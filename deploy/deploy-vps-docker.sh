#!/bin/bash
# Deploy producción en VPS. Escribe log por commit en logs/deployments/
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/encuesta-landingqr}"
COMPOSE_BASE="${COMPOSE_BASE:-/root/docker-compose.yml}"
COMPOSE_APP="${COMPOSE_APP:-$APP_DIR/deploy/docker-compose.traefik-root.yml}"
ENCUESTA_HOST="${ENCUESTA_HOST:-www.miprimercasafsa-sorteo.com}"
LOG_DIR="${APP_DIR}/logs/deployments"

mkdir -p "$LOG_DIR"
SHORT_SHA="${DEPLOY_SHA:-$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo local)}"
SHORT_SHA="${SHORT_SHA:0:7}"
LOG_FILE="${LOG_DIR}/$(date -u +%Y%m%d-%H%M%S)-${SHORT_SHA}.log"

log() {
  echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG_FILE"
}

log "========== Deploy VPS =========="
log "Commit: ${DEPLOY_SHA:-desconocido}"
log "Rama: ${DEPLOY_REF:-main}"
log "Autor: ${DEPLOY_ACTOR:-manual}"
log "Mensaje: ${DEPLOY_MESSAGE:-—}"
log "Actions: ${DEPLOY_RUN_URL:-—}"
log "Log archivo: $LOG_FILE"
log "================================"

cd "$APP_DIR"

log "Git fetch + reset a origin/main"
git fetch origin main
git reset --hard origin/main
log "HEAD local: $(git log -1 --oneline)"

# ── Inyectar variables requeridas en .env (sin duplicar) ──────────────────────
# Agregar aquí cualquier variable que deba estar en producción pero no está en git.
ENV_FILE="${APP_DIR}/.env"
ensure_env_var() {
  local key="$1" value="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    touch "$ENV_FILE"
    log "WARN: .env no existía, se creó en $ENV_FILE"
  fi
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    log "ENV: ${key} ya está en .env (sin cambios)"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
    log "ENV: ${key}=${value} agregado a .env"
  fi
}

ensure_env_var "SP_INCLUDE_ORIGEN" "true"
# ─────────────────────────────────────────────────────────────────────────────

chmod +x "${APP_DIR}/deploy/ensure-leads-env.sh" 2>/dev/null || true
chmod +x "${APP_DIR}/leads/deploy/deploy-vps-docker.sh" 2>/dev/null || true

log "Docker compose build + up"
docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_APP" up -d --build encuesta 2>&1 | tee -a "$LOG_FILE"

log "Esperar contenedor (15s)"
sleep 15
docker ps --filter name=encuesta-landingqr --format 'Estado: {{.Status}}' | tee -a "$LOG_FILE"

log "Smoke test HTTPS (Traefik)"
if curl -sfk -H "Host: ${ENCUESTA_HOST}" https://127.0.0.1/ -o /dev/null -w "Landing HTTP %{http_code}\n" | tee -a "$LOG_FILE"; then
  log "OK: landing responde"
else
  log "ERROR: landing no respondió"
  exit 1
fi

log "Últimas 30 líneas del contenedor:"
docker logs --tail 30 encuesta-landingqr 2>&1 | tee -a "$LOG_FILE"

LEADS_DIR="${APP_DIR}/leads"
LEADS_DEPLOY="${LEADS_DIR}/deploy/deploy-vps-docker.sh"
ENSURE_LEADS_ENV="${APP_DIR}/deploy/ensure-leads-env.sh"
if [[ -x "$ENSURE_LEADS_ENV" ]]; then
  MONOREPO_ROOT="$APP_DIR" LEADS_DIR="$LEADS_DIR" bash "$ENSURE_LEADS_ENV" 2>&1 | tee -a "$LOG_FILE" || true
fi
if [[ -x "$LEADS_DEPLOY" && -f "${LEADS_DIR}/.env" ]]; then
  log "Desplegando CRM leads..."
  MONOREPO_ROOT="$APP_DIR" bash "$LEADS_DEPLOY" 2>&1 | tee -a "$LOG_FILE" || log "WARN: deploy leads falló — ver logs/deployments-leads/"
elif [[ -d "$LEADS_DIR" ]]; then
  log "WARN: no se pudo desplegar leads (falta ${LEADS_DIR}/.env o falló el build)"
fi

log "Deploy VPS terminado con éxito"
# Mantener solo los últimos 30 logs de deploy
ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs -r rm -f
