-- =============================================================================
-- DBA — Ver y exportar imágenes de cierre PIJ
-- Base: STRSYSTEM | Tabla: dbo.registrarSeguimientoLead_imagen
-- =============================================================================
-- Las fotos viven en DOS lados:
--   A) Disco del VPS (volumen leads/data/cierres-pij/{leadId}/)
--   B) SQL: columna contenido VARBINARY(MAX)  (si tiene_contenido = 1)
--
-- Listado rápido (metadatos, sin bytes):
--   EXEC dbo.spConsultarSeguimiento @lead_id = 3906, @solo_ultimo = 1, @incluir_diccionario = 0;
--   → RESULT SET de imágenes (tiene_contenido, storage_path, tipo_imagen, …)
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------- 1) Listar por lead ---------- */
DECLARE @lead_id INT = 3906;  -- ← cambiar

SELECT
    i.id,
    i.id_imagen,
    i.id_seguimiento,
    i.lead_id,
    i.venta_key,
    i.tipo_imagen,
    i.mime_type,
    i.nombre_original,
    i.tamano_bytes,
    i.storage_path,
    bytes_sql       = DATALENGTH(i.contenido),
    tiene_contenido = CASE WHEN i.contenido IS NOT NULL THEN 1 ELSE 0 END,
    i.operador_id,
    i.subido_en
FROM dbo.registrarSeguimientoLead_imagen AS i
WHERE i.lead_id = @lead_id
ORDER BY i.id_seguimiento DESC, i.venta_key, i.tipo_imagen;
GO

/* ---------- 2) Listar por id de seguimiento (historial) ---------- */
DECLARE @id_seguimiento INT = 6514;  -- ← cambiar

SELECT
    i.id_imagen,
    i.lead_id,
    i.tipo_imagen,
    i.storage_path,
    bytes_sql = DATALENGTH(i.contenido),
    i.nombre_original,
    i.subido_en
FROM dbo.registrarSeguimientoLead_imagen AS i
WHERE i.id_seguimiento = @id_seguimiento
ORDER BY i.tipo_imagen;
GO

/*
---------- 3) Exportar UNA imagen a archivo (SQLCMD / máquina con acceso al SQL)

Opción recomendada: script Node del repo
  node scratch/exportar-imagenes-pij-lead.mjs 3906
  → escribe en scratch/exports-pij/3906/

Opción BCP (servidor SQL Windows; crear carpeta C:\Temp\pij\ antes):

  -- Sustituir @id_imagen y la ruta de salida
  DECLARE @sql NVARCHAR(MAX) = N'
  bcp "SELECT contenido FROM STRSYSTEM.dbo.registrarSeguimientoLead_imagen WHERE id_imagen = ''f8f9555d-1b38-4edc-8da6-7213c8b73db9'' AND contenido IS NOT NULL" queryout "C:\Temp\pij\img1.jpeg" -T -S SERVER18951 -N
  ';
  -- Ejecutar desde CMD/PowerShell (no desde SSMS grid). Preferir -U/-P si no usás Trusted.

Opción VPS (archivo en disco, sin tocar SQL):
  ssh user@vps
  cd /opt/encuesta-landingqr/leads   # o LEADS_DIR real
  ls data/cierres-pij/3906/
  # copiar con scp / WinSCP la carpeta del lead
*/
