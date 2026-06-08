# Instructivo de uso — Seguimiento de Leads (Mi Primer Casa)

> **Versión visual (recomendada):** abrí **[INSTRUCTIVO_USO_APLICACION.html](./INSTRUCTIVO_USO_APLICACION.html)** en el navegador — diseño con diagramas, colores por rol, flujos paso a paso e índice navegable.  
> **En la app:** en la pantalla de login, botón **«Ver instructivo de uso»** → `/leads/instructivo.html` (producción).  
> **Word:** [INSTRUCTIVO_USO_APLICACION.docx](./INSTRUCTIVO_USO_APLICACION.docx)

**Aplicación:** CRM web para seguimiento comercial de leads del sorteo.  
**URL producción:** https://www.miprimercasafsa-sorteo.com/leads/  
**Roles cubiertos:** **Promotor** y **Supervisor**.

---

## 1. ¿Para qué sirve la aplicación?

La app permite:

- Ver los leads asignados a tu equipo (encuestas del sorteo y cargas manuales).
- Registrar **contacto**, **entrevistas**, **reagendas**, **cierres** (ventas) y **referidos**.
- Agendar y consultar entrevistas en el **calendario**.
- Cargar leads nuevos manualmente (feria, redes, referidos).
- Compartir **links de redes** (Instagram, Facebook, WhatsApp, TikTok).
- Consultar **métricas** de rendimiento (promotor: propias; supervisor: del equipo).

Los datos se guardan en el servidor y quedan disponibles para el resto del equipo según el rol.

---

## 2. Ingreso a la aplicación

### 2.1 Iniciar sesión

1. Abrí la URL de la aplicación en el navegador del celular o la PC.
2. Ingresá tu **usuario** (correo o login del operador) y **contraseña**.
3. Tocá **Ingresar**.

El sistema valida las credenciales contra SQL Server (`operadorAccesoCategoria`). Si son incorrectas, verás un mensaje de error.

### 2.2 Rol y pantalla inicial

Según tu categoría en el sistema:

| Rol | Badge en la barra superior | Pestañas disponibles |
|-----|----------------------------|----------------------|
| **Promotor** | Verde «Promotor» | Leads · Calendario · Métricas |
| **Supervisor** | Azul «Supervisor» | Leads · Promotores · Calendario |

Al entrar siempre aterrizás en **Leads**.

### 2.3 Cerrar sesión

Tocá **Salir** en la esquina superior derecha.

### 2.4 Notificaciones (campana)

Promotores y supervisores ven un ícono de campana. Ahí aparecen avisos cuando se **regenera el link acortado de Instagram** de tu código de operador. Tocá una notificación para marcarla como leída.

---

## 3. Conceptos básicos: el recorrido de un lead

Un lead puede moverse entre **cuatro bandejas** (pestañas dentro de Leads):

```
┌─────────────┐     contacto / entrevista      ┌─────────────┐
│  Prioridad  │ ─────────────────────────────► │ Contactado  │
│ (sin tratar │                                │ (ya hubo    │
│  o cita)    │                                │  contacto)  │
└──────┬──────┘                                └──────┬──────┘
       │                                              │
       │ reagenda                                     │ compró
       ▼                                              ▼
┌─────────────┐                                ┌─────────────┐
│En seguimien-│                                │   Cierres   │
│to (reagenda)│                                │  (ventas)   │
└─────────────┘                                └─────────────┘
```

| Bandeja | Cuándo aparece el lead |
|---------|------------------------|
| **Prioridad** | Aún no fue contactado, tiene entrevista pendiente, o fue derivado a terreno |
| **Contactado** | Ya hubo contacto o entrevista sin cierre; también «No compró» / «Sin interés» |
| **En seguimiento** | Tiene entrevista **reagendada** (nueva fecha futura) |
| **Cierres** | Cerró venta («Compró») — ordenados con las más recientes arriba |

**Colores de las tarjetas (referencia rápida):**

| Color | Significado |
|-------|-------------|
| Verde agua | Lead nuevo / encuesta sin contactar |
| Ámbar | Contactado |
| Naranja | Post-entrevista sin compra (prioridad en Contactado) |
| Bordó claro | En seguimiento (reagenda) |
| Verde oscuro | Cierre / venta |
| Índigo | Solo lectura (no podés editar) |

---

## 4. Pantalla Leads — elementos comunes

### 4.1 Barra de búsqueda

Podés buscar por **nombre**, **teléfono** o **dirección**. Los resultados muestran leads de todas las bandejas. Tocá la **X** para volver a la vista por pestañas.

### 4.2 Pestañas y contadores

Cuatro botones con el nombre de la bandeja y la **cantidad** de leads. Tocá uno para cambiar de lista.

### 4.3 Botón «Cargar lead»

Abre el formulario de **carga manual** (ver §6.3 promotor / §7.3 supervisor).

### 4.4 Banner informativo

Texto de ayuda sobre el orden de **Prioridad** y qué pasa al **reagendar** (el texto varía levemente entre promotor y supervisor).

### 4.5 Tarjeta de lead

Cada tarjeta muestra, según el estado:

- Nombre, teléfono, domicilio (si hay).
- Badge de **sorteo/campaña**.
- Badge **Referido** (si el lead vino de un referido).
- Fecha de entrevista agendada (si aplica).
- **Historial inline** (últimos movimientos de seguimiento).
- Estado visual (pill): «Nuevo», «Contactado», «Reagenda», «Compró», etc.

**Tocá la tarjeta** para abrir el formulario completo de seguimiento.

### 4.6 Links para compartir en redes

Al final de la pantalla Leads (y también en Métricas del promotor) aparece la sección con botones de **Instagram**, **Facebook**, **WhatsApp** y **TikTok**. Tocá un ícono para compartir tu link personal del sorteo.

### 4.7 Modificar teléfono

Solo en leads de **carga manual** (origen app). En la tarjeta aparece el botón **Modificar teléfono**. No aplica a encuestas QR del sorteo ni a tarjetas de solo lectura.

---

## 5. Guía del PROMOTOR

### 5.1 Resumen y alertas (solo promotor)

Arriba de las bandejas verás:

| Bloque | Qué muestra |
|--------|-------------|
| **Resumen** | Total leads · Contactados · En seguimiento · % conversión |
| **Alerta roja** | Encuestas **sin contactar** hace **2 o más días** — tocá un nombre para abrir el lead |

### 5.2 Bandeja Prioridad — orden de trabajo

Los leads se agrupan en **tres bloques** (de arriba hacia abajo):

| Grupo | Qué son | Orden |
|-------|---------|-------|
| **1. Interés terreno — derivado por promotor** | Vos derivaste al supervisor un cliente interesado en terreno | Los más antiguos primero |
| **2. Entrevista pendiente** | Tienen fecha/hora de entrevista agendada | Los más antiguos primero |
| **3. Encuesta sin contactar** | Llegaron del sorteo y aún no los contactaste | Los más antiguos primero |

> Las derivaciones a terreno las **gestiona el supervisor**; vos las ves en Prioridad hasta que el equipo las resuelva.

**Consejo de uso diario:** empezá por entrevistas del día, luego encuestas sin contactar (las alertas rojas te ayudan).

### 5.3 Bandeja Contactado

Leads que ya tuvieron algún contacto pero **no cerraron** ni están en reagenda activa.

- Los que tuvieron entrevista y quedaron en **«No compró»** o **«Sin interés»** aparecen **arriba** (tarjeta naranja).
- El resto en orden cronológico (ámbar).

### 5.4 Bandeja En seguimiento

Leads con entrevista **reagendada**. Ordenados por la **fecha de reagenda** más próxima primero.

Incluye reagendas del promotor tras ofrecer **Plan Inversión Joven** (seguimiento PIJ).

### 5.5 Bandeja Cierres

Ventas registradas. Las **más recientes arriba**.

Si el cierre lo cargó el **supervisor** (terreno o flujo de confirmación telefónica), la tarjeta queda en **solo lectura** para el promotor: podés ver los datos pero no modificarlos.

### 5.6 Formulario de seguimiento — flujo PROMOTOR

Abrí el lead tocando la tarjeta. El formulario es un panel deslizable desde abajo.

#### Paso 1 — Visita en calle

**¿Hubo entrevista?** Sí / No

#### Si NO hubo entrevista

- **No muestra interés** → va a Contactado.
- **Quiere reagendar** → indicá fecha y hora → va a **En seguimiento**.

#### Si SÍ hubo entrevista — Resultado

| Opción | Qué pasa |
|--------|----------|
| **No compró** | Podés ofrecer reagendar para PIJ → si aceptás, nueva fecha → **En seguimiento** |
| **Compró** | Solo podés cerrar **Plan Inversión Joven** (entrega $33.000 + número de recibo) → **Cierres** |
| **Derivar terreno** | Indicá si el cliente propuso fecha → el lead queda para el **supervisor** en Prioridad |

#### Referidos (si hubo cierre o resultado con venta)

- **¿Brindó referidos?** Sí / No
- Si sí: nombre y teléfono de cada referido. Al guardar, se crean leads nuevos automáticamente (si el teléfono no existe en la campaña).

#### Observaciones

Campo de texto libre para notas de la visita.

#### Guardar

Tocá **Guardar seguimiento** al pie del formulario. Si reagendaste, la app puede llevarte a la pestaña **En seguimiento**.

### 5.7 Cargar lead manual (promotor)

1. Tocá **Cargar lead**.
2. Completá **nombre** y **teléfono** (obligatorios).
3. **Domicilio** (opcional).
4. **¿Agendar entrevista ahora?**
   - **No** → el lead queda en Prioridad (encuesta sin contactar) o Contactado según corresponda.
   - **Sí** → fecha/hora, lugar (sucursal o domicilio), dirección → va a **Prioridad** con entrevista pendiente.
5. Guardá.

El sistema usa tu **código @usuario** del sorteo para asociar el lead. Si no está en sesión, lo obtiene de tus links de redes o de tus leads existentes.

**Duplicados:** no podés cargar el mismo teléfono dos veces en la misma campaña.

### 5.8 Calendario (promotor)

Pestaña **Calendario**:

- Vista mensual con entrevistas y reagendas.
- Tocá un día para ver eventos.
- En cada evento: **WhatsApp** al cliente, **Reagendar**, **Abrir seguimiento** (vuelve a Leads con el formulario abierto).
- Botones **mes anterior / siguiente** y **Hoy**.

### 5.9 Métricas (promotor)

Pestaña **Métricas**:

| Sección | Contenido |
|---------|-----------|
| Resumen | Mismos 4 números que en Leads |
| Gráfico origen | De dónde vienen tus leads (QR, Manual, Facebook, Instagram, WhatsApp, TikTok) |
| Historial reciente | Últimos movimientos de tus leads |
| Links redes | Misma sección que en Leads |

---

## 6. Guía del SUPERVISOR

### 6.1 Diferencias principales respecto al promotor

| Aspecto | Supervisor |
|---------|------------|
| Alcance | Ve leads de **todo su equipo** (todos los promotores) |
| Pestaña extra | **Promotores** — métricas del equipo |
| Prioridad | Ve además el grupo **«Interés terreno — derivado por promotor»** arriba de todo |
| Formulario seguimiento | Empieza con **«¿Confirmó entrevista?»** (contacto telefónico) |
| Productos en cierre | Puede cerrar **Plan Inversión Joven** y **Terreno** |
| Resumen/alertas rojas | **No** aparecen (son del promotor) |
| Solo lectura | No puede editar leads en **seguimiento PIJ del promotor** (reagenda tras no comprar PIJ) |

En las tarjetas de leads del supervisor se muestra el **nombre del promotor** asignado.

### 6.2 Bandeja Prioridad — orden (supervisor)

| Grupo | Qué son |
|-------|---------|
| **1. Interés terreno — derivado por promotor** | El promotor derivó un cliente interesado en terreno |
| **2. Entrevista pendiente** | Citas agendadas |
| **3. Encuesta sin contactar** | Sin contacto aún |

Dentro de cada grupo: **más antiguos primero**.

### 6.3 Cargar lead manual (supervisor)

Igual que el promotor, con estas diferencias:

- El lead se asocia al **supervisor** como operador de carga.
- Si agendás entrevista en **sucursal**, se muestra la dirección de oficinas del listado del SP.

### 6.4 Formulario de seguimiento — flujo SUPERVISOR

#### Paso 1 — ¿Confirmó entrevista?

| Respuesta | Siguiente paso |
|-----------|----------------|
| **Sí** | Canal (Llamada / Mensaje) → si hay cita previa se muestra → **¿Hubo entrevista?** |
| **No** | ¿Quiere reagendar o no estaba interesado? → si reagenda: fecha + canal |

#### Si confirmó pero no tenía cita previa

Al elegir canal sin entrevista agendada, cargás **nueva fecha** → el lead va a **En seguimiento** y al calendario.

#### ¿Hubo entrevista?

| Resultado | Acción |
|-----------|--------|
| **No compró** | Va a Contactado |
| **Compró** | Elegí producto: **PIJ** o **Terreno**; barrio (terreno); estado de pago; recibo/contrato si aplica → **Cierres** |
| **Reagendar** | Nueva fecha → **En seguimiento** |
| **Sin interés** | Va a Contactado |

#### Referidos y observaciones

Igual que promotor: al cerrar con referidos, se generan leads nuevos.

### 6.5 Bandejas Contactado, En seguimiento y Cierres

Mismas reglas que el promotor (§5.4–5.6), con visibilidad de todo el equipo.

En **Cierres**, los cierres cargados por el supervisor en terreno aparecen para consulta del promotor en solo lectura.

### 6.6 Calendario (supervisor)

Igual funcionalidad que el promotor (§5.9), pero muestra entrevistas de **todos los promotores** del equipo. En el detalle del evento podés ver a qué promotor pertenece el lead.

### 6.7 Pestaña Promotores — métricas del equipo

| Sección | Para qué sirve |
|---------|----------------|
| **Efectividad de entrevistas** | Por promotor: entrevistas realizadas, compras, no compras, sin interés, tasa de cierre |
| **Tabla conversión** | Total leads vs. compras por promotor |
| **Gráfico barras** | Comparación visual entre promotores |
| **Origen de leads** | Canales de captación del equipo |
| **Historial** | Actividad reciente por promotor |

Usá esta pestaña para seguimiento semanal del equipo y detectar promotores con baja conversión o muchas encuestas sin contactar.

---

## 7. Comparativa rápida: promotor vs supervisor

| Tarea | Promotor | Supervisor |
|-------|:--------:|:----------:|
| Ver solo sus leads | ✓ | — |
| Ver leads del equipo | — | ✓ |
| Cargar lead manual | ✓ | ✓ |
| Agendar entrevista al cargar | ✓ | ✓ |
| Confirmar entrevista telefónica | — | ✓ |
| Cerrar Plan Inversión Joven | ✓ | ✓ |
| Cerrar Terreno | — | ✓ |
| Derivar interés terreno | ✓ | — |
| Gestionar derivación terreno | — | ✓ |
| Reagendar seguimiento PIJ (post no compró) | ✓ | Solo lectura |
| Registrar referidos en cierre | ✓ | ✓ |
| Modificar teléfono (carga manual) | ✓ | ✓ |
| Calendario | ✓ | ✓ |
| Métricas propias | ✓ | — |
| Métricas del equipo | — | ✓ |
| Links redes | ✓ | ✓ |
| Notificaciones Instagram | ✓ | ✓ |

---

## 8. Consejos de operación diaria

### Promotor — rutina sugerida

1. Revisá **alertas rojas** (+2 días sin contactar).
2. Bandeja **Prioridad**: entrevistas del día → encuestas nuevas.
3. Abrí cada lead y completá el **formulario de seguimiento** (contacto, visita en calle o cierre PIJ).
4. Revisá **En seguimiento** para reagendas de la semana.
5. Compartí links de redes cuando captures leads en feria o visita.
6. Consultá **Métricas** al cierre de la semana.

### Supervisor — rutina sugerida

1. **Prioridad**: atendé primero **derivados a terreno**, luego entrevistas del equipo.
2. Confirmá entrevistas telefónicas y cerrá **terrenos** cuando corresponda.
3. Usá **Calendario** para la agenda del día de todos los promotores.
4. Revisá **Promotores** para efectividad y leads sin contactar.
5. Cargá leads manualmente si el promotor no pudo hacerlo en el momento.

---

## 9. Mensajes de error frecuentes

| Mensaje / situación | Qué hacer |
|---------------------|-----------|
| Usuario o clave incorrectos | Verificá credenciales con administración |
| Teléfono ya registrado en la campaña | Buscá el lead existente; no dupliques |
| No se pudo identificar código promotor | Volvé a iniciar sesión; si persiste, contactá soporte (planilla SQL links) |
| Cierre solo lectura | El supervisor registró ese cierre; consultá con él si hay que corregir |
| No hay barrios cargados | Avisá a soporte — falta catálogo en servidor |
| Error al cargar datos | Revisá conexión; si es masivo, puede ser permiso SQL (MPCSP) |

---

## 10. Modo demo (capacitación)

Para practicar sin datos reales:

```bash
npm run demo
```

Abrí la URL local que indica Vite. En la pantalla de login elegí **Demo Promotor**, **Demo Supervisor** o **Demo Superadmin** (este último no se cubre en este instructivo).

---

## Documentación relacionada

| Tema | Archivo |
|------|---------|
| Bandejas Contactado / Cierres | [FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md](./FUNCIONALIDAD_BANDEJAS_CONTACTADO_CIERRES.md) |
| Prioridad y alertas | [PRIORIDAD_LEADS.md](./PRIORIDAD_LEADS.md) |
| Referidos | [FUNCIONALIDAD_REFERIDOS_ENCUESTA.md](./FUNCIONALIDAD_REFERIDOS_ENCUESTA.md) |
| Links y redes | [FUNCIONALIDAD_ACORTADOR_LINKS.md](./FUNCIONALIDAD_ACORTADOR_LINKS.md) |
| Login y roles | [LOGIN_SP.md](./LOGIN_SP.md) |
| Visión técnica del sistema | [DOCUMENTACION_SISTEMA.md](./DOCUMENTACION_SISTEMA.md) |

---

*Instructivo basado en la versión actual de la aplicación (junio 2026). Ante diferencias con pantalla, prevalece el comportamiento del código en producción.*
