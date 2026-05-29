# Estructuras de tablas — SPs del CRM Seguimiento de Leads

Documento para **Leonel / DBA**: tablas que impactan los procedimientos almacenados que usa la app, según código, documentación y columnas observadas en **STRSYSTEM** (mayo 2026).

> **Importante:** En este repositorio **no** están los scripts `CREATE TABLE` de STRSYSTEM/mensajeria. Las estructuras de `dbo.encuesta`, `operador`, etc. deben confirmarse en SQL Server con `sp_helptext` / `sys.tables` (ver sección 5).

---

## 1. Procedimientos almacenados que usa la app

| SP | Base donde se ejecuta | Parámetros | Uso en la app |
|----|------------------------|------------|----------------|
| `[dbo].[operadorAccesoCategoria]` | `DB_NAME` → **STRSYSTEM** | `@LoginID`, `@PasID` | Login, sesión, rol |
| `[dbo].[encuestasMuestraOperador]` | `ENCUESTAS_DB_NAME` o `DB_NAME` (hoy **STRSYSTEM**) | `@idVendedor` (= `idOperador` del login) | Listado de leads / encuestas |
| `[dbo].[SP_RegistrarSeguimientoLead]` | (planeado, `.env.example`) | — | **Aún no integrado** en producción |

**Permisos SQL** (usuario app, ej. `MPCSP`):

- `EXEC` en los dos SP anteriores.
- El SP de encuestas **accede en lectura a la base `mensajeria`** (error 916 si el login no tiene usuario en esa base), aunque la conexión sea STRSYSTEM.

---

## 2. `[dbo].[operadorAccesoCategoria]`

### Ejecución

```sql
EXEC [dbo].[operadorAccesoCategoria]
  @LoginID = N'email@ejemplo.com',
  @PasID   = N'clave';
```

### Result set conocido (columnas que devuelve el SP)

| Columna | Tipo observado | Descripción |
|---------|----------------|-------------|
| `idOperador` | int | ID del operador logueado |
| `operadorCodigo` | string | Email / login |
| `operadorDescripcion` | string | Nombre para pantalla |
| `operadorFUM` | datetime | Fecha (no usada en app hoy) |
| `Categoria` | string | Ej. `PROMOTOR PLAN JOVEN` — respaldo de rol |
| `idSupervisor` | int (opcional) | Si el SP la expone |
| `idVendedor` | int (opcional) | Si el SP la expone |

### Tablas que **probablemente** toca (inferido, validar con DBA)

- Tabla(s) de **operadores / usuarios** del sistema STR (credenciales, categoría, ids).
- Nombres habituales en este tipo de sistemas: `operador`, `Operador`, `usuario`, etc. — **no están documentados en el repo**.

La app **no escribe** en tablas de login; solo `EXEC` del SP.

---

## 3. `[dbo].[encuestasMuestraOperador]`

### Ejecución

```sql
EXEC [dbo].[encuestasMuestraOperador] @idVendedor = 132;
-- En la app: @idVendedor = idOperador devuelto en el login
```

### Result set conocido (columnas reales observadas en producción)

| Columna del SP | Origen lógico en encuesta | Uso en CRM |
|----------------|---------------------------|------------|
| `id` | PK numérico encuesta (ej. `176`) | **`lead.id` en el CRM** |
| `telefono` | `encuesta.telefono` | WhatsApp, contacto |
| `encuesta` | código campaña (ej. `sorteo01`) | Agrupación |
| `fechaAlta` | alta del registro | Orden / fechas |
| `usuario` | código promotor / `?codigo=` landing (ej. `SORTEO01S21P01`) | `@usuario` en carga; **no** es PK del contacto |
| `Promotor` | nombre promotor | UI + combo supervisor |
| `supervisor` | nombre supervisor | UI |
| `idVendedor` | int | Rol + filtro SP |
| `idSupervisor` | int | Rol |
| `Apellido y nombres` | `campo1Valor` (típico) | Nombre lead |
| `Domicilio` | `campo2Valor` (típico) | Barrio/domicilio texto |
| `Conoce MPC` | campo encuesta | Observaciones |
| `Sabias que con 55.000 pesos...` | campo encuesta | Pregunta sorteo |
| `Queres asesoramiento ?` | `campo5Valor` (típico) | ¿Quiere entrevista? (S/N) |
| `Horario de entrevista` | `campo6Valor` (típico) | Fecha/hora cita |
| `Contacto en  (2 = En sucursal , 3 = Domicilio encuestado)` | `campo7Valor` (típico) | `2` = oficinas, `3` = domicilio |
| `Domicilio de encuesta ` | `campo8Valor` (típico) | Dirección si a domicilio |
| `origen` | canal de captación | **Métricas de origen** en CRM → `seguimiento.fuente`: `qr`, `app` (Manual/App), `facebook`, `instagram` |

Valores observados en `origen` (mayo 2026): `QR`, `Facebook`, `Instagram`, `Manual` / `App` (mapeados en `server/db/encuestas.js` → `parseFuente`).

### Tabla principal: `dbo.encuesta` (estructura de referencia)

Según vista de ejemplo en `sql/migrations/001_lead_seguimiento_crm.sql` y landing sorteo:

```sql
-- Estructura INFERIDA — confirmar tipos y nullability con el DBA
CREATE TABLE dbo.encuesta (
  id            INT           NOT NULL,  -- PK (identity o no: validar)
  telefono      NVARCHAR(32)  NULL,     -- WhatsApp del cliente
  encuesta      NVARCHAR(64)  NULL,     -- ej. sorteo01
  fechaAlta     DATETIME2     NULL,
  usuario       NVARCHAR(120) NULL,     -- clave única negocio SORTEO01S21P01
  campo1Valor   NVARCHAR(MAX) NULL,     -- Apellido y nombres
  campo2Valor   NVARCHAR(MAX) NULL,     -- Domicilio / barrio
  campo3Valor   NVARCHAR(MAX) NULL,     -- (otras preguntas)
  campo4Valor   NVARCHAR(MAX) NULL,
  campo5Valor   NVARCHAR(MAX) NULL,     -- Querés asesoramiento S/N
  campo6Valor   NVARCHAR(MAX) NULL,     -- Horario entrevista (ej. 2026/05/28 10:00)
  campo7Valor   NVARCHAR(MAX) NULL,     -- Modalidad: 2 sucursal, 3 domicilio
  campo8Valor   NVARCHAR(MAX) NULL,     -- Domicilio de entrevista
  -- Posibles FKs / columnas adicionales no visibles en el result set:
  -- idVendedor, idSupervisor, idPromotor, estado, etc.
);
```

El SP seguramente hace **JOIN** con tablas de operadores/vendedores para armar `Promotor`, `supervisor`, `idVendedor`, `idSupervisor`.

### Base `mensajeria`

- Lectura cross-database desde el SP (permisos en `mensajeria` obligatorios para el login SQL de la API).
- Puede existir copia o vista de `encuesta` en STRSYSTEM y datos vivos en `mensajeria` — **definición exacta solo en el T-SQL del SP**.

---

## 4. Tablas del CRM (propuestas en el repo, aún no reemplazan el SP)

Archivo: `sql/migrations/001_lead_seguimiento_crm.sql`

### `dbo.lead_seguimiento_crm`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INT IDENTITY PK | |
| `lead_key` | NVARCHAR(120) UNIQUE | ej. `usuario` de encuesta |
| `telefono` | NVARCHAR(32) | |
| `encuesta` | NVARCHAR(64) | |
| `estado` | NVARCHAR(32) | nuevo, en_gestion, contactado, compro, etc. |
| `asignado_a` | NVARCHAR(120) | |
| `id_operador` | INT | |
| `seguimiento_json` | NVARCHAR(MAX) | JSON del modal (canal, entrevista, venta) |
| `creado_en` | DATETIME2 | |
| `actualizado_en` | DATETIME2 | |
| `actualizado_por` | NVARCHAR(120) | |

### `dbo.lead_nota_crm`

| Columna | Tipo | Notas |
|---------|------|--------|
| `id` | INT IDENTITY PK | |
| `lead_key` | NVARCHAR(120) FK → `lead_seguimiento_crm` | |
| `texto` | NVARCHAR(MAX) | |
| `autor_id` | NVARCHAR(64) | |
| `autor_nombre` | NVARCHAR(200) | |
| `creado_en` | DATETIME2 | |

**Hoy la app guarda seguimiento en SQLite local** (`data/app-cache.db`, tabla `lead_seguimiento_externo`), no en estas tablas SQL, hasta integrar `SP_RegistrarSeguimientoLead`.

---

## 5. Consultas para Leonel (obtener DDL y dependencias reales)

```sql
-- Definición de los SP
EXEC sp_helptext 'dbo.operadorAccesoCategoria';
EXEC sp_helptext 'dbo.encuestasMuestraOperador';

-- Tablas que referencia cada SP (SQL Server 2017+)
SELECT
  OBJECT_SCHEMA_NAME(d.referenced_id) AS esquema,
  OBJECT_NAME(d.referenced_id) AS tabla_o_vista
FROM sys.sql_expression_dependencies AS d
WHERE d.referencing_id = OBJECT_ID('dbo.encuestasMuestraOperador')
  AND d.referenced_id IS NOT NULL
ORDER BY 1, 2;

-- Mismo para login
SELECT
  OBJECT_SCHEMA_NAME(d.referenced_id) AS esquema,
  OBJECT_NAME(d.referenced_id) AS tabla_o_vista
FROM sys.sql_expression_dependencies AS d
WHERE d.referencing_id = OBJECT_ID('dbo.operadorAccesoCategoria')
  AND d.referenced_id IS NOT NULL
ORDER BY 1, 2;

-- Estructura de encuesta si existe en STRSYSTEM y en mensajeria
USE STRSYSTEM;
EXEC sp_help 'dbo.encuesta';

USE mensajeria;
EXEC sp_help 'dbo.encuesta';
```

---

## 6. Resumen para respuesta rápida a Leonel

| SP | Tablas / objetos impactados (confirmar en servidor) |
|----|-----------------------------------------------------|
| `operadorAccesoCategoria` | Tabla(s) de **operadores** + posible relación supervisor/vendedor |
| `encuestasMuestraOperador` | **`dbo.encuesta`** (+ joins operador/promotor/supervisor); lectura **mensajeria** |
| `SP_RegistrarSeguimientoLead` | (futuro) probablemente `encuesta` y/o `lead_seguimiento_crm` |

**Columnas críticas para el CRM hoy:** `telefono`, `usuario`, `campo1`–`campo8` (mapeados en el result set con alias largos), `idVendedor`, `idSupervisor`.

---

## 7. Scripts de inspección en el proyecto

```bash
npm run inspect:login -- email@ejemplo.com clave
npm run inspect:leads -- 132
```

Muestran columnas crudas del SP y el mapeo que hace Node.
