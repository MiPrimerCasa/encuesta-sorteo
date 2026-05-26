#!/usr/bin/env bash
# Ejecutar UNA VEZ en la consola SSH de Hostinger (como root):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/MiPrimerCasa/encuesta-sorteo/main/deploy/vps-bootstrap-leads.sh)"
#
# O si ya tenés el repo:
#   cd /opt/encuesta-landingqr && git pull origin main && bash deploy/vps-bootstrap-leads.sh

set -euo pipefail

MONOREPO_ROOT="${MONOREPO_ROOT:-/opt/encuesta-landingqr}"
cd "$MONOREPO_ROOT"

echo "==> Actualizar código"
git fetch origin main
git reset --hard origin/main
git log -1 --oneline

echo "==> Crear leads/.env si falta"
chmod +x deploy/ensure-leads-env.sh deploy/deploy-vps-docker.sh leads/deploy/deploy-vps-docker.sh
MONOREPO_ROOT="$MONOREPO_ROOT" bash deploy/ensure-leads-env.sh

echo "==> Redeploy encuesta (Traefik sin /leads)"
bash deploy/deploy-vps-docker.sh

echo "==> Deploy CRM leads"
MONOREPO_ROOT="$MONOREPO_ROOT" bash leads/deploy/deploy-vps-docker.sh

echo "==> Verificación"
docker ps --filter name=encuesta-landingqr --filter name=seguimiento-leads --format 'table {{.Names}}\t{{.Status}}'
curl -sfk -H "Host: www.miprimercasafsa-sorteo.com" "https://127.0.0.1/leads/api/health" | head -c 200
echo ""
echo "Listo: https://www.miprimercasafsa-sorteo.com/leads"
