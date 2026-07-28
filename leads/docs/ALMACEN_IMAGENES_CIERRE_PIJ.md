# Almacén de imágenes — cierre Plan Inversión Joven

**Fecha:** 2026-07-13  
**Estado:** implementado (disco + SQL)

## Dónde se guardan (VPS)

El contenedor monta `./data` → `/app/data`. Las fotos quedan en:

```text
data/cierres-pij/{leadId}/{tipo}__{ventaKey}__{uuid}.jpeg
```

Ejemplo:

```text
data/cierres-pij/3906/img1__principal__57ce2241-....jpeg
data/cierres-pij/3906/img7__principal__dad67513-....jpeg
```

Variables (`.env` / `deploy/.env.vps.example`):

| Variable | Default |
|----------|---------|
| `CIERRES_PIJ_DIR` | `data/cierres-pij` |
| `CIERRES_PIJ_MAX_MB` | `8` |

El script `deploy/deploy-vps-docker.sh` crea `data/cierres-pij` en cada deploy. `git clean` **no** borra `leads/data/`. El backup diario de `data/` incluye estas fotos.

## Asociación con el lead

| Capa | Cómo se asocia |
|------|----------------|
| Carpeta en disco | Nombre de carpeta = **id del lead** |
| Metadatos en seguimiento | `imagenesCierre[].leadId` + `storagePath` |
| SQL tabla hija | `registrarSeguimientoLead_imagen.lead_id` + `seguimiento_id` |
| Bytes en SQL | columna `contenido` (además del archivo en disco) |

## Cómo verlas

1. **En el VPS:** `ls leads/data/cierres-pij/3906/`
2. **En la app:** reabrir el lead → miniaturas vía `GET /api/cierres-pij/imagenes/:id?path=...`
3. **En SQL:** `EXEC spConsultarSeguimiento @lead_id=3906` → result set de imágenes

## Para el DBA — ver y descargar

### A) Solo listar (metadatos)

```sql
EXEC dbo.spConsultarSeguimiento
  @lead_id = 3906,
  @solo_ultimo = 1,
  @incluir_diccionario = 0;
-- Revisar el result set de imágenes: tipo_imagen, storage_path, tiene_contenido
```

Script de listados: [`sql/DBA_VerYExportarImagenesCierrePij.sql`](../sql/DBA_VerYExportarImagenesCierrePij.sql).

### B) Descargar desde SQL (bytes en `contenido`)

Desde la máquina con acceso a STRSYSTEM y el `.env` del proyecto:

```bash
node scratch/exportar-imagenes-pij-lead.mjs 3906
```

Salida: `scratch/exports-pij/3906/*.jpeg`

Si `tiene_contenido = 0`, no hay bytes en SQL: usar la opción C.

### C) Descargar desde el VPS (archivo en disco)

```bash
# en el VPS
ls /opt/encuesta-landingqr/leads/data/cierres-pij/3906/
# copiar con scp / WinSCP / FileZilla la carpeta del lead
```

| Origen | Cuándo usarlo |
|--------|----------------|
| SQL `contenido` | Backup / auditoría desde SSMS + script Node |
| VPS `data/cierres-pij/{leadId}/` | Siempre tiene el archivo original tras el upload |

## Notas

- Rutas viejas `AAAA/MM/DD/uuid.jpeg` (antes de agrupar por lead) **siguen resolviendo** si el archivo existe.
- No guardes `CIERRES_PIJ_DIR` fuera de `data/` o se pierde al redeployar la imagen Docker.
- En la prueba del lead 3906, `tiene_contenido = 1`: se pueden bajar desde SQL o desde disco.
