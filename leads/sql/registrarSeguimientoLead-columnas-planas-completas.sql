-- =============================================================================
-- registrarSeguimientoLead — verificar y agregar TODAS las columnas planas
-- Base: STRSYSTEM
-- =============================================================================
-- Objetivo:
--   Asegurar que la tabla dbo.registrarSeguimientoLead tenga todas las columnas
--   planas que la app Node envía al SP_RegistrarSeguimientoLead.
--
-- IDEMPOTENTE: si medio de pago ya se aplicó, solo agrega lo que falte
-- (serie_pij, nro_adhesion, nro_anexo, compras_adicionales_json, etc.).
--
-- ORDEN DBA:
--   1) sql/registrarSeguimientoLead-tablas-hijas.sql (compras + imágenes en tablas hijas)
--   2) Este script
--   3) sql/MigrarSeguimientoJsonAColumnasPlanas.sql (historial viejo)
--   4) Desplegar app Node
--
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------------------------------------------------------------------------
   PASO 0 — Diagnóstico: qué columnas existen y cuáles faltan
   (Ejecutar antes y después del script)
--------------------------------------------------------------------------- */
SELECT
    v.orden,
    v.columna,
    v.grupo,
    v.descripcion,
    estado = CASE
        WHEN COL_LENGTH('dbo.registrarSeguimientoLead', v.columna) IS NULL THEN N'*** FALTA ***'
        ELSE N'OK'
    END,
    tipo_sql = CASE
        WHEN COL_LENGTH('dbo.registrarSeguimientoLead', v.columna) IS NULL THEN v.tipo_nuevo
        ELSE (
            SELECT c.DATA_TYPE
                 + COALESCE('(' + CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR(10)) + ')', '')
            FROM INFORMATION_SCHEMA.COLUMNS c
            WHERE c.TABLE_SCHEMA = 'dbo'
              AND c.TABLE_NAME = 'registrarSeguimientoLead'
              AND c.COLUMN_NAME = v.columna
        )
    END
FROM (VALUES
    -- Base (deben existir desde el SP original)
    ( 10, 'lead_id',                    N'base',        N'ID encuesta / lead',                    NULL),
    ( 11, 'telefono',                   N'base',        N'Teléfono',                              NULL),
    ( 12, 'encuesta',                   N'base',        N'Código campaña',                        NULL),
    ( 13, 'fechaAlta',                  N'base',        N'Fecha registro fila historial',         NULL),
    ( 14, 'confirmo_entrevista',        N'base',        N'Confirmó entrevista',                   NULL),
    ( 15, 'canal',                      N'base',        N'Medio contacto',                        NULL),
    ( 16, 'hubo_entrevista',            N'base',        N'Hubo entrevista',                       NULL),
    ( 17, 'resultado_entrevista',       N'base',        N'Resultado entrevista',                  NULL),
    ( 18, 'horario_entrevista_propuesto',N'base',       N'Horario propuesto',                     NULL),
    ( 19, 'fecha_reagenda',             N'base',        N'Fecha reagenda',                        NULL),
    ( 20, 'seguimiento_pij_promotor',   N'base',        N'Seguimiento PIJ promotor',              NULL),
    ( 21, 'id_producto',                N'base',        N'Producto venta',                        NULL),
    ( 22, 'estado_pago',                N'base',        N'Estado pago',                           NULL),
    ( 23, 'id_barrio',                  N'base',        N'Barrio terreno',                        NULL),
    ( 24, 'numero_recibo',              N'base',        N'Recibo/anexo texto completo',           NULL),
    ( 25, 'brindo_referidos',           N'base',        N'Brindó referidos',                      NULL),
    ( 26, 'referidos_json',             N'base',        N'Array referidos',                       NULL),
    ( 27, 'observaciones',              N'base',        N'Notas operador',                        NULL),
    ( 28, 'operador_id',                N'base',        N'ID operador',                           NULL),
    ( 29, 'operador_rol',               N'base',        N'Rol operador',                          NULL),
    ( 30, 'operador_nombre',            N'base',        N'Nombre operador',                       NULL),
    ( 31, 'seguimiento_json',           N'base',        N'Snapshot JSON completo',                NULL),
    -- Medio de pago (script medio-pago.sql — puede estar ya aplicado)
    ( 40, 'forma_pago',                 N'medio_pago',  N'efectivo | transferencia | mixto',      'NVARCHAR(16)'),
    ( 41, 'monto_cierre',               N'medio_pago',  N'Monto total PIJ',                       'DECIMAL(12,2)'),
    ( 42, 'monto_efectivo',             N'medio_pago',  N'Parte efectivo',                          'DECIMAL(12,2)'),
    ( 43, 'monto_transferencia',        N'medio_pago',  N'Parte transferencia',                     'DECIMAL(12,2)'),
    ( 44, 'fecha_cierre',               N'medio_pago',  N'Fecha/hora cierre',                     'DATETIME2(0)'),
    ( 45, 'fuente',                     N'medio_pago',  N'Origen lead (qr, app, …)',              'NVARCHAR(16)'),
    ( 46, 'titular_transferencia',      N'medio_pago',  N'Titular transferencia',                 'NVARCHAR(200)'),
    ( 461, 'titular_coincide_cliente',  N'medio_pago',  N'Titular coincide con cliente',          'BIT'),
    ( 47, 'banco_transferencia',        N'medio_pago',  N'Banco transferencia (legado)',          'NVARCHAR(120)'),
    ( 48, 'referencia_transferencia',   N'medio_pago',  N'Referencia / nro. operación TRF (legado)', 'NVARCHAR(120)'),
    ( 32, 'seguimiento_agenda_operador_rol', N'base',  N'Rol que agendó',                        'NVARCHAR(16)'),
    ( 33, 'derivacion_terreno_activa',  N'base',        N'Derivación terreno activa',             'BIT'),
    -- Adhesión / anexo PIJ + compras adicionales
    ( 50, 'serie_pij',                  N'pij_recibo',  N'Serie A o B',                           'NVARCHAR(1)'),
    ( 51, 'nro_adhesion',               N'pij_recibo',  N'Número adhesión',                       'NVARCHAR(10)'),
    ( 52, 'nro_anexo',                  N'pij_recibo',  N'Número anexo',                          'NVARCHAR(10)'),
    ( 53, 'compras_adicionales_json',   N'pij_recibo',  N'LEGACY — usar tabla registrarSeguimientoLead_compra', 'NVARCHAR(MAX)'),
    ( 54, 'imagenes_cierre_json',       N'pij_imagen',  N'LEGACY — usar tabla registrarSeguimientoLead_imagen','NVARCHAR(MAX)'),
    ( 55, 'dni_cliente',                N'pij_cliente', N'DNI del cliente al cierre PIJ',         'NVARCHAR(16)'),
    -- Verificación en caja de sucursal (push caja → CRM)
    ( 60, 'caja_estado',                N'caja',        N'pendiente | verificado | rechazado',    'NVARCHAR(16)'),
    ( 61, 'caja_verificado_en',         N'caja',        N'Fecha/hora confirmación de caja',       'DATETIME2(0)'),
    ( 62, 'caja_comprobante_id',        N'caja',        N'ID/nro interno de comprobante de caja', 'NVARCHAR(64)'),
    ( 63, 'caja_motivo_rechazo',        N'caja',        N'Motivo si caja rechaza el cierre',      'NVARCHAR(300)'),
    ( 64, 'caja_sucursal',              N'caja',        N'Sucursal que confirmó (token sync)',    'NVARCHAR(32)'),
    ( 65, 'caja_confirmado_por',        N'caja',        N'Usuario de caja que confirmó la venta', 'NVARCHAR(200)')
) v(orden, columna, grupo, descripcion, tipo_nuevo)
ORDER BY v.orden;
GO

/* ---------------------------------------------------------------------------
   PASO 1 — Agregar columnas que falten (idempotente)
--------------------------------------------------------------------------- */

-- Medio de pago
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'forma_pago') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD forma_pago NVARCHAR(16) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'monto_cierre') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD monto_cierre DECIMAL(12, 2) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'monto_efectivo') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD monto_efectivo DECIMAL(12, 2) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'monto_transferencia') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD monto_transferencia DECIMAL(12, 2) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'fecha_cierre') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD fecha_cierre DATETIME2(0) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'fuente') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD fuente NVARCHAR(16) NULL;
GO

-- Adhesión / anexo / compras adicionales
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'serie_pij') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD serie_pij NVARCHAR(1) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'nro_adhesion') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD nro_adhesion NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'nro_anexo') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD nro_anexo NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'compras_adicionales_json') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD compras_adicionales_json NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'imagenes_cierre_json') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD imagenes_cierre_json NVARCHAR(MAX) NULL;
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.registrarSeguimientoLead') AND name = N'dni_cliente'
)
    ALTER TABLE dbo.registrarSeguimientoLead ADD dni_cliente NVARCHAR(16) NULL;
GO

-- Verificación en caja de sucursal (push caja → CRM)
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_estado') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD caja_estado NVARCHAR(16) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_verificado_en') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD caja_verificado_en DATETIME2(0) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_comprobante_id') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD caja_comprobante_id NVARCHAR(64) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_motivo_rechazo') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD caja_motivo_rechazo NVARCHAR(300) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_sucursal') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD caja_sucursal NVARCHAR(32) NULL;
GO
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'caja_confirmado_por') IS NULL
    ALTER TABLE dbo.registrarSeguimientoLead ADD caja_confirmado_por NVARCHAR(200) NULL;
GO

/* ---------------------------------------------------------------------------
   PASO 2 — SP_RegistrarSeguimientoLead con TODOS los parámetros planos
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
      -- Compras adicionales (JSON plano)
      @compras_adicionales_json NVARCHAR(MAX) = NULL,
      -- Imágenes de cierre PIJ (JSON plano)
      @imagenes_cierre_json NVARCHAR(MAX) = NULL,
      -- DNI cliente al cierre PIJ
      @dni_cliente NVARCHAR(16) = NULL,
      -- Verificación en caja de sucursal (push caja → CRM)
      @caja_estado NVARCHAR(16) = NULL,
      @caja_verificado_en DATETIME2(0) = NULL,
      @caja_comprobante_id NVARCHAR(64) = NULL,
      @caja_motivo_rechazo NVARCHAR(300) = NULL,
      @caja_sucursal NVARCHAR(32) = NULL,
      @caja_confirmado_por NVARCHAR(200) = NULL
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
            caja_confirmado_por
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
            @caja_confirmado_por
            );

        DECLARE @nuevoId INT = SCOPE_IDENTITY();

        EXEC dbo.SP_InsertarSeguimientoHijos
            @id_seguimiento           = @nuevoId,
            @lead_id                  = @lead_id,
            @compras_adicionales_json = @compras_adicionales_json,
            @imagenes_cierre_json     = @imagenes_cierre_json;

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
   PASO 3 — Diagnóstico post-ejecución (debe quedar todo OK)
--------------------------------------------------------------------------- */
SELECT
    faltantes = SUM(CASE WHEN COL_LENGTH('dbo.registrarSeguimientoLead', v.columna) IS NULL THEN 1 ELSE 0 END),
    total_esperadas = COUNT(*)
FROM (VALUES
    ('forma_pago'), ('monto_cierre'), ('monto_efectivo'), ('monto_transferencia'),
    ('fecha_cierre'), ('fuente'),
    ('serie_pij'), ('nro_adhesion'), ('nro_anexo'), ('compras_adicionales_json'), ('dni_cliente'),
    ('caja_estado'), ('caja_verificado_en'), ('caja_comprobante_id'),
    ('caja_motivo_rechazo'), ('caja_sucursal'), ('caja_confirmado_por')
) v(columna);

-- Si faltantes > 0, revisar permisos ALTER TABLE del usuario DBA.

/*
-- Ver último cierre con columnas planas:
SELECT TOP 5
    id, lead_id, resultado_entrevista, id_producto,
    numero_recibo, serie_pij, nro_adhesion, nro_anexo,
    forma_pago, monto_cierre, fecha_cierre, fuente,
    compras_adicionales_json
FROM dbo.registrarSeguimientoLead
WHERE resultado_entrevista = N'compro'
ORDER BY id DESC;
*/
