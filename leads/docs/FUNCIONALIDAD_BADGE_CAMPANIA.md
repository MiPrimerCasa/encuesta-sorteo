# Badge de campaña (sorteo) en tarjetas de lead

**Roles:** promotor y supervisor  
**Estado:** activo

### Resumen

Cada lead muestra en la tarjeta el sorteo/campaña al que pertenece (ej. **Sorteo 01**, **Sorteo 02**), leyendo la columna `encuesta` del SP `encuestasMuestraOperador`. Permite distinguir el mismo teléfono en campañas distintas sin mezclar prioridades por sorteo.

### Reglas de negocio

| Origen del dato | Campo en app | Etiqueta UI |
|-----------------|--------------|-------------|
| Columna SQL `encuesta` / `Encuesta` | `lead.codigoCampania` (normalizado, ej. `sorteo01`) | `etiquetaCampania()` → «Sorteo 01» |
| Sin columna en fila | `codigoCampania` undefined | Sin chip |

La prioridad de la pestaña **Prioridad** no depende del sorteo (ver [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md)).

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Backend mapeo SP → lead | `server/db/encuestas.js` → `mapEncuestaRowToLead` | `pickField(row, 'encuesta', …)` + `normalizarEncuestaCargaId` |
| Normalización sorteo | `server/db/codigo-promotor.js` → `normalizarEncuestaCargaId` | `SORTEO01` → `sorteo01` |
| Dominio UI | `src/domain/campania.ts` | `normalizarCodigoCampania`, `etiquetaCampania` |
| Tipos | `src/types/index.ts` → `Lead.codigoCampania` | Contrato frontend |
| UI tarjeta | `src/components/leads/LeadCard.tsx` | Chip violeta bajo el nombre del lead |

### Persistencia

- El código de campaña **viene del SP** en cada listado; no se guarda aparte en SQLite.
- La carga manual usa `ENCUESTA_CARGA_ID` en servidor (ver [FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md](./FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md)).

### Pruebas manuales

- [ ] Lead con `encuesta = sorteo01` en SQL → chip «Sorteo 01».
- [ ] Lead sorteo02 → «Sorteo 02».
- [ ] Fila sin columna `encuesta` → sin chip (comportamiento legacy).

### Relacionado

- [SORTEOS_Y_PARTICIPANTES.md](./SORTEOS_Y_PARTICIPANTES.md)
- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
