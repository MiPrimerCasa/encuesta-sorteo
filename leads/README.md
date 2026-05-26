# Seguimiento de Leads — Mi Primer Casa S.A.

App React mobile-first conectada **solo a la base de producción** (SQL Server STRSYSTEM). No incluye usuarios ni leads de prueba.

**Deploy:** monorepo recomendado con [encuesta-sorteo](https://github.com/MiPrimerCasa/encuesta-sorteo) → carpeta `leads/` — ver [docs/MONOREPO.md](docs/MONOREPO.md).  
Alternativa repo aparte: [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md).

## Fuentes de datos

| Dato | Origen |
|------|--------|
| **Login y rol** | `[dbo].[operadorAccesoCategoria]` — ver tabla de columnas abajo |
| **Leads / encuestas** | `[dbo].[encuestasMuestraOperador] @idVendedor` — usa **idVendedor** del login (o `idOperador` si no viene) |

### Login: `operadorAccesoCategoria`

```sql
EXEC [dbo].[operadorAccesoCategoria] @LoginID = 'email', @PasID = 'clave'
```

| Columna (SP) | Uso en la app |
|--------------|----------------|
| `idOperador` | Identificador del operador logueado |
| `idSupervisor` | Regla de rol (si el SP la devuelve) |
| `idVendedor` | Regla de rol + `@idVendedor` en encuestas |
| `operadorDescripcion` | Nombre en pantalla |
| `operadorCodigo` | Email / login guardado |
| `Categoria` | Respaldo de rol si faltan los ids |

**Rol (regla DBA):**

- `idSupervisor` **=** `idVendedor` → **supervisor** (Leads + Promotores)
- `idSupervisor` **≠** `idVendedor` → **promotor** (solo Leads)
- Si el SP no trae esos ids, se usa `Categoria` (`PROMOTOR PLAN JOVEN` → promotor)

Tras el login, en DevTools → red → `POST /api/auth/login` podés ver `idSupervisor`, `idVendedor` y `rolOrigen` (`ids` o `categoria`).
| **Seguimiento en la app** | Caché local `data/app-cache.db` (lo que registrás al guardar en el modal) |
| **Productos y barrios** | Catálogo fijo de la app (formulario de venta) |

## Requisitos

- Node.js ≥ 20.19 (`.nvmrc`)
- `.env` o `src/.env` con credenciales de producción

```env
SP_LOGIN=dbo.operadorAccesoCategoria
SP_LOGIN_PARAM_USER=LoginID
SP_LOGIN_PARAM_PASS=PasID

SP_ENCUESTAS=encuestasMuestraOperador
SP_ENCUESTAS_PARAM_ID=idVendedor

DB_HOST=...
DB_NAME=STRSYSTEM
ENCUESTAS_DB_NAME=mensajeria
DB_USER=...
DB_PASSWORD=...
```

## Desarrollo

```bash
npm install
npm run dev:api    # http://localhost:3001
npm run dev        # http://localhost:5173
```

Login con **email y clave reales** del operador en STRSYSTEM. La lista de leads usa el **id del operador** devuelto en el login, no el nombre.

### Error: MPCSP no puede acceder a «mensajeria»

El **login** usa STRSYSTEM y funciona. El SP `encuestasMuestraOperador` (aunque se ejecute desde STRSYSTEM) **lee datos en la base mensajeria**. El usuario SQL de la API (`MPCSP` en `.env`) debe existir también en **mensajeria**; cambiar solo `ENCUESTAS_DB_NAME` en la app **no alcanza**.

Pedí al administrador SQL que ejecute (ajustando el login si no es MPCSP):

```sql
USE mensajeria;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'MPCSP')
  CREATE USER [MPCSP] FOR LOGIN [MPCSP];

GRANT CONNECT TO [MPCSP];
GRANT EXECUTE ON dbo.encuestasMuestraOperador TO [MPCSP];
-- Si falla por tablas internas del SP:
ALTER ROLE db_datareader ADD MEMBER [MPCSP];
```

Dejá en `.env`: `ENCUESTAS_DB_NAME=STRSYSTEM` (conexión principal). Hasta que exista el usuario en mensajeria, el login en la app puede funcionar y la lista de leads no.

## Producción

```bash
npm run build
npm start
```

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado y SPs configurados |
| POST | `/api/auth/login` | `operadorAccesoCategoria` |
| GET | `/api/leads` | `encuestasMuestraOperador` (sesión requerida) |
| GET | `/api/promotores` | Derivado de encuestas del operador |
| GET | `/api/productos?rol=` | Catálogo por rol |
| GET | `/api/barrios` | Catálogo para venta de terreno |
| PATCH | `/api/leads/:id/seguimiento` | Guarda seguimiento en caché local |

Headers de sesión: `x-usuario-id`, `x-usuario-rol`, `x-usuario-nombre`.

## Vistas

1. **Leads** — Entrevista, contactar, seguimiento, compraron.
2. **Promotores** — Métricas y gráficos sobre las encuestas visibles para el usuario.
