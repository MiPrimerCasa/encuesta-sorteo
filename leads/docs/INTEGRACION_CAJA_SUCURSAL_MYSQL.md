# Integración CRM ↔ Caja de sucursal (MySQL nube + API HTTPS)

**Fecha:** 2026-07-18  
**Estado:** alineado al contrato SistemaCajaPIJ  
**Productos:** Plan Inversión Joven (`prod-pij`) y Terreno (`prod-terreno`)

## Fuente de verdad del contrato

Especificaciones del equipo Caja (repo `SistemaCajaPIJ`):

- [`CRM_FLUJO_ENVIO_VPS_CAJA.md`](../../SistemaCajaPIJ/docs/CRM_FLUJO_ENVIO_VPS_CAJA.md) — flujo, payload §5, VPS vs sucursal, checklist
- [`CRM_INTEGRACION_CAJA.md`](../../SistemaCajaPIJ/docs/CRM_INTEGRACION_CAJA.md) — mapeo campos CRM ↔ ERP
- Tipos: `SistemaCajaPIJ/app/src/shared/crm-ingest-types.ts`

Relacionado en este repo:
- [REQUISITOS_INTEGRACION_CAJA_SUCURSAL_PIJ.md](./REQUISITOS_INTEGRACION_CAJA_SUCURSAL_PIJ.md)
- [datos_crm_caja_unificado.md](./datos_crm_caja_unificado.md)
- [INTEGRACION_SOAP_PIJ_SISTEMA_INTEGRAL.md](./INTEGRACION_SOAP_PIJ_SISTEMA_INTEGRAL.md)

---

## 1. Objetivo

Cuando el CRM cierra venta (`compro` o `derivar_terreno`), publica en el VPS:

1. **Cola** `crm_venta_pendiente` con `payload_json` completo (cliente, seguimiento, pagos, promotor/supervisor, refs de adjuntos).
2. **Metadatos de fotos** en `caja_cierre` + `caja_cierre_imagen` (bytes en `data/cierres-pij/{leadId}/`).

La caja de sucursal hace **PULL** por HTTPS, materializa en su MySQL local `erp_sucursal`, valida, y hace **PUSH** a `caja_venta_cierre` → el CRM actualiza campos `caja*`.

> MySQL **no** se expone a internet. Sync remota = HTTPS + Bearer token.

---

## 2. Arquitectura

```
CRM (cierre)
  │ 1) SP_RegistrarSeguimientoLead → SQL Server
  │ 2) mysql2 → caja_pij.crm_venta_pendiente + caja_cierre(_imagen)
  │ 3) SOAP PIJ (si flag on)
  ▼
VPS MySQL caja_pij + disco cierres-pij/
  │ HTTPS pull/push (token por sucursal 01/02/03)
  ▼
Caja Electron + MySQL erp_sucursal (local)
```

---

## 3. Esquema MySQL VPS (`caja_pij`)

Scripts:

| Archivo | Uso |
|---------|-----|
| [`deploy/mysql-caja/init/01-esquema.sql`](../deploy/mysql-caja/init/01-esquema.sql) | Instalación limpia |
| [`deploy/mysql-caja/init/02-operadores.sql`](../deploy/mysql-caja/init/02-operadores.sql) | Catálogo `operador` (si faltaba) |
| [`deploy/mysql-caja/init/03-contrato-oficial.sql`](../deploy/mysql-caja/init/03-contrato-oficial.sql) | Migración aditiva si el volumen ya existía |

Tablas clave:

| Tabla | Rol |
|-------|-----|
| `crm_venta_pendiente` | Cola CRM→caja (`payload_json` = contrato §5) |
| `caja_cierre` / `caja_cierre_imagen` | Metadatos fotos + `download_url` / `sha256` |
| `caja_venta_cierre` | Retorno caja→CRM (`CONFIRMADA` / `RECHAZADA`) |
| `operador` | Catálogo promotores/supervisores |
| `sync_cursor` | Cursor pull por sucursal |

Idempotencia: `crm_venta_external_id` = id del registro `SP_RegistrarSeguimientoLead`.

---

## 4. Payload que publica el CRM

Misma forma que `POST /api/v1/crm/leads` del ingest Caja. Incluye:

- `leadId`, `sucursalCodigo` (`01`/`02`/`03`)
- `lead`: nombre/apellido, DNI, teléfono, `promotorId`, `promotorNombre`, `supervisorNombre`, campaña…
- `seguimiento`: resultado, producto, estadoPago, recibo, `pagos`, `adjuntos[]`, compras adicionales
- `operador`: quien cerró en el CRM

Mapeo slots CRM → tipos contrato:

| Slot CRM | `adjuntos[].tipo` |
|----------|-------------------|
| `img1` | `DNI_FRENTE` |
| `img2` | `DNI_DORSO` |
| `img5` | `PAPEL_ADHESION` |
| `img6` | `PAPEL_ANEXO` |
| `img7` | `COMPROBANTE_TRANSFERENCIA` |

`urlDescarga` apunta a `/api/caja/imagenes/{id_imagen}` (bytes en el VPS).

---

## 5. API CRM (`/api/caja/*`)

Auth: `Authorization: Bearer <token>` (`CAJA_SYNC_TOKENS`).

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/caja/health` | Ping + MySQL |
| `GET` | `/caja/cierres` o `/caja/pendientes?desde=&limit=` | Pull incremental (`payload` completo) |
| `GET` | `/caja/imagenes/:idImagen` | Descarga binaria (contrato) |
| `GET` | `/caja/cierres/:id/imagenes/:imgId` | Compat |
| `GET` | `/caja/operadores?equipo=&rol=&refresh=` | Catálogo |
| `POST` | `/caja/ack` | `{ ultimoId }` → marca `DESCARGADA` |
| `POST` | `/caja/confirmaciones` | Push confirmación/rechazo |

Confirmación preferida:

```json
{
  "pendienteUuid": "…",
  "estado": "CONFIRMADA",
  "confirmadoPor": "cajero1",
  "reciboNumero": "R-100",
  "contratoUuid": "…"
}
```

Compat: `{ "cierreId": 128, "estado": "cerrado", "confirmadoPor": "…" }`.

---

## 6. Variables de entorno

```env
CAJA_MYSQL_ENABLED=true
CAJA_MYSQL_HOST=mysql-caja
CAJA_MYSQL_DB=caja_pij
CAJA_MYSQL_USER=crm_caja
CAJA_MYSQL_PASSWORD=…

# Códigos ERP
CAJA_SYNC_TOKENS={"01":"token-largo-secreto"}
CAJA_ERP_SUCURSAL_MAP={"S21":"01"}
CAJA_DEFAULT_SUCURSAL=01
```

---

## 7. Deploy VPS (MySQL ya existente)

```bash
docker exec -i mysql-caja mysql -ucrm_caja -p caja_pij < deploy/mysql-caja/init/03-contrato-oficial.sql
docker exec -i mysql-caja mysql -ucrm_caja -p caja_pij < deploy/mysql-caja/init/02-operadores.sql
```

Reiniciar CRM con `CAJA_MYSQL_ENABLED=true` y tokens por `01`/`02`/`03`.

---

## 8. Checklist (desde specs Caja)

- [x] Disparar con `compro` / `derivar_terreno`
- [x] `sucursalCodigo` ERP (+ mapa S##→01)
- [x] Payload con apellido/nombre, promotor, supervisor, DNI, recibo, pagos, adjuntos tipados
- [x] Fotos en VPS + `caja_cierre_imagen` + `urlDescarga`
- [x] Consumir confirmación → campos `caja*` en SQL Server
- [ ] Reintento manual de publicación (UI)
- [ ] Dirección stock adhesión/anexo caja→CRM

## 9. Historial

| Fecha | Cambio |
|-------|--------|
| 2026-07-17 | Infra MySQL + publicación plana `cierre_pendiente`. |
| 2026-07-18 | Promotor/supervisor + catálogo `operador`. |
| 2026-07-18 | **Alineación contrato oficial:** `crm_venta_pendiente` + `caja_cierre(_imagen)` + `caja_venta_cierre` + payload §5. |
