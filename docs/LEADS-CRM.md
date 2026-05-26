# CRM Seguimiento de Leads (monorepo)

Código en [`leads/`](../leads/) — repo origen: [SISTEMA_SEGUIMIENTO_LEADS](https://github.com/MiPrimerCasa/SISTEMA_SEGUIMIENTO_LEADS).

## URLs

| Entorno | URL |
|---------|-----|
| Producción | https://www.miprimercasafsa-sorteo.com/leads |
| API health | https://www.miprimercasafsa-sorteo.com/leads/api/health |

La landing de encuesta sigue en la raíz del dominio; el CRM no comparte contenedor.

## Primer deploy en el VPS

```bash
ssh root@72.60.12.48
cd /opt/encuesta-landingqr
git pull origin main

cp leads/deploy/.env.vps.example leads/.env
chmod 600 leads/.env
nano leads/.env   # DB_*, credenciales STRSYSTEM

chmod +x leads/deploy/deploy-vps-docker.sh
./leads/deploy/deploy-vps-docker.sh
```

## Desarrollo local

```bash
# Terminal 1 — encuesta (raíz)
npm run dev:api && npm run dev

# Terminal 2 — CRM
cd leads && npm install
npm run dev:api    # BASE_PATH=/leads → http://localhost:3001/leads
npm run dev        # http://localhost:5173/leads/
```

## CI

- Cambios solo en `leads/**` → workflow `deploy-leads.yml` (no redeploya encuesta).
- Cambios en raíz (sin `leads/`) → `deploy-vps.yml` (solo encuesta).

Documentación detallada: `leads/docs/MONOREPO.md`, `leads/README.md`.
