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

# Actualizar monorepo (un solo git pull en la raíz)
if [[ -d "${MONOREPO_ROOT}/.git" ]]; then
  cd "$MONOREPO_ROOT"
  git fetch --all --prune
  git pull --ff-only origin main || git pull --ff-only
fi

set -a
# shellcheck disable=SC1091
source "${LEADS_DIR}/.env" 2>/dev/null || true
set +a
export LEADS_SMOKE_HOST="${LEADS_SMOKE_HOST:-www.miprimercasafsa-sorteo.com}"
export BASE_PATH="${BASE_PATH:-/leads}"

echo "LEADS_SMOKE_HOST=${LEADS_SMOKE_HOST}"
echo "BASE_PATH=${BASE_PATH}"
echo "URL pública: https://${LEADS_SMOKE_HOST}${BASE_PATH}"
echo "Building ${SERVICE_NAME} (encuesta-landingqr no se reinicia)..."

docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  build "$SERVICE_NAME"

docker compose --project-directory "$LEADS_DIR" \
  -f "$ROOT_COMPOSE" \
  -f "$TRAEFIK_FRAGMENT" \
  up -d --no-deps "$SERVICE_NAME"

echo "Waiting for health..."
sleep 5

if curl -sfk -H "Host: ${LEADS_SMOKE_HOST}" "https://127.0.0.1${BASE_PATH}/api/health" | tee /tmp/leads-health.json; then
  echo ""
  echo "Smoke test OK"
else
  echo "WARN: smoke test falló — docker logs ${SERVICE_NAME}"
  docker logs --tail 80 "$SERVICE_NAME" || true
  exit 1
fi

docker ps --filter "name=${SERVICE_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo "=== Deploy finished ==="
