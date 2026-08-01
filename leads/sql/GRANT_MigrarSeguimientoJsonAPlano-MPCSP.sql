-- =============================================================================
-- GRANT — permiso para ejecutar SP_MigrarSeguimientoJsonAPlano
-- Base: STRSYSTEM | Usuario app: MPCSP
-- =============================================================================
-- Pedido: el usuario MPCSP necesita poder correr:
--   EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'preview';
--   EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'aplicar', @solo_vacios = 1;
--   EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'verificar';
--
-- El SP está definido WITH EXECUTE AS 'dbo', por eso NO hace falta
-- GRANT UPDATE/SELECT en tablas: alcanza con GRANT EXECUTE en el SP.
--
-- Ejecutar como DBA / sysadmin.
-- Si el login de la app no es MPCSP, reemplazar [MPCSP] por el usuario real.
-- =============================================================================

USE [STRSYSTEM];
GO

/* Usuario de base (si aún no existe) */
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'MPCSP')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'MPCSP')
        CREATE USER [MPCSP] FOR LOGIN [MPCSP];
    ELSE
        RAISERROR(N'No existe el LOGIN [MPCSP] en el servidor. Crear el login o ajustar el nombre del usuario.', 16, 1);
END
GO

GRANT CONNECT TO [MPCSP];
GO

/* El SP debe existir (script MigrarSeguimientoJsonAColumnasPlanas.sql) */
IF OBJECT_ID(N'dbo.SP_MigrarSeguimientoJsonAPlano', N'P') IS NULL
BEGIN
    RAISERROR(
        N'Falta dbo.SP_MigrarSeguimientoJsonAPlano. Ejecutar antes sql/MigrarSeguimientoJsonAColumnasPlanas.sql',
        16,
        1
    );
END
ELSE
BEGIN
    GRANT EXECUTE ON dbo.SP_MigrarSeguimientoJsonAPlano TO [MPCSP];
    PRINT N'OK: GRANT EXECUTE ON dbo.SP_MigrarSeguimientoJsonAPlano TO [MPCSP]';
END
GO

/* Verificación */
SELECT
    pr.name AS usuario,
    pe.permission_name,
    pe.state_desc,
    OBJECT_SCHEMA_NAME(major_id) + N'.' + OBJECT_NAME(major_id) AS objeto
FROM sys.database_permissions pe
INNER JOIN sys.database_principals pr ON pr.principal_id = pe.grantee_principal_id
WHERE pr.name = N'MPCSP'
  AND pe.major_id = OBJECT_ID(N'dbo.SP_MigrarSeguimientoJsonAPlano');
GO

/*
-- Prueba (como MPCSP):
EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'preview';
*/
