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

# Si existe un contenedor viejo con el mismo nombre (a veces queda "huérfano"),
# `docker compose up` puede fallar por conflicto. Lo limpiamos antes de recrear.
docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  rm -sf "$SERVICE_NAME" || true

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
  exit 1
fi

docker ps --filter "name=${SERVICE_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo "=== Deploy finished ==="
