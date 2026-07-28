-- =============================================================================
-- AMPLIACIÓN registrarSeguimientoLead — medio de pago y monto (PIJ $33.000)
-- Base: STRSYSTEM
-- =============================================================================
-- Contexto:
--   La app guarda el seguimiento en columnas planas + seguimiento_json.
--   El JSON es la fuente de verdad de la app, pero el DBA necesita columnas
--   planas para reportes, bloqueos y consultas sin parsear JSON.
--
-- Campos NUEVOS solicitados (cierre PIJ entrega_33):
--   forma_pago          → efectivo | transferencia | mixto
--   monto_cierre        → monto total cobrado (ej. 33000)
--   monto_efectivo      → parte en efectivo (obligatorio si mixto o efectivo)
--   monto_transferencia → parte en transferencia (obligatorio si mixto o transferencia)
--
-- Campos RECOMENDADOS (hoy solo en JSON, conviene plano):
--   fecha_cierre        → fecha/hora del cierre (hoy solo $.fechaCierre en JSON)
--   fuente              → qr | app | facebook | instagram | whatsapp | tiktok
--
-- La app Node enviará estos valores vía SP_RegistrarSeguimientoLead.
--
-- ORDEN DE EJECUCIÓN DBA:
--   1) Este script (columnas + SP_RegistrarSeguimientoLead)
--   2) sql/SP_ExportarCierresParaBloqueo.sql (exportación con columnas nuevas)
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------------------------------------------------------------------------
   1) Nuevas columnas en la tabla
--------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'forma_pago') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD forma_pago NVARCHAR(16) NULL;
END;
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'monto_cierre') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD monto_cierre DECIMAL(12, 2) NULL;
END;
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'monto_efectivo') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD monto_efectivo DECIMAL(12, 2) NULL;
END;
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'monto_transferencia') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD monto_transferencia DECIMAL(12, 2) NULL;
END;
GO

-- Recomendado: fecha de cierre (hoy solo en seguimiento_json $.fechaCierre)
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'fecha_cierre') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD fecha_cierre DATETIME2(0) NULL;
END;
GO

-- Recomendado: fuente del lead (hoy solo en seguimiento_json $.fuente)
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'fuente') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD fuente NVARCHAR(16) NULL;
END;
GO

/* ---------------------------------------------------------------------------
   2) SP de registro — agregar parámetros nuevos
   (El DBA debe reemplazar el ALTER PROCEDURE completo o fusionar con el actual)
--------------------------------------------------------------------------- */
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
      @seguimiento_json NVARCHAR(MAX),
      -- Nuevos parámetros (NULL si el seguimiento no es un cierre)
      @forma_pago NVARCHAR(16) = NULL,           -- efectivo | transferencia | mixto
      @monto_cierre DECIMAL(12, 2) = NULL,       -- monto total
      @monto_efectivo DECIMAL(12, 2) = NULL,     -- parte efectivo
      @monto_transferencia DECIMAL(12, 2) = NULL,-- parte transferencia
      @fecha_cierre DATETIME2(0) = NULL,         -- fecha/hora del cierre
      @fuente NVARCHAR(16) = NULL                -- qr | app | facebook | ...
         WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO registrarSeguimientoLead
            (
            lead_id,
            telefono,
            encuesta,
            fechaAlta,
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
            seguimiento_json,
            forma_pago,
            monto_cierre,
            monto_efectivo,
            monto_transferencia,
            fecha_cierre,
            fuente
            )
        VALUES
            (
            @lead_id,
            @telefono,
            @encuesta,
            GETDATE(),
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
            @seguimiento_json,
            @forma_pago,
            @monto_cierre,
            @monto_efectivo,
            @monto_transferencia,
            @fecha_cierre,
            @fuente
            );

        DECLARE @nuevoId INT = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        SELECT 1 AS codigo,
               N'Seguimiento registrado correctamente.' AS mensaje,
               @nuevoId AS idRegistrarSeguimientoLead;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SELECT 0 AS codigo,
               ERROR_MESSAGE() AS mensaje,
               NULL AS idRegistrarSeguimientoLead;
    END CATCH
END;
GO

GRANT EXECUTE ON dbo.SP_RegistrarSeguimientoLead TO [MPCSP];
GO

/* ---------------------------------------------------------------------------
   3) Consulta de verificación para el DBA
   Compara columnas planas vs JSON en cierres PIJ
--------------------------------------------------------------------------- */
/*
SELECT TOP 50
    s.id,
    s.lead_id,
    s.resultado_entrevista,
    s.id_producto,
    s.estado_pago,
    s.numero_recibo,
    -- Columnas planas nuevas
    s.forma_pago,
    s.monto_cierre,
    s.monto_efectivo,
    s.monto_transferencia,
    s.fecha_cierre,
    s.fuente,
    -- Mismo dato desde JSON (para comparar)
    JSON_VALUE(s.seguimiento_json, '$.formaPago')          AS json_forma_pago,
    JSON_VALUE(s.seguimiento_json, '$.montoCierre')          AS json_monto_cierre,
    JSON_VALUE(s.seguimiento_json, '$.montoEfectivo')        AS json_monto_efectivo,
    JSON_VALUE(s.seguimiento_json, '$.montoTransferencia')   AS json_monto_transferencia,
    JSON_VALUE(s.seguimiento_json, '$.fechaCierre')          AS json_fecha_cierre,
    JSON_VALUE(s.seguimiento_json, '$.fuente')               AS json_fuente,
    s.seguimiento_json
FROM dbo.registrarSeguimientoLead s
WHERE s.resultado_entrevista = N'compro'
  AND COALESCE(s.id_producto, JSON_VALUE(s.seguimiento_json, '$.idProducto')) = N'prod-pij'
ORDER BY s.id DESC;
*/
