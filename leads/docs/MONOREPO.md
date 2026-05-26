# Monorepo con encuesta-sorteo

Un solo repositorio y un solo clone en el VPS; la **landing** sigue en la raíz y el **CRM de leads** vive en `leads/`.

## Estructura objetivo

```
encuesta-sorteo/                    # repo github.com/MiPrimerCasa/encuesta-sorteo
├── package.json                    # landing (existente)
├── server/                         # API landing (existente)
├── src/                            # React landing (existente)
├── deploy/
│   ├── deploy-vps-docker.sh        # solo encuesta (NO modificar rutas)
│   └── docker-compose.traefik-root.yml
├── leads/                          # ← este proyecto (Seguimiento Leads)
│   ├── Dockerfile
│   ├── package.json
│   ├── server/
│   ├── src/
│   ├── deploy/
│   │   ├── deploy-vps-docker.sh
│   │   ├── docker-compose.traefik-root.yml
│   │   └── .env.vps.example
│   └── sql/migrations/
├── logs/
│   ├── deployments/                # encuesta
│   └── deployments-leads/          # CRM
└── .github/workflows/
    ├── deploy-vps.yml              # encuesta (existente)
    └── deploy-leads.yml            # copiar desde leads/deploy/github-workflow/
```

## VPS (sin cambiar la ruta del clone)

| Servicio | Carpeta | Contenedor | Dominio ejemplo |
|----------|---------|------------|-----------------|
| Landing | `/opt/encuesta-landingqr` (raíz) | `encuesta-landingqr` | `www.miprimercasafsa-sorteo.com` |
| CRM | `/opt/encuesta-landingqr/leads` | `seguimiento-leads` | `leads.srv955546.hstgr.cloud` |

La encuesta **no** se redeploya al publicar solo cambios en `leads/`.

## Cómo integrar este código

### 1. En tu máquina (rama `main` del monorepo)

```bash
cd /ruta/a/encuesta-sorteo
git pull origin main

# Copiar el proyecto actual dentro del monorepo
mkdir -p leads
rsync -av --exclude node_modules --exclude dist --exclude data \
  /ruta/a/SEGUIMIENTO_LEADS/ ./leads/

# Workflow en la raíz del monorepo
mkdir -p .github/workflows
cp leads/deploy/github-workflow/deploy-leads.yml .github/workflows/deploy-leads.yml

git add leads .github/workflows/deploy-leads.yml
git commit -m "feat: CRM seguimiento de leads en monorepo (carpeta leads/)"
git push origin main
```

### 2. En el VPS (primera vez)

```bash
ssh root@72.60.12.48
cd /opt/encuesta-landingqr
git pull origin main   # trae la carpeta leads/

cp leads/deploy/.env.vps.example leads/.env
chmod 600 leads/.env
nano leads/.env        # DB_*, LEADS_HOST, SP_*

chmod +x leads/deploy/deploy-vps-docker.sh
./leads/deploy/deploy-vps-docker.sh
```

### 3. Variables

- **Landing:** `/opt/encuesta-landingqr/.env` (como hoy).
- **CRM:** `/opt/encuesta-landingqr/leads/.env` (puede repetir `DB_*` o apuntar al mismo SQL).

## Deploy

```bash
# Solo CRM (recomendado tras cambios en leads/)
cd /opt/encuesta-landingqr
./leads/deploy/deploy-vps-docker.sh

# Solo landing (sin tocar CRM)
./deploy/deploy-vps-docker.sh
```

## CI (GitHub Actions)

`deploy-leads.yml` en la **raíz** del monorepo:

- `paths: ['leads/**']` → no dispara deploy de la encuesta.
- SSH → `git pull` en `/opt/encuesta-landingqr` → script en `leads/deploy/`.

## Desarrollo local

```bash
# Terminal 1 — landing (raíz del monorepo)
npm run dev:api
npm run dev

# Terminal 2 — CRM
cd leads
npm install
npm run dev:api
npm run dev
```

Puertos: landing y CRM usan **3001** por defecto; en local corré el CRM en otro puerto, ej. `PORT=3002 npm run dev:api` en `leads/`.

## Rollback CRM sin afectar encuesta

```bash
cd /opt/encuesta-landingqr
docker compose --project-directory ./leads \
  -f /root/docker-compose.yml \
  -f leads/deploy/docker-compose.traefik-root.yml \
  stop seguimiento-leads
```

## Repo standalone (alternativa)

Si no usás monorepo, este mismo código puede desplegarse en `/opt/seguimiento-leads` con `APP_DIR` apuntando ahí (ver `docs/DEPLOY_VPS.md`).
