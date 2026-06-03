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
| Requerimientos no funcionales (RNF-01 … RNF-08) | 8 | 0 | 0 |
| Entregables DBA (sección 13.8, ítems 1 … 10) | 1 | 2 | 7 |

*Nota: en app, RF-17 está parcial (badge + `ENCUESTA_CARGA_ID`); en SQL faltan `dbo.campania`, SP ampliados y persistencia de seguimiento en servidor (ítems 1–4, 6–8 del anexo 13).*

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
| RF-12 | **Implementado** | El sistema debe ofrecer enlaces para compartir en Instagram/Facebook según el operador. | `LinksRedesSection.tsx`, `/api/links-redes` |
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
| RF-24 | **Implementado** | La pestaña **Contactado** debe incluir los resultados negativos: «no hubo entrevista + no muestra interés» (`sin_interes`) y «hubo entrevista por llamada o mensaje + no compró» (`no_compro`), tanto de promotores como de supervisores. | `useLeadsFilter.ts` (jun. 2026) |
| RF-25 | **Parcial** | La pestaña **Cierres** debe mostrar las ventas del supervisor (PIJ y Terreno) y las ventas de PIJ de los promotores, para que el supervisor realice el control de calidad contactando al cliente. | Cierres lista todos los `compro` del equipo; falta UI/flujo dedicado de control de calidad (checklist, contacto registrado) |
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
2. **Contactado** — ya hubo contacto, no son prioridad ni reagenda.
3. **En seguimiento** — `resultadoEntrevista = reagenda`.
4. **Cierres** — compraron + subsección «No compró».

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
| **Contactado** | «¿Hubo entrevista?» = **No** + «No muestra interés» (`sin_interes`); o «¿Hubo entrevista?» = **Sí** (llamada/mensaje) + «No compró» (`no_compro`). | Resultados negativos de promotor o supervisor (incluye leads que el promotor cargó con esa info). |
| **En seguimiento** | La entrevista se **reagenda** (`resultadoEntrevista = reagenda`, con `fechaReagenda`). Permite confirmar las entrevistas una por una. | Promotor y supervisor |
| **Cierre** | El lead **compró** (`resultadoEntrevista = compro`) Terreno o PIJ. | Ventas del supervisor (PIJ y Terreno) + ventas de PIJ de promotores (control de calidad). |

> **Estado de implementación:** implementado. Los resultados negativos (`no_compro`, `sin_interes`) se muestran en la pestaña **Contactado**; la pestaña **Cierres** solo lista compras (`compro`). Ver `tabIdListaLead` en `src/domain/leads.ts` y `src/hooks/useLeadsFilter.ts`.

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

*Documento generado a partir del análisis integral del repositorio. Mantener actualizado ante cambios funcionales relevantes. Cada vez que se agregan requerimientos se actualiza esta documentación y el anexo del DBA (sección 13).*
