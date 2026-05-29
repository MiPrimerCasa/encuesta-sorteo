#!/usr/bin/env bash
# Deploy CRM Seguimiento Leads — monorepo encuesta-sorteo (carpeta leads/).
# No redeploya encuesta-landingqr.
set -euo pipefail

MONOREPO_ROOT="${MONOREPO_ROOT:-/opt/encuesta-landingqr}"
LEADS_DIR="${LEADS_DIR:-${APP_DIR:-${MONOREPO_ROOT}/leads}}"
ROOT_COMPOSE="${ROOT_COMPOSE:-/root/docker-compose.yml}"
TRAEFIK_FRAGMENT="${LEADS_DIR}/deploy/docker-compose.traefik-root.yml"
SERVICE_NAME="seguimiento-leads"
LOG_DIR="${MONOREPO_ROOT}/logs/deployments-leads"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/${TIMESTAMP}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Deploy ${SERVICE_NAME} @ ${TIMESTAMP} ==="
echo "MONOREPO_ROOT=${MONOREPO_ROOT}"
echo "LEADS_DIR=${LEADS_DIR}"

if [[ ! -f "${LEADS_DIR}/.env" ]]; then
  echo "ERROR: falta ${LEADS_DIR}/.env (copiá desde leads/deploy/.env.vps.example)"
  exit 1
fi

if [[ ! -f "$ROOT_COMPOSE" ]]; then
  echo "ERROR: no existe ${ROOT_COMPOSE}"
  exit 1
fi

if [[ ! -f "$TRAEFIK_FRAGMENT" ]]; then
  echo "ERROR: no existe ${TRAEFIK_FRAGMENT}"
  exit 1
fi

# Actualizar monorepo (omitir si CI ya hizo fetch + reset --hard)
if [[ -z "${SKIP_MONOREPO_GIT_PULL:-}" ]] && [[ -d "${MONOREPO_ROOT}/.git" ]]; then
  cd "$MONOREPO_ROOT"
  git checkout -f main 2>/dev/null || git checkout -fB main origin/main
  git reset --hard HEAD
  git clean -fd -e .env -e 'leads/.env' 2>/dev/null || true
  git fetch origin main
  git reset --hard origin/main
fi

set -a
# shellcheck disable=SC1091
source "${LEADS_DIR}/.env" 2>/dev/null || true
set +a
export LEADS_HOST="${LEADS_HOST:-leads.srv955546.hstgr.cloud}"
export LEADS_TRAEFIK_HOST="${LEADS_TRAEFIK_HOST:-www.miprimercasafsa-sorteo.com}"

# Red compartida Traefik ↔ encuesta (si el label apunta a otra red, Traefik no registra el router → 404).
detect_traefik_network() {
  local traefik="${TRAEFIK_CONTAINER:-root-traefik-1}"
  local encuesta="${ENCUESTA_CONTAINER:-encuesta-landingqr}"
  local net

  if docker container inspect "$traefik" >/dev/null 2>&1 \
     && docker container inspect "$encuesta" >/dev/null 2>&1; then
    while IFS= read -r net; do
      [[ -z "$net" ]] && continue
      if docker container inspect "$encuesta" \
        --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' \
        2>/dev/null | grep -qx "$net"; then
        echo "$net"
        return 0
      fi
    done < <(docker container inspect "$traefik" \
      --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' 2>/dev/null || true)
  fi

  if docker container inspect "$encuesta" >/dev/null 2>&1; then
    net=$(docker container inspect "$encuesta" \
      --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' \
      2>/dev/null | head -1)
    if [[ -n "$net" ]]; then
      echo "$net"
      return 0
    fi
  fi
  echo "root_default"
}

export TRAEFIK_DOCKER_NETWORK="${TRAEFIK_DOCKER_NETWORK:-$(detect_traefik_network)}"

echo "LEADS_HOST=${LEADS_HOST}"
echo "LEADS_TRAEFIK_HOST=${LEADS_TRAEFIK_HOST}"
echo "TRAEFIK_DOCKER_NETWORK=${TRAEFIK_DOCKER_NETWORK}"
echo "Building ${SERVICE_NAME} (encuesta-landingqr no se reinicia)..."

docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  build "$SERVICE_NAME"

# Limpiar contenedor viejo (stop → rm, con espera si Docker dice "removal in progress").
# No usar `docker ps --filter name=^/foo$`: en varios hosts no aplica regex y devuelve vacío
# aunque el contenedor exista → compose up falla con "name already in use".
# No usar `docker inspect $SERVICE_NAME` sin --type container (puede resolver a la imagen).
container_ids_for_service() {
  docker ps -a --format '{{.ID}} {{.Names}}' 2>/dev/null \
    | awk -v svc="$SERVICE_NAME" '{
        n = $2
        sub(/^\//, "", n)
        if (n == svc) print $1
      }' || true
}

container_running() {
  docker container inspect "$SERVICE_NAME" >/dev/null 2>&1 \
    && [[ "$(docker inspect --type container -f '{{.State.Running}}' "$SERVICE_NAME" 2>/dev/null)" == "true" ]]
}

force_remove_by_name() {
  docker rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true
}

COMPOSE=(docker compose --project-directory "$LEADS_DIR" -f "$ROOT_COMPOSE" -f "$TRAEFIK_FRAGMENT")
ROLLBACK_TAG="seguimiento-leads:rollback"
APP_PORT="${APP_PORT:-3001}"
BASE_PATH="${APP_BASE_PATH:-/leads}"
BASE_PATH="${BASE_PATH%/}"
HEALTH_PATH="${BASE_PATH}/api/health/live"

connect_traefik_networks() {
  local encuesta="${ENCUESTA_CONTAINER:-encuesta-landingqr}"
  if ! docker container inspect "$SERVICE_NAME" >/dev/null 2>&1; then
    echo "WARN: ${SERVICE_NAME} no existe — omitiendo conexión de redes."
    return 0
  fi
  if ! docker container inspect "$encuesta" >/dev/null 2>&1; then
    echo "Contenedor ${encuesta} no encontrado — no se puede auto-detectar red."
    return 0
  fi
  local encuesta_networks
  encuesta_networks=$(docker container inspect "$encuesta" \
    --format '{{range $net, $cfg := .NetworkSettings.Networks}}{{$net}} {{end}}' \
    | tr ' ' '\n' | grep -v '^$' || true)
  echo "Redes de ${encuesta}:"
  for net in $encuesta_networks; do
    echo "  ${net}"
    if ! docker container inspect "$SERVICE_NAME" \
         --format '{{range $net, $cfg := .NetworkSettings.Networks}}{{$net}} {{end}}' \
         2>/dev/null | grep -qw "$net"; then
      echo "  → Conectando ${SERVICE_NAME} a ${net}..."
      docker network connect "$net" "$SERVICE_NAME" 2>/dev/null \
        && echo "  → OK" || echo "  → ya conectado o error (ignorado)"
    else
      echo "  → ${SERVICE_NAME} ya está en ${net}"
    fi
  done
}

health_probe() {
  docker exec "$SERVICE_NAME" node -e "
    const port=${APP_PORT};
    const paths=['${HEALTH_PATH}','/api/health/live'];
    (async () => {
      for (const p of paths) {
        try {
          const r = await fetch('http://127.0.0.1:' + port + p);
          if (r.ok) process.exit(0);
        } catch {}
      }
      process.exit(1);
    })();
  " 2>/dev/null
}

attempt_rollback() {
  if container_running; then
    return 0
  fi
  if ! docker image inspect "$ROLLBACK_TAG" >/dev/null 2>&1; then
    echo "WARN: no hay imagen ${ROLLBACK_TAG} para rollback."
    return 1
  fi
  echo "ROLLBACK: restaurando ${ROLLBACK_TAG} → latest..."
  docker tag "$ROLLBACK_TAG" seguimiento-leads:latest
  "${COMPOSE[@]}" up -d --no-deps --force-recreate "$SERVICE_NAME" || return 1
  connect_traefik_networks
  if health_probe; then
    echo "ROLLBACK OK — servicio restaurado con imagen anterior."
    return 0
  fi
  echo "WARN: rollback levantó contenedor pero health no respondió."
  return 1
}

on_deploy_error() {
  echo "ERROR en deploy — intentando rollback..."
  attempt_rollback || true
}
trap on_deploy_error ERR

if container_running; then
  echo "Guardando imagen de rollback desde contenedor actual..."
  docker commit "$SERVICE_NAME" "$ROLLBACK_TAG" >/dev/null 2>&1 || true
fi

"${COMPOSE[@]}" stop "$SERVICE_NAME" >/dev/null 2>&1 || true
"${COMPOSE[@]}" rm -sf "$SERVICE_NAME" >/dev/null 2>&1 || true
force_remove_by_name

for attempt in $(seq 1 15); do
  mapfile -t cids < <(container_ids_for_service)
  if ((${#cids[@]} == 0)); then
    if docker container inspect "$SERVICE_NAME" >/dev/null 2>&1; then
      echo "Nombre ${SERVICE_NAME} aún registrado — docker rm -f por nombre..."
      force_remove_by_name
      sleep 2
      continue
    fi
    echo "Contenedor ${SERVICE_NAME} eliminado (o no existía)."
    break
  fi
  for cid in "${cids[@]}"; do
    [[ -z "$cid" ]] && continue
    status="$(docker inspect --type container -f '{{.State.Status}}' "$cid" 2>/dev/null | tr -d '\r\n' || echo unknown)"
    echo "Quitando contenedor viejo ${cid} (intento ${attempt}/15, estado=${status})..."
    if [[ "$status" == "removing" ]]; then
      sleep 5
      continue 2
    fi
    docker stop -t 15 "$cid" >/dev/null 2>&1 || true
    sleep 2
    docker rm -f "$cid" >/dev/null 2>&1 || true
  done
  sleep 3
done

mapfile -t remaining < <(container_ids_for_service)
if ((${#remaining[@]} > 0)) || docker container inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "ERROR: no se pudo quitar ${SERVICE_NAME}. Contenedores restantes:"
  docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}' \
    | grep -F "$SERVICE_NAME" || true
  exit 1
fi

"${COMPOSE[@]}" up -d --no-deps --force-recreate "$SERVICE_NAME"

# Traefik solo descubre el CRM si comparte red con la encuesta — siempre conectar antes del health.
echo "--- Conectar redes Traefik ---"
connect_traefik_networks

echo "Waiting for health (${HEALTH_PATH} o /api/health/live)..."
HEALTH_OK=0
for i in {1..20}; do
  if health_probe; then
    HEALTH_OK=1
    echo ""
    echo "Smoke test OK (directo al contenedor)"
    break
  fi
  echo "Health not ready yet (${i}/20) — esperando..."
  sleep 3
done

if [[ "$HEALTH_OK" -ne 1 ]]; then
  echo "WARN: smoke test falló — docker logs ${SERVICE_NAME}"
  docker logs --tail 120 "$SERVICE_NAME" || true
  if container_running; then
    echo "WARN: healthcheck no confirmó a tiempo, pero el contenedor está running. Se continúa."
  else
    echo "ERROR: el contenedor no quedó corriendo — intentando rollback..."
    attempt_rollback || true
    if ! container_running; then
      exit 1
    fi
  fi
fi

trap - ERR

docker ps --filter "name=${SERVICE_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "--- Diagnóstico redes ---"
echo "Redes de ${SERVICE_NAME}:"
docker container inspect "$SERVICE_NAME" --format '{{range $net, $cfg := .NetworkSettings.Networks}}  {{$net}} ip={{$cfg.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null || echo "  (no se pudo inspeccionar)"
echo "Todas las redes Docker:"
docker network ls --format '  {{.Name}} driver={{.Driver}}'

echo "Redes finales de ${SERVICE_NAME}:"
docker container inspect "$SERVICE_NAME" --format '{{range $net, $cfg := .NetworkSettings.Networks}}  {{$net}} ip={{$cfg.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null || true

# El health interno no prueba Traefik; sin esto el workflow puede quedar verde con 404 público.
traefik_smoke() {
  local host="${LEADS_TRAEFIK_HOST}"
  local code
  code=$(curl -sfk -o /dev/null -w '%{http_code}' --max-time 20 \
    -H "Host: ${host}" \
    "https://127.0.0.1${HEALTH_PATH}" 2>/dev/null || echo "000")
  echo "Traefik smoke Host=${host} ${HEALTH_PATH} → HTTP ${code}"
  [[ "$code" == "200" ]]
}

echo "--- Smoke Traefik (ruta pública /leads) ---"
if ! traefik_smoke; then
  echo "WARN: Traefik no enruta /leads. Reiniciando ${TRAEFIK_CONTAINER:-root-traefik-1}..."
  docker restart "${TRAEFIK_CONTAINER:-root-traefik-1}" >/dev/null 2>&1 || true
  sleep 10
  connect_traefik_networks
  if ! traefik_smoke; then
    echo "ERROR: sigue sin enrutar /leads. Labels del contenedor:"
    docker container inspect "$SERVICE_NAME" --format '{{json .Config.Labels}}' 2>/dev/null || true
    exit 1
  fi
fi
echo "Traefik enruta /leads OK"

echo "=== Deploy finished ==="
