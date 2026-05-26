# CRM Seguimiento de Leads (monorepo)

Código en [`leads/`](../leads/) — repo origen: [SISTEMA_SEGUIMIENTO_LEADS](https://github.com/MiPrimerCasa/SISTEMA_SEGUIMIENTO_LEADS).

## URLs

| Entorno | URL |
|---------|-----|
| Producción | https://www.miprimercasafsa-sorteo.com/leads |
| API health | https://www.miprimercasafsa-sorteo.com/leads/api/health |

La landing de encuesta sigue en la raíz del dominio; el CRM no comparte contenedor.

## Flujo con el frontend (repo standalone)

El equipo UI trabaja en [SISTEMA_SEGUIMIENTO_LEADS](https://github.com/MiPrimerCasa/SISTEMA_SEGUIMIENTO_LEADS) (ramas → PR → `main`). Al mergear, Actions puede sincronizar a `leads/` y desplegar.

Guía completa: [`leads/docs/FLUJO-FRONTEND-DEPLOY.md`](../leads/docs/FLUJO-FRONTEND-DEPLOY.md)

## Primer deploy en el VPS (obligatorio)

Si abrís `/leads` y ves la **encuesta** en lugar del login del CRM, el contenedor `seguimiento-leads` **no está corriendo** o falta `leads/.env`.

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

Verificar:

```bash
docker ps --filter name=seguimiento-leads
curl -sfk -H "Host: www.miprimercasafsa-sorteo.com" https://127.0.0.1/leads/api/health
```

Debe responder `"ok": true`. La página debe titular **Seguimiento de Leads**, no "MiPrimerCasa Sorteo".

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
