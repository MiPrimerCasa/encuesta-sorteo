#!/usr/bin/env bash
# Ejecutar desde TU PC (con clave SSH al VPS):
#   bash scripts/deploy-vps-remote.sh
#   VPS_HOST=72.60.12.48 VPS_USER=root bash scripts/deploy-vps-remote.sh

set -euo pipefail

VPS_HOST="${VPS_HOST:-72.60.12.48}"
VPS_USER="${VPS_USER:-root}"

ssh -o ConnectTimeout=20 "${VPS_USER}@${VPS_HOST}" bash -s <<'REMOTE'
set -euo pipefail

if [[ -f /opt/encuesta-landingqr/leads/deploy/deploy-vps-docker.sh ]]; then
  echo "Modo: monorepo (/opt/encuesta-landingqr/leads)"
  cd /opt/encuesta-landingqr
  git fetch --all --prune
  git pull --ff-only origin main || git pull --ff-only
  chmod +x leads/deploy/deploy-vps-docker.sh
  MONOREPO_ROOT=/opt/encuesta-landingqr bash leads/deploy/deploy-vps-docker.sh
elif [[ -f /opt/seguimiento-leads/deploy/deploy-vps-docker.sh ]]; then
  echo "Modo: standalone (/opt/seguimiento-leads)"
  cd /opt/seguimiento-leads
  git fetch --all --prune
  git pull --ff-only origin main || git pull --ff-only
  chmod +x deploy/deploy-vps-docker.sh
  MONOREPO_ROOT=/opt/seguimiento-leads LEADS_DIR=/opt/seguimiento-leads bash deploy/deploy-vps-docker.sh
else
  echo "ERROR: no se encontró deploy en /opt/encuesta-landingqr/leads ni /opt/seguimiento-leads"
  exit 1
fi
REMOTE

echo "Deploy remoto finalizado."
