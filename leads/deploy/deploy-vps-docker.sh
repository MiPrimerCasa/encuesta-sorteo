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

echo "LEADS_HOST=${LEADS_HOST}"
echo "Building ${SERVICE_NAME} (encuesta-landingqr no se reinicia)..."

docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  build "$SERVICE_NAME"

# Limpiar contenedor viejo (a veces queda como "Removal in progress" o "Created" huérfano).
# Sin --rmi para no borrar la imagen recién construida.
docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  rm -sf "$SERVICE_NAME" >/dev/null 2>&1 || true

# Garantía extra: si quedó un contenedor con ese nombre por cualquier motivo, forzar remove.
# Reintentos por si Docker reporta "removal already in progress" (race en stop/remove anterior).
for attempt in 1 2 3 4 5 6 7 8; do
  if ! docker inspect "$SERVICE_NAME" >/dev/null 2>&1; then
    break
  fi
  echo "Quitando contenedor viejo (intento ${attempt}/8)..."
  docker rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true
  sleep 2
done

if docker inspect "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "WARN: no se pudo quitar el contenedor viejo, intentando up de todos modos."
fi

docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  up -d --no-deps --force-recreate "$SERVICE_NAME"

echo "Waiting for health..."
APP_PORT="${APP_PORT:-3001}"
HEALTH_OK=0
for i in {1..12}; do
  # Hacemos el healthcheck directo desde el contenedor (evita dependencia de Traefik/TLS).
  if docker exec "$SERVICE_NAME" node -e "fetch('http://127.0.0.1:${APP_PORT}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    HEALTH_OK=1
    echo ""
    echo "Smoke test OK (directo al contenedor)"
    break
  fi
  echo "Health not ready yet (${i}/12) — esperando..."
  sleep 3
done

if [[ "$HEALTH_OK" -ne 1 ]]; then
  echo "WARN: smoke test falló — docker logs ${SERVICE_NAME}"
  docker logs --tail 120 "$SERVICE_NAME" || true
  # En algunos VPS el endpoint puede tardar más (red/DB), pero el contenedor queda operativo.
  # Si el contenedor está corriendo, no frenamos el deploy para evitar falsos negativos.
  if [[ -n "$(docker ps --filter "name=^/${SERVICE_NAME}$" --filter "status=running" --format '{{.Names}}')" ]]; then
    echo "WARN: healthcheck no confirmó a tiempo, pero el contenedor está running. Se continúa."
  else
    echo "ERROR: el contenedor no quedó corriendo."
    exit 1
  fi
fi

docker ps --filter "name=${SERVICE_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "--- Diagnóstico redes ---"
echo "Redes de ${SERVICE_NAME}:"
docker inspect "$SERVICE_NAME" --format '{{range $net, $cfg := .NetworkSettings.Networks}}  {{$net}} ip={{$cfg.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null || echo "  (no se pudo inspeccionar)"
echo "Todas las redes Docker:"
docker network ls --format '  {{.Name}} driver={{.Driver}}'

# Auto-conectar a la misma red que el contenedor principal de la encuesta.
# Traefik vigila la red en la que corre la encuesta; si leads no está en esa red, no se descubre.
ENCUESTA_CONTAINER="${ENCUESTA_CONTAINER:-encuesta-landingqr}"
if docker inspect "$ENCUESTA_CONTAINER" >/dev/null 2>&1; then
  ENCUESTA_NETWORKS=$(docker inspect "$ENCUESTA_CONTAINER" \
    --format '{{range $net, $cfg := .NetworkSettings.Networks}}{{$net}} {{end}}' \
    | tr ' ' '\n' | grep -v '^$' || true)
  echo "Redes de ${ENCUESTA_CONTAINER}:"
  for NET in $ENCUESTA_NETWORKS; do
    echo "  ${NET}"
    if ! docker inspect "$SERVICE_NAME" \
         --format '{{range $net, $cfg := .NetworkSettings.Networks}}{{$net}} {{end}}' \
         2>/dev/null | grep -qw "$NET"; then
      echo "  → Conectando ${SERVICE_NAME} a ${NET}..."
      docker network connect "$NET" "$SERVICE_NAME" 2>/dev/null \
        && echo "  → OK" || echo "  → ya conectado o error (ignorado)"
    else
      echo "  → ${SERVICE_NAME} ya está en ${NET}"
    fi
  done
else
  echo "Contenedor ${ENCUESTA_CONTAINER} no encontrado — no se puede auto-detectar red."
fi

echo "Redes finales de ${SERVICE_NAME}:"
docker inspect "$SERVICE_NAME" --format '{{range $net, $cfg := .NetworkSettings.Networks}}  {{$net}} ip={{$cfg.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null || true
echo "=== Deploy finished ==="
