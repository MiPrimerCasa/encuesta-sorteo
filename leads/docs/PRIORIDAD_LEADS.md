# Prioridad en la bandeja inicial de Leads

La app **no ordena por número de sorteo ni por campaña**. Cada nuevo sorteo suma filas al mismo SP (`encuestasMuestraOperador`); la prioridad se calcula solo con **campos de negocio** que el DBA ya expone o que la app guarda en seguimiento local.

## Pestaña «Prioridad» (antes «No contactados»)

Tres grupos, en este orden:

| Orden | Grupo | Regla en la app | Campos que usa |
|------|--------|-----------------|----------------|
| 1 | **Interés terreno — derivado por promotor** | `seguimiento.resultadoEntrevista = 'derivar_terreno'` | Seguimiento local (promotor en calle) |
| 2 | **Entrevista pendiente** | `lista = 'entrevista'`, sin cierre ni reagenda, con horario válido | Encuesta / carga: `Horario de entrevista`, `lista`; opcional `horarioEntrevistaPropuesto` si derivó con fecha |
| 3 | **Encuesta sin contactar** | Sin seguimiento de contacto y sin entrevista agendada ni derivación | Sin `canal` ni `huboEntrevista`; sin horario de entrevista útil |

Dentro de cada grupo: **FIFO** por `fechaAlta` (o `fechaObtencion` si falta alta).

## Qué NO va en esta pestaña

- **Contactado** — Ya hubo contacto (`canal` o `huboEntrevista`) y no es derivación ni entrevista pendiente prioritaria.
- **En seguimiento** — `resultadoEntrevista = 'reagenda'`.
- **Cierres** — `compro`, `no_compro`, `sin_interes`.

Ver también: [SORTEOS_Y_PARTICIPANTES.md](./SORTEOS_Y_PARTICIPANTES.md) (mismo teléfono en sorteo01 y sorteo02).

## Nuevo sorteo — checklist DBA (sin cambiar la app)

1. **Mismo SP de listado** — `encuestasMuestraOperador` filtra por operador logueado; cada sorteo nuevo son más filas, no otra lógica en Node.
2. **Columnas estables** — Mantener nombres de horario de entrevista, usuario, promotor, teléfono, domicilio (ver mapeo en `mapEncuestaRowToLead`).
3. **Fecha de alta** — Que cada encuesta tenga timestamp de alta o horario real (no solo placeholder `T09:00:00` si hay cita).
4. **Login** — `Categoria` = `PROMOTOR` o `SUPERVISOR` en `operadorAccesoCategoria`.
5. **Seguimiento** — Hoy en SQLite por lead; a futuro el mismo JSON puede ir a SQL sin cambiar reglas de prioridad.

## Campos de seguimiento relevantes (app)

| Campo | Uso |
|-------|-----|
| `resultadoEntrevista` | `derivar_terreno`, `reagenda`, `compro`, etc. |
| `horarioEntrevistaPropuesto` | Fecha si el promotor derivó con cita (supervisor + calendario) |
| `canal`, `huboEntrevista` | Si pasó a «Contactado» |
| `fechaReagenda` | Pestaña En seguimiento |

## Código

- Reglas: `src/domain/prioridad-leads.ts`
- Listas: `src/hooks/useLeadsFilter.ts`
- UI agrupada: `src/components/leads/LeadsPanel.tsx`
