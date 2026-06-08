-- Permisos mínimos para el CRM Seguimiento de Leads (usuario API, ej. MPCSP).
-- Política DBA: MPCSP solo GRANT EXECUTE en SPs — SIN SELECT/INSERT directo en tablas.
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

-- Login y listados
GRANT EXECUTE ON dbo.operadorAccesoCategoria TO [MPCSP];
GRANT EXECUTE ON dbo.encuestasMuestraOperador TO [MPCSP];
GRANT EXECUTE ON dbo.encuestasMuestra TO [MPCSP];
GRANT EXECUTE ON dbo.encuestaSorteo01Update TO [MPCSP];

-- Seguimiento CRM — solo SP (escritura vía SP_RegistrarSeguimientoLead con EXECUTE AS OWNER)
GRANT EXECUTE ON dbo.SP_RegistrarSeguimientoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_HistorialSeguimientoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoOperador TO [MPCSP];
-- Panel superadmin (sql/SP_HistorialSeguimientoAdmin.sql)
GRANT EXECUTE ON dbo.SP_HistorialSeguimientoAdmin TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoGlobal TO [MPCSP];

-- Referidos (sql/lead_referido-tabla-sp.sql)
GRANT EXECUTE ON dbo.SP_RegistrarReferidoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ContarReferidosLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ObtenerMetaReferidosLead TO [MPCSP];

-- NO otorgar:
--   GRANT SELECT, INSERT ON dbo.registrarSeguimientoLead TO [MPCSP];
-- La app lee/escribe seguimiento únicamente vía los SP anteriores.
GO

-- 2) El SP encuestasMuestraOperador suele leer encuestas en mensajeria
USE mensajeria;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'MPCSP')
  CREATE USER [MPCSP] FOR LOGIN [MPCSP];
GO
GRANT CONNECT TO [MPCSP];
ALTER ROLE db_datareader ADD MEMBER [MPCSP];
GO

-- Verificación (como MPCSP):
-- USE STRSYSTEM;
-- EXEC dbo.encuestasMuestra;
-- EXEC dbo.SP_HistorialSeguimientoAdmin @desde = '2025-01-01';
-- EXEC dbo.SP_UltimoSeguimientoGlobal;
-- EXEC dbo.SP_UltimoSeguimientoOperador @id_operador = 132;
