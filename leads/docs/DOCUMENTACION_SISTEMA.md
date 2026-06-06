# Documentación del Sistema — Seguimiento de Leads (Mi Primer Casa S.A.)

> Documento maestro de referencia funcional y técnica del CRM **Seguimiento de Leads**.
> Reúne objetivos, requerimientos, actores, funciones, reglas de negocio, arquitectura y despliegue.

---

## 1. Resumen ejecutivo

**Seguimiento de Leads** es un CRM *mobile-first* para los operadores comerciales de **Mi Primer Casa S.A.**. Permite gestionar los *leads* (contactos potenciales) que provienen de **encuestas y sorteos** difundidos mediante una *landing* con código QR, realizar su seguimiento comercial hasta el cierre (venta o descarte), y ofrecer métricas y calendario al equipo de ventas.

El sistema se conecta a la base de datos de **producción (SQL Server – STRSYSTEM)** para leer los participantes/encuestas y autenticar usuarios, y mantiene una base de datos local **SQLite** para persistir el seguimiento comercial y los catálogos.

- **Producto comercial principal:** Plan Inversión Joven (PIJ) y venta de Terrenos.
- **Usuarios del sistema:** Promotores y Supervisores.
- **Acceso público:** `https://www.miprimercasafsa-sorteo.com/leads`

---

## 2. Objetivos del sistema

1. **Centralizar** el seguimiento comercial de los leads provenientes de sorteos/encuestas de Mi Primer Casa.
2. **Priorizar** las acciones comerciales de mayor valor (interés en terreno derivado → entrevistas pendientes → nuevos contactos sin atender).
3. **Registrar ventas** aplicando reglas según producto y rol del usuario.
4. **Dar visibilidad al supervisor** sobre su equipo: rendimiento por promotor, calendario de entrevistas y conversión.
5. **Permitir carga manual** de leads alineada con el mismo flujo que la landing del sorteo.
6. **Soportar múltiples campañas/sorteos** simultáneos sin cambiar la lógica de priorización.

---

## 3. Actores del sistema

| Actor | Descripción | Acceso |
|-------|-------------|--------|
| **Promotor comercial** | Operador de campo que gestiona sus propios leads. | Vistas: Leads, Métricas |
| **Supervisor** | Responsable de un equipo de promotores. | Vistas: Leads, Promotores, Calendario |
| **DBA / Administración** | Gestiona Stored Procedures, campañas activas y la planilla de códigos de promotor. | Backend / Base de datos |
| **Cliente final (participante)** | Persona que completó la encuesta/sorteo. *Fuera del CRM* (es el origen del lead). | — |

### Diferencias por rol

| Capacidad | Promotor | Supervisor |
|-----------|:--------:|:----------:|
| Ver sus propios leads | ✔ | ✔ |
| Ver leads de todo el equipo | — | ✔ |
| Contacto rápido (swipe) | ✔ | — |
| Vender Plan Inversión Joven (PIJ) | ✔ | ✔ |
| Vender Terreno | — | ✔ |
| Derivar interés de Terreno al supervisor | ✔ | — |
| Calendario de entrevistas | — | ✔ |
| Métricas por promotor (equipo) | — | ✔ |
| Métricas personales | ✔ | — |
| Cargar lead manualmente | ✔ (propio) | ✔ (propio o de promotor) |

---

## 4. Requerimientos

> **Última revisión de estado:** junio 2026 (auditoría contra el código en `src/` y `server/`).

### Leyenda de estado

| Estado | Significado |
|--------|-------------|
| **Implementado** | Cubierto en la app/backend en producción o en el flujo actual del repo. |
| **Parcial** | Existe algo equivalente pero falta el detalle del requerimiento (UI, regla o capa DBA). |
| **Pendiente** | No implementado o depende del DBA / infra sin integrar aún. |

### 4.0 Resumen de cumplimiento

| Ámbito | Implementados | Parciales | Pendientes |
|--------|:-------------:|:---------:|:----------:|
| Requerimientos funcionales (RF-01 … RF-28) | 20 | 7 | 1 |
| Requerimientos funcionales ampliados (RF-29 … RF-43, §14–§15) | 13 | 2 | 0 |
| Requerimientos funcionales UX bandejas (RF-44 … RF-47, §16) | 4 | 0 | 0 |
| Requerimientos funcionales links y código (RF-48 … RF-51, §17) | 4 | 0 | 0 |
| **Total requerimientos funcionales (RF-01 … RF-51)** | **41** | **9** | **1** |
| Requerimientos no funcionales (RNF-01 … RNF-08) | 8 | 0 | 0 |
| Entregables DBA (sección 13.8, ítems 1 … 10) | 1 | 2 | 7 |

*Nota: en app, RF-17 está parcial (badge + `ENCUESTA_CARGA_ID`); en SQL faltan `dbo.campania`, SP ampliados y persistencia de seguimiento en servidor (ítems 1–4, 6–8 del anexo 13). RF-26 sigue pendiente en vista supervisor (existe métrica parcial en superadmin, RF-35).*

### 4.1 Requerimientos funcionales

| ID | Estado | Requerimiento | Notas / referencia en código |
|----|--------|---------------|------------------------------|
| RF-01 | **Implementado** | El sistema debe autenticar usuarios contra SQL Server de producción (SP `operadorAccesoCategoria`). | `server/create-app.js`, login |
| RF-02 | **Implementado** | El sistema debe determinar automáticamente el rol (promotor/supervisor) según la relación `idOperador`/`idVendedor` y la categoría del operador. | `server/db/encuestas.js` |
| RF-03 | **Implementado** | El sistema debe listar los leads/encuestas asignados al operador (SP `encuestasMuestraOperador`). | `fetchLeads`, `mapEncuestaRowToLead` |
| RF-04 | **Implementado** | El sistema debe clasificar los leads en pestañas: **Prioridad**, **Contactado**, **En seguimiento** y **Cierres**. | `LeadsPanel.tsx`, `useLeadsFilter.ts` |
| RF-05 | **Implementado** | El sistema debe priorizar los leads en tres niveles: terreno derivado (0), entrevista pendiente (1) y encuesta sin contactar (2), ordenados FIFO por fecha de alta. | `prioridad-leads.ts` |
| RF-06 | **Implementado** | El sistema debe mostrar una alerta de encuestas sin contactar por ≥ 2 días. | `AlertasSinContactar.tsx` |
| RF-07 | **Implementado** | El sistema debe permitir registrar el seguimiento comercial completo de un lead (contacto, entrevista, resultado, venta, referidos). | `LeadModalForm.tsx`, `seguimientoSchema` |
| RF-08 | **Implementado** | El sistema debe permitir agendar y reagendar entrevistas. | `NuevoLeadSheet`, `fechaReagenda`, `CalendarioView` / `RescheduleSheet` |
| RF-09 | **Implementado** | El sistema debe permitir la carga manual de leads (SP de carga, por defecto `encuestaCargaSorteo01`). | `NuevoLeadSheet`, `encuesta-carga.js` |
| RF-10 | **Implementado** | El sistema debe rechazar cargas duplicadas con el mismo teléfono dentro de la misma campaña. | `encuesta-carga.js`, pre-chequeo API |
| RF-11 | **Implementado** | El sistema debe permitir el contacto vía WhatsApp con mensaje prearmado. | `WhatsAppLeadButton.tsx`, `whatsapp.ts` |
| RF-12 | **Implementado** | El sistema debe ofrecer enlaces para compartir en redes según el operador (Instagram, Facebook, WhatsApp, TikTok). | `LinksRedesSection.tsx`, `/api/links-redes`, `rptLinkQRenRedesSociales` |
| RF-13 | **Implementado** | El supervisor debe poder ver un calendario mensual de entrevistas y reagendas (con feriados de Argentina). | `CalendarioView.tsx`, `lib/feriados` |
| RF-14 | **Implementado** | El supervisor debe poder ver métricas de conversión y rendimiento por promotor. | `PromotoresPanel`, `PromotoresTable` (total, compró, % conversión) |
| RF-15 | **Implementado** | El promotor debe poder ver sus métricas personales (resumen, origen de leads, historial). | `PromotorMetricasPanel`, `PromotorResumen` |
| RF-16 | **Implementado** | El sistema debe aplicar reglas de venta según producto y rol (PIJ vs Terreno, estados de pago, recibo, barrio). | `venta.ts`, `seguimientoSchema`, `catalog.js` |
| RF-17 | **Parcial** | El sistema debe soportar múltiples campañas/sorteos identificadas por `codigoCampania`. | Badge y `ENCUESTA_CARGA_ID` en app; política del SP de listado (A/B/C) y tabla `campania` pendientes en SQL |
| RF-18 | **Parcial** | **Captación en calle (QR):** el promotor asiste al cliente para completar la encuesta con el QR; el lead generado debe poder verificarse en el sistema para iniciar el seguimiento de inmediato. | Flujo operativo (landing + listado); no hay pantalla dedicada «verificar lead del QR» |
| RF-19 | **Implementado** | El promotor debe poder registrar el seguimiento de forma diferida (gestionar al cliente en el momento de forma manual y luego completar la información de ese lead en el sistema). | Cualquier lead se abre en `LeadModalForm` cuando aparece en el listado |
| RF-20 | **Parcial** | Si el promotor marca «no hubo entrevista» o no registra seguimiento del lead, el lead debe permanecer disponible para que el **supervisor** lo gestione. | Sin seguimiento → sigue en Prioridad; supervisor ve el equipo vía SP. Falta bandeja explícita «sin tratar por promotor» |
| RF-21 | **Parcial** | Cuando el promotor cierra una venta de PIJ con todos los pasos completos, el lead debe pasar a **Cierres** para control de calidad del supervisor y dejar de aparecer en la bandeja de gestión directa del supervisor. | Venta PIJ → pestaña Cierres (`compro`). No hay subsección ni filtro «Cierres promotores» ni exclusión automática de Prioridad/Contactado solo para el supervisor |
| RF-22 | **Parcial** | La bandeja del supervisor debe recibir los leads de encuestas **no cerrados** por el promotor, sin importar la fuente (QR, Instagram, Facebook, WhatsApp manual). | Supervisor recibe todo lo que devuelve el SP (incl. `origen`); no se filtra «solo no cerrados por promotor» en UI |
| RF-23 | **Implementado** | El sistema debe aplicar la máquina de estados Prioridad → Contactado / En seguimiento / Cierre según las reglas de la sección «Máquina de estados». | `tabIdListaLead`, `useLeadsFilter` (jun. 2026) |
| RF-24 | **Implementado** | La pestaña **Contactado** debe incluir los resultados negativos: «no hubo entrevista + no muestra interés» (`sin_interes`) y «hubo entrevista por llamada o mensaje + no compró» (`no_compro`), tanto de promotores como de supervisores. Los post-entrevista sin compra van **arriba** con estilo naranja. | `useLeadsFilter.ts`, `sortLeadsContactados`, `leadPostEntrevistaSinCompra`, `LeadCard.tsx` (jun. 2026) |
| RF-25 | **Parcial** | La pestaña **Cierres** debe mostrar las ventas del supervisor (PIJ y Terreno) y las ventas de PIJ de los promotores, para que el supervisor realice el control de calidad contactando al cliente. | Lista `compro` del equipo ordenada por fecha de venta (`sortLeadsPorVentaReciente`); falta UI/flujo dedicado de control de calidad (checklist, contacto registrado) |
| RF-26 | **Pendiente** | El supervisor debe poder ver la **efectividad de entrevistas por promotor** (entrevistas realizadas vs. compras / no compras). | `PromotoresTable` solo tiene conversión global (compró/total), no entrevistas realizadas ni desglose no_compro/sin_interes por promotor |
| RF-27 | **Parcial** | Las entrevistas reagendadas deben confirmarse una por una desde la pestaña En seguimiento. | Reagendas en pestaña En seguimiento + modal de seguimiento; sin paso guiado «confirmar entrevista» uno a uno |
| RF-28 | **Implementado** | Toda la lógica de negocio (estados, prioridad, métricas, cierres) debe ser **independiente del sorteo/campaña** para soportar nuevos sorteos sin cambios de código. | `prioridad-leads.ts`, filtros por campos de seguimiento, no por `codigoCampania` |

### 4.2 Requerimientos no funcionales

| ID | Estado | Requerimiento | Notas |
|----|--------|---------------|-------|
| RNF-01 | **Implementado** | **Mobile-first:** la interfaz está optimizada para uso en dispositivos móviles (campo). | Tailwind, drawers, swipe promotor |
| RNF-02 | **Implementado** | El frontend (SPA) debe servirse bajo el path base `/leads`. | `APP_BASE_PATH`, `vite.config.ts` |
| RNF-03 | **Implementado** | La sesión se almacena en `sessionStorage` (clave `mpc-crm-session`). | `api/client.ts` |
| RNF-04 | **Implementado** | El seguimiento comercial se persiste localmente en SQLite (`data/app-cache.db`) con volumen Docker. | `server/db/sqlite.js`; migración a SQL Server pendiente (RF relacionado con anexo 13) |
| RNF-05 | **Implementado** | El sistema debe conectarse únicamente a la base de producción (sin datos de prueba en modo normal). | Requiere `.env` SQL; modo demo opcional por URL/`VITE_DEMO` |
| RNF-06 | **Implementado** | El sistema debe exponer endpoints de salud (`/health`, `/health/live`) para el healthcheck del contenedor. | `create-app.js` |
| RNF-07 | **Implementado** | El despliegue se realiza vía Docker detrás de Traefik en un VPS (Hostinger). | `deploy/`, `Dockerfile` |
| RNF-08 | **Implementado** | La validación de datos de entrada se realiza con Zod en el backend. | `server/schemas/` |

---

## 5. Arquitectura técnica

### 5.1 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js ≥ 20.19 |
| Frontend | React 19, TypeScript 5.8, Vite 7, Tailwind CSS 4 |
| Librerías UI | vaul (drawers), react-datepicker, recharts |
| Backend | Express 5, compression, cors, Zod |
| BD producción | SQL Server (STRSYSTEM / mensajeria) vía `mssql` |
| BD local | SQLite vía `better-sqlite3` |
| Fechas | date-fns 4 |
| Dev | concurrently (API + Vite en paralelo) |

> **Nota:** la navegación no usa React Router; se controla por estado `VistaActiva` en `App.tsx`.

### 5.2 Estructura de directorios

```
SEGUIMIENTO_LEADS/
├── src/                    # Frontend React + TypeScript
│   ├── api/                # Cliente HTTP y modo demo
│   ├── components/         # UI por dominio (auth, leads, calendario, promotores, layout, ui)
│   ├── context/            # AuthContext
│   ├── domain/             # Lógica de negocio pura
│   ├── hooks/              # Filtrado de leads y métricas
│   ├── lib/                # Calendario, feriados AR
│   ├── types/              # Tipos TypeScript centrales
│   └── App.tsx             # Shell principal
├── server/                 # API Express
│   ├── db/                 # SQL Server, SQLite, encuestas, carga, catálogos
│   ├── schemas/            # Validación Zod
│   ├── catalog.js          # Productos y barrios
│   └── create-app.js       # Rutas API + SPA estática
├── deploy/                 # Docker, Traefik, scripts VPS, workflows
├── docs/                   # Documentación
├── sql/migrations/         # Borrador tablas CRM (futuro)
└── Dockerfile
```

### 5.3 Modelo de datos principal (Lead)

| Entidad | Campos clave |
|---------|--------------|
| **Lead** | `id`, `encuestaUsuario`, `telefono`, `nombre`, `domicilio`, `promotorNombre`, `promotorId`, `fechaAlta`, `lista` (`entrevista`\|`contacto`), `codigoCampania`, `horarioEntrevista`, `lugarEntrevista`, `seguimiento` |
| **SeguimientoLead** | `fuente`, `canal`, `huboEntrevista`, `resultadoEntrevista`, `horarioEntrevistaPropuesto`, `fechaReagenda`, `idProducto`, `estadoPago`, `idBarrio`, `numeroRecibo`, `referidos`, `observaciones` |
| **NuevoLeadData** | Campos de carga manual + datos para agendar entrevista |
| **UsuarioSesion** | `id`, `nombre`, `rol`, `categoria`, `codigoCarga`, `idOperador`, `idSupervisor`, `idVendedor`, `rolOrigen` |

---

## 6. Funcionalidades detalladas

### 6.1 Autenticación y roles

- Login con email/clave validado contra el SP `operadorAccesoCategoria` (SQL Server).
- El rol se determina así:
  - `idOperador === idVendedor` → **supervisor**
  - `idOperador !== idVendedor` → **promotor**
  - Respaldo: columna `Categoria` (`PROMOTOR` / `SUPERVISOR`).
- **Modo demo:** activable con `VITE_DEMO=true` o por URL (`/demo/supervisor`, `/demo/promotor`) usando datos ficticios (`demoData.ts`).

### 6.2 Gestión de leads — ciclo de vida

```
Encuesta/sorteo (SQL) → Listado SP → Tarjeta en CRM
        ↓
Prioridad (sin contactar / entrevista pendiente / terreno derivado)
        ↓
Contacto (canal: llamada / mensaje)
        ↓
Entrevista (confirmada / realizada)
        ↓
Resultado: compró | no compró | sin interés | reagenda | derivar terreno
        ↓
Cierre (venta con producto + pago + recibo) o archivo negativo
```

**Pestañas de la vista Leads (`LeadsPanel`):**

1. **Prioridad** — leads agrupados por prioridad (0 → 1 → 2).
2. **Contactado** — ya hubo contacto o resultado negativo; post-entrevista sin compra arriba (naranja).
3. **En seguimiento** — `resultadoEntrevista = reagenda`.
4. **Cierres** — solo ventas (`compro`), ordenadas por fecha de cierre (más reciente arriba).

**Modal de seguimiento (`LeadModalForm`):** drawer que recorre confirmación de entrevista → canal de contacto → ¿hubo entrevista? → resultado (según rol) → venta (producto, pago, barrio, recibo, referidos).

### 6.3 Priorización de leads (bandeja inicial / no contactados)

> Detalle completo en `docs/PRIORIDAD_LEADS.md`. **La prioridad es independiente del sorteo/campaña:** cada sorteo nuevo solo agrega más filas, no cambia la lógica.

La pestaña **Prioridad** ordena los leads no contactados **cronológicamente y por orden de importancia**. Se muestran primero los de mayor valor comercial:

| Orden | Grupo | Condición | Por qué primero |
|:-----:|-------|-----------|-----------------|
| 0 | Interés en terreno — derivado por el promotor | `resultadoEntrevista = derivar_terreno` | Cliente con interés caliente detectado en calle; máxima prioridad de contacto del supervisor. |
| 1 | Entrevista pendiente | `lista = entrevista`, sin cierre/reagenda, horario válido | Ya hay una cita comprometida que no se puede perder. |
| 2 | Encuesta sin contactar | Hizo la encuesta pero sin entrevista ni derivación; sin `canal` ni `huboEntrevista` | Oportunidad fría a la espera del primer contacto. |

Dentro de cada grupo el orden es **FIFO por `fechaAlta`** (más antiguo primero), para no dejar envejecer ninguna oportunidad.

**Excluidos de Prioridad:** contactados, reagendas (van a *En seguimiento*) y cierres.
**Alerta:** se muestra un banner para encuestas de prioridad 2 con ≥ 2 días sin contacto.

### 6.10 Flujo operativo de captación (promotor en calle con QR)

El promotor sale a la calle con el código QR y opera el lead de punta a punta:

1. El promotor **asiste al cliente** para completar la encuesta mediante el QR.
2. La encuesta genera un **lead** (una fila en `encuesta`, con su `id` y `codigoCampania`).
3. El promotor **verifica en el sistema** que el lead de ese cliente quedó cargado.
4. Si detecta **interés en el momento**, inicia el seguimiento: lo registra en el sistema, o lo gestiona de forma manual y luego completa la información de ese lead.
5. Si el promotor **no realiza la entrevista** y marca «no hubo entrevista», o directamente **no carga la información** del lead, el lead queda **disponible para que el supervisor lo gestione**.
6. Si el promotor **vende un Plan Inversión Joven** y completa todos los pasos, el lead pasa a **Cierres** y le aparece al supervisor en el control de calidad de promotores; **deja de figurar** en la bandeja de gestión directa del supervisor.

**Leads que llegan a la bandeja del supervisor:** todas las encuestas que el promotor **no cerró con venta de PIJ**, sin importar la fuente de captación: QR, Instagram, Facebook o WhatsApp manual.

### 6.11 Máquina de estados y transiciones (pestañas)

El estado de un lead se deriva de su seguimiento y define en qué pestaña aparece:

| Pestaña / estado | Condición de entrada | Aplica a |
|------------------|----------------------|----------|
| **Prioridad** (no contactado) | Sin contacto ni cierre. Ordenado: derivar_terreno (0) → entrevista pendiente (1) → encuesta sin contactar (2). | Promotor y supervisor |
| **Contactado** | «¿Hubo entrevista?» = **No** + «No muestra interés» (`sin_interes`); o «¿Hubo entrevista?» = **Sí** (llamada/mensaje) + «No compró» (`no_compro`). Los post-entrevista negativos se listan **primero** (naranja); el resto de contactados en amarillo ámbar, FIFO. | Resultados negativos de promotor o supervisor (incluye leads que el promotor cargó con esa info). |
| **En seguimiento** | La entrevista se **reagenda** (`resultadoEntrevista = reagenda`, con `fechaReagenda`). Permite confirmar las entrevistas una por una. | Promotor y supervisor |
| **Cierre** | El lead **compró** (`resultadoEntrevista = compro`) Terreno o PIJ. | Ventas del supervisor (PIJ y Terreno) + ventas de PIJ de promotores (control de calidad). |

> **Estado de implementación:** implementado. Los resultados negativos (`no_compro`, `sin_interes`) se muestran en la pestaña **Contactado** (post-entrevista arriba, estilo naranja); **Cierres** solo lista compras (`compro`) con ventas recientes arriba. Ver `tabIdListaLead`, `sortLeadsContactados`, `sortLeadsPorVentaReciente` en `src/domain/leads.ts` y `src/hooks/useLeadsFilter.ts`.

```
Encuesta/sorteo → Lead en bandeja (PRIORIDAD)
   │
   ├─ Derivar terreno (promotor) ───────────► PRIORIDAD (orden 0) ──► gestiona supervisor
   │
   ├─ ¿Hubo entrevista? = No + No interés ──► CONTACTADO (sin_interes)
   │
   ├─ ¿Hubo entrevista? = Sí + No compró ───► CONTACTADO (no_compro)
   │
   ├─ Reagenda entrevista ──────────────────► EN SEGUIMIENTO (confirmar 1 x 1)
   │
   └─ Compró (PIJ / Terreno) ───────────────► CIERRE (control de calidad supervisor)
```

### 6.12 Cierres y control de calidad

La pestaña **Cierres** reúne todas las ventas para que el supervisor contacte al cliente y haga control de calidad:

- Ventas del **supervisor**: Plan Inversión Joven y Terreno.
- Ventas de **PIJ de los promotores**: una vez que el promotor completa todos los pasos, el lead se mueve a Cierres y **sale de la bandeja directa** del supervisor.
- **Orden:** las ventas más recientes aparecen **arriba** (`fechaVentaLead` desde historial o `fechaAlta` como respaldo).

Objetivo: el supervisor puede verificar cada venta cerrada (recibo/comprobante, producto, estado de pago) y contactar al cliente para asegurar la calidad de la operación.

### 6.13 Efectividad de entrevistas por promotor (métrica)

El supervisor debe poder ver la **efectividad de entrevistas de cada promotor**: cuántas entrevistas realizó y en cuántas se concretó una compra. Indicadores sugeridos por promotor (y por campaña):

| Indicador | Cálculo |
|-----------|---------|
| Entrevistas realizadas | Leads con `huboEntrevista = true` |
| Compras | Leads con `resultadoEntrevista = compro` |
| No compró | Leads con `resultadoEntrevista = no_compro` |
| Sin interés / sin entrevista | Leads con `resultadoEntrevista = sin_interes` |
| Tasa de conversión de entrevistas | Compras / Entrevistas realizadas |

### 6.4 Encuestas, sorteos y participantes

> Detalle completo en `docs/SORTEOS_Y_PARTICIPANTES.md`.

- **Una participación = una fila `encuesta` = un `lead.id`.**
- **Campaña** = columna `encuesta` (`sorteo01`, `sorteo02`, …).
- **Duplicado de carga:** mismo teléfono + misma campaña → rechazado.
- **Mismo teléfono en otra campaña** → permitido (nueva participación).
- El seguimiento se guarda **por `lead.id`** (no se mezcla entre sorteos).
- Para lanzar un nuevo sorteo se configura la variable `ENCUESTA_CARGA_ID=sorteo02`.

### 6.5 Carga manual de leads

- Se realiza vía el SP de carga (`encuestaCargaSorteo01` por defecto, configurable).
- Valida duplicado por teléfono + campaña.
- El supervisor puede elegir a qué promotor asignar el lead.
- Errores controlados: `ContactoYaRegistradoError` (409), `CodigoPromotorCargaError` (400), `CargaEncuestaSinPersistirError` (502).

### 6.6 Calendario / eventos (solo supervisor)

- Construye eventos desde leads con entrevista pendiente o reagenda (excluye comprados).
- Vista mensual navegable con feriados de Argentina.
- Acciones desde el calendario: WhatsApp, reagendar, abrir el seguimiento en la vista Leads.

### 6.7 Ventas y productos

| Producto | Rol | Estados de pago válidos |
|----------|-----|-------------------------|
| **Plan Inversión Joven (PIJ)** | promotor + supervisor | seña, entrega $33k, entrega $55k |
| **Terreno** | solo supervisor | seña, 100% (+ barrio obligatorio) |

- **Barrios disponibles:** Cecotto, Los Elfos, Los Búfalos, Palmares.
- Se exige número de recibo/comprobante en ventas con entrega o terreno.

### 6.8 Links de redes (captación)

- Por cada código de operador (SORTEO) hay enlaces preconfigurados de Instagram/Facebook.
- Permite compartir nativo (`navigator.share`) o abrir la URL.
- Visible en `LeadsPanel` y `PromotorMetricasPanel`.

### 6.9 Métricas

- **Supervisor (`PromotoresPanel`):** tabla de conversión, gráfico de leads por promotor/tiempo, distribución por origen y historial.
- **Promotor (`PromotorMetricasPanel`):** resumen personal, gráfico de origen, historial propio y links de redes.

---

## 7. API del backend

Endpoints montados en `/api` y `{APP_BASE_PATH}/api` (por defecto `/leads/api`).

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health/live` | No | Liveness `{ ok: true }` |
| GET | `/health` | No | Estado SQL y SPs configurados |
| POST | `/auth/login` | No | Login SQL Server |
| GET | `/leads` | Headers sesión | Lista encuestas + seguimiento local |
| POST | `/leads` | Headers sesión | Carga manual de encuesta |
| PATCH | `/leads/:id/seguimiento` | Headers sesión | Guarda seguimiento en SQLite |
| GET | `/promotores` | Supervisor | Promotores derivados de encuestas |
| GET | `/barrios` | SQL configurado | Catálogo de barrios |
| GET | `/productos?rol=` | SQL configurado | Catálogo de productos filtrado por rol |
| GET | `/links-redes` | Headers sesión | Links IG/FB por código de operador |

**Headers de sesión:** `x-usuario-id`, `x-usuario-rol`, `x-usuario-nombre` (y opcionalmente `x-usuario-login-id`, `x-usuario-codigo-carga`, `x-promotor-nombre`).

---

## 8. Bases de datos

### 8.1 SQL Server (producción) — solo lectura/escritura vía SPs

| Stored Procedure | Uso |
|------------------|-----|
| `operadorAccesoCategoria` | Login (`@LoginID`, `@PasID`) |
| `encuestasMuestraOperador` | Listado de leads (`@idVendedor`) |
| `encuestaCargaSorteo01` (configurable) | Alta manual de lead |

### 8.2 SQLite local (`data/app-cache.db`)

| Tabla | Propósito |
|-------|-----------|
| `lead_seguimiento_externo` | JSON de seguimiento por `lead_id` |
| `seguimiento_eventos` | Auditoría de cambios |
| `productos` | Catálogo sincronizado desde `catalog.js` |
| `barrios` | Catálogo sincronizado |

---

## 9. Despliegue e infraestructura

- **Contenedor:** `seguimiento-leads` (Node 20, puerto interno 3001).
- **Proxy:** Traefik en VPS Hostinger.
- **Ruta pública:** `https://www.miprimercasafsa-sorteo.com/leads` (PathPrefix `/leads`).
- **Volumen:** `./data` → persistencia de SQLite.
- **CI/CD:** push a `main` en `leads/**` → deploy por SSH + verificación de salud (`deploy/github-workflow/deploy-leads.yml`).

### Variables de entorno críticas

```
APP_BASE_PATH=/leads
SP_LOGIN, SP_ENCUESTAS, SP_CARGA_ENCUESTA
ENCUESTA_CARGA_ID=sorteo01
DB_HOST, DB_NAME, ENCUESTAS_DB_NAME, DB_USER, DB_PASSWORD
LEADS_HOST, LEADS_TRAEFIK_HOST
```

---

## 10. Integraciones externas

- **SQL Server STRSYSTEM** (+ lectura de `mensajeria` según SP).
- **Landing encuesta-sorteo** (misma tabla `encuesta`, mismos SPs de carga/listado).
- **WhatsApp** (enlaces `wa.me`).
- **Redes sociales** (links compartibles por operador).

---

## 11. Limitaciones actuales conocidas

- El seguimiento se guarda en **SQLite local** del contenedor (aún no en SQL Server CRM).
- El SP `SP_RegistrarSeguimientoLead` está planeado pero **no integrado** (ver `sql/migrations/001_lead_seguimiento_crm.sql`).
- El listado muestra lo que devuelve el SP, sin deduplicar por teléfono a nivel global.
- El modo producción **requiere** un `.env` con configuración de SQL; no hay demo del lado del servidor.

---

## 12. Documentación complementaria

| Archivo | Contenido |
|---------|-----------|
| `docs/PRIORIDAD_LEADS.md` | Reglas de la pestaña Prioridad y checklist para nuevo sorteo |
| `docs/SORTEOS_Y_PARTICIPANTES.md` | Modelo de participación multicampaña y duplicados |
| `docs/ESTRUCTURAS_TABLAS_SP.md` | Columnas de los SP y mapeo encuesta → CRM |
| `docs/LOGIN_SP.md` | Detalle del login `operadorAccesoCategoria` |
| `docs/MONOREPO.md` | Integración en `encuesta-sorteo/leads/` |
| `docs/DEPLOY_VPS.md` | Infraestructura, Traefik, primer deploy |
| `docs/FLUJO-FRONTEND-DEPLOY.md` | Flujo de build/deploy del frontend |
| `README.md` | Quick start y resumen de la API |

---

---

## 13. Anexo — Parámetros y procedimientos para el DBA

Especificación para que el DBA cree y mantenga la capa de datos del CRM. **Principio rector: todo debe ser abstracto respecto del sorteo/campaña.** El día de mañana se lanzarán más sorteos y la misma persona podrá volver a participar; el sistema debe seguir funcionando **sin cambios de código**, solo configurando la campaña activa.

### 13.1 Principio de abstracción multi-sorteo

- **Nada hardcodeado:** ningún procedimiento debe contener el texto `sorteo01` fijo. La campaña se pasa siempre como parámetro `@encuesta` (o se resuelve desde una tabla de campaña activa).
- **Una participación = una fila** en `encuesta`, identificada por `id` (PK) y `encuesta` (campaña). Misma persona en sorteo01 y sorteo02 = dos leads independientes con su propio seguimiento.
- **Unicidad por campaña:** evitar `UNIQUE` global por teléfono. Usar `UNIQUE (telefono_normalizado, encuesta)` para permitir reparticipación en nuevos sorteos.
- **Estado y métricas calculados sobre columnas estables** (no sobre el nombre del sorteo): teléfono, fecha de alta, horario de entrevista, resultado de entrevista, producto.

### 13.2 Tabla de campañas (abstracción del sorteo)

**Justificación:** permite lanzar nuevos sorteos y marcar cuál está activo sin tocar la app.

```sql
CREATE TABLE dbo.campania (
  id_campania   INT IDENTITY(1,1) PRIMARY KEY,
  codigo        NVARCHAR(64)  NOT NULL UNIQUE,  -- sorteo01, sorteo02, ...
  nombre        NVARCHAR(120) NOT NULL,         -- "Sorteo 01"
  activa        BIT           NOT NULL DEFAULT 0,
  fecha_inicio  DATETIME2     NULL,
  fecha_fin     DATETIME2     NULL
);
-- Solo una campaña activa a la vez (regla de negocio a aplicar por el DBA).
```

### 13.3 Persistencia del seguimiento — `SP_RegistrarSeguimientoLead`

**Estado actual:** hoy la app guarda el seguimiento en SQLite local (`lead_seguimiento_externo`). El objetivo es persistirlo en SQL Server vía este SP, sobre la tabla `lead_seguimiento_crm` (ya propuesta en `sql/migrations/001_lead_seguimiento_crm.sql`).

**Justificación:** centraliza el seguimiento en la base corporativa, habilita reportes/cierres/métricas server-side y sobrevive a recreaciones del contenedor.

| Parámetro | Tipo | Justificación / uso |
|-----------|------|---------------------|
| `@lead_id` | INT | PK de la fila de `encuesta` (= `lead.id`). Identifica la participación exacta. |
| `@telefono` | NVARCHAR(32) | Refuerza identidad y permite armar `lead_key`. |
| `@encuesta` | NVARCHAR(64) | Campaña del lead. Clave de la abstracción multi-sorteo. |
| `@canal` | NVARCHAR(16) | `llamada` \| `mensaje` \| NULL. Cómo se contactó. |
| `@hubo_entrevista` | BIT | Sí/No/NULL. Determina la rama de la máquina de estados. |
| `@resultado_entrevista` | NVARCHAR(16) | `sin_interes` \| `reagenda` \| `no_compro` \| `compro` \| `derivar_terreno`. Define la pestaña/estado. |
| `@horario_entrevista_propuesto` | NVARCHAR(32) | Fecha/hora cuando el promotor deriva terreno con cita. |
| `@fecha_reagenda` | NVARCHAR(32) | Obligatoria si `@resultado_entrevista = reagenda`. Mueve a En seguimiento. |
| `@seguimiento_pij_promotor` | BIT | Reagenda del promotor tras «No compró» PIJ; el supervisor la ve solo lectura. |
| `@id_producto` | NVARCHAR(32) | `prod-pij` \| `prod-terreno`. Obligatorio si compró. |
| `@estado_pago` | NVARCHAR(16) | `sena` \| `cien` \| `entrega_33` \| `entrega_55`. Validado según producto. |
| `@id_barrio` | NVARCHAR(32) | Obligatorio en venta de Terreno. |
| `@numero_recibo` | NVARCHAR(80) | Recibo (supervisor) o comprobante (promotor) de la venta. |
| `@brindo_referidos` | BIT | Si el cliente dejó referidos. |
| `@referidos_json` | NVARCHAR(MAX) | Lista de referidos `[{nombre, telefono}]`. |
| `@observaciones` | NVARCHAR(500) | Notas libres del operador. |
| `@operador_id` | INT | Quién registró el seguimiento (auditoría). |
| `@operador_rol` | NVARCHAR(16) | `promotor` \| `supervisor`. Necesario para cierres y control de calidad. |
| `@operador_nombre` | NVARCHAR(200) | Nombre del operador (auditoría / UI). |
| `@seguimiento_json` | NVARCHAR(MAX) | JSON completo del modal (a prueba de futuro: campos nuevos no rompen el contrato). |

```sql
CREATE OR ALTER PROCEDURE dbo.SP_RegistrarSeguimientoLead
  @lead_id INT,
  @telefono NVARCHAR(32) = NULL,
  @encuesta NVARCHAR(64) = NULL,
  @canal NVARCHAR(16) = NULL,
  @hubo_entrevista BIT = NULL,
  @resultado_entrevista NVARCHAR(16) = NULL,
  @horario_entrevista_propuesto NVARCHAR(32) = NULL,
  @fecha_reagenda NVARCHAR(32) = NULL,
  @seguimiento_pij_promotor BIT = NULL,
  @id_producto NVARCHAR(32) = NULL,
  @estado_pago NVARCHAR(16) = NULL,
  @id_barrio NVARCHAR(32) = NULL,
  @numero_recibo NVARCHAR(80) = NULL,
  @brindo_referidos BIT = NULL,
  @referidos_json NVARCHAR(MAX) = NULL,
  @observaciones NVARCHAR(500) = NULL,
  @operador_id INT = NULL,
  @operador_rol NVARCHAR(16) = NULL,
  @operador_nombre NVARCHAR(200) = NULL,
  @seguimiento_json NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  -- UPSERT por lead_key = CONCAT(@telefono, '|', @encuesta) o por @lead_id.
  -- Calcular columna 'estado' derivada (nuevo/contactado/en_seguimiento/cerrado_compro/derivado_terreno).
  -- Guardar columnas clave (resultado, producto, estado_pago, operador_rol, fecha_cierre) + seguimiento_json.
END;
```

### 13.4 Listado de leads parametrizado por campaña — `encuestasMuestraOperador`

**Justificación:** el listado debe poder filtrar por campaña activa y, además, devolver ya el seguimiento (estado actual) para que la app arme las pestañas en una sola llamada.

| Parámetro | Tipo | Uso |
|-----------|------|-----|
| `@idVendedor` | INT | Operador logueado (= `idOperador` del login). Filtra sus leads. |
| `@encuesta` | NVARCHAR(64) = NULL | Campaña a listar. `NULL` = campaña activa o todas, según política acordada. |
| `@solo_campania_activa` | BIT = 1 | Si está en 1, devuelve solo la campaña marcada como activa en `dbo.campania`. |

Debe hacer `LEFT JOIN` con `lead_seguimiento_crm` para devolver, junto a cada encuesta, su `estado`, `resultado_entrevista`, `operador_rol` y `seguimiento_json`. Políticas a acordar (documentar cuál se elige): **A** todas las participaciones visibles, **B** solo campaña activa, **C** última participación por teléfono. Recomendado: A o B.

### 13.5 Carga de leads parametrizada — `SP_CargarEncuesta`

**Justificación:** un único SP parametrizado por campaña es más mantenible que un SP por sorteo (`encuestaCargaSorteo01`, `...02`, etc.).

| Parámetro | Uso |
|-----------|-----|
| `@telefono` | Teléfono del cliente. Parte de la clave de duplicado. |
| `@encuesta` | Campaña. Parte de la clave de duplicado. **No hardcodear.** |
| `@usuario` | Código del promotor / QR (ej. `SORTEO01S21P01`). Asigna el lead al promotor. |
| `@campo1` … `@campo8` | Respuestas de la encuesta (nombre, domicilio, asesoramiento, horario, modalidad, domicilio entrevista). |
| `@origen` | Fuente de captación: `QR`, `Facebook`, `Instagram`, `Manual`/`App`. |

**Regla de duplicado:** rechazar solo si existe **mismo `@telefono` + mismo `@encuesta`** (devolver código de duplicado). Mismo teléfono en otra campaña = participación nueva válida.

### 13.6 Cierres y control de calidad del supervisor — `SP_LeadsCierresSupervisor`

**Justificación:** el supervisor necesita ver, en un solo lugar, todas las ventas cerradas (propias de PIJ y Terreno, y las de PIJ de sus promotores) para hacer control de calidad.

| Parámetro | Uso |
|-----------|-----|
| `@id_supervisor` | Supervisor logueado. Filtra su equipo. |
| `@encuesta` = NULL | Campaña (NULL = todas / activa). |

Devuelve los leads con `resultado_entrevista = compro`, con columnas: `producto`, `estado_pago`, `numero_recibo`, `operador_rol` (promotor/supervisor), `operador_nombre`, teléfono y datos del cliente. Estos leads dejan de aparecer en la bandeja de gestión directa del supervisor.

### 13.7 Efectividad de entrevistas por promotor — `SP_EfectividadEntrevistasPromotor`

**Justificación:** alimenta la métrica de la sección 6.13 sin que la app tenga que traer todos los leads y calcular en el cliente.

| Parámetro | Uso |
|-----------|-----|
| `@id_supervisor` | Equipo a analizar. |
| `@encuesta` = NULL | Campaña (NULL = todas / activa). Permite comparar entre sorteos. |
| `@desde`, `@hasta` | Rango de fechas opcional (por período). |

Devuelve, por promotor: `entrevistas_realizadas` (`hubo_entrevista = 1`), `compras` (`compro`), `no_compras` (`no_compro`), `sin_interes`, y `tasa_conversion` = compras / entrevistas realizadas.

### 13.8 Resumen — qué entregar al DBA

| # | Estado | Entregable / parámetro | Detalle | Relación con RF |
|---|--------|------------------------|---------|-----------------|
| 1 | **Pendiente** | Tabla `dbo.campania` | Abstracción de sorteos + flag de campaña activa. | RF-17, RF-28 |
| 2 | **Pendiente** | Tablas `lead_seguimiento_crm` y `lead_nota_crm` | Borrador en `sql/migrations/001_lead_seguimiento_crm.sql`; falta ejecutar en SQL y columnas derivadas. | RNF-04, RF-07 |
| 3 | **Pendiente** | SP `SP_RegistrarSeguimientoLead` | 20 parámetros de la sección 13.3; hoy seguimiento en SQLite. | RNF-04 |
| 4 | **Pendiente** | SP `encuestasMuestraOperador` (ampliado) | + `@encuesta`, `@solo_campania_activa` y JOIN con seguimiento. | RF-03, RF-17, RF-22 |
| 5 | **Parcial** | SP `SP_CargarEncuesta` parametrizado | Existe `encuestaCargaSorteo01` por campaña vía `ENCUESTA_CARGA_ID`; falta SP único parametrizado. | RF-09, RF-10 |
| 6 | **Pendiente** | SP `SP_LeadsCierresSupervisor` | Cierres para control de calidad en servidor. | RF-21, RF-25 |
| 7 | **Pendiente** | SP `SP_EfectividadEntrevistasPromotor` | Métrica por promotor / campaña. | RF-26 |
| 8 | **Pendiente** | Índice `UNIQUE (telefono_normalizado, encuesta)` | Permite reparticipación en nuevos sorteos. | RF-10, RF-17 |
| 9 | **Parcial** | Permisos SQL del usuario de la app (ej. `MPCSP`) | Login y listado operativos; faltan permisos sobre tablas/SP CRM nuevos. | RF-01, RF-03 |
| 10 | **Implementado** | Variable de deploy `ENCUESTA_CARGA_ID` | Usada en `encuesta-carga.js` y `.env.example`. | RF-09, RF-17 |

> Consultas para que el DBA obtenga el DDL real (definición de SP y tablas que tocan) están en `docs/ESTRUCTURAS_TABLAS_SP.md` (sección 5: `sp_helptext`, `sys.sql_expression_dependencies`, `sp_help`).

---

## 14. Actualización — nuevas funcionalidades

> **Añadido:** junio 2026. Esta sección **no reemplaza** las secciones 1–13; documenta lo incorporado después y enlaza la documentación de detalle en `docs/`.

### 14.0 Revisión de estados (respecto a §4 y §13.8)

| Ítem | Estado anterior (§4 / §13.8) | Estado actual |
|------|------------------------------|---------------|
| **RNF-04** Seguimiento en SQLite | Implementado (solo SQLite) | **Parcial** — con `SP_SEGUIMIENTO` en `.env` persiste en SQL Server (`registrarSeguimientoLead`); sin variable → fallback SQLite |
| **DBA ítem 3** `SP_RegistrarSeguimientoLead` | Pendiente | **Parcial** — app conectada (`seguimiento-sql.js`); DBA debe corregir `@resultado_entrevista` **NVARCHAR(16)** (no BIT). Ver `sql/SP_RegistrarSeguimientoLead-notas.sql` |
| **DBA ítem 9** Permisos `MPCSP` | Parcial | **Parcial+** — script `sql/grants-mpcsp-leads.sql` (login, seguimiento, referidos, `encuestaSorteo01Update`) |
| **RF-26** Efectividad entrevistas | Pendiente | **Parcial** — panel **superadmin** incluye productividad por promotor; falta vista dedicada en supervisor (RF-26 original) |

### 14.1 Nuevos requerimientos funcionales

| ID | Estado | Requerimiento | Doc detalle |
|----|--------|---------------|-------------|
| RF-29 | **Parcial** | Persistir seguimiento en SQL Server vía `SP_RegistrarSeguimientoLead` cuando `SP_SEGUIMIENTO` está configurado. | [FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md](./FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md) |
| RF-30 | **Implementado** | Historial append-only de cada guardado de seguimiento (fecha, operador, etiqueta, pestaña destino). | [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md) |
| RF-31 | **Parcial** | Al cerrar con referidos, crear leads en `encuesta` + vínculo `lead_referido` (árbol, visibilidad promotor/supervisor). | [FUNCIONALIDAD_REFERIDOS_ENCUESTA.md](./FUNCIONALIDAD_REFERIDOS_ENCUESTA.md) |
| RF-32 | **Implementado** | Carga manual con `@origen = '2'`: alta nueva o **actualización** si teléfono+campaña ya existen. | [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md) |
| RF-33 | **Implementado** | Modificar teléfono de lead cargado manualmente (`encuestaSorteo01Update`, `PATCH /api/leads/:id/telefono`). | [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md) |
| RF-34 | **Implementado** | Acortar y verificar links de redes (Instagram); notificaciones en campana NavBar. | [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) |
| RF-35 | **Implementado** | Rol **superadmin**: panel empresa (KPIs semana, rankings, productividad, conocimiento encuesta). | §14.2.7 (esta sección) |
| RF-36 | **Implementado** | Parámetro `@confirmo_entrevista` en SP de seguimiento (flujo supervisor). | [FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md](./FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md) |

### 14.2 Resumen por funcionalidad

#### 14.2.1 Conexión SP seguimiento (RF-29, RNF-04)

- **Variables:** `SP_SEGUIMIENTO`, `SEGUIMIENTO_TABLE`, `ENCUESTAS_DB_NAME`.
- **Guardado:** `PATCH /api/leads/:id/seguimiento` → `execRegistrarSeguimientoLead` con todos los `@param` (incl. `@confirmo_entrevista`, `@referidos_json`, `@seguimiento_json`).
- **Lectura:** última fila por `lead_id` en `registrarSeguimientoLead`; batch al listar leads.
- **Código:** `server/db/seguimiento-sql.js`, `server/db/encuestas.js`.

#### 14.2.2 Historial de seguimiento (RF-30)

- Cada cambio distinto agrega fila; sin cambio en JSON → no duplica.
- **API:** `GET /api/leads/:id/historial`; `PATCH` devuelve `historial` (últimas 30).
- **UI:** `SeguimientoHistorialPanel` / `LeadHistorialInline` en `LeadModalForm`.
- **Dominio:** `src/domain/seguimiento-historial.ts`.
- **SQL propuesto:** `sql/lead-seguimiento-historial.sql`.

#### 14.2.3 Referidos → encuesta (RF-31)

- Al guardar seguimiento con `brindoReferidos`, la app dispara `SP_RegistrarReferidoLead` (o carga legacy).
- Tabla **`lead_referido`**: origen, raíz, nivel, `operador_rol`, visibilidad (supervisor carga → promotor no ve).
- **SPs:** `SP_RegistrarReferidoLead`, `SP_ContarReferidosLead`, `SP_ObtenerMetaReferidosLead`.
- **Script:** `sql/lead_referido-tabla-sp.sql`.
- **Código:** `server/db/referidos-carga.js`; respuesta PATCH incluye `nuevosLeads`, `referidosCreados`.

#### 14.2.4 Carga manual origen 2 y modificar teléfono (RF-32, RF-33)

- `@origen = '2'` en `encuestaCargaSorteo01`: INSERT o UPDATE campos 1–8.
- `POST /api/leads` → `201` alta · `200` si actualizó existente.
- `PATCH /api/leads/:id/telefono` → `encuestaSorteo01Update` (solo leads manuales).
- **Scripts:** `sql/encuestaCargaSorteo01-origen2-upsert.sql`, `sql/encuestaSorteo01Update.sql`.

#### 14.2.5 Acortador links redes (RF-34)

- Catálogo desde SP `rptLinkQRenRedesSociales` o JSON.
- Scripts npm: `links:acortar`, `links:verificar`, `links:actualizar-todos`.
- **API:** `GET /api/notificaciones/links-redes`, `POST .../vista`.
- Promotor: solo su código; supervisor: equipo completo.

#### 14.2.6 Modelo SQL ampliado (RF-36)

Parámetros del SP alineados con la app (además de los listados en §13.3):

| Parámetro | Uso |
|-----------|-----|
| `@confirmo_entrevista` | Supervisor: ¿confirmó la entrevista? |
| `@fuente` | Opcional; si no, JOIN a `encuesta.origen` |
| `@referidos_json` | Dispara alta de referidos vía RF-31 |

Análisis completo: [FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md](./FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md).

#### 14.2.7 Panel superadmin (RF-35)

- **Rol:** `superadmin` (login IDs en `SUPERADMIN_LOGIN_IDS` / `superadmin-auth.js`). No accede a bandejas Prioridad/Contactado/Cierres; vista por defecto `admin`.
- **Vista:** `SuperadminDashboard` — «Panel global de equipos».
- **API:** `GET /api/admin/dashboard` → `AdminDashboardData`.
- **Código:** `server/db/admin-dashboard.js`, `src/domain/admin-metrics.ts`, `src/domain/admin-productividad.ts`.
- **Doc detalle (catálogo completo de pantalla):** [FUNCIONALIDAD_PANEL_SUPERADMIN.md](./FUNCIONALIDAD_PANEL_SUPERADMIN.md).

**Semana móvil:** hoy + 6 días anteriores. Fuente leads: `SP_ENCUESTAS_ADMIN` (default `encuestasMuestra`). Historial: tabla `registrarSeguimientoLead` (~400 días) si `SP_SEGUIMIENTO` está activo.

##### Datos mostrados en pantalla

| Bloque | Componente | Qué muestra |
|--------|------------|-------------|
| Encabezado | `SuperadminDashboard` | Rango semana móvil, fecha de hoy, banner `aviso` si falla el SP |
| **Hoy** (4 KPIs) | `StatCard` | Entrevistas, cierres, terrenos (`prod-terreno`), PIJ (`prod-pij`) del día — totales empresa |
| Evolución temporal | `AdminMetricsChart` | Barras Leads / Entrevistas / Cierres / Terrenos / PIJ; filtro supervisor; agrupación semana ISO, mes o año |
| Conocimiento encuesta | `AdminConocimientoEncuesta` | «¿Conocían MPC?» y «¿Sabían PIJ?» — conteo Sí / No / Sin dato + gráfico apilado (`campo3`/`campo4`) |
| Productividad | `AdminProductividadPanel` | Embudo global (leads → entrevista → cierre + tasas); tiempo respuesta; recuperación PIJ; cierres con referidos; backlog 7/14/30 días; resultados entrevista; efectividad por canal (QR, Manual, FB, IG, WA, TikTok); tabla encuesta vs cierre; top 8 promotores por tasa de cierre |
| Destacados semana | `RankingList` ×5 | Top 5: más entrevistas, más cierres, más leads nuevos, más terrenos, más PIJ |
| Supervisores y equipos | Tabla por supervisor | Encabezado con totales semana/hoy; filas promotor: Leads (hist.), Ent. sem./hoy, Cierres sem./hoy, Terrenos sem., PIJ sem. |

##### Rankings de la semana (top 5 cada uno)

| Ranking | Métrica por promotor |
|---------|----------------------|
| Más entrevistas | `entrevistasSemana` |
| Más cierres | `cierresSemana` |
| Más leads nuevos | `leadsSemana` (altas en semana móvil) |
| Más terrenos vendidos | `ventasTerrenoSemana` |
| Más Plan Inv. Joven | `ventasPijSemana` |

##### Productividad — tasas del embudo global

| Métrica | Fórmula |
|---------|---------|
| Tasa entrevista | entrevistas / leads |
| Tasa cierre (lead) | cierres / leads |
| Tasa cierre (entrevista) | cierres / entrevistas |

##### Resultados de entrevista en gráfico

`compro`, `no_compro`, `reagenda`, `sin_interes`, `derivar_terreno`, `pendiente` — estado actual por lead.

> **RF-26:** la tabla «Promotores por tasa de cierre» del panel superadmin cubre efectividad parcial; la vista dedicada en **supervisor** sigue pendiente.

### 14.3 Nuevos endpoints API

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/api/leads/:id/historial` | promotor, supervisor | Historial de seguimiento del lead |
| PATCH | `/api/leads/:id/telefono` | promotor, supervisor | Modificar teléfono (lead manual) |
| GET | `/api/notificaciones/links-redes` | promotor, supervisor | Avisos links vencidos/regenerados |
| POST | `/api/notificaciones/links-redes/:id/vista` | promotor, supervisor | Marcar notificación leída |
| GET | `/api/admin/dashboard` | superadmin | Panel métricas empresa |

`PATCH /api/leads/:id/seguimiento` ampliado: respuesta con `historial`, `referidosCreados`, `nuevosLeads`, `message`.

### 14.4 Nuevos entregables DBA (añadir a §13.8)

| # | Estado | Entregable | Script / notas |
|---|--------|------------|----------------|
| 11 | **Parcial** | `SP_RegistrarSeguimientoLead` operativo | Corregir tipo `resultado_entrevista`; `sql/SP_RegistrarSeguimientoLead-notas.sql` |
| 12 | **Pendiente** | Tabla + SP `lead_referido` | `sql/lead_referido-tabla-sp.sql` |
| 13 | **Implementado** | `encuestaCargaSorteo01` origen 2 upsert | `sql/encuestaCargaSorteo01-origen2-upsert.sql` |
| 14 | **Implementado** | `encuestaSorteo01Update` | `sql/encuestaSorteo01Update.sql` |
| 15 | **Parcial** | `grants-mpcsp-leads.sql` | Permisos seguimiento + referidos + update teléfono |
| 16 | **Pendiente** | Ajuste `encuestasMuestraOperador` para referidos y visibilidad | Ver `FUNCIONALIDAD_REFERIDOS_ENCUESTA.md` |

### 14.5 Índice de documentación nueva

| Tema | Archivo |
|------|---------|
| Conexión SP seguimiento | [FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md](./FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md) |
| Historial seguimiento | [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md) |
| Referidos encuesta | [FUNCIONALIDAD_REFERIDOS_ENCUESTA.md](./FUNCIONALIDAD_REFERIDOS_ENCUESTA.md) |
| Carga manual origen 2 | [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md) |
| Acortador links | [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) |
| Modelo parámetros SP | [FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md](./FUNCIONALIDAD_MODELO_SEGUIMIENTO_SQL.md) |
| Contactado vs Cierres | [FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md](./FUNCIONALIDAD_CONTACTADO_VS_CIERRES.md) |
| Panel superadmin (datos en pantalla) | [FUNCIONALIDAD_PANEL_SUPERADMIN.md](./FUNCIONALIDAD_PANEL_SUPERADMIN.md) |
| Índice general | [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md) |

---

## 15. Actualización — nuevas funcionalidades (junio 2026, segunda entrega)

> **Añadido:** 5 jun 2026. Complementa **§14** sin modificar secciones 1–13 ni reescribir §14.

### 15.0 Revisión de estados (respecto a §14)

| Ítem | Estado en §14 | Estado actual |
|------|-----------------|---------------|
| **RF-29** SP seguimiento SQL | Parcial | **Parcial+** — lectura vía `SP_HistorialSeguimientoLead` y `SP_UltimoSeguimientoOperador` |
| **RF-30** Historial seguimiento | Implementado | **Implementado+** — historial también **inline en tarjetas** (`LeadHistorialInline`) |
| **RF-31** Referidos → encuesta | Parcial | **Parcial+** — badge **Referido**, meta vía `SP_ObtenerMetaReferidosLead`, fix campo3/4 |
| **RF-34** Links redes | Implementado | **Implementado+** — catálogo default desde SP `rptLinkQRenRedesSociales` (STRSYSTEM) |
| **DBA ítem 12** `lead_referido` | Pendiente | **Parcial** — scripts desplegables + fix Pablo (`lead_referido-fix-campo3-campo4-pablo.sql`) |

### 15.1 Nuevos requerimientos funcionales

| ID | Estado | Requerimiento | Doc / código |
|----|--------|---------------|--------------|
| RF-37 | **Implementado** | Historial de seguimiento **visible en la tarjeta** del lead (últimos estados sin abrir el modal). | `useHistorialLeads.ts`, `LeadHistorialInline.tsx`, `LeadCard.tsx` |
| RF-38 | **Implementado** | Lectura de seguimiento en SQL Server por SP dedicados (historial por lead + último estado batch por operador). | `sql/SP_ConsultarSeguimientoLead-notas.sql`, `seguimiento-sql.js` |
| RF-39 | **Implementado** | Badge **Referido** en tarjeta con metadatos (origen, nivel, visibilidad promotor/supervisor). | `FUNCIONALIDAD_REFERIDOS_ENCUESTA.md`, `LeadCard.tsx` |
| RF-40 | **Implementado** | Idempotencia al cargar referidos (`referidosGenerados` evita duplicar altas). | `src/domain/referidos-carga.ts`, `referidos-carga.js` |
| RF-41 | **Implementado** | Catálogo de links redes desde **SP en STRSYSTEM** (respaldo JSON). | `links-redes-sp.js`, `SP_LINKS_REDES` |
| RF-42 | **Implementado** | Exportar planilla de prueba de links redes en Excel (`npm run links:export-prueba` → `.xlsx`). | `scripts/export-links-redes-prueba.mjs` |
| RF-43 | **Implementado** | Distinguir origen de carga manual vs QR (`@origen` 1/2 en SP carga). | `FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md`, `SP_CARGA_INCLUDE_ORIGEN` |

### 15.2 Resumen por funcionalidad

#### 15.2.1 Historial inline en tarjetas (RF-37)

- `LeadsPanel` precarga historial de los leads visibles con `useHistorialLeads`.
- `LeadCard` muestra `LeadHistorialInline` (últimas entradas, etiqueta de estado, operador).
- Complementa el panel del modal (RF-30) para seguimiento rápido en bandeja.

#### 15.2.2 SP de lectura de seguimiento (RF-38)

Variables `.env`:

```env
SP_SEGUIMIENTO_HISTORIAL=dbo.SP_HistorialSeguimientoLead
SP_SEGUIMIENTO_ULTIMOS=dbo.SP_UltimoSeguimientoOperador
```

| SP | Uso |
|----|-----|
| `SP_HistorialSeguimientoLead` | Historial de **un** lead (`GET /api/leads/:id/historial`) |
| `SP_UltimoSeguimientoOperador` | Último seguimiento de **todos** los leads visibles al cargar listado |

Regla de visibilidad: igual que `encuestasMuestraOperador` (supervisor = equipo; promotor = propios).  
Script DBA: `sql/SP_ConsultarSeguimientoLead-notas.sql`.  
Permisos: `GRANT EXECUTE` en ambos SP (ver `grants-mpcsp-leads.sql`).

#### 15.2.3 Referidos — refinamiento (RF-39, RF-40)

- **Badge Referido** en `LeadCard` cuando `lead.esReferido` (desde SP listado o `SP_ObtenerMetaReferidosLead`).
- Campos lead: `esReferido`, `leadReferidoDeId`, `nivelReferido`, `referidoCargadoPorRol`.
- **Fix DBA:** no escribir metadata de referido en `campo3`/`campo4` de encuesta (son preguntas del sorteo). Script: `sql/lead_referido-fix-campo3-campo4-pablo.sql`.
- **Idempotencia:** `seguimiento.referidosGenerados[]` guarda teléfonos ya procesados; re-guardar no duplica altas.
- Resolución `id_vendedor` / `id_supervisor`: JOIN `encuesta.usuario` → `mensajeria.dbo.vendedor.codigo`.

#### 15.2.4 Links redes desde SQL (RF-41, RF-42)

- Catálogo operadores: `EXEC dbo.rptLinkQRenRedesSociales` (default) con fallback `links-redes.json`.
- `LINKS_REDES_SOURCE=sql` (default) | `json`.
- Inspección: `npm run inspect:links-redes`.
- Export CSV prueba (todos los códigos + links IG/FB/WA): `npm run links:export-prueba` → `data/links-redes-prueba-YYYY-MM-DD.csv`.
- Verificación HTTP opcional: `npm run links:export-prueba:verificar`.

#### 15.2.5 Origen de carga QR vs manual (RF-43)

- `SP_CARGA_INCLUDE_ORIGEN=true` → la app envía `@origen`: `1` = QR, `2` = manual/app.
- Permite upsert en carga manual (`origen 2`) sin bloquear altas QR (`origen 1`).

### 15.3 Variables `.env` nuevas o ampliadas

| Variable | Default | Uso |
|----------|---------|-----|
| `SP_SEGUIMIENTO_HISTORIAL` | `dbo.SP_HistorialSeguimientoLead` | Lectura historial |
| `SP_SEGUIMIENTO_ULTIMOS` | `dbo.SP_UltimoSeguimientoOperador` | Batch al listar leads |
| `SP_OBTENER_META_REFERIDO` | `SP_ObtenerMetaReferidosLead` | Badge referido |
| `SP_REGISTRAR_REFERIDO` | `SP_RegistrarReferidoLead` | Alta referido |
| `REFERIDOS_AUTO_CARGA` | `true` | Procesar referidos al guardar |
| `SP_LINKS_REDES` | `dbo.rptLinkQRenRedesSociales` | Catálogo links |
| `LINKS_REDES_SOURCE` | `sql` | `sql` \| `json` |
| `SP_CARGA_INCLUDE_ORIGEN` | `true` | Enviar `@origen` en carga |
| `SUPERADMIN_LOGIN_IDS` | — | Logins con rol superadmin |
| `ADMIN_SUPERVISOR_IDS` | — | Filtro supervisores en panel admin |

### 15.4 Nuevos entregables DBA (añadir a §14.4)

| # | Estado | Entregable | Script |
|---|--------|------------|--------|
| 17 | **Pendiente** | `SP_HistorialSeguimientoLead` | `SP_ConsultarSeguimientoLead-notas.sql` |
| 18 | **Pendiente** | `SP_UltimoSeguimientoOperador` | `SP_ConsultarSeguimientoLead-notas.sql` |
| 19 | **Parcial** | Fix referidos campo3/4 + SP actualizado | `lead_referido-fix-campo3-campo4-pablo.sql` |
| 20 | **Implementado** | SP catálogo links `rptLinkQRenRedesSociales` | STRSYSTEM (DBA) |

### 15.5 Scripts npm / utilidades nuevas

| Comando | Descripción |
|---------|-------------|
| `npm run inspect:links-redes` | Inspecciona columnas del SP de links |
| `npm run links:export-prueba` | CSV de links por operador |
| `npm run links:export-prueba:verificar` | CSV + verificación HTTP |
| `npm run test:referidos-sp` | Prueba SP referidos (si existe en package.json) |

### 15.6 Documentación de detalle

| Tema | Archivo |
|------|---------|
| Referidos (badge, visibilidad, SPs) | [FUNCIONALIDAD_REFERIDOS_ENCUESTA.md](./FUNCIONALIDAD_REFERIDOS_ENCUESTA.md) |
| SP lectura seguimiento | [sql/SP_ConsultarSeguimientoLead-notas.sql](../sql/SP_ConsultarSeguimientoLead-notas.sql) |
| Historial (modal + inline) | [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md) |
| Links redes SP + export | [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) |
| Carga origen 1/2 | [FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md](./FUNCIONALIDAD_CARGA_MANUAL_ORIGEN2.md) |

### 15.7 URL de producción

Sistema desplegado en: [https://www.miprimercasafsa-sorteo.com/leads/](https://www.miprimercasafsa-sorteo.com/leads/)

---

## 16. Actualización — UX de bandejas Contactado y Cierres (junio 2026, tercera entrega)

> **Añadido:** 2 jun 2026. Complementa **§14** y **§15** sin modificar secciones 1–13.

### 16.0 Revisión de estados (respecto a §4 y §15)

| Ítem | Estado anterior | Estado actual |
|------|-----------------|---------------|
| **RF-24** Contactado con negativos | Implementado | **Implementado+** — prioridad y color naranja para post-entrevista sin compra |
| **RF-25** Cierres control de calidad | Parcial | **Parcial+** — orden por fecha de venta; sigue faltando flujo QC dedicado |
| **§6.2** texto pestaña Cierres | Desactualizado («No compró» en Cierres) | Corregido: solo `compro` |

### 16.1 Nuevos requerimientos funcionales

| ID | Estado | Requerimiento | Doc / código |
|----|--------|---------------|--------------|
| RF-44 | **Implementado** | El banner informativo de la vista Leads debe adaptarse al rol: promotor (entrevistas, swipe, contacto rápido) vs supervisor (terreno derivado, tres grupos de prioridad). | `LeadsPanel.tsx` (`esPromotor`) |
| RF-45 | **Implementado** | En **Cierres**, promotor y supervisor deben ver arriba las ventas más recientes. | `fechaVentaLead`, `sortLeadsPorVentaReciente`, `useLeadsFilter.ts`, `LeadsPanel.tsx` |
| RF-46 | **Implementado** | En **Contactado**, los leads con entrevista realizada y resultado negativo (`no_compro` / `sin_interes`) deben listarse **antes** que el resto de contactados. | `leadPostEntrevistaSinCompra`, `sortLeadsContactados` |
| RF-47 | **Implementado** | Los post-entrevista sin compra en Contactado deben distinguirse visualmente (fondo naranja claro, badge «No compró» / «Sin interés») del amarillo ámbar de contactados habituales. | `LeadCard.tsx`, `StatusPill` variante `post-entrevista` |

### 16.2 Resumen por funcionalidad

#### 16.2.1 Banner contextual por rol (RF-44)

- **Supervisor:** «derivados a terreno → entrevistas agendadas → encuestas sin contactar».
- **Promotor:** «tus entrevistas agendadas → encuestas sin contactar», swipe para contacto rápido, reagenda a En seguimiento.
- Sin duplicar el bloque `PromotorResumen` / `AlertasSinContactar` (solo promotor).

#### 16.2.2 Cierres — ventas recientes arriba (RF-45)

- `fechaVentaLead`: última entrada `compro` del historial (`creadoEn`); si no hay historial, `fechaAlta` / `fechaObtencion`.
- `sortLeadsPorVentaReciente`: orden descendente por esa fecha.
- `LeadsPanel` reordena la pestaña Cierres al cargar historial (`useHistorialLeads`).

#### 16.2.3 Contactado — post-entrevista prioritario (RF-46, RF-47)

| Grupo | Condición | Orden | Color tarjeta |
|-------|-----------|-------|---------------|
| 1 — Post-entrevista negativo | `esCerradoNegativoLead` + `huboEntrevista = true` | Más reciente arriba | Naranja (`orange-50` / `orange-200`) |
| 2 — Resto contactados | `canal` o `huboEntrevista` sin cierre negativo prioritario | FIFO (`fechaAlta`) | Ámbar (`amber-50`) |

Badge: variante `post-entrevista` en `StatusPill` («No compró» o «Sin interés»).

Doc detalle: [FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md](./FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md).

### 16.3 Mapa de código

| Función / componente | Archivo |
|----------------------|---------|
| `fechaVentaLead`, `sortLeadsPorVentaReciente` | `src/domain/leads.ts` |
| `leadPostEntrevistaSinCompra`, `sortLeadsContactados` | `src/domain/leads.ts` |
| Listas `compraron` y `paraContactar` | `src/hooks/useLeadsFilter.ts` |
| Banner, orden Cierres con historial | `src/components/leads/LeadsPanel.tsx` |
| Estilo naranja y pill | `src/components/leads/LeadCard.tsx`, `StatusPill.tsx` |

### 16.4 Requerimientos que siguen pendientes o parciales (sin cambio de estado)

| ID | Estado | Motivo |
|----|--------|--------|
| RF-17 | Parcial | Multisorteo en SQL (`campania`, SP listado ampliado) |
| RF-18 | Parcial | Sin pantalla «verificar lead QR» |
| RF-20 | Parcial | Sin bandeja «sin tratar por promotor» |
| RF-21 | Parcial | Cierre PIJ promotor en Cierres sí; falta exclusión supervisor y subsección QC |
| RF-22 | Parcial | Sin filtro UI «solo no cerrados por promotor» |
| RF-25 | Parcial | Orden de ventas sí; falta flujo control de calidad |
| RF-26 | Pendiente | Efectividad entrevistas en vista **supervisor** (superadmin tiene parte) |
| RF-27 | Parcial | Reagendas en bandeja; sin wizard «confirmar una por una» |
| RF-29 | Parcial | SP escritura seguimiento SQL |
| RF-31 | Parcial | Referidos en encuesta + visibilidad completa en listado SP |

---

## 17. Actualización — links redes, métricas y código promotor (junio 2026, cuarta entrega)

> **Añadido:** 5 jun 2026. Complementa §14–§16 tras auditoría del código en `main` (commits `d5a81c6`, `a1807ef`, `2bc32e1`).

### 17.0 Revisión de estados (respecto a §4, §14 y §15)

| Ítem | Estado anterior | Estado actual |
|------|-----------------|---------------|
| **RF-12** Links redes | Implementado (IG/FB) | **Implementado+** — WhatsApp y TikTok con iconos en `LinksRedesSection` |
| **RF-15** Métricas promotor | Implementado | **Implementado+** — gráfico origen incluye WhatsApp y TikTok |
| **RF-42** Export links prueba | Implementado (CSV) | **Implementado+** — export principal en **Excel (.xlsx)**; CSV legacy en `data/` si existe |
| **RF-09** Carga manual `@usuario` | Implementado | **Implementado+** — resolución estricta sin mezclar códigos ajenos (`operadores-catalog.js`) |

### 17.1 Nuevos requerimientos funcionales

| ID | Estado | Requerimiento | Doc / código |
|----|--------|---------------|--------------|
| RF-48 | **Implementado** | Compartir links de **WhatsApp** y **TikTok** desde la sección «Links para compartir en redes», con iconos de marca (igual que Instagram/Facebook). | `LinksRedesSection.tsx`, tipo `LinksRedes`, SP catálogo |
| RF-49 | **Implementado** | Registrar y visualizar **WhatsApp** y **TikTok** como fuente de lead en métricas del promotor y panel admin (gráficos de origen). | `fuenteLabels.ts`, `OrigenLeadsChart.tsx`, `admin-productividad.ts` |
| RF-50 | **Implementado** | Resolver el código `@usuario` del promotor desde la **planilla SQL** (`rptLinkQRenRedesSociales`) con reglas estrictas: sin asignar códigos de otro vendedor por coincidencia parcial de nombre. | `operadores-catalog.js` → `resolveCodigoCargaPromotorStrict`, `enriquecerUsuarioConCodigoCarga` |
| RF-51 | **Implementado** | Si el promotor no trae `codigoCarga` en sesión, obtenerlo de `/api/links-redes` o de un lead propio antes de cargar manualmente. | `LeadsPanel.tsx` (`codigoCargaFallback`), login y `encuesta-carga.js` |

### 17.2 Resumen por funcionalidad

#### 17.2.1 Redes ampliadas — WhatsApp y TikTok (RF-48)

- API `GET /api/links-redes` devuelve `whatsapp` y `tiktok` además de `instagram` y `facebook`.
- Botones cuadrados con icono SVG de marca; compartir nativo (`navigator.share`) o `window.open`.
- Solo **Instagram** usa link acortado en cron; Facebook/WhatsApp/TikTok son links largos del SP.

#### 17.2.2 Métricas por fuente (RF-49)

- `FuenteLead` incluye `whatsapp` y `tiktok`.
- Carga manual: `origenIngresoToFuente` mapea origen → fuente para métricas.
- `OrigenLeadsChart` (promotor) y `AdminProductividadPanel` (superadmin) muestran las 6 fuentes.

#### 17.2.3 Código promotor desde planilla SQL (RF-50, RF-51)

Prioridad de resolución para **promotor** (`resolveCodigoCargaPromotorStrict`):

1. `byIdOperador` en catálogo SP (precargado con `warmOperadoresCatalog` al arrancar API).
2. `byLoginId` / `byNombre` exacto en catálogo.
3. Coincidencia flexible de nombre **solo** si el vendedor del SP coincide (`nombresCoinciden`).
4. Filas propias del listado `encuestasMuestraOperador` (`idVendedor` + `usuario`).
5. `codigoCarga` de sesión solo si pasa validación `codigoPerteneceAVendedor`.

**Login, listado leads, carga manual y notificaciones links** usan `enriquecerUsuarioConCodigoCarga` en cada request relevante.

**Frontend:** si falta código en sesión, `LeadsPanel` consulta `fetchLinksRedes()` y usa `links.codigo` como fallback para `NuevoLeadSheet`.

**QA DBA:** `node scripts/verificar-asignacion-links.mjs` — casos Jose G / Leonel C contra STRSYSTEM.

Doc detalle: [FUNCIONALIDAD_CODIGO_PROMOTOR_PLANILLA.md](./FUNCIONALIDAD_CODIGO_PROMOTOR_PLANILLA.md).

#### 17.2.4 Export planilla links (actualización RF-42)

- `npm run links:export-prueba` → `data/links-redes-prueba-YYYY-MM-DD.xlsx` (columnas IG/FB/WA/TikTok por operador).
- `npm run links:export-prueba:verificar` — añade columnas HTTP ok/error.

### 17.3 Mapa de código

| Componente | Archivo |
|------------|---------|
| Catálogo SP + merge JSON | `server/db/operadores-catalog.js`, `links-redes-sp.js` |
| Enriquecer sesión con código | `enriquecerUsuarioConCodigoCarga` (login, leads, carga) |
| Carga manual segura | `server/db/encuesta-carga.js` |
| Fallback UI promotor | `src/components/leads/LeadsPanel.tsx` |
| Links 4 redes | `src/components/leads/LinksRedesSection.tsx` |
| Métricas origen | `src/components/promotores/OrigenLeadsChart.tsx` |
| Verificación QA | `scripts/verificar-asignacion-links.mjs` |

### 17.4 Scripts npm / utilidades

| Comando | Descripción |
|---------|-------------|
| `npm run links:export-prueba` | Excel de links por operador (SP) |
| `npm run links:export-prueba:verificar` | Excel + verificación HTTP |
| `node scripts/verificar-asignacion-links.mjs` | QA asignación código ↔ planilla SQL |

### 17.5 Panel superadmin — catálogo de datos en pantalla (RF-35)

> Doc ampliada: [FUNCIONALIDAD_PANEL_SUPERADMIN.md](./FUNCIONALIDAD_PANEL_SUPERADMIN.md)

El rol **superadmin** (`SUPERADMIN_LOGIN_IDS`) no usa bandejas de leads. Al iniciar sesión carga `GET /api/admin/dashboard` y muestra `SuperadminDashboard` — **Panel global de equipos**.

**Fuentes:** listado global `SP_ENCUESTAS_ADMIN` (default `encuestasMuestra`) + historial `registrarSeguimientoLead` (~400 días) si `SP_SEGUIMIENTO` está activo. **Semana móvil:** hoy + 6 días anteriores.

#### 17.5.1 Encabezado y avisos

| Elemento | Campo / origen |
|----------|----------------|
| Rango semana | `semanaDesde` – `semanaHasta` |
| Fecha de hoy | `hoy` (formato largo es-AR) |
| Banner ámbar | `aviso` — fallo del SP, sin permisos MPCSP, listado vacío |

#### 17.5.2 Sección «Hoy» — 4 KPIs globales

| Tarjeta | Campo API | Definición |
|---------|-----------|------------|
| Entrevistas | `resumenHoy.entrevistas` | Leads distintos con entrevista hoy (historial: `hubo_entrevista`, `confirmo_entrevista` o resultado de entrevista válido). Máx. 1 por lead/día. |
| Cierres | `resumenHoy.cierres` | Leads con `resultado_entrevista = compro` hoy. Máx. 1 por lead. |
| Terrenos | `resumenHoy.ventasTerreno` | Cierres hoy con `id_producto = prod-terreno` |
| Plan Inv. Joven | `resumenHoy.ventasPij` | Cierres hoy con `id_producto = prod-pij` |

#### 17.5.3 Evolución temporal (`AdminMetricsChart`)

Visible si `eventos.length > 0`.

| Control | Opciones |
|---------|----------|
| Supervisor | Todos los equipos · un supervisor (si hay más de uno) |
| Período | Semana ISO · Mes · Año |

**Series del gráfico:**

| Serie | Tipo evento | Conteo |
|-------|-------------|--------|
| Leads | `lead` | Fecha de alta del lead |
| Entrevistas | `entrevista` | Primera entrevista por lead por día |
| Cierres | `cierre` | `resultado_entrevista = compro` |
| Terrenos | `terreno` | Cierre + producto terreno |
| PIJ | `pij` | Cierre + producto PIJ |

#### 17.5.4 Conocimiento de marca (`AdminConocimientoEncuesta`)

Visible si `conocimientoLeads.total > 0`. Total de leads del SP.

| Pregunta | Campos | Origen SQL |
|----------|--------|------------|
| ¿Conocían Mi Primer Casa? | `conoceMpc`: si / no / sinResponder | `campo3` encuesta |
| ¿Sabían del Plan Inversión Joven? | `sabiaPlanInversionJoven`: si / no / sinResponder | `campo4` encuesta |

Cada pregunta: contadores Sí / No / Sin dato + barra apilada (si hay respuestas).

#### 17.5.5 Productividad — embudo y eficiencia (`AdminProductividadPanel`)

Visible si `productividad.embudoGlobal.leads > 0`.

**Embudo global** (sobre todos los leads):

| Etapa | Campo | Tasa |
|-------|-------|------|
| Leads | `embudoGlobal.leads` | 100 % (base) |
| Con entrevista | `embudoGlobal.conEntrevista` | `tasaEntrevistaPct` |
| Con cierre | `embudoGlobal.conCierre` | `tasaCierreLeadPct` |
| Texto adicional | — | Cierre sobre entrevistas: `tasaCierreEntrevistaPct` |

**Mini KPIs:**

| Etiqueta | Campos | Significado |
|----------|--------|-------------|
| Tiempo resp. prom. | `tiempoPrimeraEntrevista` | Días alta → primera entrevista (promedio, mediana, muestras) |
| Recuperación PIJ | `pijRecuperacion` | % seguimientos PIJ promotor que cerraron |
| Cierres c/ referidos | `referidos` | Cierres con `brindoReferidos` + total referidos brindados |
| Backlog +30 días | `backlog` | Leads sin gestión ≥30 días (sub: 7d y 14d) |

**Gráfico resultados de entrevista** — estado actual por lead:

`compro` (Compró) · `no_compro` (No compró) · `reagenda` · `sin_interes` · `derivar_terreno` · `pendiente` (Sin resultado)

**Gráfico efectividad por canal** — por fuente con leads (`canales[]`):

| Fuente | Etiqueta UI |
|--------|-------------|
| `qr` | QR |
| `app` | Manual |
| `facebook` | Facebook |
| `instagram` | Instagram |
| `whatsapp` | WhatsApp |
| `tiktok` | TikTok |
| `otros` | Otros |

Por canal: leads, cierres, `tasaCierrePct` (badge bajo el gráfico).

**Tabla encuesta vs cierre** (`conocimientoVsCierre`): segmento (Conoce MPC / Sabía PIJ × Sí/No/Sin dato), leads, cierres, tasa %.

**Tabla top 8 promotores por tasa de cierre** (`embudoPromotores`): promotor, supervisor, leads, entrevistas, cierres, Lead→Ent., Ent.→Cierre, Lead→Cierre.

> Cubre parte de **RF-26**; la vista dedicada en supervisor sigue pendiente.

#### 17.5.6 Destacados de la semana — rankings (top 5)

| Ranking | Campo API | Métrica |
|---------|-----------|---------|
| Más entrevistas | `rankings.entrevistasSemana` | `entrevistasSemana` |
| Más cierres | `rankings.cierresSemana` | `cierresSemana` |
| Más leads nuevos | `rankings.leadsSemana` | Altas en semana móvil |
| Más terrenos vendidos | `rankings.ventasTerrenoSemana` | Cierres terreno en semana |
| Más Plan Inv. Joven | `rankings.ventasPijSemana` | Cierres PIJ en semana |

Cada ítem: posición, `promotorNombre`, `supervisorNombre`, `valor`.

#### 17.5.7 Supervisores y equipos — tabla por supervisor

**Encabezado de equipo:**

| Dato | Campo |
|------|-------|
| Nombre | `supervisorNombre` |
| Cantidad promotores | `promotores.length` |
| Semana | `totales.entrevistasSemana` ent. · `totales.cierresSemana` cierres |
| Hoy | `totales.entrevistasHoy` ent. · `totales.cierresHoy` cierres |

**Columnas por promotor:**

| Columna UI | Campo | Alcance |
|------------|-------|---------|
| Promotor | `promotorNombre` | — |
| Leads | `leadsTotal` | Histórico (todo el SP) |
| Ent. sem. | `entrevistasSemana` | Semana móvil |
| Ent. hoy | `entrevistasHoy` | Hoy |
| Cierres sem. | `cierresSemana` | Semana móvil |
| Cierres hoy | `cierresHoy` | Hoy |
| Terrenos | `ventasTerrenoSemana` | Semana móvil |
| PIJ | `ventasPijSemana` | Semana móvil |

#### 17.5.8 Mapa de código (superadmin)

| Capa | Archivo |
|------|---------|
| UI | `SuperadminDashboard.tsx`, `AdminMetricsChart.tsx`, `AdminConocimientoEncuesta.tsx`, `AdminProductividadPanel.tsx` |
| Dominio | `admin-metrics.ts`, `admin-productividad.ts` |
| API | `admin-dashboard.js`, `GET /api/admin/dashboard` en `create-app.js` |
| Tipos | `AdminDashboardData` en `types/index.ts` |

---

*Documento generado a partir del análisis integral del repositorio. Las novedades se agregan en **§14**–**§17** sin reescribir el cuerpo principal (secciones 1–13).*
