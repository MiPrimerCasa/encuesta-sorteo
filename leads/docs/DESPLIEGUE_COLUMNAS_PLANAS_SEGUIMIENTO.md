# Despliegue — columnas planas de seguimiento (STRSYSTEM)

Guía para DBA y desarrollo: ampliar `dbo.registrarSeguimientoLead`, migrar historial existente y desplegar la app Node.

---

## ¿Se registra en el historial?

**Sí.** En este sistema el historial **es** la tabla `dbo.registrarSeguimientoLead`:

- Cada vez que un promotor o supervisor **guarda** un seguimiento, la app ejecuta `SP_RegistrarSeguimientoLead` e **inserta una fila nueva** (append-only).
- Esa fila es una entrada del historial (fecha, operador, estado, snapshot).
- El **estado actual** del lead es la **última fila** por `lead_id`.
- El modal de historial (`GET /api/leads/:id/historial`) lee esas filas.

**Después de desplegar todo**, cada guardado nuevo incluye automáticamente:

| Capa | Qué guarda |
|------|------------|
| **Columnas planas** | `forma_pago`, montos, `fecha_cierre`, `fuente`, `serie_pij`, `nro_adhesion`, `nro_anexo`, etc. |
| **Tablas hijas** | `registrarSeguimientoLead_compra` (ventas extra), `registrarSeguimientoLead_imagen` (fotos PIJ) |
| **`seguimiento_json`** | Objeto completo (respaldo / fuente de verdad de la app) |

**El historial viejo** (filas ya cargadas) no se re-escribe: se **completa** con el SP de migración, rellenando columnas planas vacías desde el JSON que ya tienen.

---

## Resumen por rol

| Rol | Tarea |
|-----|--------|
| **DBA** | Ejecutar scripts SQL en orden, migrar historial, verificar |
| **Desarrollo** | Desplegar app Node (ya envía columnas planas al SP) |
| **Operaciones** | Probar un cierre PIJ y revisar en SSMS |

**Base de datos:** `STRSYSTEM`  
**Herramienta DBA:** SSMS o Azure Data Studio (no MySQL Workbench)

---

## FASE 1 — Scripts SQL (DBA)

Usuario con permisos `CREATE` / `ALTER` (no MPCSP).

### Orden obligatorio

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | **`sql/registrarSeguimientoLead-tablas-hijas.sql`** | Crea `registrarSeguimientoLead_compra` e `registrarSeguimientoLead_imagen`, SPs auxiliares. |
| 2 | **`sql/aplicar-dni-cliente.sql`** *(si solo falta DNI)* **o** **`sql/registrarSeguimientoLead-columnas-planas-completas.sql`** | Agrega `dni_cliente` + actualiza `SP_RegistrarSeguimientoLead`. Preferir el unificado completo. |
| 3 | `sql/SP_ExportarCierresParaBloqueo.sql` | Crea `fn_ParseReciboPij` (necesario para migración y export). |
| 4 | `sql/MigrarSeguimientoJsonAColumnasPlanas.sql` | Migra historial viejo JSON → columnas planas **y tablas hijas**. |
| 5 | **`sql/spConsultarSeguimiento.sql`** | Diagnóstico: columnas OK/FALTA, DNI, compras, **imágenes** (result sets 1–8). |

Scripts anteriores (referencia; incluidos en el script unificado):

- `sql/SP_RegistrarSeguimientoLead-medio-pago.sql` — ya aplicado en producción
- `sql/SP_RegistrarSeguimientoLead-adhesion-anexo.sql` — equivalente al unificado

### Columnas planas — referencia

**Venta principal (cada fila de historial):**

- Contacto: `canal`, `hubo_entrevista`, `resultado_entrevista`, `confirmo_entrevista`, etc.
- Venta: `id_producto`, `estado_pago`, `id_barrio`
- Recibo: `numero_recibo` (texto completo, ej. `B135/300 ANEXO 75/300`)
- PIJ desglosado: `serie_pij`, `nro_adhesion`, `nro_anexo`
- Medio de pago: `forma_pago`, `monto_cierre`, `monto_efectivo`, `monto_transferencia`
- Cliente PIJ: `dni_cliente`
- Otros: `fecha_cierre`, `fuente`, `referidos_json`, `observaciones`, `operador_id`, `operador_rol`, `operador_nombre`

**Compras adicionales** — tabla `dbo.registrarSeguimientoLead_compra` (una fila por venta extra):

| Columna | Descripción |
|---------|-------------|
| `id_seguimiento` | FK a la fila de historial donde se guardó |
| `id_compra` | UUID de la app |
| `serie_pij`, `nro_adhesion`, `nro_anexo` | Desglose PIJ |
| `forma_pago`, montos, `fecha_cierre` | Medio de pago de esa venta |

**Imágenes PIJ** — tabla `dbo.registrarSeguimientoLead_imagen` (una fila por foto):

| Columna | Descripción |
|---------|-------------|
| `venta_key` | `principal` o UUID de compra adicional |
| `tipo_imagen` | `img1`…`img7` |
| `storage_path` | Ruta en disco (app Node) |
| `contenido` | `VARBINARY(MAX)` — bytes cuando el DBA los cargue vía `SP_RegistrarImagenCierrePij` |

Las columnas `compras_adicionales_json` e `imagenes_cierre_json` en la fila principal quedan como **legacy** (la app aún las envía; el SP desglosa en tablas hijas).

**Siempre presente:**

- `seguimiento_json` — snapshot completo (no se elimina)

### Formato PIJ

La app une serie + adhesión + anexo en `numero_recibo`:

```
B135/300 ANEXO 75/300
```

| Parte | Columna plana |
|-------|----------------|
| Serie `B` | `serie_pij` |
| Adhesión `135` | `nro_adhesion` |
| Anexo `75` | `nro_anexo` |

Para terrenos, `numero_recibo` guarda el recibo del terreno; `serie_pij` / `nro_adhesion` / `nro_anexo` quedan NULL.

### Ejemplo `compras_adicionales_json`

```json
[
  {
    "id": "uuid-compra-1",
    "idProducto": "prod-pij",
    "estadoPago": "entrega_33",
    "serie": "B",
    "nroAdhesion": "200",
    "nroAnexo": "45",
    "numeroRecibo": "B200/300 ANEXO 45/300",
    "fechaCierre": "2026-07-01T15:30:00",
    "formaPago": "efectivo",
    "montoCierre": 33000
  }
]
```

---

## FASE 2 — Migración del historial existente (DBA)

Solo para filas **ya cargadas** antes de los scripts. Los registros nuevos no necesitan este paso.

### Antes de migrar

1. **Backup** de `dbo.registrarSeguimientoLead`.
2. Confirmar que existen las columnas nuevas (ver estructura de tabla o `COL_LENGTH`).

### Pasos

```sql
-- 1) Vista previa (NO modifica nada)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'preview';

-- 2) Probar con UN lead
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'preview',
    @lead_id = 12345;  -- reemplazar por ID real

-- 3) Aplicar migración segura (solo completa columnas vacías)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'aplicar',
    @solo_vacios = 1,
    @priorizar_json = 0;

-- 4) Verificar pendientes
EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'verificar';

-- 5) Segunda pasada (solo si hace falta; el JSON es la fuente de verdad)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'aplicar',
    @solo_vacios = 0,
    @priorizar_json = 1;

-- 6) Si hay muchas filas, por lotes
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'aplicar',
    @solo_vacios = 1,
    @lote_max = 5000;
-- Repetir hasta que verificar devuelva 0 pendientes
```

### Qué hace la migración

- Recorre **todas** las filas de historial con `seguimiento_json` válido.
- Copia valores del JSON → columnas planas vacías.
- Parsea `numero_recibo` → `serie_pij`, `nro_adhesion`, `nro_anexo` (vía `fn_ParseReciboPij`).
- Arma `compras_adicionales_json` desde `$.comprasAdicionales`.
- **No borra** `seguimiento_json`.
- **No crea** filas nuevas; solo actualiza las existentes.

---

## FASE 3 — Despliegue de la aplicación (desarrollo)

**Después** de que el DBA ejecute al menos los scripts 1 y 2.

La app Node (`server/db/seguimiento-sql.js`) ya:

- Parsea adhesión/anexo al guardar.
- Envía `@serie_pij`, `@nro_adhesion`, `@nro_anexo`, `@compras_adicionales_json`.
- Envía medio de pago, montos, `fecha_cierre`, `fuente`.
- Sigue guardando `seguimiento_json` completo.

### Variables `.env` (producción)

```env
SP_SEGUIMIENTO=SP_RegistrarSeguimientoLead
SEGUIMIENTO_TABLE=registrarSeguimientoLead
```

### Build y deploy

```bash
npm run build
# Reiniciar servicio Node en el servidor
```

---

## FASE 4 — Pruebas post-despliegue

### A) Prueba funcional (app)

1. Abrir un lead de prueba.
2. Registrar cierre PIJ con serie, adhesión, anexo y medio de pago.
3. Guardar → debe aparecer en el **historial** del modal (ej. `Compró · PIJ · Efectivo $33.000`).
4. Agregar una **compra adicional** PIJ y guardar de nuevo.
5. Verificar que el historial muestra **dos entradas** (una por cada guardado).

### B) Prueba en base (DBA)

```sql
SELECT TOP 5
    id, lead_id, resultado_entrevista,
    numero_recibo, serie_pij, nro_adhesion, nro_anexo,
    forma_pago, monto_cierre, fecha_cierre,
    compras_adicionales_json,
    LEN(seguimiento_json) AS json_len
FROM dbo.registrarSeguimientoLead
WHERE lead_id = 12345  -- ID de prueba
ORDER BY id DESC;

EXEC dbo.spConsultarSeguimiento @solo_ultimo = 1, @top = 20;
```

### C) Exportación / bloqueos (si aplica)

```sql
EXEC dbo.SP_ExportarCierresParaBloqueo @solo_pij = 1;
```

---

## FASE 5 — Comportamiento por tipo de dato

| Situación | ¿Columnas planas? | ¿En historial? |
|-----------|-------------------|----------------|
| Guardado **nuevo** después del deploy | Sí, automático | Sí, nueva fila por cada guardado |
| Historial **viejo** antes del deploy | Se completa con migración | Ya estaba; se actualizan columnas vacías |
| Solo contacto / reagenda (sin cierre) | Planos de contacto; recibo NULL | Sí, fila de historial |
| Compras adicionales | En `compras_adicionales_json` de la fila del guardado | Sí, en la fila donde se guardaron |

---

## Checklist final

### DBA

- [ ] Backup `registrarSeguimientoLead`
- [ ] Ejecutar **`registrarSeguimientoLead-columnas-planas-completas.sql`** (verificar PASO 0: todo OK)
- [ ] Ejecutar `SP_ExportarCierresParaBloqueo.sql` (`fn_ParseReciboPij`)
- [ ] Ejecutar `MigrarSeguimientoJsonAColumnasPlanas.sql`
- [ ] `SP_MigrarSeguimientoJsonAPlano` → `@modo = preview`
- [ ] `SP_MigrarSeguimientoJsonAPlano` → `@modo = aplicar`, `@solo_vacios = 1`
- [ ] `SP_MigrarSeguimientoJsonAPlano` → `@modo = verificar` (0 pendientes o segunda pasada)
- [ ] (Opcional) `spConsultarSeguimiento` para auditoría

### Desarrollo

- [ ] `npm run build`
- [ ] Deploy app Node
- [ ] Confirmar `SP_SEGUIMIENTO` en `.env`

### Pruebas

- [ ] Cierre PIJ nuevo → columnas planas en última fila
- [ ] Compra adicional → `compras_adicionales_json` poblado
- [ ] Historial en app muestra entradas correctas
- [ ] Export bloqueos OK (si usan ese SP)

---

## Preguntas frecuentes

**¿Cada guardado duplica datos?**  
Sí, por diseño: cada cambio genera una nueva fila de historial con su snapshot (plano + JSON). Es intencional para auditoría.

**¿Hay que correr la migración cada día?**  
No. Solo **una vez** para historial viejo. Lo nuevo lo hace la app sola.

**¿El historial de la app muestra adhesión/anexo?**  
En la UI muestra la etiqueta legible (ej. `Compró · PIJ · Efectivo $33.000`). Los números desglosados están en columnas planas para reportes SQL.

**¿MPCSP puede ejecutar la migración?**  
La migración la ejecuta el **DBA** con usuario con permisos de escritura. MPCSP solo tiene `EXECUTE` en SPs de la app.

---

## Documentación relacionada

- [FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md](./FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md)
- [FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md](./FUNCIONALIDAD_HISTORIAL_SEGUIMIENTO.md)
- `sql/spConsultarSeguimiento.sql` — diccionario de columnas y muestras
