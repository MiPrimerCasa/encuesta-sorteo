# Panel superadmin — datos en pantalla (RF-35)

**Fecha / referencia:** junio 2026 · `SuperadminDashboard.tsx`, `GET /api/admin/dashboard`  
**Roles afectados:** superadmin  
**Estado:** activo

### Resumen

El rol **superadmin** no usa las bandejas de leads. Al iniciar sesión ve el **Panel global de equipos**: métricas consolidadas de todos los supervisores y promotores del sorteo, con KPIs del día, rankings de la semana móvil, gráficos de evolución, conocimiento de encuesta y embudo de productividad.

Los datos provienen de `GET /api/admin/dashboard` (`AdminDashboardData`). En producción el backend ejecuta el SP de listado global (`SP_ENCUESTAS_ADMIN`, default `encuestasMuestra`) y cruza el historial de seguimiento SQL (`registrarSeguimientoLead`, últimos ~400 días).

---

## 1. Acceso y encabezado

| Elemento | Contenido | Origen |
|----------|-----------|--------|
| Rol | Solo usuarios con `rol === 'superadmin'` (logins en `SUPERADMIN_LOGIN_IDS`) | `superadmin-auth.js`, login |
| Vista por defecto | `admin` (no bandejas Prioridad/Contactado/Cierres) | `App.tsx` |
| Título | «Mi Primer Casa S.A. · Superadmin» | UI fija |
| Subtítulo | «Panel global de equipos» | UI fija |
| Rango temporal | «Semana móvil (dd/mm – dd/mm) · Resultados de hoy (día de la semana, día mes)» | `semanaDesde`, `semanaHasta`, `hoy` |
| Aviso (banner ámbar) | Mensaje de error o advertencia si el SP falla o no devuelve datos | `data.aviso` |

**Semana móvil:** los 7 días que terminan hoy (hoy + 6 días anteriores). Las métricas «semana» usan ese rango; «hoy» es el día calendario actual.

---

## 2. Sección «Hoy» — 4 tarjetas KPI

Tarjetas numéricas con totales **globales** (suma de todos los equipos):

| Tarjeta | Campo API | Definición |
|---------|-----------|------------|
| **Entrevistas** | `resumenHoy.entrevistas` | Leads distintos con al menos un registro de entrevista hoy en historial (`hubo_entrevista`, `confirmo_entrevista` o `resultado_entrevista` ∈ compro/no_compro/reagenda/derivar_terreno/sin_interes). Máx. 1 por lead por día. |
| **Cierres** | `resumenHoy.cierres` | Leads con `resultado_entrevista = compro` registrado hoy. Máx. 1 por lead. |
| **Terrenos** | `resumenHoy.ventasTerreno` | Cierres hoy con `id_producto = prod-terreno`. |
| **Plan Inv. Joven** | `resumenHoy.ventasPij` | Cierres hoy con `id_producto = prod-pij`. |

---

## 3. Evolución temporal — gráfico de barras

**Componente:** `AdminMetricsChart`  
**Visible si:** `eventos.length > 0`

| Control | Opciones |
|---------|----------|
| Filtro supervisor | «Todos los equipos» o un supervisor (solo si hay más de uno) |
| Agrupación período | Semana (ISO) · Mes · Año |

**Series del gráfico** (barras agrupadas por período):

| Serie | Color | Tipo evento | Cómo se cuenta |
|-------|-------|-------------|----------------|
| Leads | Gris `#71717A` | `lead` | Fecha de alta del lead (`fechaAlta` / `fechaObtencion`) |
| Entrevistas | Bordó `#9A1620` | `entrevista` | Primera entrevista por lead por día en historial |
| Cierres | Verde `#059669` | `cierre` | Cada fila de historial con `resultado_entrevista = compro` |
| Terrenos | Ámbar `#D97706` | `terreno` | Cierre + producto terreno |
| PIJ | Índigo `#6366F1` | `pij` | Cierre + producto PIJ |

Historial consultado: ~400 días hacia atrás desde hoy (para cubrir vista anual).

---

## 4. Conocimiento de marca — encuesta de captación

**Componente:** `AdminConocimientoEncuesta`  
**Visible si:** `conocimientoLeads.total > 0`

Encabezado: total de leads en el listado global.

### 4.1 ¿Conocían Mi Primer Casa?

| Dato | Campo | Fuente lead |
|------|-------|-------------|
| Total leads | `conocimientoLeads.total` | Cantidad de filas del SP |
| Sí | `conocimientoLeads.conoceMpc.si` | `lead.conoceMpc === true` |
| No | `conocimientoLeads.conoceMpc.no` | `lead.conoceMpc === false` |
| Sin dato | `conocimientoLeads.conoceMpc.sinResponder` | `conoceMpc` null/undefined |
| Gráfico | Barra apilada Sí / No / Sin dato | Solo si hay al menos una respuesta Sí o No |

### 4.2 ¿Sabían del Plan Inversión Joven?

| Dato | Campo | Fuente lead |
|------|-------|-------------|
| Sí | `conocimientoLeads.sabiaPlanInversionJoven.si` | `lead.sabiaPlanInversionJoven === true` |
| No | `conocimientoLeads.sabiaPlanInversionJoven.no` | `false` |
| Sin dato | `conocimientoLeads.sabiaPlanInversionJoven.sinResponder` | null/undefined |
| Gráfico | Igual que arriba | Colores índigo / gris / ámbar |

Origen SQL: campos derivados de `campo3` y `campo4` de encuesta (sin mezclar metadata de referidos).

---

## 5. Productividad — embudo y eficiencia

**Componente:** `AdminProductividadPanel`  
**Visible si:** `productividad.embudoGlobal.leads > 0`

### 5.1 Embudo global

Barras de progreso sobre **todos los leads** del SP:

| Etapa | Campo | Tasa mostrada |
|-------|-------|---------------|
| Leads | `embudoGlobal.leads` | 100 % (base) |
| Con entrevista | `embudoGlobal.conEntrevista` | `tasaEntrevistaPct` = entrevistas / leads |
| Con cierre | `embudoGlobal.conCierre` | `tasaCierreLeadPct` = cierres / leads |
| Texto adicional | — | **Cierre sobre entrevistas:** `tasaCierreEntrevistaPct` = cierres / entrevistas |

**Criterio entrevista:** `huboEntrevista` en seguimiento actual, resultado de entrevista conocido, o fila en historial que indique entrevista.  
**Criterio cierre:** `resultadoEntrevista === compro` en seguimiento o historial.

### 5.2 Mini KPIs (cuadrícula 2×2)

| Etiqueta | Campos | Definición |
|----------|--------|------------|
| **Tiempo resp. prom.** | `tiempoPrimeraEntrevista` | Días desde alta del lead hasta primera entrevista. Muestra promedio, mediana y cantidad de muestras. |
| **Recuperación PIJ** | `pijRecuperacion` | % de leads con seguimiento PIJ promotor (`seguimientoPijPromotor`) que terminaron en cierre. Subtítulo: «X cierres de Y seguimientos». |
| **Cierres c/ referidos** | `referidos` | Cantidad de cierres donde `brindoReferidos === true`. Subtítulo: total de referidos brindados (`referidos[]`). |
| **Backlog +30 días** | `backlog` | Leads sin gestión (sin cierre, sin entrevista, sin seguimiento PIJ, sin reagenda) con más de 30 días desde alta. Subtítulo: también cuenta 7d y 14d (`sinGestion7`, `sinGestion14`). |

### 5.3 Resultado de entrevistas (gráfico barras horizontales)

Conteo por estado **actual** de cada lead (`resultadosEntrevista`):

| Clave | Etiqueta en pantalla |
|-------|----------------------|
| `compro` | Compró |
| `no_compro` | No compró |
| `reagenda` | Reagenda |
| `sin_interes` | Sin interés |
| `derivar_terreno` | Derivar terreno |
| `pendiente` | Sin resultado |

Solo se muestran categorías con cantidad > 0.

### 5.4 Efectividad por canal (gráfico barras)

Por cada fuente con al menos un lead (`canales[]`):

| Columna / dato | Campo | Canales posibles |
|----------------|-------|------------------|
| Etiqueta | `label` | QR, Manual, Facebook, Instagram, WhatsApp, TikTok, Otros |
| Leads | `leads` | Barra gris |
| Cierres | `cierres` | Barra con color de marca por fuente |
| Tasa cierre | `tasaCierrePct` | Badge bajo el gráfico: «{canal}: X% cierre» |

Fuente del lead: `seguimiento.fuente` (mapeo desde origen de carga manual vía `origenIngresoToFuente`).

### 5.5 Encuesta vs cierre (tabla)

**Visible si:** `conocimientoVsCierre.length > 0`

| Columna | Campo |
|---------|-------|
| Segmento | `segmento` — ej. «Conoce MPC: Sí», «Sabía PIJ: No», «Conoce MPC: Sin dato» |
| Leads | `leads` |
| Cierres | `cierres` |
| Tasa | `tasaCierrePct` — cierres / leads del segmento |

### 5.6 Promotores por tasa de cierre (tabla, top 8)

Ordenados por `tasaCierrePct` descendente (`embudoPromotores`, máx. 8 filas):

| Columna | Campo | Fórmula |
|---------|-------|---------|
| Promotor | `promotorNombre` + `supervisorNombre` (subtítulo) | — |
| Leads | `leads` | Total asignado al promotor |
| Entrev. | `entrevistas` | Con entrevista |
| Cierres | `cierres` | Con cierre |
| Lead→Ent. | `tasaEntrevistaPct` | entrevistas / leads |
| Ent.→Cierre | `tasaCierreEntrevistaPct` | cierres / entrevistas |
| Lead→Cierre | `tasaCierrePct` | cierres / leads (destacado) |

> Esta tabla cubre parte de la métrica **RF-26** (efectividad por promotor), aunque RF-26 formal sigue pendiente en la vista del **supervisor**.

---

## 6. Destacados de la semana — 5 rankings

**Visible siempre** (listas vacías muestran «Sin datos en la semana»).

Top **5 promotores** por métrica en la semana móvil. Cada ítem muestra:

| Campo en lista | Origen |
|----------------|--------|
| Posición | 1–5 |
| Nombre promotor | `promotorNombre` |
| Supervisor | `supervisorNombre` (si existe) |
| Valor | `valor` (sin unidad extra en UI) |

| Ranking | Campo API | Métrica |
|---------|-----------|---------|
| Más entrevistas | `rankings.entrevistasSemana` | `entrevistasSemana` por promotor |
| Más cierres | `rankings.cierresSemana` | `cierresSemana` |
| Más leads nuevos | `rankings.leadsSemana` | Altas de lead en semana móvil |
| Más terrenos vendidos | `rankings.ventasTerrenoSemana` | Cierres terreno en semana |
| Más Plan Inv. Joven | `rankings.ventasPijSemana` | Cierres PIJ en semana |

---

## 7. Supervisores y equipos — tablas por equipo

Un **artículo por supervisor**, ordenados alfabéticamente.

### 7.1 Encabezado de equipo

| Dato | Campo |
|------|-------|
| Nombre supervisor | `supervisorNombre` |
| Cantidad promotores | `promotores.length` |
| Totales semana | `totales.entrevistasSemana` ent. · `totales.cierresSemana` cierres |
| Totales hoy | `totales.entrevistasHoy` ent. · `totales.cierresHoy` cierres |

### 7.2 Tabla de promotores (por fila)

| Columna UI | Campo API | Alcance temporal |
|------------|-----------|------------------|
| Promotor | `promotorNombre` | — |
| Leads | `leadsTotal` | **Histórico** (todos los leads del promotor en el SP) |
| Ent. sem. | `entrevistasSemana` | Semana móvil |
| Ent. hoy | `entrevistasHoy` | Hoy |
| Cierres sem. | `cierresSemana` | Semana móvil |
| Cierres hoy | `cierresHoy` | Hoy |
| Terrenos | `ventasTerrenoSemana` | Semana móvil (producto terreno) |
| PIJ | `ventasPijSemana` | Semana móvil (producto PIJ) |

**Nota:** `leadsSemana`, `ventasTerrenoHoy` y `ventasPijHoy` existen en el modelo pero **no** se muestran en esta tabla (solo en rankings / resumen hoy global).

---

## 8. Contrato API `AdminDashboardData`

Respuesta de `GET /api/admin/dashboard`:

```typescript
{
  generadoEn: string;           // ISO timestamp
  semanaDesde: string;
  semanaHasta: string;
  hoy: string;
  supervisores: SupervisorMetricasAdmin[];
  resumenHoy: { entrevistas, cierres, ventasTerreno, ventasPij };
  rankings: {
    entrevistasSemana, cierresSemana, leadsSemana,
    ventasTerrenoSemana, ventasPijSemana  // RankingAdminEntry[]
  };
  eventos?: AdminChartEvent[];           // gráfico temporal
  conocimientoLeads?: AdminConocimientoLeads;
  productividad?: AdminProductividad;
  aviso?: string;
  totalLeads?: number;        // solo respuesta servidor
  totalSupervisores?: number;
  source?: string;            // nombre SP usado
}
```

---

## 9. Fuentes de datos y variables de entorno

| Variable | Default | Uso |
|----------|---------|-----|
| `SP_ENCUESTAS_ADMIN` | `encuestasMuestra` | Listado global de encuestas/leads |
| `SP_SEGUIMIENTO` | — | Si está configurado, habilita lectura de historial SQL |
| `SEGUIMIENTO_TABLE` | `registrarSeguimientoLead` | Tabla para eventos y métricas de semana/hoy |
| `SUPERADMIN_LOGIN_IDS` | — | IDs de login con rol superadmin |

**Permisos DBA:** `GRANT EXECUTE` a `MPCSP` sobre `encuestasMuestra` (o el SP configurado). Sin permiso, el panel muestra `aviso` y datos vacíos.

**Modo demo:** `npm run demo` — `getDemoAdminDashboard()` genera datos ficticios con la misma estructura.

---

## 10. Mapa de código

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| UI principal | `src/components/admin/SuperadminDashboard.tsx` | Layout, KPIs, rankings, tablas |
| Gráfico temporal | `src/components/admin/AdminMetricsChart.tsx` | Filtros y barras por período |
| Conocimiento | `src/components/admin/AdminConocimientoEncuesta.tsx` | Preguntas campo3/campo4 |
| Productividad | `src/components/admin/AdminProductividadPanel.tsx` | Embudo, canales, promotores |
| Hook gráfico | `src/hooks/useAdminChartData.ts` | Agrupación semana/mes/año |
| Tipos | `src/types/index.ts` | `AdminDashboardData` y sub-tipos |
| Métricas semana/hoy | `src/domain/admin-metrics.ts`, `server/domain/admin-metrics.js` | `buildAdminDashboard`, rankings |
| Productividad | `src/domain/admin-productividad.ts`, `server/domain/admin-productividad.js` | Embudo, backlog, canales |
| API servidor | `server/db/admin-dashboard.js` | `fetchAdminDashboard` |
| Endpoint | `server/create-app.js` | `GET /api/admin/dashboard` (solo superadmin) |
| Cliente | `src/api/client.ts` | `fetchAdminDashboard` |
| Auth rol | `server/db/superadmin-auth.js` | Resolución superadmin |

---

## 11. Pruebas manuales sugeridas

- [ ] Login con ID en `SUPERADMIN_LOGIN_IDS` → carga panel sin bandejas de leads.
- [ ] Verificar que las 4 tarjetas «Hoy» coinciden con actividad del día en STRSYSTEM.
- [ ] Cambiar agrupación del gráfico (semana/mes/año) y filtro por supervisor.
- [ ] Confirmar rankings con promotor que tuvo entrevistas/cierres en la semana.
- [ ] Tabla de supervisor: totales del encabezado = suma de filas de promotores.
- [ ] Sin `SP_SEGUIMIENTO`: gráfico y métricas de semana/hoy pueden quedar en 0; productividad parcial.
- [ ] `npm run demo`: panel renderiza con datos de `demoData.ts`.

---

## Relacionado

- [DOCUMENTACION_SISTEMA.md](./DOCUMENTACION_SISTEMA.md) §14.2.7 (RF-35)
- [LOGIN_SP.md](./LOGIN_SP.md) — rol desde `Categoria`
- [FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md](./FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md) — historial para métricas
- [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)
