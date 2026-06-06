# Índice de funcionalidades (documentación por cambio lógico)

Cada cambio de negocio tiene su propio archivo en `docs/`, siguiendo la [plantilla](./PLANTILLA_FUNCIONALIDAD.md).

## Cómo documentar un cambio nuevo

1. Copiar `docs/PLANTILLA_FUNCIONALIDAD.md` → `docs/FUNCIONALIDAD_<NOMBRE>.md`.
2. Completar reglas, flujo y **tabla de archivos** donde vive la lógica.
3. Agregar una fila en la tabla de abajo.
4. Si afecta deploy o SP, enlazar también `LOGIN_SP.md`, `SORTEOS_Y_PARTICIPANTES.md`, etc.

## Funcionalidades documentadas

| Funcionalidad | Doc | Roles | Capa principal |
|---------------|-----|-------|----------------|
| Pestaña Prioridad (bandeja inicial) | [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md) | Promotor, supervisor | `prioridad-leads.ts`, `useLeadsFilter.ts`, `LeadsPanel.tsx` |
| Badge de campaña / sorteo en tarjetas | [FUNCIONALIDAD_BADGE_CAMPANIA.md](./FUNCIONALIDAD_BADGE_CAMPANIA.md) | Ambos | `encuestas.js`, `campania.ts`, `LeadCard.tsx` |
| Duplicado carga manual (teléfono + encuesta) | [FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md](./FUNCIONALIDAD_DUPLICADO_CARGA_MANUAL.md) | Ambos | `encuesta-carga.js` |
| Seguimiento PIJ tras «No compró» + reagenda | [FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md](./FUNCIONALIDAD_SEGUIMIENTO_PIJ_REAGENDA.md) | Promotor (acción), supervisor (solo lectura) | `LeadModalForm.tsx`, `leads.ts`, `LeadCard.tsx` |
| No compró / sin interés → Contactado (no Cierres) | [FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md](./FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md) | Ambos | `useLeadsFilter.ts`, `leads.ts`, `LeadsPanel.tsx` |
| Orden y estilos Contactado / Cierres + banner promotor | [FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md](./FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md) | Ambos | `leads.ts`, `useLeadsFilter.ts`, `LeadsPanel.tsx`, `LeadCard.tsx` |
| Código @usuario desde planilla SQL (strict) | [FUNCIONALIDAD_CODIGO_PROMOTOR_PLANILLA.md](./FUNCIONALIDAD_CODIGO_PROMOTOR_PLANILLA.md) | Promotor, supervisor | `operadores-catalog.js`, `encuesta-carga.js` |
| Links WhatsApp/TikTok + métricas origen | [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) §17 | Ambos | `LinksRedesSection.tsx`, `OrigenLeadsChart.tsx` |
| Derivar terreno (promotor → supervisor) | [FUNCIONALIDAD_DERIVAR_TERRENO_PROMOTOR.md](./FUNCIONALIDAD_DERIVAR_TERRENO_PROMOTOR.md) | Promotor, supervisor | `LeadModalForm.tsx`, `prioridad-leads.ts` |
| Calendario supervisor | [FUNCIONALIDAD_CALENDARIO_SUPERVISOR.md](./FUNCIONALIDAD_CALENDARIO_SUPERVISOR.md) | Supervisor | `CalendarioView.tsx`, `NavBar.tsx` |
| Conexión SP_RegistrarSeguimientoLead | [FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md](./FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md) | Ambos | `seguimiento-sql.js`, `.env SP_SEGUIMIENTO` |
| Historial de estados al guardar seguimiento | [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md) | Ambos | Tabla `registrarSeguimientoLead` + SP lectura |
| Historial inline en tarjeta de lead | [DOCUMENTACION_SISTEMA.md](./DOCUMENTACION_SISTEMA.md) §15.2.1 | Ambos | `useHistorialLeads.ts`, `LeadHistorialInline.tsx` |
| Modelo SQL seguimiento (análisis parámetros SP) | [FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md](./FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md) | DBA + dev | Propuesta `@lead_id`, `@resultado_entrevista`, etc. |
| Multisorteo / participantes | [SORTEOS_Y_PARTICIPANTES.md](./SORTEOS_Y_PARTICIPANTES.md) | Ambos | `encuesta-carga.js`, SP |
| Referidos → encuesta + árbol + visibilidad | [FUNCIONALIDAD_REFERIDOS_ENCUESTA.md](./FUNCIONALIDAD_REFERIDOS_ENCUESTA.md) | Promotor, supervisor, DBA | `lead_referido`, `referidos-carga.js`, `LeadCard.tsx` |
| Carga manual origen 2 (upsert) + modificar teléfono | [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md) | Promotor, supervisor | `encuesta-carga.js`, `encuestaSorteo01Update` |
| Acortador y verificación links redes | [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) | Supervisor (cron), ambos (notif.) | `url-shortener.js`, NavBar |
| Panel superadmin (métricas empresa) | [FUNCIONALIDAD_PANEL_SUPERADMIN.md](./FUNCIONALIDAD_PANEL_SUPERADMIN.md) | Superadmin | `SuperadminDashboard`, `admin-dashboard.js` |
| Login y rol desde `Categoria` | [LOGIN_SP.md](./LOGIN_SP.md) | Ambos | `mssql.js`, `encuestas.js` |
| Deploy y monorepo | [MONOREPO.md](./MONOREPO.md), [DEPLOY_VPS.md](./DEPLOY_VPS.md) | — | `deploy/` |

## Documentación transversal

| Tema | Archivo |
|------|---------|
| Estructuras SQL / SP | [ESTRUCTURAS_TABLAS_SP.md](./ESTRUCTURAS_TABLAS_SP.md) |
| Visión general del sistema | [DOCUMENTACION_SISTEMA.md](./DOCUMENTACION_SISTEMA.md) |
| CI / frontend deploy | [FLUJO-FRONTEND-DEPLOY.md](./FLUJO-FRONTEND-DEPLOY.md) |

## Mapa rápido `src/domain/`

| Módulo | Responsabilidad |
|--------|-----------------|
| `prioridad-leads.ts` | Grupos 0/1/2 de la pestaña Prioridad |
| `leads.ts` | Cierres, reagenda, derivación, tab destino, PIJ promotor, orden Contactado/Cierres |
| `campania.ts` | Etiquetas Sorteo 01 / 02 desde columna `encuesta` |
| `venta.ts` | Productos, pagos, etiquetas promotor/supervisor |
| `fuenteLabels.ts` | Badge QR / redes en tarjeta |
| `referidos-carga.ts` | Idempotencia y mensajes de alta referidos |
| `seguimiento-historial.ts` | Etiquetas del historial (modal e inline) |
