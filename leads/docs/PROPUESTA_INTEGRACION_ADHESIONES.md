# Propuesta de Integración: Stored Procedure `adhesionesPorVendedorGestion`

Este documento detalla la propuesta técnica y de diseño para integrar los datos de facturación real del sistema central (`STRSYSTEM`) con el CRM de Seguimiento de Leads, utilizando el Stored Procedure `adhesionesPorVendedorGestion`.

---

## 🔍 Análisis del Stored Procedure y Datos Devueltos

El Stored Procedure se ejecuta pasando el identificador único del vendedor (`@idVendedor`):
```sql
EXEC adhesionesPorVendedorGestion @idVendedor = 23
```

Al inspeccionar su comportamiento con el `@idVendedor = 23` (Norma Morzan), se recupera un listado histórico de **177 adhesiones** con las siguientes columnas y datos típicos:

| Columna | Tipo de Dato / Formato | Ejemplo de Valor | Descripción y Utilidad en el CRM |
| :--- | :--- | :--- | :--- |
| **`idLoteVenta`** | `Int` | `13747` | Identificador único de la adhesión en el sistema de ventas/facturación. Evita duplicados. |
| **`cliente01Nombre`** | `String` | `'VEGA CLAUDIO RAMÓN'` | Nombre del cliente en el contrato. Útil para cruzar visualmente con el lead en el CRM. |
| **`Monto Adhesion`** | `Decimal` | `350000` | Monto total pactado para la adhesión inicial. |
| **`Total Cobrado`** | `Decimal` | `350000` o `2500000` | Monto real que el cliente pagó y ya fue ingresado a caja. |
| **`Saldo Adhesion`** | `Decimal` | `0` o `2500000` | Saldo pendiente por cobrar en la adhesión. |
| **`Fecha Visita`** | `DateTime` | `2026-06-08` | Fecha oficial en la que se generó la venta/adhesión. |
| **`Estado Venta`** | `String` | `''` (Vacío) o `'Lote Liberado'` | Si es `'Lote Liberado'`, indica que el lote fue devuelto o cancelado administrativamente. |
| **`Cant. Imagenes`** | `Int` | `1` o `0` | Cantidad de fotos de comprobantes/recibos cargados por el promotor. |
| **`Recibos Auditados`** | `Int` (Flag) | `1` o `0` | Flag de aprobación de administración (`1` = Aprobado, `0` = Pendiente de auditar). |
| **`cuotasCantidadDescripcion`**| `String` | `'200 cuotas'` / `'120 cuotas'` | Plan de financiación contratado. |
| **`loteVentaTipoDescripcion`**| `String` | `'FINANCIACION POR...'` | Tipo de producto financiero vendido. |
| **`Barrio`** | `String` | `'BUFALOS I'` | Nombre del desarrollo/barrio donde se vendió el lote. |
| **`Manzana`** / **`Parcela`** | `String` | `'42'` / `'05'` | Nomenclatura física del lote vendido. |
| **`Medida`** / **`Sup`** | `String` / `Decimal`| `'10 x 30'` / `'300.00'` | Dimensiones físicas y superficie del terreno. |

---

## 💵 Criterio Lógico: ¿Seña o Pago Completo?

Para determinar el estado financiero y administrativo de cada adhesión sin modificar el stored procedure, se puede aplicar la siguiente lógica en el backend/frontend:

* 🟢 **Pago Completo:** `Total Cobrado >= Monto Adhesion` (el `Saldo Adhesion` es `0` o menor, y la venta no está cancelada).
* 🟡 **Seña / Pago Parcial:** `Total Cobrado < Monto Adhesion` y `Total Cobrado > 0` (el cliente entregó una seña inicial, pero posee un `Saldo Adhesion` pendiente).
* 🔴 **Impago / Pendiente:** `Total Cobrado == 0` (no se registró ingreso en caja aún).
* ❌ **Anulada / Liberada:** `Estado Venta == 'Lote Liberado'` (sin importar los montos, el lote fue devuelto).

---

## 🛠️ Propuestas de Integración a Futuro

### 📋 Opción 1: Panel de "Mis Adhesiones Reales" (Para Promotores y Supervisores)
**Objetivo:** Permitir a los vendedores consultar el estado de sus ventas reales facturadas sin tener que llamar o preguntar a administración.

* **Cómo funcionaría:**
  * Se agrega una nueva pestaña **"Mis Adhesiones"** en el panel lateral del Promotor (y una vista consolidada en el del Supervisor).
  * Al ingresar, el backend ejecuta `EXEC adhesionesPorVendedorGestion @idVendedor = {idVendedor}` usando el id de vendedor del usuario logueado.
  * Muestra una tabla interactiva y elegante con filtros por estado:
    * **Filtros:** *Todas, Pagos Completos, Señas, Pendientes de Auditoría, Anuladas*.
    * **Semáforos Visuales:**
      * 🟢 **Pago Completo** (saldo en 0).
      * 🟡 **Señado** (muestra la seña cobrada y el saldo restante).
      * ⚠️ **Falta Documentación** (si `Cant. Imagenes = 0` o `Recibos Auditados = 0` para alertar al promotor que debe subir el comprobante físico).
      * 🔴 **Lote Liberado** (ventas caídas).

---

### 📊 Opción 2: Conciliación Financiera en el Dashboard Global (Para Superadmin)
**Objetivo:** Medir la efectividad de ventas no solo en cantidad de leads/cierres del CRM, sino en dinero real ingresado en caja.

* **Cómo funcionaría:**
  * En la sección de estadísticas globales de productividad (donde hoy se ve el embudo y el gráfico de barras de entrevistas):
    * Se añade una sección de **"Productividad Financiera por Equipo/Vendedor"**.
    * Se totalizan los montos acumulados por vendedor:
      * **Monto Nominal Vendido:** Sumatoria de `Monto Adhesion`.
      * **Recaudación Real (Caja):** Sumatoria de `Total Cobrado`.
      * **Saldo Pendiente (Señas en curso):** Sumatoria de `Saldo Adhesion`.
    * **Tasa de Conversión a Caja:** Muestra qué porcentaje del valor nominal de las ventas declaradas por los vendedores se ha convertido realmente en dinero cobrado (`Total Cobrado / Monto Adhesion * 100`).

---

### 🔔 Opción 3: Sistema de Alertas Proactivas para el Vendedor
**Objetivo:** Agilizar el proceso administrativo de cobros reduciendo demoras en las carpetas de clientes.

* **Cómo funcionaría:**
  * Al iniciar sesión en el CRM, el sistema revisa en segundo plano las adhesiones del vendedor.
  * Si detecta registros recientes que tengan `Cant. Imagenes == 0` (no se subió foto de recibo) o `Recibos Auditados == 0` (administración no aprobó el pago por algún motivo):
    * Muestra un banner amarillo de alerta:
      > ⚠️ **Atención:** Tenés **3 adhesiones** con documentación pendiente (ej. Cliente *Vega Claudio Ramón*, lote *Búfalos I - Mz 42 Pc 05*). Subí los comprobantes en administración para procesar su auditoría.

---

## 💻 Plan Técnico de Implementación sugerido

Si se decide llevar adelante cualquiera de estas opciones en el futuro, los cambios requeridos serían:

### 1. Backend (`server/`)
* **Base de Datos (`server/db/adhesiones.js`):**
  * Crear un módulo para ejecutar el SP:
    ```javascript
    import sql from 'mssql';
    import { getSqlPoolEncuestas } from './mssql.js';

    export async function getAdhesionesPorVendedor(idVendedor) {
      const pool = await getSqlPoolEncuestas();
      const result = await pool.request()
        .input('idVendedor', sql.Int, idVendedor)
        .execute('adhesionesPorVendedorGestion');
      return result.recordset;
    }
    ```
* **Ruta de API (`server/create-app.js`):**
  * Agregar un endpoint `/api/adhesiones/vendedor` (que tome el `idVendedor` de la sesión del usuario o permita filtrar por `idVendedor` si el rol es superadmin/supervisor).

### 2. Frontend (`src/`)
* **Cliente API (`src/api/client.ts`):**
  * Añadir el método `fetchAdhesionesVendedor(idVendedor?: number)` para interactuar con el backend.
* **Componente React:**
  * Crear un componente reutilizable `AdhesionesTable.tsx` que renderice la lista de forma premium, usando Tailwind CSS para los badges de colores (verde para saldado, amarillo para señas, gris para cancelados).
