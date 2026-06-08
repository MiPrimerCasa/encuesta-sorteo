# Deploy CRM Leads en el VPS (desde Windows con OpenSSH).
# Requiere: ssh.exe y acceso al servidor (clave o contraseña).
#
#   $env:VPS_HOST = "72.60.12.48"
#   $env:VPS_USER = "root"
#   .\scripts\deploy-vps-remote.ps1

$VpsHost = if ($env:VPS_HOST) { $env:VPS_HOST } else { "72.60.12.48" }
$VpsUser = if ($env:VPS_USER) { $env:VPS_USER } else { "root" }

$remoteScript = @'
set -euo pipefail
if [[ -f /opt/encuesta-landingqr/leads/deploy/deploy-vps-docker.sh ]]; then
  cd /opt/encuesta-landingqr
  git fetch origin main
  git reset --hard origin/main
  chmod +x leads/deploy/deploy-vps-docker.sh
  MONOREPO_ROOT=/opt/encuesta-landingqr SKIP_MONOREPO_GIT_PULL=1 bash leads/deploy/deploy-vps-docker.sh
elif [[ -f /opt/seguimiento-leads/deploy/deploy-vps-docker.sh ]]; then
  cd /opt/seguimiento-leads
  git fetch origin main
  git reset --hard origin/main
  chmod +x deploy/deploy-vps-docker.sh
  MONOREPO_ROOT=/opt/seguimiento-leads LEADS_DIR=/opt/seguimiento-leads SKIP_MONOREPO_GIT_PULL=1 bash deploy/deploy-vps-docker.sh
else
  echo "ERROR: no se encontró deploy-vps-docker.sh en el VPS"
  exit 1
fi
'@

Write-Host "Conectando a ${VpsUser}@${VpsHost} ..."
ssh -o ConnectTimeout=25 "${VpsUser}@${VpsHost}" $remoteScript
if ($LASTEXITCODE -ne 0) {
  Write-Error "Deploy falló. Si GitHub Actions también falla, revisá VPS_SSH_KEY en encuesta-sorteo → Settings → Secrets."
  exit $LASTEXITCODE
}
Write-Host "Deploy remoto finalizado."
