# Deploy manual del CRM en el VPS (monorepo encuesta-sorteo → leads/).
# Requiere acceso SSH al servidor (clave en ~/.ssh o agente).
#
# Desde PowerShell en la raíz del repo:
#   .\scripts\deploy-manual.ps1
#
# O con otro usuario/host:
#   $env:VPS_HOST = "72.60.12.48"; $env:VPS_USER = "root"; .\scripts\deploy-manual.ps1

$ErrorActionPreference = "Stop"

$VpsHost = if ($env:VPS_HOST) { $env:VPS_HOST } else { "72.60.12.48" }
$VpsUser = if ($env:VPS_USER) { $env:VPS_USER } else { "root" }

$remoteScript = @'
set -euo pipefail
MONOREPO_ROOT="${MONOREPO_ROOT:-/opt/encuesta-landingqr}"
cd "$MONOREPO_ROOT"
git config --global --add safe.directory "$MONOREPO_ROOT" 2>/dev/null || true
git checkout -f main 2>/dev/null || git checkout -fB main origin/main
git fetch origin main
git reset --hard origin/main
echo "Monorepo en: $(git rev-parse --short HEAD) — $(git log -1 --oneline)"
test -f leads/deploy/deploy-vps-docker.sh
chmod +x leads/deploy/deploy-vps-docker.sh
export MONOREPO_ROOT SKIP_MONOREPO_GIT_PULL=1
bash leads/deploy/deploy-vps-docker.sh
'@

Write-Host "Deploy manual CRM -> ${VpsUser}@${VpsHost}" -ForegroundColor Cyan
Write-Host "Trae main del monorepo y reconstruye Docker (5-10 min)." -ForegroundColor Gray

$remoteScript | ssh -o ConnectTimeout=25 "${VpsUser}@${VpsHost}" bash -s

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "SSH fallo. Alternativa: en Hostinger -> VPS -> Terminal del servidor, pegar:" -ForegroundColor Yellow
  Write-Host $remoteScript -ForegroundColor DarkGray
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Verificando produccion..." -ForegroundColor Cyan
$health = curl.exe -sk "https://www.miprimercasafsa-sorteo.com/leads/api/health/live" 2>$null
Write-Host $health

$html = curl.exe -sk "https://www.miprimercasafsa-sorteo.com/leads/" 2>$null
if ($html -match 'index-([A-Za-z0-9]+)\.js') {
  Write-Host "Bundle en produccion: index-$($Matches[1]).js" -ForegroundColor Green
  Write-Host "Deberia incluir links-redes (build reciente). Forza Ctrl+F5 en el navegador." -ForegroundColor Gray
} else {
  Write-Host "No se pudo leer index.html de produccion." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Listo: https://www.miprimercasafsa-sorteo.com/leads" -ForegroundColor Green
