# Modelo SQL de seguimiento — cobertura vs app actual

**Índice:** [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)  
**Estado:** diseño / alineación DBA (hoy el seguimiento vive en SQLite local por `lead_id`)

---

## Respuesta corta

**Sí:** con los parámetros que listaste se puede cubrir casi todo el seguimiento operativo de la app (compró / no compró / reagenda / derivar terreno / venta / referidos / auditoría / multisorteo).

**Faltan pocos campos explícitos** y **varios datos del lead no son “seguimiento”** sino de la fila `encuesta` (el SP de listado debe seguir devolviéndolos o un JOIN).

**Recomendación:** tabla (o SP upsert) con columnas explícitas **+** `@seguimiento_json` como respaldo; validar en el SP las mismas reglas que `server/schemas/seguimiento.js`.

---

## Mapa: parámetro SQL → app → pestaña

| Parámetro SQL | Campo app (`SeguimientoLead` / `Lead`) | Uso en negocio |
|---------------|----------------------------------------|----------------|
| `@lead_id` | `lead.id` (PK `encuesta.id`) | Clave única de participación |
| `@telefono` | `lead.telefono` | Identidad + duplicados con `@encuesta` |
| `@encuesta` | `lead.codigoCampania` | Multisorteo |
| `@canal` | `seguimiento.canal` | Contactado; flujo supervisor |
| `@hubo_entrevista` | `seguimiento.huboEntrevista` | Rama del modal (sí/no entrevista) |
| `@resultado_entrevista` | `seguimiento.resultadoEntrevista` | **Motor de pestañas** (ver tabla abajo) |
| `@horario_entrevista_propuesto` | `seguimiento.horarioEntrevistaPropuesto` | Derivación terreno con cita → también pisa `lead.horarioEntrevista` en app |
| `@fecha_reagenda` | `seguimiento.fechaReagenda` | En seguimiento + calendario |
| `@seguimiento_pij_promotor` | `seguimiento.seguimientoPijPromotor` | Supervisor solo lectura; badge PIJ |
| `@id_producto` | `seguimiento.idProducto` | Cierres (`prod-pij` / `prod-terreno`) |
| `@estado_pago` | `seguimiento.estadoPago` | Cierres + validación por producto |
| `@id_barrio` | `seguimiento.idBarrio` | Venta terreno |
| `@numero_recibo` | `seguimiento.numeroRecibo` | Recibo / comprobante |
| `@brindo_referidos` | `seguimiento.brindoReferidos` | Post-venta |
| `@referidos_json` | `seguimiento.referidos[]` | Lista `{nombre, telefono}` |
| `@observaciones` | `seguimiento.observaciones` | Notas |
| `@operador_*` | sesión login | Auditoría (hoy parcial en SQLite `seguimiento_eventos`) |
| `@seguimiento_json` | payload completo del modal | Campos futuros sin migración |

### Pestañas según `@resultado_entrevista` (reglas actuales de la app)

| `resultado_entrevista` | Condiciones extra | Pestaña |
|------------------------|-------------------|---------|
| *(null)* + sin contacto | sin `canal` y sin `hubo_entrevista` | **Prioridad** (grupo 2) |
| *(null)* + entrevista SP | `lead.lista=entrevista` + horario válido | **Prioridad** (grupo 1) |
| `derivar_terreno` | — | **Prioridad** (grupo 0) |
| `reagenda` | `fecha_reagenda` obligatoria | **En seguimiento** |
| `reagenda` + `seguimiento_pij_promotor=1` | tras no compró PIJ | **En seguimiento** (supervisor solo lectura) |
| `compro` | producto + pago válidos | **Cierres** |
| `no_compro` / `sin_interes` | sin `reagenda` | **Contactado** |

Validaciones que el SP debe replicar (ver `server/schemas/seguimiento.js`):

- `reagenda` → `@fecha_reagenda` NOT NULL  
- `compro` → `@id_producto`, `@estado_pago`; terreno → `@id_barrio`; recibo según producto/pago  
- `seguimiento_pij_promotor=1` → coherente con `resultado_entrevista=reagenda`

---

## ¿Alcanza para “si compró o no” y reagenda del promotor?

| Escenario promotor | ¿Cubierto? | Campos |
|--------------------|------------|--------|
| No hubo entrevista → sin interés | Sí | `hubo_entrevista=0`, `resultado=sin_interes` |
| No hubo entrevista → reagenda | Sí | `resultado=reagenda`, `fecha_reagenda` |
| Hubo entrevista → **compró** PIJ/terreno | Sí | `resultado=compro`, producto, pago, barrio, recibo |
| Hubo entrevista → **no compró** sin seguimiento | Sí | `resultado=no_compro` → Contactado |
| Hubo entrevista → **no compró** + reagenda PIJ | Sí | `resultado=reagenda`, `fecha_reagenda`, `seguimiento_pij_promotor=1`, `hubo_entrevista=1` |
| Derivar terreno | Sí | `resultado=derivar_terreno`, `horario_entrevista_propuesto` opcional |

| Escenario supervisor | ¿Cubierto? | Notas |
|----------------------|------------|--------|
| ¿Confirmó entrevista? + canal | **Parcial** | Ver `@confirmo_entrevista` abajo |
| Cierre PIJ + terreno | Sí | Mismos campos de venta |
| Ver seguimiento PIJ del promotor | Sí | `seguimiento_pij_promotor` + rol operador |

---

## Parámetros que faltan o conviene agregar

### Recomendados (la app ya los usa)

| Campo sugerido | Tipo | Motivo |
|-----------------|------|--------|
| `@confirmo_entrevista` | `BIT` NULL | Solo supervisor: «¿Confirmó entrevista?» — hoy en `SeguimientoLead.confirmoEntrevista` pero **no está en el schema Zod del API** (se pierde al guardar si no se agrega al contrato). |
| `@fuente` | `NVARCHAR(16)` NULL | `qr` \| `app` \| `facebook` \| `instagram` — métricas y badge en tarjeta. Suele venir de `encuesta.origen`; el seguimiento local puede pisarla. |
| `@actualizado_en` | `DATETIME2` | Orden, alertas «+2 días sin contactar», auditoría (hoy `actualizado_en` solo en SQLite). |
| `@creado_en` | `DATETIME2` | Primera vez que se registró seguimiento (opcional). |

### No van en el SP de seguimiento (vienen del listado `encuesta`)

Estos definen Prioridad / calendario / UI y deben seguir en `encuestasMuestraOperador` (o vista JOIN):

| Dato | Columna SP típica | Campo app |
|------|-------------------|-----------|
| Nombre, domicilio | encuesta | `nombre`, `domicilio` |
| Promotor asignado | Promotor / usuario | `promotorNombre`, `promotorId` |
| Entrevista original | Horario de entrevista | `horarioEntrevista`, `fechaAlta` |
| Lugar cita | Contacto en / Domicilio de encuesta | `lugarEntrevista`, `domicilioEntrevista` |
| Supervisor | supervisor | `supervisorNombre` |
| Origen encuesta | origen | alimenta `fuente` si no hay en seguimiento |

### Opcionales (negocio futuro)

| Campo | Motivo |
|-------|--------|
| `@version` / `ROWVERSION` | Evitar pisar seguimiento si dos operadores guardan a la vez |
| Tabla histórica `seguimiento_historial` | Hoy es **un snapshot** por lead (merge); no hay línea de tiempo de cambios salvo `seguimiento_eventos` en SQLite |
| `@lista` | Hoy se **deriva** en app (`entrevista`/`contacto`); el SP puede calcularla o dejarla a la vista |
| Catálogo productos/barrios en SQL | La app valida `prod-pij` / `prod-terreno` y barrios desde SQLite catálogo |

---

## Diseño de tabla sugerido

```sql
-- Clave: una fila de seguimiento por participación (lead)
UNIQUE (lead_id)  -- = encuesta.id
-- o UNIQUE (telefono, encuesta) si el SP no recibe lead_id en edge cases

-- CHECK resultado_entrevista IN ('sin_interes','reagenda','no_compro','compro','derivar_terreno')
-- CHECK: resultado_entrevista = 'reagenda' => fecha_reagenda IS NOT NULL
```

Lectura para la API:

1. `encuestasMuestraOperador` → datos base del lead.  
2. `LEFT JOIN seguimiento_crm ON seguimiento_crm.lead_id = encuesta.id` → merge como hoy `getSeguimientoExterno` + `mapEncuestaRowToLead`.  
3. Exponer columnas planas al Node **o** solo `seguimiento_json` parseado en servidor.

---

## Brecha actual (antes de SQL)

| Tema | Hoy |
|------|-----|
| Persistencia | `lead_seguimiento_externo.seguimiento_json` en SQLite del VPS |
| Clave | `lead_id` = PK numérica del SP (correcto en listado; coherente con `@lead_id`) |
| API Zod | No incluye `confirmoEntrevista` ni `fuente` → conviene alinear al pasar a SQL |
| Histórico | **Implementado en SQLite** (`lead_seguimiento_historial`); ver [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md). Pendiente tabla en SQL Server. |

---

## Checklist DBA ↔ app

- [ ] `UNIQUE (lead_id)` o `(telefono, encuesta)` alineado con duplicados de carga manual  
- [ ] Validaciones `reagenda` / `compro` / `derivar_terreno` en SP  
- [ ] Agregar `confirmo_entrevista` y `fuente` si se quiere paridad total con supervisor y métricas  
- [ ] `actualizado_en` para alertas y orden  
- [ ] Vista o SP de lectura que una `encuesta` + `seguimiento` (misma forma que `mapEncuestaRowToLead`)  
- [ ] Migrar Node: reemplazar `upsertSeguimientoExterno` por `EXEC dbo.seguimientoCrmUpsert` (nombre a definir)

---

## Relacionado

- [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md)
- [FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md](./FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md)
- [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md)
- [SORTEOS_Y_PARTICIPANTES.md](./SORTEOS_Y_PARTICIPANTES.md)
- Código validación: `server/schemas/seguimiento.js`
- Código pestañas: `src/domain/leads.ts`, `src/hooks/useLeadsFilter.ts`, `src/domain/prioridad-leads.ts`
