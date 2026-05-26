# Login: `operadorAccesoCategoria` y pantallas

Guía para alinear con el DBA qué devuelve el SP y qué muestra la app.

## 1. Qué ejecuta la app

```sql
EXEC [dbo].[operadorAccesoCategoria]
  @LoginID = 'email del operador',
  @PasID   = 'contraseña'
```

Una fila = login OK. Cero filas = usuario o clave incorrectos.

## 2. Columnas que ya conocemos (WhatsApp / captura)

| Columna SQL | Ejemplo | Uso en la app |
|-------------|---------|----------------|
| `idOperador` | `42` | Quién se logueó |
| `operadorCodigo` | `pablo@mail.com` | Email guardado en sesión |
| `operadorDescripcion` | `STRAUSS PABLO` | Nombre en la barra |
| `operadorFUM` | fecha | (no se usa hoy) |
| `Categoria` | `PROMOTOR PLAN JOVEN` | Respaldo de rol si faltan ids |

## 3. Regla de pantallas (implementada)

Tras el login, la app llama `encuestasMuestraOperador` con `@idVendedor = idOperador` y lee **`idVendedor`** de la primera fila:

| Comparación | Rol | Pestañas |
|-------------|-----|----------|
| `idOperador` **===** `idVendedor` (fila) | **supervisor** | Leads + Promotores |
| `idOperador` **!==** `idVendedor` (fila) | **promotor** | solo Leads |

La **lista de leads** la define la DB en ese SP (no se filtra de nuevo en Node).

Si encuestas falla o no devuelve filas, se usa **Categoria** del login como respaldo.

`rolOrigen` en la respuesta del login:

- `"encuestas"` → regla idOperador vs idVendedor
- `"categoria"` → respaldo

## 4. Columnas del login (operadorAccesoCategoria)

## 5. Columnas útiles en cada lead (encuestas)

`idVendedor`, `idSupervisor`, `Promotor`, `supervisor`, `usuario`, `telefono`, etc.  
Ver: `npm run inspect:leads -- <idOperador>`

## 6. Qué pantallas ve cada rol

| `rol` en la app | Pestañas | Quién suele ser |
|-----------------|----------|-----------------|
| `supervisor` | **Leads** + **Promotores** | Misma persona es supervisor y “vendedor” a nivel id (o categoría no promotor) |
| `promotor` | **solo Leads** | Tiene un supervisor distinto (otro id) o categoría promotor plan joven |

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
    "categoria": "PROMOTOR PLAN JOVEN",
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
4. ¿Un supervisor con categoría `PROMOTOR PLAN JOVEN` pero ids iguales es supervisor o promotor? (hoy: **ids ganan** si vienen ambos.)
