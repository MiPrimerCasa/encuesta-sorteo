# Prioridad en la bandeja inicial de Leads

**Índice general:** [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)  
**Roles:** promotor y supervisor  
**Estado:** activo

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

- **Contactado** — Ya hubo contacto (`canal` o `huboEntrevista`) y no es derivación ni entrevista pendiente prioritaria. **También** los resultados negativos `no_compro` y `sin_interes`.
- **En seguimiento** — `resultadoEntrevista = 'reagenda'`.
- **Cierres** — solo `compro` (compras de PIJ/terreno, incluyendo PIJ de promotores para control de calidad).

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
| `seguimientoPijPromotor` | Reagenda del promotor tras «No compró» (PIJ); supervisor solo lectura |

## Reagenda PIJ tras «No compró» (promotor)

Si el promotor marca **No compró** y elige **reagendar** para volver a ofrecer Plan Inversión Joven:

- `resultadoEntrevista` = `reagenda`, `seguimientoPijPromotor` = `true`, `fechaReagenda` obligatoria.
- Sale de **Prioridad** y pasa a **En seguimiento**, ordenado por `fechaReagenda`.
- El **supervisor** ve la tarjeta en En seguimiento con badge *Seguimiento por plan inversión joven*, texto *Promotor: [nombre]* y **sin poder abrir** el lead (solo lectura). En calendario tampoco puede reagendar ni cambiar estado.

## Dónde está el cambio (mapa de código)

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Reglas prioridad 0/1/2 | `src/domain/prioridad-leads.ts` | `prioridadTabInicial`, `perteneceTabInicial`, `ordenarPorPrioridadTabInicial`, etiquetas de grupo |
| Tab destino al abrir lead | `src/domain/leads.ts` → `tabIdListaLead` | Derivados y entrevista pendiente → pestaña `entrevista` (Prioridad) |
| Listas excluyentes | `src/hooks/useLeadsFilter.ts` | `entrevistaPendiente`, `paraContactar`, `encuestaSinContactar` (alertas +2 días) |
| UI pestaña y secciones | `src/components/leads/LeadsPanel.tsx` | Tab «Prioridad», `agruparPorPrioridadTabInicial`, banner informativo (texto distinto promotor vs supervisor) |
| Alertas promotor | `src/components/leads/AlertasSinContactar.tsx` | Solo prioridad 2 (encuesta sin contactar) |
| Tarjetas | `src/components/leads/LeadCard.tsx` / `SwipeableLeadCard.tsx` | Render por grupo |

## Relacionado

- [FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md](./FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md) — orden y colores en Contactado / Cierres; banner promotor
- [FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md](./FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md) — negativos en Contactado, no en Cierres
- [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md) — sale de Prioridad al reagendar PIJ
- [FUNCIONALIDAD_DERIVAR_TERRENO_PROMOTOR.md](./FUNCIONALIDAD_DERIVAR_TERRENO_PROMOTOR.md) — grupo 0 en Prioridad
- [SORTEOS_Y_PARTICIPANTES.md](./SORTEOS_Y_PARTICIPANTES.md)