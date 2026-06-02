# Sorteos repetidos: mismo teléfono, nueva participación

Pregunta habitual: *«Si alguien participó en sorteo01 y vuelve a participar en sorteo02, ¿el CRM lo trata como ya participó?»*

Respuesta corta: **depende de cómo esté modelado en SQL**, no de la prioridad de la app. La app puede mostrar **una fila por participación** si el DBA lo define así.

---

## Cómo identifica hoy el CRM cada lead

| Concepto | En SQL / SP | En la app |
|----------|-------------|-----------|
| **Participación (lead)** | Fila en `dbo.encuesta` con PK numérica `id` | `lead.id` (ej. `176`, `502`) |
| **Campaña / sorteo** | Columna `encuesta` (ej. `sorteo01`, `sorteo02`) | Hoy no se muestra en UI; existe en el result set |
| **Teléfono del cliente** | `telefono` | Contacto WhatsApp |
| **Código QR / promotor** | Columna `usuario` (ej. `SORTEO01S21P01`) | `encuestaUsuario` — **no** es el DNI del cliente |

El **seguimiento comercial** (entrevista, compro, derivar terreno, etc.) se guarda en caché local por **`lead.id` = PK de esa fila de encuesta**.

Consecuencia importante:

- Misma persona, **dos sorteos** → en principio **dos filas** en `encuesta` → **dos `id`** → **dos leads en el CRM**, cada uno con su seguimiento.
- El historial de sorteo01 **no se mezcla** automáticamente con sorteo02 (salvo que el SP o la UI lo fusionen a propósito).

---

## Duplicados: qué evita hoy la carga

Al registrar por landing o **Cargar lead** manual, el SP de carga (`encuestaCargaSorteo01` o sucesor) usa clave de negocio:

**`teléfono` + `encuesta` (campaña)**

- Mismo teléfono + **mismo** `sorteo01` otra vez → el SP puede responder duplicado (`codigo = 0`) → *«Este contacto ya está registrado»*.
- Mismo teléfono + **`sorteo02`** (nueva campaña) → **debería permitir** una fila nueva, si el SP y la landing están configurados para `encuesta = sorteo02`.

Variable de entorno de la app al cargar manual:

```env
ENCUESTA_CARGA_ID=sorteo01   # al lanzar sorteo02 → sorteo02 (o el id que use el DBA)
```

---

## Qué debe definir el DBA (modelo abstracto)

### 1. Una participación = una fila en `encuesta`

No usar **UNIQUE solo en `telefono`** a nivel global.

Usar unicidad por campaña, por ejemplo:

```sql
-- Ejemplo conceptual (ajustar nombres reales)
UNIQUE (telefono_normalizado, encuesta)
-- o UNIQUE (telefono, encuesta, fecha_corte_sorteo)
```

Así un cliente puede estar en sorteo01 y sorteo02 sin conflicto.

### 2. Columna `encuesta` estable por campaña

| Campaña | Valor sugerido en `encuesta` |
|---------|------------------------------|
| Sorteo 01 | `sorteo01` |
| Sorteo 02 | `sorteo02` |
| Landing `?Encuesta=SORTEO02` | Mapear al mismo texto que guarda el SP |

La app de prioridad **no depende** del nombre del sorteo; solo necesita columnas estables (`id`, teléfono, horario, fecha alta).

### 3. SP de listado `encuestasMuestraOperador`

Definir con negocio una de estas políticas (documentar cuál eligieron):

| Política | Comportamiento en CRM |
|----------|------------------------|
| **A — Todas las participaciones visibles** | Devuelve sorteo01 + sorteo02 del mismo teléfono → **2 tarjetas** (cada una con su seguimiento). |
| **B — Solo campaña activa** | Parámetro `@encuesta = 'sorteo02'` o tabla `campania_activa` → solo filas del sorteo vigente. |
| **C — Última participación por teléfono** | Una fila por teléfono (la más reciente) → el operador no ve el historial del sorteo anterior en la lista. |

Recomendación para ventas: **A o B**.  
- **B** si solo se opera el sorteo actual.  
- **A** si el supervisor debe ver historial (con etiqueta de campaña en UI cuando se exponga `encuesta`).

### 4. SP de carga (landing + manual)

- Mismo contrato: `@telefono`, `@encuesta`, campos 1–8.
- Duplicado solo si **misma campaña + mismo teléfono**.
- Para sorteo02: nuevo SP `encuestaCargaSorteo02` **o** un solo SP parametrizado `@encuesta` (más mantenible).

### 5. Seguimiento en SQL (futuro)

El borrador `lead_seguimiento_crm` propone:

```text
lead_key = telefono|sorteo01   -- una fila de seguimiento POR participación
```

Eso alinea CRM con multicampaña sin reutilizar el seguimiento del sorteo anterior.

---

## Qué **no** hace hoy la app (y no confundir)

- No deduplica por teléfono en el listado (muestra lo que devuelve el SP).
- El pre-chequeo al cargar manual usa `telefonoYaEnCampania` (teléfono + `encuesta` / `ENCUESTA_CARGA_ID`), no solo teléfono.
- La columna `usuario` del SP **no** identifica al participante; es el código del promotor en el QR.

---

## Resumen para Leonel / DBA

| Pregunta | Respuesta |
|----------|-----------|
| ¿Participó en sorteo01 y quiere sorteo02? | **Puede** ser otra participación legítima si SQL permite `(teléfono, encuesta)` distinto. |
| ¿El CRM lo marca como «ya participó»? | Solo si el **SP de carga** o el **listado** tratan el teléfono como único global (evitar). |
| ¿El seguimiento del sorteo01 pisa el sorteo02? | **No**, si cada participación tiene su `id` de encuesta (como hoy en SQLite). |
| ¿Hay que cambiar la app por cada sorteo? | Prioridad y pestañas **no**. Sí configurar `ENCUESTA_CARGA_ID` / SP de carga y acordar política del SP de listado (A, B o C). |

---

## Checklist al lanzar sorteo02

1. [ ] Valor `encuesta = 'sorteo02'` en nuevas filas (landing + SP carga).
2. [x] UNIQUE / validación duplicado = **teléfono + encuesta**, no solo teléfono (pre-chequeo en API + badge `codigoCampania` en tarjetas).
3. [ ] `encuestasMuestraOperador`: documentar si filtra por campaña activa o devuelve todo.
4. [ ] Actualizar `ENCUESTA_CARGA_ID` (y nombre del SP si aplica) en `.env` del deploy.
5. [ ] (Opcional) Exponer columna `encuesta` en el CRM como badge «Sorteo 02» para el operador.
