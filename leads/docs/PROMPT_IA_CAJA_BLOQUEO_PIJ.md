# Prompt para la IA del repo SistemaCajaPIJ (otra ventana Cursor)

Copiá y pegá el bloque de abajo tal cual.

---

## Contexto — cambio de lógica de negocio PIJ (CRM ↔ Caja ↔ Integral)

El CRM **Seguimiento Leads** ya NO debe ejecutar el bloqueo del lote en el sistema integral al cerrar la venta.  
Ese paso lo hace **la caja de sucursal**, después de validar los datos y generar el comprobante.

### Flujo acordado

```
1) CRM: cierre PIJ (compro + entrega_33)
   → guarda seguimiento en STRSYSTEM
   → publica pendiente a caja (crm_venta_pendiente + adjuntos/imágenes)

2) CAJA: operador valida el pendiente
   → genera comprobante / cobro efectivo
   → ejecuta SP dbo.loteVentaBloqueoVendedorPIJ en STRSYSTEM
   → obtiene idLoteVenta (idVenta)
   → con ese id, envía las imágenes al integral (SP/WS que corresponda del lado integral)
   → confirma al CRM por HTTPS

3) CRM: recibe confirmación
   → cajaEstado = verificado
   → idVentaIntegral = <id del SP>
   → pijIntegralEstado = bloqueado (o fotos_ok si ya mandaron imgs)
```

### Qué debe implementar / ajustar CAJA

1. **Al confirmar una venta PIJ pendiente del CRM** (después de validar y generar comprobante):
   - Ejecutar en SQL Server STRSYSTEM el SP:

```sql
EXEC dbo.loteVentaBloqueoVendedorPIJ
  @idVenta = 0,                          -- alta / bloqueo nuevo
  @idVendedor = <id vendedor CRM>,
  @solicitud = N'A200/300',              -- parcela completa: serie+nro+/300
  @anexo = 2000,                         -- reciboNumero / nro anexo
  @montoEfectivo = ...,
  @montoTransferencia = ...,
  @fechaAnexo = ...,
  @nombreCliente = ...,
  @numeroDocumentoCliente = ...,         -- DNI
  @domicilioCliente = ...,
  @numeroTelefonoCliente = ...
```

   - El result set trae (entre otras) **`idVenta`** o **`idLoteVenta`** > 0. Ese es el id a guardar y a usar para fotos.
   - `solicitud` NO es solo el número: formato **`A200/300`** (o `B…/300`), igual que `barrioLoteParcela`.

2. **Con el id obtenido**, enviar las imágenes del cierre al sistema integral (el mecanismo que defina el DBA: segundo SP / ASMX con idVenta > 0). Las fotos ya vienen referenciadas en el pendiente del CRM (`GET /api/caja/imagenes/:idImagen` o adjuntos del ingest local).

3. **Avisar al CRM** con el endpoint existente de confirmaciones, **agregando el id**:

`POST /api/caja/confirmaciones`  
Header: `Authorization: Bearer <token sucursal>`  
Body (ejemplo éxito):

```json
{
  "pendienteUuid": "<uuid del crm_venta_pendiente>",
  "estado": "CONFIRMADA",
  "confirmadoPor": "caja.usuario",
  "reciboNumero": "2000",
  "idCaja": "COMP-...",
  "idVentaIntegral": 14051,
  "pijIntegralEstado": "bloqueado"
}
```

Aliases aceptados por el CRM:
- `idLoteVenta` ≡ `idVentaIntegral`
- Si las fotos ya se subieron al integral: `"pijIntegralEstado": "fotos_ok"`
- Si el bloqueo falló pero igual quieren informar error (opcional):  
  `"estado": "CONFIRMADA"` o manejar rechazo; para error de PIJ:  
  `"pijIntegralEstado": "error"`, `"pijIntegralError": "mensaje..."`

4. **No depender del CRM para el SP de bloqueo.** El CRM dejó de llamarlo al cerrar (`PIJ_BLOQUEO_OWNER=caja`).

### Datos que ya manda el CRM en el pendiente (usar para armar el SP)

Del `payload_json` / ingest típico:

**Bloques listos para el SP** → raíz del pendiente: `payload.bloqueosPij[]` (también `bloqueoPij` = solo el principal, compat):

```json
"bloqueosPij": [
  { "ventaKey": "principal", "esPrincipal": true,  "idVendedor": 132, "solicitud": "A200/300", "anexo": 2000, "...": "..." },
  { "ventaKey": "uuid-2do-pij", "esPrincipal": false, "idVendedor": 132, "solicitud": "A201/300", "anexo": 2001, "...": "..." }
]
```

- Un ítem por cada Plan Inversión (principal + compras adicionales `prod-pij`; sin terreno)
- `ventaKey`: `"principal"` o el `id` de la compra adicional (UUID)
- Cada ítem también trae: `idVenta` (0 hasta bloquear), montos, `fechaAnexo`, cliente, DNI, domicilio, tel, `adjuntos`, `serie`, `adhesion`
- `idVendedorNombre` / `idVendedorLabel` (`"132 - CAJAL JESUS LEONEL"`) desde **operadorRPT**
- `cerradoPor`: `{ id, nombre, label, rol }` (`promotor` | `supervisor`)
- `equipo.promotor` / `equipo.supervisor`: `{ id, nombre, label, rol }`
- `cantidadPij`: cantidad de ítems en `bloqueosPij`

También en `lead`: `promotorRol`, `supervisorRol`  
`operador.rol` y `seguimiento.operadorRol`: rol de quien guardó el cierre

También:
- `lead`: nombre, teléfono, domicilio, `promotorNombre` / `promotorLabel`, `supervisorNombre` / `supervisorLabel` (completos vía operadorRPT)
- `operador`: `usuarioId`, `nombre` completo, `label` `"id - NOMBRE COMPLETO"`, `rol`
- `seguimiento.comprasAdicionales[]`: solo PIJ adicionales (el CRM no envía terreno a caja)

**En caja:** iterar `bloqueosPij` y ejecutar el SP **una vez por cada ítem** (cada uno con su `solicitud`/`anexo`). Al confirmar al CRM, mandar al menos el `idVentaIntegral` del principal; idealmente un array de ids por `ventaKey` si el contrato se amplía.
### Prueba de referencia (STRSYSTEM)

Una corrida directa del SP con datos de prueba devolvió `idVenta = 14051` con:
- solicitud `A200/300`, anexo `2000`, idVendedor `132`, montos 20000/13000, DNI `25874565`, domicilio largo tipo “BARRIO OBRERO…”

### Contrato CRM ya preparado (repo SEGUIMIENTO_LEADS)

- `POST /api/caja/confirmaciones` acepta `idVentaIntegral` / `idLoteVenta` / `pijIntegralEstado` / `pijIntegralError`
- Al confirmar, el CRM persiste en seguimiento (JSON + columnas planas si el DBA aplicó `sql/SP_RegistrarSeguimientoLead-id-venta-integral.sql`):
  - `id_venta_integral`
  - `pij_integral_estado`
  - `caja_*`

### Fuera de alcance de caja (lo hace el CRM)

- Alta del seguimiento / lead
- Publicar pendiente + metadatos de imágenes
- UI de promotores

### Pedido concreto a implementar en SistemaCajaPIJ

1. Tras validación + comprobante → para **cada** ítem de `bloqueosPij`, llamar `loteVentaBloqueoVendedorPIJ`.
2. Guardar cada `idLoteVenta` localmente (por `ventaKey`).
3. Subir imágenes al integral con el id de cada venta.
4. `POST` confirmación al CRM incluyendo `idVentaIntegral` (principal; y si hay más, documentar mapeo por ventaKey).
5. Manejo de error: si un SP falla, no marcar ese PIJ como bloqueado; mostrar error al cajero.

---
