-- =============================================================================
-- Imágenes de cierre PIJ — DEPRECADO como columna JSON única
-- Base: STRSYSTEM
-- =============================================================================
-- Usar en su lugar:
--   sql/registrarSeguimientoLead-tablas-hijas.sql
--     → tabla dbo.registrarSeguimientoLead_imagen
--     → SP_RegistrarImagenCierrePij (bytes VARBINARY)
--     → SP_InsertarSeguimientoHijos (metadatos desde la app)
--
-- La columna imagenes_cierre_json en registrarSeguimientoLead queda legacy.
-- =============================================================================

USE STRSYSTEM;
GO

PRINT N'Las imágenes PIJ se guardan en dbo.registrarSeguimientoLead_imagen.';
PRINT N'Ejecutá sql/registrarSeguimientoLead-tablas-hijas.sql';
GO
