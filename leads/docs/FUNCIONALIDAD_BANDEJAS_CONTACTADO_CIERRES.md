# Bandejas Contactado y Cierres — orden y estilos UX

**Roles:** promotor y supervisor  
**Estado:** activo (jun. 2026)  
**RF:** RF-44 … RF-47 (§16 `DOCUMENTACION_SISTEMA.md`)

### Resumen

Mejoras de **orden visual** y **contexto** en las pestañas Contactado y Cierres, más el banner informativo adaptado al rol promotor.

### Reglas de negocio

#### Banner informativo (RF-44)

| Rol | Mensaje |
|-----|---------|
| **Supervisor** | Prioridad: derivados a terreno → entrevistas agendadas → encuestas sin contactar. Reagendar → En seguimiento. |
| **Promotor** | Prioridad: tus entrevistas agendadas → encuestas sin contactar. Swipe o abrir tarjeta para seguimiento. Reagendar → En seguimiento. |

#### Cierres — ventas recientes arriba (RF-45)

- Solo leads con `resultadoEntrevista = compro`.
- Orden: **fecha de venta descendente** (última entrada `compro` del historial; respaldo `fechaAlta`).
- Aplica igual a promotor y supervisor.

#### Contactado — post-entrevista prioritario (RF-46, RF-47)

| Prioridad | Condición | Orden dentro del grupo | Estilo |
|:---------:|-----------|------------------------|--------|
| 1 | `no_compro` o `sin_interes` **y** `huboEntrevista = true` | Más reciente arriba | Fondo naranja claro, pill «No compró» / «Sin interés» |
| 2 | Resto de contactados (`canal` o contacto previo) | FIFO por `fechaAlta` | Fondo ámbar (contactado habitual) |

La reagenda PIJ tras «No compró» **no** entra aquí — va a En seguimiento ([FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md)).

### Dónde está el cambio

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Dominio | `src/domain/leads.ts` | `fechaVentaLead`, `sortLeadsPorVentaReciente`, `leadPostEntrevistaSinCompra`, `sortLeadsContactados` |
| Filtros | `src/hooks/useLeadsFilter.ts` | `compraron` y `paraContactar` con nuevos ordenadores |
| UI lista | `src/components/leads/LeadsPanel.tsx` | Banner por rol; Cierres reordena con `historialPorLead` |
| Tarjeta | `src/components/leads/LeadCard.tsx` | Clase naranja + pill `post-entrevista` |
| Pill | `src/components/ui/StatusPill.tsx` | Variante `post-entrevista` |

### Pruebas manuales

- [ ] Promotor: banner sin texto de «derivados a terreno».
- [ ] Supervisor: banner con tres grupos de prioridad.
- [ ] Registrar venta nueva → aparece primera en **Cierres**.
- [ ] Marcar entrevista + no compró → **Contactado**, arriba del resto, tarjeta naranja.
- [ ] Contactado habitual (solo canal, sin negativo) → ámbar, debajo de los naranjas.

### Relacionado

- [FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md](./FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md) — negativos en Contactado, no en Cierres
- [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md) — pestaña Prioridad
- [DOCUMENTACION_SISTEMA.md](./DOCUMENTACION_SISTEMA.md) §16
