# Acortador y verificación de links de redes

**Rol:** supervisor (notificaciones); operación en servidor (cron).

## ¿Python o JavaScript?

**Conviene JavaScript (Node)** en este proyecto:

- Mismo runtime que la API (`server/`), mismo deploy en el VPS.
- Los links ya viven en `server/data/links-redes.json` y SQLite local.
- El script Python se portó a `server/lib/url-shortener.js` + scripts npm.
- Cron en el VPS: `node scripts/verificar-links-redes.mjs` (sin instalar Python).

Podés mantener el script Python solo para exportar la planilla de Google Sheets; el equivalente es `npm run links:sheet-export`.

## Flujo

1. **Catálogo** — `links-redes.json` (generado con `npm run generate:links-redes`).
2. **Acortar** — `npm run links:acortar` guarda URL corta en SQLite solo para **Instagram** (`data/app-cache.db`, tabla `links_acortados`).
3. **Verificar** — `npm run links:verificar` revisa links vencidos (por defecto 1 por ejecución, cada 7 días).
4. Si el acortado **no responde**, se **regenera** automáticamente.
5. Si sigue fallando → **notificación** en la campana del supervisor (NavBar).

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
| GET | `/api/notificaciones/links-redes` | supervisor |
| POST | `/api/notificaciones/links-redes/:codigo/:red/atendida` | supervisor |

## Archivos

| Archivo | Rol |
|---------|-----|
| `server/lib/url-shortener.js` | tinyurl, clck.ru, is.gd, v.gd |
| `server/lib/link-health.js` | HEAD/GET del link corto |
| `server/db/links-acortados-store.js` | SQLite + lógica verificar/regenerar |
| `src/components/layout/NotificationsCenter.tsx` | Campana en NavBar |
