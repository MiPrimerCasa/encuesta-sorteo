# Acortador y verificación de links de redes

**Rol:** supervisor (notificaciones); operación en servidor (cron).

## ¿Python o JavaScript?

**Conviene JavaScript (Node)** en este proyecto:

- Mismo runtime que la API (`server/`), mismo deploy en el VPS.
- En producción los links vienen de **STRSYSTEM**: `exec dbo.rptLinkQRenRedesSociales` (ver `.env`: `SP_LINKS_REDES`). Respaldo: `server/data/links-redes.json`.
- El script Python se portó a `server/lib/url-shortener.js` + scripts npm.
- Cron en el VPS: `node scripts/verificar-links-redes.mjs` (sin instalar Python).

Podés mantener el script Python solo para exportar la planilla de Google Sheets; el equivalente es `npm run links:sheet-export`.

## Flujo

1. **Catálogo** — SP en STRSYSTEM (default) o `links-redes.json` si `LINKS_REDES_SOURCE=json`. Inspección: `npm run inspect:links-redes`.
2. **Acortar** — `npm run links:acortar` (solo pendientes) o **`npm run links:actualizar-todos`** (todos promotores + supervisores del catálogo).
3. **Verificar** — `npm run links:verificar` revisa links vencidos (por defecto 1 por ejecución, cada 7 días).
4. Si el acortado **no responde**, se **regenera** automáticamente.
5. Si cambia o se regenera → **notificación** en la campana (NavBar) solo para el operador dueño del código (`codigoCarga`), promotor o supervisor.

Los promotores comparten el link **largo** `wa.me` desde Leads (Instagram y Facebook). Solo **Instagram** tiene link acortado para bio/planilla; **Facebook** siempre es el link normal, sin acortar ni verificar.

## Cron sugerido (VPS)

```bash
# Diario 04:00 — verifica 1 link (rota toda la semana)
0 4 * * * cd /opt/encuesta-landingqr/leads && node scripts/verificar-links-redes.mjs >> logs/links-verify.log 2>&1

# Tras actualizar planilla — acortar nuevos
# 0 5 * * 1 cd /opt/encuesta-landingqr/leads && node scripts/acortar-links-redes.mjs
```

Variables opcionales en `.env`:

| Variable | Default | Uso |
|----------|---------|-----|
| `LINKS_VERIFY_INTERVAL_DAYS` | 7 | Días entre verificaciones del mismo link |
| `LINKS_VERIFY_MAX_PER_RUN` | 1 | Cuántos links revisar por ejecución |
| `LINKS_ACORTAR_PAUSA_MS` | 1000 | Pausa entre llamadas a acortadores |

## API

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/notificaciones/links-redes` | promotor + supervisor |
| POST | `/api/notificaciones/links-redes/:id/vista` | promotor + supervisor |

## Archivos

| Archivo | Rol |
|---------|-----|
| `server/lib/url-shortener.js` | tinyurl, clck.ru, is.gd, v.gd |
| `server/lib/link-health.js` | HEAD/GET del link corto |
| `server/db/links-acortados-store.js` | SQLite + lógica verificar/regenerar |
| `src/components/layout/NotificationsCenter.tsx` | Campana en NavBar |
