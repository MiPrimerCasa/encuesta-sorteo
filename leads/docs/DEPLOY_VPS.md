# Deploy en VPS Hostinger (Docker + Traefik)

Sistema **Seguimiento de Leads** como servicio hermano de `encuesta-landingqr`. No comparte contenedor ni puertos publicados en el host.

> **Recomendado:** monorepo `encuesta-sorteo` con este código en `leads/` → [MONOREPO.md](./MONOREPO.md).  
> Este documento describe también el deploy **standalone** en `/opt/seguimiento-leads`.

## Infraestructura (referencia)

| Item | Valor |
|------|--------|
| IP | `72.60.12.48` |
| Panel | `srv955546.hstgr.cloud` |
| Compose raíz | `/root/docker-compose.yml` |
| Red Docker | `root_default` (external) |
| Proxy | Traefik `root-traefik-1` v2.11.x |
| Encuesta existente | `/opt/encuesta-landingqr` → `encuesta-landingqr` |

## Repo y ruta en el VPS

| Entorno | Ruta |
|---------|------|
| Este CRM | `/opt/seguimiento-leads` |
| Contenedor | `seguimiento-leads` |
| Puerto interno | `3001` (solo red Docker) |

**Repositorio sugerido:** `github.com/MiPrimerCasa/seguimiento-leads` (hermano de `encuesta-sorteo`, no mezclar carpetas para no romper el deploy de la landing).

## DNS

Crear registro **A** (o CNAME al hostname del VPS):

```
leads.srv955546.hstgr.cloud  →  72.60.12.48
```

Dominio de marca alternativo (cuando esté definido):

```
crm.miprimercasafsa-sorteo.com  →  72.60.12.48
```

Actualizar `LEADS_HOST` en `/opt/seguimiento-leads/.env` y volver a desplegar.

## Primer deploy (manual en el VPS)

```bash
ssh root@72.60.12.48

mkdir -p /opt/seguimiento-leads/logs/deployments
git clone https://github.com/MiPrimerCasa/seguimiento-leads.git /opt/seguimiento-leads
cd /opt/seguimiento-leads

cp deploy/.env.vps.example .env
chmod 600 .env
nano .env   # DB_*, SP_*, LEADS_HOST

chmod +x deploy/deploy-vps-docker.sh
./deploy/deploy-vps-docker.sh
```

Smoke test (en el servidor):

```bash
curl -sfk -H "Host: leads.srv955546.hstgr.cloud" https://127.0.0.1/api/health
```

Respuesta esperada: `"ok": true`, `"sql": "ok"`.

## Deploy automático (GitHub Actions)

Secrets (reutilizar los de la encuesta):

| Secret | Uso |
|--------|-----|
| `VPS_HOST` | `72.60.12.48` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | clave privada deploy |
| `SLACK_WEBHOOK_URL` | opcional |

Workflow: `.github/workflows/deploy-vps.yml` (push a `main`).

## Variables `.env` en el VPS

Plantilla: `deploy/.env.vps.example`.

- Credenciales SQL: **nunca** en el repo.
- `ENCUESTAS_DB_NAME`: misma base que login si el SP vive en STRSYSTEM.
- El usuario SQL debe tener acceso a `mensajeria` si `encuestasMuestraOperador` la usa internamente.

## Coexistencia con la encuesta

- **No** se modifica `/opt/encuesta-landingqr` ni el servicio `encuesta`.
- **No** se enlazan puertos `80`/`443` en el host.
- Rollback del CRM:

```bash
docker compose -f /root/docker-compose.yml \
  -f /opt/seguimiento-leads/deploy/docker-compose.traefik-root.yml \
  stop seguimiento-leads
```

La landing sigue funcionando.

## Datos y persistencia

| Dato | Origen actual |
|------|----------------|
| Login / rol | SQL `operadorAccesoCategoria` |
| Listado leads | SQL `encuestasMuestraOperador` |
| Seguimiento modal | Caché local `data/app-cache.db` (volumen Docker) |

Migración SQL para seguimiento en servidor: `sql/migrations/001_lead_seguimiento_crm.sql` (pendiente conectar en la app cuando el DBA apruebe).

Backup del volumen:

```bash
tar -czf /opt/seguimiento-leads/backups/data-$(date +%F).tar.gz -C /opt/seguimiento-leads data
```

## Preguntas resueltas / asumidas

| Tema | Decisión |
|------|----------|
| Vista SQL listado | Hoy: SP `encuestasMuestraOperador`; vista `vw_leads_encuesta_crm` documentada en SQL para unificar con tabla `encuesta` |
| Usuarios panel | Login vía `operadorAccesoCategoria` (no lista fija en `.env`) |
| Subdominio inicial | `leads.srv955546.hstgr.cloud` |
| Permisos SQL | SELECT/EXEC según SPs + CRUD en tablas `lead_*_crm` |

## E2E tras encuesta real

1. Cliente completa landing en `www.miprimercasafsa-sorteo.com`.
2. Registro en tabla `encuesta` (SQL externo).
3. Operador entra al CRM en `https://leads.srv955546.hstgr.cloud`.
4. Login con email/clave STRSYSTEM → leads visibles según `@idVendedor`.
5. Cambio de seguimiento en modal → persiste en `data/app-cache.db` (hasta SP en SQL).

## Auditoría en el VPS (comandos)

```bash
# Encuesta (no tocar)
ls -la /opt/encuesta-landingqr/.env
docker ps --filter name=encuesta
curl -sfk -H "Host: www.miprimercasafsa-sorteo.com" https://127.0.0.1/api/health

# CRM
ls -la /opt/seguimiento-leads/.env
docker logs --tail 50 seguimiento-leads
```
