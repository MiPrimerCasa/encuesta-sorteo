# Conexión API ↔ SP_RegistrarSeguimientoLead

**Estado:** activo en código Node (requiere deploy + SP corregido en SQL)

### Resumen

Al guardar seguimiento (`PATCH /api/leads/:id/seguimiento`), si existe `SP_SEGUIMIENTO` en `.env`, la API ejecuta **`dbo.SP_RegistrarSeguimientoLead`** en lugar de SQLite local. Lectura del **estado actual** e **historial**: última fila(s) de `registrarSeguimientoLead` por `lead_id`.

### Variables `.env`

```env
SP_SEGUIMIENTO=dbo.SP_RegistrarSeguimientoLead
SEGUIMIENTO_TABLE=registrarSeguimientoLead
ENCUESTAS_DB_NAME=STRSYSTEM
```

Si `SP_SEGUIMIENTO` está vacío → fallback SQLite (`data/app-cache.db`).

### Flujo guardado

1. App valida body (`server/schemas/seguimiento.js`).
2. `updateLeadSeguimientoEncuesta` mergea seguimiento previo + patch.
3. Si no hubo cambio → no llama al SP.
4. `execRegistrarSeguimientoLead` → `EXEC SP_RegistrarSeguimientoLead` con todos los `@param`.
5. SP devuelve `codigo` (1=OK, 0=error), `mensaje`, `idRegistrarSeguimientoLead`.
6. Si `codigo ≠ 1` → HTTP 400 con mensaje del SP.

### Mapeo parámetros SP ↔ app

| Parámetro SP | Origen app |
|--------------|------------|
| `@lead_id` | `lead.id` (PK encuesta) |
| `@telefono` | `lead.telefono` |
| `@encuesta` | `lead.codigoCampania` o `ENCUESTA_CARGA_ID` |
| `@confirmo_entrevista` | `seguimiento.confirmoEntrevista` |
| `@canal` | `seguimiento.canal` |
| `@hubo_entrevista` | `seguimiento.huboEntrevista` |
| `@resultado_entrevista` | `seguimiento.resultadoEntrevista` (**NVARCHAR**) |
| `@horario_entrevista_propuesto` | `seguimiento.horarioEntrevistaPropuesto` |
| `@fecha_reagenda` | `seguimiento.fechaReagenda` |
| `@seguimiento_pij_promotor` | `seguimiento.seguimientoPijPromotor` |
| `@id_producto` … `@observaciones` | campos venta / notas |
| `@referidos_json` | `JSON.stringify(seguimiento.referidos)` |
| `@operador_id` | `usuario.id` (INT login) |
| `@operador_rol` | `promotor` \| `supervisor` |
| `@operador_nombre` | sesión |
| `@seguimiento_json` | JSON completo mergeado (camelCase) |

### Lectura / historial

| Operación | SQL |
|-----------|-----|
| Estado actual del lead | `SELECT TOP 1 … WHERE lead_id = @id ORDER BY id DESC` |
| Historial modal | Misma tabla, `TOP 50 ORDER BY id DESC` |
| Listado de leads | Batch: última fila por `lead_id` |

Implementación: `server/db/seguimiento-sql.js`.

### ⚠️ Corrección obligatoria DBA

El SP que compartiste declara `@resultado_entrevista BIT`. **Debe ser `NVARCHAR(16)`** o fallará al guardar `compro`, `reagenda`, etc.

Ver: [sql/SP_RegistrarSeguimientoLead-notas.sql](../sql/SP_RegistrarSeguimientoLead-notas.sql)

### Permisos SQL

```sql
GRANT EXECUTE ON dbo.SP_RegistrarSeguimientoLead TO [MPCSP];
GRANT SELECT, INSERT ON dbo.registrarSeguimientoLead TO [MPCSP];
```

### Dónde está el código

| Archivo | Rol |
|---------|-----|
| `server/db/seguimiento-sql.js` | EXEC SP, lectura tabla, batch |
| `server/db/encuestas.js` | `updateLeadSeguimientoEncuesta`, listado con seguimiento SQL |
| `server/create-app.js` | PATCH/GET historial, error `SeguimientoRegistroError` |
| `server/schemas/seguimiento.js` | Validación body |

### Prueba manual

1. Login promotor/supervisor en producción.
2. Abrir lead → guardar «No compró» o reagenda.
3. Verificar fila en `registrarSeguimientoLead` y historial en modal.
4. `GET /api/leads/{id}/historial` → array con operador y fecha.

### Relacionado

- [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md)
- [FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md](./FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md)
