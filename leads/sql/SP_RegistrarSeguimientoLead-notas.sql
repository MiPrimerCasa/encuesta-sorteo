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
USE [STRSYSTEM]
GO
/** Object:  StoredProcedure [dbo].[SP_RegistrarSeguimientoLead]    Script Date: 10/7/2026 11:36:58 **/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[SP_RegistrarSeguimientoLead]
      @lead_id INT,
      @telefono NVARCHAR(32),
      @encuesta NVARCHAR(64),
      @confirmo_entrevista BIT,
      @canal NVARCHAR(16),
      @hubo_entrevista BIT,
      @resultado_entrevista NVARCHAR(16),
      @horario_entrevista_propuesto NVARCHAR(32),
      @fecha_reagenda NVARCHAR(32),
      @seguimiento_pij_promotor BIT,
      @id_producto NVARCHAR(32),
      @estado_pago NVARCHAR(16),
      @id_barrio NVARCHAR(32),
      @numero_recibo NVARCHAR(80),
      @brindo_referidos BIT,
      @referidos_json NVARCHAR(MAX),
      @observaciones NVARCHAR(500),
      @operador_id INT,
      @operador_rol NVARCHAR(16),
      @operador_nombre NVARCHAR(200),
      @seguimiento_json NVARCHAR(MAX)
         WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;   -- ante error grave, asegura el rollback

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO registrarSeguimientoLead
            (
            lead_id,
            telefono,
            encuesta,
			fechaAlta ,
            confirmo_entrevista,
            canal,
            hubo_entrevista,
            resultado_entrevista,
            horario_entrevista_propuesto,
            fecha_reagenda,
            seguimiento_pij_promotor,
            id_producto,
            estado_pago,
            id_barrio,
            numero_recibo,
            brindo_referidos,
            referidos_json,
            observaciones,
            operador_id,
            operador_rol,
            operador_nombre,
            seguimiento_json
            )
        VALUES
            (
            @lead_id,
            @telefono,
            @encuesta,
			getdate(),
            @confirmo_entrevista,
            @canal,
            @hubo_entrevista,
            @resultado_entrevista,
            @horario_entrevista_propuesto,
            @fecha_reagenda,
            @seguimiento_pij_promotor,
            @id_producto,
            @estado_pago,
            @id_barrio,
            @numero_recibo,
            @brindo_referidos,
            @referidos_json,
            @observaciones,
            @operador_id,
            @operador_rol,
            @operador_nombre,
            @seguimiento_json
            );

        -- Id del registro recien insertado (por si el llamador lo necesita)
        DECLARE @nuevoId INT = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        -- Devuelve resultado de exito + el id generado
        SELECT 1 AS codigo,
               N'Seguimiento registrado correctamente.' AS mensaje,
               @nuevoId AS idRegistrarSeguimientoLead;
    END TRY
    BEGIN CATCH
        -- Si quedo una transaccion abierta, revertirla
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Devuelve resultado de error con el detalle, sin romper al llamador
        SELECT 0 AS codigo,
               ERROR_MESSAGE() AS mensaje,
               NULL AS idRegistrarSeguimientoLead;

      
    END CATCH
END