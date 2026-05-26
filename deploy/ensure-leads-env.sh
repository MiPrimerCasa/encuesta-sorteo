#!/usr/bin/env bash
# Crea leads/.env a partir del .env de la encuesta en el monorepo (VPS).
set -euo pipefail

MONOREPO_ROOT="${MONOREPO_ROOT:-/opt/encuesta-landingqr}"
LEADS_DIR="${LEADS_DIR:-${MONOREPO_ROOT}/leads}"
ENCUESTA_ENV="${MONOREPO_ROOT}/.env"
LEADS_ENV="${LEADS_DIR}/.env"

if [[ -f "$LEADS_ENV" ]]; then
  echo "OK: ya existe ${LEADS_ENV}"
  exit 0
fi

if [[ ! -f "$ENCUESTA_ENV" ]]; then
  echo "ERROR: no hay ${ENCUESTA_ENV} ni ${LEADS_ENV}. Configurá la encuesta primero."
  exit 1
fi

mkdir -p "$LEADS_DIR"
cp "$ENCUESTA_ENV" "$LEADS_ENV"

append_var() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$LEADS_ENV" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$LEADS_ENV"
  else
    echo "${key}=${val}" >> "$LEADS_ENV"
  fi
}

append_var "NODE_ENV" "production"
append_var "PORT" "3001"
append_var "API_PORT" "3001"
append_var "BASE_PATH" "/leads"
append_var "LEADS_SMOKE_HOST" "www.miprimercasafsa-sorteo.com"
append_var "LEADS_PUBLIC_HOST" "https://www.miprimercasafsa-sorteo.com/leads"
append_var "SP_LOGIN" "dbo.operadorAccesoCategoria"
append_var "SP_LOGIN_PARAM_USER" "LoginID"
append_var "SP_LOGIN_PARAM_PASS" "PasID"
append_var "SP_ENCUESTAS" "encuestasMuestraOperador"
append_var "SP_ENCUESTAS_PARAM_ID" "idVendedor"
append_var "SP_SEGUIMIENTO" "dbo.SP_RegistrarSeguimientoLead"
append_var "ENCUESTAS_DB_NAME" "${ENCUESTAS_DB_NAME:-STRSYSTEM}"

chmod 600 "$LEADS_ENV"
echo "Creado ${LEADS_ENV} desde ${ENCUESTA_ENV}"
