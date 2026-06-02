# Seguimiento PIJ: «No compró» + reagenda (promotor) y solo lectura (supervisor)

**Roles:** promotor (gestiona), supervisor (visualiza)  
**Estado:** activo

### Resumen

Cuando el promotor registró entrevista, eligió **No compró** y **reagendar** para volver a ofrecer Plan Inversión Joven, el lead deja la pestaña **Prioridad**, pasa a **En seguimiento** ordenado por la nueva fecha, y el supervisor lo ve con etiqueta explícita sin poder editarlo.

### Reglas de negocio

| Actor | Acción | Persistencia | Pestaña |
|-------|--------|--------------|---------|
| Promotor | No compró + **No** reagendar | `resultadoEntrevista: no_compro` | Cierres → No compró |
| Promotor | No compró + **Sí** reagendar + fecha | `resultadoEntrevista: reagenda`, `seguimientoPijPromotor: true`, `fechaReagenda`, `huboEntrevista: true` | En seguimiento |
| Supervisor | Clic en tarjeta / calendario | — | Bloqueado (solo lectura) |

Orden en **En seguimiento:** por `fechaReagenda` ascendente (más próximo primero) — `sortSeguimientoPorFechaReagenda` en `useLeadsFilter.ts`.

### Flujo promotor

1. Leads → abrir lead → **Visita en calle** → Sí hubo entrevista.
2. **No compró** → «¿Reagendar para ofrecer nuevamente el Plan Inversión Joven?» → **Sí** → fecha/hora.
3. Guardar → desaparece de **Prioridad**; pestaña cambia a **En seguimiento**.

### Flujo supervisor

1. **En seguimiento** → tarjeta con fondo índigo, badge **Seguimiento por plan inversión joven**, texto **Promotor: [nombre]**.
2. La tarjeta no abre el modal (`leadSoloLecturaSupervisor`).
3. **Calendario:** evento visible; sin «Reagendar» ni «Cambiar estado» si es seguimiento PIJ del promotor.

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Reglas dominio | `src/domain/leads.ts` | `leadSeguimientoPijPromotor`, `leadSoloLecturaSupervisor`, `ETIQUETA_SEGUIMIENTO_PIJ` |
| Filtros / orden | `src/hooks/useLeadsFilter.ts` | Excluye reagendas de Prioridad; `sortSeguimientoPorFechaReagenda` |
| Formulario | `src/components/leads/LeadModalForm.tsx` | Bloque reagenda PIJ tras `no_compro`; guardado con `seguimientoPijPromotor` |
| Listado | `src/components/leads/LeadsPanel.tsx` | Bloqueo `abrirLead`; tras guardar promotor → tab seguimiento |
| Tarjeta | `src/components/leads/LeadCard.tsx` | Badge, promotor, `div` no clickeable si solo lectura |
| Agenda en tarjeta | `src/components/leads/EntrevistaAgendaBadge.tsx` | Título «Próximo contacto — Plan Inversión Joven» (vía prop `titulo`) |
| Calendario | `src/components/calendario/CalendarioView.tsx` | Oculta acciones si `leadSoloLecturaSupervisor` |
| Tipos | `src/types/index.ts` → `SeguimientoLead.seguimientoPijPromotor` | Flag booleano |
| Schema API | `server/schemas/seguimiento.js` | Acepta `seguimientoPijPromotor` en PATCH seguimiento |
| Persistencia | `server/db/sqlite.js` → `upsertSeguimientoExterno` | JSON merge por `lead_id` |
| Demo | `src/api/demoData.ts` | `lead-04` ejemplo con `seguimientoPijPromotor: true` |

### Campos de seguimiento

| Campo | Valor típico |
|-------|----------------|
| `resultadoEntrevista` | `reagenda` |
| `seguimientoPijPromotor` | `true` |
| `fechaReagenda` | ISO local (`YYYY-MM-DDTHH:mm`) |
| `huboEntrevista` | `true` |

### Pruebas manuales

- [ ] Promotor: no compró + reagenda → sale de Prioridad, aparece en En seguimiento con fecha.
- [ ] Promotor: no compró sin reagenda → Cierres / No compró.
- [ ] Supervisor: no abre modal en tarjeta PIJ; calendario sin botones de edición.
- [ ] Orden: dos reagendas con fechas distintas → la más cercana arriba.

### Relacionado

- [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md)
- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
