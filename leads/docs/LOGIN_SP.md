# Login: `operadorAccesoCategoria` y pantallas

**Índice general:** [INDICE_FUNCIONALIDADES.md](./INDICE_FUNCIONALIDADES.md)

Guía para alinear con el DBA qué devuelve el SP y qué muestra la app.

## 1. Qué ejecuta la app

```sql
EXEC [dbo].[operadorAccesoCategoria]
  @LoginID = 'email del operador',
  @PasID   = 'contraseña'
```

Una fila = login OK. Cero filas = usuario o clave incorrectos.

## 2. Acuerdo con DBA — `Categoria` como fuente del rol

**Objetivo:** que `operadorAccesoCategoria` devuelva en **`Categoria`** el rol real del operador, sin depender de comparar ids en `encuestasMuestraOperador` (evita casos como promotor con `idOperador === idVendedor` en la única fila).

| Valor exacto en `Categoria` (SP) | Pantalla en la app |
|----------------------------------|-------------------|
| **`SUPERVISOR`** | **Supervisor** — Leads + Promotores + Calendario |
| **`PROMOTOR`** | **Promotor** — Leads + Métricas (sin calendario; visitas en el momento) |

Solo esos dos textos (la app normaliza mayúsculas y espacios). Cualquier otro valor → respaldo por encuestas hasta que el DBA corrija la fila.

**Recomendaciones para el SP:**

- `Categoria` sin espacios de relleno al final (la app hace `.trim()`, pero conviene limpiar en SQL).
- Valores **estables** y documentados (misma ortografía en todos los operadores del mismo tipo).
- Opcional a futuro: columnas `idSupervisor` / `idVendedor` en el mismo SP; hoy la app no las exige si `Categoria` es correcta.

**Verificación después del cambio en SQL:**

```bash
npm run inspect:login -- email@operador clave
```

Debe verse `rol final: promotor` (o `supervisor`) con `rolOrigen: categoria` y pestañas acordes.

La regla por encuestas (`idOperador` vs `idVendedor`) queda como **respaldo** si `Categoria` viene vacía o el SP de encuestas falla; cuando `Categoria` viene bien, esa regla no debería cambiar el rol.

## 3. Columnas que ya conocemos (WhatsApp / captura)

| Columna SQL | Ejemplo | Uso en la app |
|-------------|---------|----------------|
| `idOperador` | `42` | Quién se logueó |
| `operadorCodigo` | `pablo@mail.com` | Email guardado en sesión |
| `operadorDescripcion` | `STRAUSS PABLO` | Nombre en la barra |
| `operadorFUM` | fecha | (no se usa hoy) |
| `Categoria` | **`PROMOTOR`** o **`SUPERVISOR`** | Define el rol en la app |

## 4. Regla de pantallas (respaldo con encuestas)

Tras el login, la app llama `encuestasMuestraOperador` con `@idVendedor = idOperador` y lee **`idVendedor`** de la primera fila:

| Comparación | Rol | Pestañas |
|-------------|-----|----------|
| `idOperador` **===** `idVendedor` (fila) | **supervisor** | Leads + Promotores |
| `idOperador` **!==** `idVendedor` (fila) | **promotor** | solo Leads |

La **lista de leads** la define la DB en ese SP (no se filtra de nuevo en Node).

Si encuestas falla o no devuelve filas, se usa **ids + Categoria** del login.  
Si encuestas marca supervisor pero `Categoria` dice PROMOTOR o `idSupervisor ≠ idOperador`, la app mantiene **promotor**.

`rolOrigen` en la respuesta del login:

- `"encuestas"` → regla idOperador vs idVendedor
- `"categoria"` → respaldo

## 5. Columnas del login (operadorAccesoCategoria)

## 5. Columnas útiles en cada lead (encuestas)

`idVendedor`, `idSupervisor`, `Promotor`, `supervisor`, `usuario`, `telefono`, etc.  
Ver: `npm run inspect:leads -- <idOperador>`

## 6. Qué pantallas ve cada rol

| `rol` en la app | Pestañas | Quién suele ser |
|-----------------|----------|-----------------|
| `supervisor` | **Leads** + **Promotores** | Misma persona es supervisor y “vendedor” a nivel id (o categoría no promotor) |
| `promotor` | **Leads** + **Métricas** | `Categoria` = **`PROMOTOR`** (o respaldo por encuestas) |

**Promotores** = gráficos y tabla del equipo (métricas de varios promotores).  
**Leads** = encuestas asignadas a ese operador vía `encuestasMuestraOperador @idVendedor`.

El `id` de sesión que va al SP de leads es **`idVendedor`** si viene; si no, **`idOperador`**.

## 6. Cómo verificar vos mismo

### Opción A — Script local

```bash
npm run inspect:login -- tu@email.com tu_clave
```

(o `node scripts/inspect-login-sp.js ...`)

Imprime:

1. Lista de **columnas** del SP  
2. JSON **crudo**  
3. JSON **mapeado** + qué pantallas corresponden  

### Opción B — Navegador

1. Iniciá sesión en la app.  
2. F12 → **Red** → `login` → respuesta JSON:

```json
{
  "usuario": {
    "id": "123",
    "rol": "promotor",
    "idSupervisor": "5",
    "idVendedor": "123",
    "idOperador": "123",
    "categoria": "PROMOTOR",
    "rolOrigen": "ids"
  }
}
```

### Opción C — SQL Server (con el DBA)

```sql
EXEC dbo.operadorAccesoCategoria
  @LoginID = '...',
  @PasID = '...';
```

Anotar **nombres exactos** de columnas de ids y validar con ejemplos:

| Caso | idSupervisor | idVendedor | Pantalla esperada |
|------|--------------|------------|-------------------|
| Jefe de sucursal | 10 | 10 | Supervisor |
| Promotor a cargo del 10 | 10 | 25 | Promotor |

## 7. Inspeccionar leads (`encuestasMuestraOperador`)

```bash
npm run inspect:leads -- 132
```

Muestra columnas del SP, valores de Promotor/supervisor y si hay ids numéricos para comparar con el login.

## 8. Preguntas para el DBA (checklist)

1. ¿Cómo se llaman en el resultset `idSupervisor` e `idVendedor`?  
2. ¿`idOperador` es siempre el vendedor logueado?  
3. Para `encuestasMuestraOperador`, ¿`@idVendedor` debe ser `idVendedor` o `idOperador`?  
4. ¿Todos los operadores tienen `Categoria` = **`PROMOTOR`** o **`SUPERVISOR`**? (recomendado; si no, la app usa respaldo por encuestas.)
