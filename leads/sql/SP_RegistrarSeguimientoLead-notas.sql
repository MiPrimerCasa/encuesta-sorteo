-- Ajustes DBA para conectar la app Node al SP SP_RegistrarSeguimientoLead
-- Ver: docs/FUNCIONALIDAD_CONEXION_SP_SEGUIMIENTO.md

/*
================================================================================
1) CRÍTICO: @resultado_entrevista NO puede ser BIT
================================================================================
La app envía textos: sin_interes | reagenda | no_compro | compro | derivar_terreno

En el SP publicado hoy figura:
  @resultado_entrevista BIT   -- INCORRECTO

Debe ser:
  @resultado_entrevista NVARCHAR(16) NULL

Y la columna en registrarSeguimientoLead también NVARCHAR(16) NULL.
*/

-- Ejemplo corrección columna (ajustar nombre real si difiere):
-- ALTER TABLE dbo.registrarSeguimientoLead
--   ALTER COLUMN resultado_entrevista NVARCHAR(16) NULL;

/*
================================================================================
2) RECOMENDADO: columna de fecha para historial / orden
================================================================================
La app ordena historial por id DESC; conviene fecha explícita:

ALTER TABLE dbo.registrarSeguimientoLead
  ADD creado_en DATETIME2(0) NOT NULL
      CONSTRAINT DF_registrarSeguimientoLead_creado DEFAULT SYSUTCDATETIME();
*/

/*
================================================================================
3) PERMISOS usuario API (MPCSP)
================================================================================
GRANT EXECUTE ON dbo.SP_RegistrarSeguimientoLead TO [MPCSP];
GRANT SELECT, INSERT ON dbo.registrarSeguimientoLead TO [MPCSP];
*/

/*
================================================================================
4) Firma SP corregida (fragmento parámetro)
================================================================================
CREATE OR ALTER PROCEDURE dbo.SP_RegistrarSeguimientoLead
  ...
  @resultado_entrevista NVARCHAR(16) = NULL,  -- no BIT
  ...
*/
