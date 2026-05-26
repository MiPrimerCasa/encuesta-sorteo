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
LEADS_ENV="${LEADS_DIR}/.env"
LEADS_DEPLOY="${LEADS_DIR}/deploy/deploy-vps-docker.sh"
if [[ -f "$LEADS_ENV" && -x "$LEADS_DEPLOY" ]]; then
  log "Desplegando CRM leads (leads/.env presente)..."
  MONOREPO_ROOT="$APP_DIR" bash "$LEADS_DEPLOY" 2>&1 | tee -a "$LOG_FILE" || log "WARN: deploy leads falló — revisar leads/.env y logs"
elif [[ -f "$LEADS_DEPLOY" ]]; then
  log "WARN: existe leads/ pero falta ${LEADS_ENV} — /leads no mostrará el CRM hasta configurarlo"
fi

log "Deploy VPS terminado con éxito"
# Mantener solo los últimos 30 logs de deploy
ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs -r rm -f
