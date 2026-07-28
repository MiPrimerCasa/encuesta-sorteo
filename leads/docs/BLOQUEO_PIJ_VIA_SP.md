# Bloqueo PIJ por SP (sin SOAP)

**Cambio (2026-07-21):** el CRM obtiene `idVentaIntegral` ejecutando
`dbo.loteVentaBloqueoVendedorPIJ` en **STRSYSTEM**, no vía ASMX.

## Config

| Variable | Default | Uso |
|----------|---------|-----|
| `PIJ_BLOQUEO_ENABLED` o `PIJ_SOAP_ENABLED` | off | Master switch |
| `PIJ_BLOQUEO_MODE` | `sp` | `sp` = SQL directo; `soap` = ASMX legacy |
| `PIJ_BLOQUEO_SP` | `loteVentaBloqueoVendedorPIJ` | Nombre del SP |

## GRANT (DBA)

```sql
GRANT EXECUTE ON dbo.loteVentaBloqueoVendedorPIJ TO [MPCSP]; -- o el user de la app
```

El SP debe devolver un result set con `idVenta` o `idLoteVenta` > 0
(también en altas nuevas).

## Código

- `server/db/pij-bloqueo-sp.js` — execute + parse id
- `server/services/pij-integral-sync.js` — orquestación
- `server/config/pij-soap-config.js` — flags / mode

Al cerrar PIJ (`compro` + `prod-pij` + `entrega_33`) se llama el SP y se
persiste `idVentaIntegral` + `pijIntegralEstado=bloqueado`.
