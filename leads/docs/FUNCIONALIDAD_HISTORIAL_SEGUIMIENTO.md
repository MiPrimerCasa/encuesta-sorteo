# Historial de estados de seguimiento

**Roles:** promotor y supervisor  
**Estado:** activo — SQL Server si `SP_SEGUIMIENTO` en `.env`; si no, SQLite local.

### Resumen

Cada guardado con cambio agrega una fila con **fecha/hora**, **operador**, **etiqueta de estado** y **snapshot JSON**. Con SQL: tabla `registrarSeguimientoLead` (append-only vía `SP_RegistrarSeguimientoLead`). El **estado actual** = última fila por `lead_id`.

### Reglas

| Evento | Historial |
|--------|-----------|
| Primer guardado con datos nuevos | Nueva fila |
| Guardar sin cambios en JSON | No se duplica fila |
| Cada cambio de resultado / canal / venta / reagenda | Nueva fila |

La entrada más reciente se marca **Actual** en el modal del lead.

### Dónde está el cambio

| Capa | Archivo |
|------|---------|
| Lógica etiquetas | `server/db/seguimiento-historial.js` |
| Persistencia SQL | `server/db/seguimiento-sql.js` → `execRegistrarSeguimientoLead`, lectura tabla |
| Persistencia fallback | `server/db/sqlite.js` → `lead_seguimiento_historial` |
| Guardado lead | `server/db/encuestas.js` → `updateLeadSeguimientoEncuesta` |
| API GET | `server/create-app.js` → `GET /api/leads/:id/historial` |
| API PATCH | respuesta incluye `historial` (últimas 30) |
| Frontend dominio | `src/domain/seguimiento-historial.ts` |
| UI | `src/components/leads/SeguimientoHistorialPanel.tsx` en `LeadModalForm` |
| Cliente | `src/api/client.ts` → `fetchHistorialSeguimiento` |
| Demo | `src/api/demoData.ts` → `appendDemoHistorialSeguimiento` |
| SQL propuesto | `sql/lead-seguimiento-historial.sql` |

### API

```http
GET /api/leads/{leadId}/historial
→ { "historial": [ { "id", "estadoEtiqueta", "operadorNombre", "creadoEn", ... } ] }

PATCH /api/leads/{leadId}/seguimiento
→ { "lead", "historial": [...] }
```

### SQL Server (producción)

Ver [FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md](./FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md) y `sql/SP_RegistrarSeguimientoLead-notas.sql`.

### Relacionado

- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
