# Datos del CRM para el Sistema de Caja Unificado
Este documento recopila y detalla todos los datos que maneja el CRM de Seguimiento de Leads (Mi Primer Casa S.A.) con el objetivo de servir de especificación técnica para el diseño e integración de un **Sistema de Caja Unificado**.

La integración entre el CRM y la Caja se centra principalmente en la detección de cierres de venta (resultado: `compro` o `derivar_terreno`), la validación y parseo de recibos físicos, y la conciliación mensual con las planillas de ingresos reales facturados.

> **Requisitos nuevos (2026-07):** flujo bidireccional con caja de **sucursal** para Plan Inversión Joven (envío de datos del cliente + recepción de **stock de adhesión/anexo** por promotor/supervisor). Ver [REQUISITOS_INTEGRACION_CAJA_SUCURSAL_PIJ.md](./REQUISITOS_INTEGRACION_CAJA_SUCURSAL_PIJ.md).

---

## 1. Datos del Lead (Cliente y Carga Inicial)
Representa al cliente prospecto capturado mediante formularios de sorteo, QR de promotores o carga manual. Es la base de datos de origen sobre la cual se realizan los cierres financieros.

| Campo en CRM (API/TS) | Columna SQL (`dbo.encuesta`) | Tipo de Dato / Rango de Valores | Descripción y Utilidad para la Caja |
| :--- | :--- | :--- | :--- |
| `id` | `id` | `INT` / `string` (UUID en local) | Identificador único del lead. Clave de relación con la venta. |
| `nombre` | `campo1Valor` | `VARCHAR(200)` / `string` | **Nombre y apellido del cliente**. Cruce visual principal con el nombre del titular del recibo de pago. |
| `telefono` | `telefono` | `VARCHAR(32)` / `string` | Teléfono / WhatsApp del cliente. Sirve como identificador y contacto de cobranza. |
| `domicilio` | `campo2Valor` | `VARCHAR(200)` / `string` | Dirección o barrio declarado del cliente. |
| `fechaAlta` | `fechaAlta` | `DATETIME2` / ISO string | Fecha y hora en la que ingresó el lead al sistema. |
| `codigoCampania` | `encuesta` | `VARCHAR(64)` (ej. `'sorteo01'`) | Nombre de la campaña o sorteo a la que pertenece. |
| `origen` / `fuente` | `origen` | `VARCHAR(32)` (ej. `'qr'`, `'manual'`, `'facebook'`) | Canal por el cual ingresó el cliente. |
| `promotorId` / `idVendedor` | JOIN (vendedor) | `INT` / `string` | ID del promotor que lo capturó o tiene asignado. Clave de comisión en Caja. |
| `promotorNombre` | JOIN (vendedor) | `VARCHAR(200)` | Nombre completo del promotor / vendedor. |
| `supervisorNombre` | JOIN (supervisor) | `VARCHAR(200)` | Nombre completo del supervisor. |
| `sabiaPlanInversionJoven` | `campo4Valor` | `BOOLEAN` / `NULL` | Indica si el cliente ya tenía conocimiento del Plan Inversión Joven (S/N). |

---

## 2. Datos de Seguimiento y Venta (Cierres Financieros)
Cuando un lead es contactado y se realiza una venta, el CRM almacena un **snapshot de seguimiento** (`seguimiento_json` en la base de datos). Estos datos disparan la facturación y la creación de recibos.

| Campo en CRM (API/TS) | Tipo de Dato / Enumerado | Descripción / Ejemplo | Utilidad en la Caja |
| :--- | :--- | :--- | :--- |
| `resultadoEntrevista` | `'sin_interes'` \| `'reagenda'` \| `'no_compro'` \| **`'compro'`** \| **`'derivar_terreno'`** | Estado de la negociación. El valor **`'compro'`** indica que la venta se cerró y debe haber un ingreso en caja. |
| `fechaCierre` | `DATETIME` (ISO `YYYY-MM-DD`) | Fecha exacta en la que se declaró el cierre. | Fecha de devengo del cobro. |
| `idProducto` | `string` (ver Catálogo) | ID del producto vendido (`'prod-pij'` o `'prod-terreno'`). | Determina el concepto y tipo de ingreso. |
| `estadoPago` | `'sena'` \| `'cien'` \| `'entrega_33'` \| `'entrega_55'` | Categoría del pago inicial (seña, pago completo o anticipo del plan). | **Crítico para Caja:** Define el tipo de movimiento. |
| `idBarrio` | `string` (ver Catálogo) | ID del desarrollo / barrio para la venta de terrenos. | Ubicación del lote vendido. |
| `numeroRecibo` | `string` (ej. `'A1245'`, `'B2300 ANEXO 3'`) | Número físico de recibo ingresado por el vendedor en la app. | **Clave de conciliación** única con el sistema de cobranza. |
| `observaciones` | `string` (máx 500 caract.) | Comentarios adicionales del vendedor sobre el cierre. | Notas internas de la operación. |
| `operadorRol` | `'promotor'` \| `'supervisor'` | Rol del usuario que cargó el cierre de la venta. | Control de auditoría. |

---

## 3. Compras Adicionales (`comprasAdicionales`)
Un cliente ya registrado en el CRM puede realizar compras subsecuentes (anexos de terreno, compras de más carpetas, etc.). Cada compra adicional se almacena como un elemento en un array dentro de `seguimiento_json` y maneja su propio flujo de caja.

* **Estructura de cada Compra Adicional:**
  * `id`: `string` (UUID único del cobro).
  * `idProducto`: `string` (`'prod-pij'` o `'prod-terreno'`).
  * `estadoPago`: `'sena' | 'cien' | 'entrega_33' | 'entrega_55'`.
  * `idBarrio`: `string | null` (si corresponde a terreno).
  * `numeroRecibo`: `string` (Recibo asociado a esta transacción específica).
  * `fechaCierre`: `string` (Fecha en la que se generó la compra adicional).

---

## 4. Catálogos Maestros Utilizados

### A. Productos (`productosCatalog`)
Define los productos comercializados que se cobran en caja.
* **Plan Inversión Joven (`prod-pij`)**
  * Código de negocio: `PLAN_INVERSION_JOVEN`
  * Roles permitidos para cobro: `promotor`, `supervisor`
* **Terreno (`prod-terreno`)**
  * Código de negocio: `TERRENO`
  * Roles permitidos para cobro: `supervisor` (requiere autorización superior)

### B. Barrios / Proyectos (`barriosCatalog`)
Listado de loteos disponibles para la asignación y cobro de terrenos:
* `b1`: **Cecotto**
* `b2`: **Los Elfos**
* `b3`: **Los Bufalos**
* `b4`: **Palmares**
* `b5`: **Doña Valentina I**
* `b6`: **Doña Valentina II**
* `b7`: **Rigonatto**
* `b8`: **Jardines de San Antonio**

### C. Estados de Pago y Reglas de Negocio (`EstadoPago`)
* **`entrega_33`** (Entrega $33.000): Exclusivo para el producto **Plan Inversión Joven** (`prod-pij`).
* **`entrega_55`** (Entrega $55.000): Anticipo alternativo para el **Plan Inversión Joven** (`prod-pij`).
* **`sena`** (Seña): Pago parcial inicial para el producto **Terreno** (`prod-terreno`). Deja un saldo pendiente.
* **`cien`** (Cierre 100%): Pago total del valor de la adhesión para el producto **Terreno** (`prod-terreno`).

---

## 5. Lógica de Parseo y Estructura de Recibos
Para unificar la caja, es fundamental comprender cómo se fragmenta y valida el campo de texto `numeroRecibo` del CRM en tres partes componentes (`serie`, `adhesion`, `anexo`):

1. **Serie de Recibo:** Letra `'A'` o `'B'`.
2. **Número de Adhesión:** Bloque numérico que identifica el contrato base (ej. `1245` en `A1245`).
3. **Número de Anexo:** Identificador opcional si la transacción es un anexo / cuota subsiguiente (ej. `3` en `A1245 ANEXO 3`).

### Expresión Regular para Parseo (utilizada en el CRM):
* **Fórmula estándar:** `/^([AB])(\d+)(?:\/300)?(?:\s+ANEXO\s+(\d+)(?:\/300)?)?$/`
* **Fórmula tolerante (Fuzzy):**
  * Serie + Adhesión: `/^([AB])(\d+)/`
  * Anexo: `/ANEXO\s*(\d+)/`

### Claves de Indexación Financiera:
* **Clave de Adhesión PIJ:** `${serie}${adhesion}` (ej. `'A1245'`).
* **Clave de Anexo:** `ANEXO${anexo}` (ej. `'ANEXO3'`).
* **Clave de Recibo Terreno:** Solo los dígitos numéricos contenidos en el string del recibo.

---

## 6. Datos del Sistema Central de Facturación (`STRSYSTEM` - SQL Server)
El sistema central maneja los cobros y la facturación real mediante el SP `adhesionesPorVendedorGestion`. A continuación se detallan las columnas devueltas y su equivalencia con la caja:

| Columna en `STRSYSTEM` | Tipo de Dato | Lógica y Equivalencia en el Sistema de Caja |
| :--- | :--- | :--- |
| `idLoteVenta` | `INT` | **ID de Transacción Comercial / Factura**. Evita duplicados en caja. |
| `cliente01Nombre` | `VARCHAR` | Nombre formal del titular del contrato. |
| `Monto Adhesion` | `DECIMAL` | Valor total nominal pactado para la cuota inicial o adhesión. |
| `Total Cobrado` | `DECIMAL` | **Monto físico real que ingresó a Caja**. |
| `Saldo Adhesion` | `DECIMAL` | Monto remanente por cobrar (`Monto Adhesion - Total Cobrado`). |
| `Fecha Visita` | `DATETIME` | Fecha oficial del registro del ingreso en caja. |
| `Estado Venta` | `VARCHAR` | Si contiene `'Lote Liberado'`, la venta y sus recibos están anulados. |
| `Cant. Imagenes` | `INT` | Fotos de comprobantes físicos subidos. Si es `0`, falta documentación. |
| `Recibos Auditados` | `INT` (0 o 1) | Estado de control interno de administración (`1` = Aprobado, `0` = Pendiente). |
| `cuotasCantidadDescripcion`| `VARCHAR` | Plan de financiamiento del lote (ej. `'120 cuotas'`). |
| `loteVentaTipoDescripcion`| `VARCHAR` | Concepto del lote. |
| `Barrio` | `VARCHAR` | Nombre formal del loteo (ej. `'BUFALOS I'`). Mapea a `idBarrio` del CRM. |

### Criterio Financiero de Conciliación en el CRM:
* **Pago Completo:** `Total Cobrado >= Monto Adhesion` (Saldo = 0).
* **Seña / Pago Parcial:** `Total Cobrado < Monto Adhesion` y `Total Cobrado > 0` (Saldo > 0).
* **Impago / Pendiente:** `Total Cobrado == 0`.
* **Anulada:** `Estado Venta == 'Lote Liberado'`.

---

## 7. Estructuras de Tablas de Seguimiento e Historial (Base de Datos)

### A. Tabla CRM Snapshot (`dbo.lead_seguimiento` / `lead_seguimiento_externo` en SQLite)
Almacena el estado actual consolidado de cada lead y su cobro.
```sql
CREATE TABLE dbo.lead_seguimiento (
  lead_id           INT NOT NULL PRIMARY KEY,   -- ID de la encuesta/lead
  encuesta          NVARCHAR(64) NOT NULL,      -- Campaña asociada (sorteo01, etc.)
  seguimiento_json  NVARCHAR(MAX) NOT NULL,     -- JSON con todos los datos de la venta y compras adicionales
  actualizado_en    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  actualizado_por   INT NULL                    -- ID de operador de la app
);
```

### B. Tabla de Historial Append-Only (`dbo.lead_seguimiento_historial`)
Registra cada cambio individual en los datos de cobro del CRM, permitiendo auditoría y control de tiempos.
```sql
CREATE TABLE dbo.lead_seguimiento_historial (
  id                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  lead_id           INT NOT NULL,               -- FK a lead/encuesta
  encuesta          NVARCHAR(64) NOT NULL,
  operador_id       INT NULL,
  operador_rol      NVARCHAR(16) NULL,          -- promotor | supervisor
  operador_nombre   NVARCHAR(200) NOT NULL,
  estado_etiqueta   NVARCHAR(500) NOT NULL,     -- Resumen visible en la UI
  resultado_entrevista NVARCHAR(16) NULL,       -- compro, no_compro, sin_interes, etc.
  pestana           NVARCHAR(32) NULL,          -- prioridad | contactado | seguimiento | cierres
  seguimiento_json  NVARCHAR(MAX) NOT NULL,     -- Snapshot completo del JSON del cobro
  creado_en         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
```

---

## 8. Relación de Referidos (`dbo.lead_referido`)
Los referidos cargados en el CRM pueden generar descuentos directos o indirectos sobre las cuotas cobradas. Para la Caja, la estructura del árbol de referidos es vital para el cálculo dinámico de saldos y beneficios por cliente.

* **Campos clave para descuentos en cuotas:**
  * `id_encuesta_referido`: ID único del cliente referido.
  * `id_encuesta_origen`: ID del cliente que brindó el referido y recibe el beneficio.
  * `id_encuesta_raiz`: Primer cliente de la cadena (el iniciador del árbol de descuentos).
  * `nivel`: Profundidad en el árbol de referidos (`1` = directo, `2` = indirecto / nieto, etc.).
  * `visible_promotor` y `visible_supervisor`: Flags de control para evitar duplicaciones o doble cobro de comisiones.

---

## 9. Recomendaciones para el Sistema de Caja Unificado
1. **Normalización de Recibos:** El sistema de Caja debe estructurar las columnas de recibo de forma desglosada (`serie`, `adhesion` y `anexo`) y no en un solo campo de texto para facilitar el cruce automático con el CRM.
2. **Eventos en Tiempo Real:** Configurar triggers o endpoints REST que notifiquen a la Caja cuando `resultadoEntrevista` cambie a `'compro'`, pre-cargando la operación en el sistema de cobros y esperando la validación física del recibo.
3. **Mapeo de Vendedores:** El CRM usa nombres informales y códigos de campañas (ej. `'SORTEO01S21P01'`). La Caja requiere los IDs de vendedor reales del sistema `STRSYSTEM` para liquidar comisiones. Se recomienda utilizar el mapeo estático de `server/domain/operador-canonical.js` para asegurar la equivalencia.
