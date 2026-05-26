#!/usr/bin/env bash
# Copia el CRM (repo standalone) → carpeta leads/ del monorepo encuesta-sorteo.
# Uso (desde la raíz de SISTEMA_SEGUIMIENTO_LEADS):
#   bash scripts/sync-to-monorepo.sh . ../encuesta-sorteo
set -euo pipefail

SOURCE_ROOT="$(cd "${1:?source root}" && pwd)"
MONOREPO="$(cd "${2:?monorepo root}" && pwd)"
DEST="${MONOREPO}/leads"

if [[ ! -d "$DEST" ]]; then
  echo "ERROR: no existe ${DEST} (¿clonaste encuesta-sorteo?)"
  exit 1
fi

RSYNC_EX=( -a
  --exclude '.git'
  --exclude 'node_modules'
  --exclude 'dist'
  --exclude 'data'
  --exclude '.env'
  --exclude 'logs'
)

sync_dir() {
  local name="$1"
  if [[ -d "${SOURCE_ROOT}/${name}" ]]; then
    mkdir -p "${DEST}/${name}"
    rsync "${RSYNC_EX[@]}" "${SOURCE_ROOT}/${name}/" "${DEST}/${name}/"
    echo "  synced ${name}/"
  fi
}

echo "Origen:  ${SOURCE_ROOT}"
echo "Destino: ${DEST}"

sync_dir src
# server/index.js usa BASE_PATH /leads — no pisar desde standalone
if [[ -d "${SOURCE_ROOT}/server" ]]; then
  mkdir -p "${DEST}/server"
  rsync "${RSYNC_EX[@]}" \
    --exclude 'index.js' \
    "${SOURCE_ROOT}/server/" "${DEST}/server/"
  echo "  synced server/ (sin index.js monorepo)"
fi
sync_dir public
sync_dir scripts
sync_dir sql
sync_dir docs

# deploy/: conservar Traefik monorepo (/leads en dominio encuesta)
if [[ -d "${SOURCE_ROOT}/deploy" ]]; then
  mkdir -p "${DEST}/deploy"
  rsync "${RSYNC_EX[@]}" \
    --exclude 'github-workflow' \
    --exclude 'docker-compose.traefik-root.yml' \
    --exclude 'deploy-vps-docker.sh' \
    "${SOURCE_ROOT}/deploy/" "${DEST}/deploy/"
  echo "  synced deploy/ (sin github-workflow ni traefik/deploy monorepo)"
fi

for f in package.json package-lock.json tsconfig.json vite.config.ts index.html \
  Dockerfile .dockerignore .nvmrc .env.example README.md; do
  if [[ -f "${SOURCE_ROOT}/${f}" ]]; then
    cp "${SOURCE_ROOT}/${f}" "${DEST}/${f}"
    echo "  copied ${f}"
  fi
done

echo "OK: sync terminado en ${DEST}"
