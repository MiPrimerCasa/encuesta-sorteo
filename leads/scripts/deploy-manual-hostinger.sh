#!/usr/bin/env bash
# Pegar en la terminal WEB de Hostinger (ya estas dentro del VPS).
# Actualiza leads/ desde GitHub y reconstruye el contenedor.

set -euo pipefail

MONOREPO_ROOT="${MONOREPO_ROOT:-/opt/encuesta-landingqr}"
cd "$MONOREPO_ROOT"

git config --global --add safe.directory "$MONOREPO_ROOT" 2>/dev/null || true
git checkout -f main 2>/dev/null || git checkout -fB main origin/main
git fetch origin main
git reset --hard origin/main

echo "Monorepo: $(git rev-parse --short HEAD) — $(git log -1 --oneline)"
test -f leads/deploy/deploy-vps-docker.sh
chmod +x leads/deploy/deploy-vps-docker.sh

export MONOREPO_ROOT SKIP_MONOREPO_GIT_PULL=1
bash leads/deploy/deploy-vps-docker.sh

echo ""
echo "Verificacion rapida:"
curl -sk "https://www.miprimercasafsa-sorteo.com/leads/api/health/live" || true
echo ""
grep -o 'index-[^"]*\.js' /opt/encuesta-landingqr/leads/dist/index.html 2>/dev/null \
  || docker exec seguimiento-leads cat /app/dist/index.html 2>/dev/null | grep -o 'index-[^"]*\.js' || true
