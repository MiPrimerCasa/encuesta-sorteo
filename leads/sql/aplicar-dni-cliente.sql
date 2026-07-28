-- =============================================================================
-- aplicar-dni-cliente.sql — agregar dni_cliente si falta (idempotente)
-- Base: STRSYSTEM
-- =============================================================================

USE [STRSYSTEM];
GO

BEGIN TRY
    ALTER TABLE dbo.registrarSeguimientoLead ADD dni_cliente NVARCHAR(16) NULL;
    PRINT N'Columna dni_cliente AGREGADA.';
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() IN (2705, 1913) -- columna duplicada / índice
        PRINT N'Columna dni_cliente ya existía.';
    ELSE
        THROW;
END CATCH
GO

/* Verificación (puede fallar silenciosa para MPCSP sin permiso de catálogo) */
BEGIN TRY
    SELECT
        columna = N'dni_cliente',
        estado = CASE
            WHEN COL_LENGTH(N'dbo.registrarSeguimientoLead', N'dni_cliente') IS NULL THEN N'(sin lectura de catálogo — DBA verificar)'
            ELSE N'OK'
        END;
END TRY
BEGIN CATCH
    PRINT N'No se pudo verificar COL_LENGTH con este usuario.';
END CATCH
GO
