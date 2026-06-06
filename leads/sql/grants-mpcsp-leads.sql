-- Permisos mínimos para el CRM Seguimiento de Leads (usuario API, ej. MPCSP).
-- Ejecutar como sysadmin o DBA en SQL Server de producción.
-- Ajustá [MPCSP] si el login en .env (DB_USER) es otro.

-- 1) Login y SP de autenticación (si el login ya existe, omitir CREATE LOGIN)
-- CREATE LOGIN [MPCSP] WITH PASSWORD = '...', CHECK_POLICY = OFF;

USE STRSYSTEM;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'MPCSP')
  CREATE USER [MPCSP] FOR LOGIN [MPCSP];
GO
GRANT CONNECT TO [MPCSP];
GRANT EXECUTE ON dbo.operadorAccesoCategoria TO [MPCSP];
GRANT EXECUTE ON dbo.encuestasMuestraOperador TO [MPCSP];
GRANT EXECUTE ON dbo.encuestasMuestra TO [MPCSP];
GRANT EXECUTE ON dbo.encuestaSorteo01Update TO [MPCSP];
-- Seguimiento CRM (SP + lectura/escritura historial en tabla)
GRANT EXECUTE ON dbo.SP_RegistrarSeguimientoLead TO [MPCSP];
GRANT SELECT, INSERT ON dbo.registrarSeguimientoLead TO [MPCSP];
-- Lectura batch / historial (RF-38, panel superadmin)
GRANT EXECUTE ON dbo.SP_HistorialSeguimientoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoOperador TO [MPCSP];
-- Referidos (sql/lead_referido-tabla-sp.sql) — solo SP, sin GRANT en tablas
GRANT EXECUTE ON dbo.SP_RegistrarReferidoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ContarReferidosLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ObtenerMetaReferidosLead TO [MPCSP];
-- Si tras EXECUTE falla por SELECT en tablas internas del SP:
-- ALTER ROLE db_datareader ADD MEMBER [MPCSP];
GO

-- 2) El SP encuestasMuestraOperador suele leer encuestas en mensajeria
USE mensajeria;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'MPCSP')
  CREATE USER [MPCSP] FOR LOGIN [MPCSP];
GO
GRANT CONNECT TO [MPCSP];
-- Lectura de tablas que use el SP (encuesta, etc.):
ALTER ROLE db_datareader ADD MEMBER [MPCSP];
GO

-- Verificación (como MPCSP o impersonate):
-- USE STRSYSTEM;
-- EXEC dbo.encuestasMuestraOperador @idVendedor = 132;  -- idOperador de prueba
