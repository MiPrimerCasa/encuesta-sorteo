# Calendario y seguimiento desde agenda (solo supervisor)

**Roles:** supervisor (calendario); promotor sin pestaña calendario  
**Estado:** activo

### Resumen

El supervisor ve **Calendario** en la barra de navegación. Desde un evento puede **reagendar** o **cambiar estado** (abre Leads con el modal del lead). Los leads en seguimiento PIJ del promotor son **solo lectura** también en calendario.

### Reglas de negocio

| Rol | Calendario | Acciones en evento |
|-----|------------|-------------------|
| Supervisor | Sí | Reagendar, cambiar estado (salvo seguimiento PIJ promotor) |
| Promotor | No (pestaña oculta) | — |

Eventos = entrevistas agendadas + reagendas (`fechaReagenda`).

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Navegación | `src/components/layout/NavBar.tsx` | `TABS_SUPERVISOR` vs `TABS_PROMOTOR` |
| Vista | `src/App.tsx` | Render `CalendarioView` si `vistaActiva === 'calendario'` y rol supervisor |
| Calendario | `src/components/calendario/CalendarioView.tsx` | Grilla, drawer evento, `RescheduleSheet` |
| Eventos | `src/components/calendario/calendar-types.ts` → `buildCalendarEvents` | Desde `getHorarioEntrevistaLead` / reagenda |
| Ir a Leads | `App.tsx` → `onAbrirSeguimientoLead` | `setLeadIdSeguimiento` + cambio de vista |
| Consumo deep link | `src/components/leads/LeadsPanel.tsx` | `leadIdSeguimientoInicial` abre modal |
| Solo lectura PIJ | `CalendarioView.tsx` + [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md) | Sin botones si `leadSoloLecturaSupervisor` |

### Relacionado

- [LOGIN_SP.md](./LOGIN_SP.md) — rol supervisor
- [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md)
