-- =============================================================================
-- id_venta_integral (+ estado PIJ) en registrarSeguimientoLead
-- Base: STRSYSTEM
-- =============================================================================
-- Mapea el idLoteVenta / idVenta que devuelve dbo.loteVentaBloqueoVendedorPIJ
-- a columnas planas del CRM (además de seguir en seguimiento_json).
--
-- Prerrequisito: SP_RegistrarSeguimientoLead ya con columnas planas
--   (sql/registrarSeguimientoLead-columnas-planas-completas.sql).
--
-- App Node: pasa @id_venta_integral / @pij_integral_* desde
--   server/db/seguimiento-sql.js al registrar el seguimiento.
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------------------------------------------------------------------------
   PASO 1 — Columnas planas
--------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'id_venta_integral') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD id_venta_integral INT NULL;
    PRINT N'Columna id_venta_integral AGREGADA.';
END
ELSE
    PRINT N'Columna id_venta_integral ya existía.';
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'pij_integral_estado') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD pij_integral_estado NVARCHAR(16) NULL;
    PRINT N'Columna pij_integral_estado AGREGADA.';
END
ELSE
    PRINT N'Columna pij_integral_estado ya existía.';
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'pij_integral_error') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD pij_integral_error NVARCHAR(500) NULL;
    PRINT N'Columna pij_integral_error AGREGADA.';
END
ELSE
    PRINT N'Columna pij_integral_error ya existía.';
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'pij_integral_enviado_en') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD pij_integral_enviado_en DATETIME2(0) NULL;
    PRINT N'Columna pij_integral_enviado_en AGREGADA.';
END
ELSE
    PRINT N'Columna pij_integral_enviado_en ya existía.';
GO

/* ---------------------------------------------------------------------------
   PASO 2 — Backfill desde seguimiento_json (cierres previos)
--------------------------------------------------------------------------- */
UPDATE dbo.registrarSeguimientoLead
SET
    id_venta_integral = TRY_CONVERT(
        INT,
        JSON_VALUE(seguimiento_json, '$.idVentaIntegral')
    ),
    pij_integral_estado = LEFT(
        NULLIF(LTRIM(RTRIM(JSON_VALUE(seguimiento_json, '$.pijIntegralEstado'))), N''),
        16
    ),
    pij_integral_error = LEFT(
        NULLIF(LTRIM(RTRIM(JSON_VALUE(seguimiento_json, '$.pijIntegralError'))), N''),
        500
    ),
    pij_integral_enviado_en = TRY_CONVERT(
        DATETIME2(0),
        JSON_VALUE(seguimiento_json, '$.pijIntegralEnviadoEn')
    )
WHERE seguimiento_json IS NOT NULL
  AND (
        (
            id_venta_integral IS NULL
            AND TRY_CONVERT(INT, JSON_VALUE(seguimiento_json, '$.idVentaIntegral')) IS NOT NULL
        )
     OR (
            pij_integral_estado IS NULL
            AND NULLIF(LTRIM(RTRIM(JSON_VALUE(seguimiento_json, '$.pijIntegralEstado'))), N'') IS NOT NULL
        )
      );

PRINT N'Backfill desde JSON: filas afectadas = ' + CAST(@@ROWCOUNT AS NVARCHAR(20));
GO

/* ---------------------------------------------------------------------------
   PASO 3 — SP_RegistrarSeguimientoLead (parámetros + INSERT)
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
      -- Medio de pago
      @forma_pago NVARCHAR(16) = NULL,
      @monto_cierre DECIMAL(12, 2) = NULL,
      @monto_efectivo DECIMAL(12, 2) = NULL,
      @monto_transferencia DECIMAL(12, 2) = NULL,
      @fecha_cierre DATETIME2(0) = NULL,
      @fuente NVARCHAR(16) = NULL,
      -- Adhesión / anexo PIJ
      @serie_pij NVARCHAR(1) = NULL,
      @nro_adhesion NVARCHAR(10) = NULL,
      @nro_anexo NVARCHAR(10) = NULL,
      -- Compras adicionales / imágenes (JSON plano legacy)
      @compras_adicionales_json NVARCHAR(MAX) = NULL,
      @imagenes_cierre_json NVARCHAR(MAX) = NULL,
      -- DNI cliente
      @dni_cliente NVARCHAR(16) = NULL,
      -- Caja sucursal
      @caja_estado NVARCHAR(16) = NULL,
      @caja_verificado_en DATETIME2(0) = NULL,
      @caja_comprobante_id NVARCHAR(64) = NULL,
      @caja_motivo_rechazo NVARCHAR(300) = NULL,
      @caja_sucursal NVARCHAR(32) = NULL,
      @caja_confirmado_por NVARCHAR(200) = NULL,
      -- Bloqueo sistema integral PIJ (loteVentaBloqueoVendedorPIJ → id)
      @id_venta_integral INT = NULL,
      @pij_integral_estado NVARCHAR(16) = NULL,
      @pij_integral_error NVARCHAR(500) = NULL,
      @pij_integral_enviado_en DATETIME2(0) = NULL
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
            fuente,
            serie_pij,
            nro_adhesion,
            nro_anexo,
            compras_adicionales_json,
            imagenes_cierre_json,
            dni_cliente,
            caja_estado,
            caja_verificado_en,
            caja_comprobante_id,
            caja_motivo_rechazo,
            caja_sucursal,
            caja_confirmado_por,
            id_venta_integral,
            pij_integral_estado,
            pij_integral_error,
            pij_integral_enviado_en
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
            @fuente,
            @serie_pij,
            @nro_adhesion,
            @nro_anexo,
            @compras_adicionales_json,
            @imagenes_cierre_json,
            @dni_cliente,
            @caja_estado,
            @caja_verificado_en,
            @caja_comprobante_id,
            @caja_motivo_rechazo,
            @caja_sucursal,
            @caja_confirmado_por,
            @id_venta_integral,
            @pij_integral_estado,
            @pij_integral_error,
            @pij_integral_enviado_en
            );

        DECLARE @nuevoId INT = SCOPE_IDENTITY();

        IF OBJECT_ID(N'dbo.SP_InsertarSeguimientoHijos', N'P') IS NOT NULL
        BEGIN
            EXEC dbo.SP_InsertarSeguimientoHijos
                @id_seguimiento           = @nuevoId,
                @lead_id                  = @lead_id,
                @compras_adicionales_json = @compras_adicionales_json,
                @imagenes_cierre_json     = @imagenes_cierre_json;
        END

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
   PASO 4 — Verificación
--------------------------------------------------------------------------- */
SELECT TOP 10
    id,
    lead_id,
    id_producto,
    id_venta_integral,
    pij_integral_estado,
    pij_integral_enviado_en,
    JSON_VALUE(seguimiento_json, '$.idVentaIntegral') AS json_idVentaIntegral
FROM dbo.registrarSeguimientoLead
WHERE id_producto = N'prod-pij'
   OR JSON_VALUE(seguimiento_json, '$.idVentaIntegral') IS NOT NULL
ORDER BY id DESC;
GO

/*
-- Ejemplo manual de mapeo (después de un bloqueo SP que devolvió 14051):
-- El CRM lo hace solo al guardar seguimiento; esto es solo referencia DBA.

-- UPDATE dbo.registrarSeguimientoLead
-- SET id_venta_integral = 14051,
--     pij_integral_estado = N'bloqueado',
--     pij_integral_enviado_en = SYSUTCDATETIME()
-- WHERE id = <id_fila_seguimiento>;
*/
