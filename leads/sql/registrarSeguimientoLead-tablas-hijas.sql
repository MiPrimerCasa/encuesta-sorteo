-- =============================================================================
-- registrarSeguimientoLead — tablas hijas planas (compras + imágenes)
-- Base: STRSYSTEM
-- =============================================================================
-- Objetivo:
--   Separar compras adicionales e imágenes de cierre PIJ en tablas propias,
--   en lugar de JSON en la fila principal.
--
-- ORDEN DBA (antes de migración y deploy app):
--   1) sql/registrarSeguimientoLead-tablas-hijas.sql   (este archivo)
--   2) sql/registrarSeguimientoLead-columnas-planas-completas.sql
--   3) sql/SP_ExportarCierresParaBloqueo.sql
--   4) sql/MigrarSeguimientoJsonAColumnasPlanas.sql
--
-- La app Node sigue enviando @compras_adicionales_json y @imagenes_cierre_json
-- al SP principal; el SP desglosa en tablas hijas. Los bytes de imagen van en
-- columna contenido (VARBINARY) vía SP_RegistrarImagenCierrePij.
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------------------------------------------------------------------------
   TABLA — compras adicionales (una fila por venta extra)
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.registrarSeguimientoLead_compra', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.registrarSeguimientoLead_compra (
        id                  INT IDENTITY(1, 1) NOT NULL,
        id_seguimiento      INT                NOT NULL,
        lead_id             INT                NOT NULL,
        id_compra           NVARCHAR(36)       NOT NULL,
        orden               SMALLINT           NOT NULL CONSTRAINT DF_rSL_compra_orden DEFAULT (0),
        id_producto         NVARCHAR(32)       NULL,
        estado_pago         NVARCHAR(16)       NULL,
        id_barrio           NVARCHAR(32)       NULL,
        numero_recibo       NVARCHAR(80)       NULL,
        serie_pij           NVARCHAR(1)        NULL,
        nro_adhesion        NVARCHAR(10)       NULL,
        nro_anexo           NVARCHAR(10)       NULL,
        forma_pago          NVARCHAR(16)       NULL,
        monto_cierre        DECIMAL(12, 2)     NULL,
        monto_efectivo      DECIMAL(12, 2)     NULL,
        monto_transferencia DECIMAL(12, 2)     NULL,
        fecha_cierre        DATETIME2(0)       NULL,
        CONSTRAINT PK_registrarSeguimientoLead_compra PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_rSL_compra_seguimiento_id UNIQUE (id_seguimiento, id_compra)
    );

    CREATE INDEX IX_rSL_compra_seguimiento ON dbo.registrarSeguimientoLead_compra (id_seguimiento);
    CREATE INDEX IX_rSL_compra_lead        ON dbo.registrarSeguimientoLead_compra (lead_id);
END;
GO

/* ---------------------------------------------------------------------------
   TABLA — imágenes de cierre PIJ (una fila por foto / venta)
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.registrarSeguimientoLead_imagen', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.registrarSeguimientoLead_imagen (
        id                  INT IDENTITY(1, 1) NOT NULL,
        id_seguimiento      INT                NOT NULL,
        lead_id             INT                NOT NULL,
        id_imagen           NVARCHAR(36)       NOT NULL,
        venta_key           NVARCHAR(36)       NOT NULL,
        tipo_imagen         NVARCHAR(16)       NOT NULL,
        mime_type           NVARCHAR(32)       NULL,
        nombre_original     NVARCHAR(260)      NULL,
        tamano_bytes        INT                NULL,
        storage_path        NVARCHAR(500)      NULL,
        contenido           VARBINARY(MAX)     NULL,
        operador_id         INT                NULL,
        subido_en           DATETIME2(0)       NULL,
        CONSTRAINT PK_registrarSeguimientoLead_imagen PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_rSL_imagen_slot UNIQUE (id_seguimiento, venta_key, tipo_imagen)
    );

    CREATE INDEX IX_rSL_imagen_seguimiento ON dbo.registrarSeguimientoLead_imagen (id_seguimiento);
    CREATE INDEX IX_rSL_imagen_lead        ON dbo.registrarSeguimientoLead_imagen (lead_id);
    CREATE INDEX IX_rSL_imagen_venta       ON dbo.registrarSeguimientoLead_imagen (id_seguimiento, venta_key);
END;
GO

/* ---------------------------------------------------------------------------
   SP auxiliar — insertar compras e imágenes desde JSON (app Node)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_InsertarSeguimientoHijos
    @id_seguimiento           INT,
    @lead_id                  INT,
    @compras_adicionales_json NVARCHAR(MAX) = NULL,
    @imagenes_cierre_json     NVARCHAR(MAX) = NULL
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;

    IF @id_seguimiento IS NULL OR @lead_id IS NULL
        RETURN;

    /* Compras adicionales */
    IF ISJSON(@compras_adicionales_json) = 1
       AND EXISTS (SELECT 1 FROM OPENJSON(@compras_adicionales_json))
    BEGIN
        INSERT INTO dbo.registrarSeguimientoLead_compra (
            id_seguimiento,
            lead_id,
            id_compra,
            orden,
            id_producto,
            estado_pago,
            id_barrio,
            numero_recibo,
            serie_pij,
            nro_adhesion,
            nro_anexo,
            forma_pago,
            monto_cierre,
            monto_efectivo,
            monto_transferencia,
            fecha_cierre
        )
        SELECT
            @id_seguimiento,
            @lead_id,
            j.id_compra,
            j.orden,
            j.id_producto,
            j.estado_pago,
            j.id_barrio,
            j.numero_recibo,
            j.serie_pij,
            j.nro_adhesion,
            j.nro_anexo,
            j.forma_pago,
            j.monto_cierre,
            j.monto_efectivo,
            j.monto_transferencia,
            j.fecha_cierre
        FROM OPENJSON(@compras_adicionales_json) AS arr
        CROSS APPLY (
            SELECT
                orden               = TRY_CAST(arr.[key] AS SMALLINT),
                id_compra           = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.id'))), N''),
                id_producto         = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.idProducto'))), N''),
                estado_pago         = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.estadoPago'))), N''),
                id_barrio           = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.idBarrio'))), N''),
                numero_recibo       = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.numeroRecibo'))), N''),
                serie_pij           = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.serie'))), N''),
                nro_adhesion        = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.nroAdhesion'))), N''),
                nro_anexo           = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.nroAnexo'))), N''),
                forma_pago          = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.formaPago'))), N''),
                monto_cierre        = TRY_CAST(JSON_VALUE(arr.value, '$.montoCierre') AS DECIMAL(12, 2)),
                monto_efectivo      = TRY_CAST(JSON_VALUE(arr.value, '$.montoEfectivo') AS DECIMAL(12, 2)),
                monto_transferencia = TRY_CAST(JSON_VALUE(arr.value, '$.montoTransferencia') AS DECIMAL(12, 2)),
                fecha_cierre        = COALESCE(
                    TRY_CONVERT(DATETIME2(0), JSON_VALUE(arr.value, '$.fechaCierre'), 126),
                    TRY_CONVERT(DATETIME2(0), JSON_VALUE(arr.value, '$.fechaCierre'), 127)
                )
        ) AS j
        WHERE j.id_compra IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.registrarSeguimientoLead_compra c
              WHERE c.id_seguimiento = @id_seguimiento
                AND c.id_compra = j.id_compra
          );
    END;

    /* Imágenes — metadatos; bytes opcionales en contenido */
    IF ISJSON(@imagenes_cierre_json) = 1
       AND EXISTS (SELECT 1 FROM OPENJSON(@imagenes_cierre_json))
    BEGIN
        INSERT INTO dbo.registrarSeguimientoLead_imagen (
            id_seguimiento,
            lead_id,
            id_imagen,
            venta_key,
            tipo_imagen,
            mime_type,
            nombre_original,
            tamano_bytes,
            storage_path,
            operador_id,
            subido_en
        )
        SELECT
            @id_seguimiento,
            @lead_id,
            j.id_imagen,
            j.venta_key,
            j.tipo_imagen,
            j.mime_type,
            j.nombre_original,
            j.tamano_bytes,
            j.storage_path,
            j.operador_id,
            j.subido_en
        FROM OPENJSON(@imagenes_cierre_json)
        WITH (
            id_imagen       NVARCHAR(36)  '$.id',
            venta_key       NVARCHAR(36)  '$.ventaKey',
            tipo_imagen     NVARCHAR(16)  '$.tipo',
            mime_type       NVARCHAR(32)  '$.mimeType',
            nombre_original NVARCHAR(260) '$.nombreOriginal',
            tamano_bytes    INT           '$.tamanoBytes',
            storage_path    NVARCHAR(500) '$.storagePath',
            operador_id     INT           '$.operadorId',
            subido_en_txt   NVARCHAR(32)  '$.subidoEn'
        ) AS raw
        CROSS APPLY (
            SELECT
                id_imagen = NULLIF(LTRIM(RTRIM(raw.id_imagen)), N''),
                venta_key = NULLIF(LTRIM(RTRIM(raw.venta_key)), N''),
                tipo_imagen = CASE LOWER(NULLIF(LTRIM(RTRIM(raw.tipo_imagen)), N''))
                    WHEN N'recibo' THEN N'img6'
                    WHEN N'comprobante_transferencia' THEN N'img7'
                    ELSE NULLIF(LTRIM(RTRIM(raw.tipo_imagen)), N'')
                END,
                mime_type = NULLIF(LTRIM(RTRIM(raw.mime_type)), N''),
                nombre_original = NULLIF(LTRIM(RTRIM(raw.nombre_original)), N''),
                tamano_bytes = raw.tamano_bytes,
                storage_path = NULLIF(LTRIM(RTRIM(raw.storage_path)), N''),
                operador_id = raw.operador_id,
                subido_en = COALESCE(
                    TRY_CONVERT(DATETIME2(0), raw.subido_en_txt, 126),
                    TRY_CONVERT(DATETIME2(0), raw.subido_en_txt, 127)
                )
        ) AS j
        WHERE j.id_imagen IS NOT NULL
          AND j.venta_key IS NOT NULL
          AND j.tipo_imagen IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.registrarSeguimientoLead_imagen i
              WHERE i.id_seguimiento = @id_seguimiento
                AND i.venta_key = j.venta_key
                AND i.tipo_imagen = j.tipo_imagen
          );
    END;
END;
GO

/* ---------------------------------------------------------------------------
   SP — registrar / actualizar bytes de una imagen
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_RegistrarImagenCierrePij
    @id_seguimiento  INT,
    @lead_id         INT,
    @id_imagen       NVARCHAR(36),
    @venta_key       NVARCHAR(36),
    @tipo_imagen     NVARCHAR(16),
    @mime_type       NVARCHAR(32)     = NULL,
    @nombre_original NVARCHAR(260)    = NULL,
    @tamano_bytes    INT              = NULL,
    @storage_path    NVARCHAR(500)    = NULL,
    @contenido       VARBINARY(MAX)   = NULL,
    @operador_id     INT              = NULL,
    @subido_en       DATETIME2(0)     = NULL
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @tipo NVARCHAR(16) = CASE LOWER(LTRIM(RTRIM(@tipo_imagen)))
        WHEN N'recibo' THEN N'img6'
        WHEN N'comprobante_transferencia' THEN N'img7'
        ELSE LTRIM(RTRIM(@tipo_imagen))
    END;

    IF @id_seguimiento IS NULL OR @lead_id IS NULL OR @id_imagen IS NULL
       OR @venta_key IS NULL OR @tipo IS NULL
    BEGIN
        SELECT 0 AS codigo, N'Faltan parámetros obligatorios.' AS mensaje;
        RETURN;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (
            SELECT 1
            FROM dbo.registrarSeguimientoLead_imagen
            WHERE id_seguimiento = @id_seguimiento
              AND venta_key = @venta_key
              AND tipo_imagen = @tipo
        )
        BEGIN
            UPDATE dbo.registrarSeguimientoLead_imagen
            SET
                id_imagen       = @id_imagen,
                mime_type       = COALESCE(@mime_type, mime_type),
                nombre_original = COALESCE(@nombre_original, nombre_original),
                tamano_bytes    = COALESCE(@tamano_bytes, tamano_bytes),
                storage_path    = COALESCE(@storage_path, storage_path),
                contenido       = COALESCE(@contenido, contenido),
                operador_id     = COALESCE(@operador_id, operador_id),
                subido_en       = COALESCE(@subido_en, subido_en, SYSDATETIME())
            WHERE id_seguimiento = @id_seguimiento
              AND venta_key = @venta_key
              AND tipo_imagen = @tipo;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.registrarSeguimientoLead_imagen (
                id_seguimiento, lead_id, id_imagen, venta_key, tipo_imagen,
                mime_type, nombre_original, tamano_bytes, storage_path,
                contenido, operador_id, subido_en
            )
            VALUES (
                @id_seguimiento, @lead_id, @id_imagen, @venta_key, @tipo,
                @mime_type, @nombre_original, @tamano_bytes, @storage_path,
                @contenido, @operador_id, COALESCE(@subido_en, SYSDATETIME())
            );
        END;

        COMMIT TRANSACTION;

        SELECT 1 AS codigo, N'Imagen registrada.' AS mensaje;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS codigo, ERROR_MESSAGE() AS mensaje;
    END CATCH;
END;
GO

GRANT EXECUTE ON dbo.SP_InsertarSeguimientoHijos TO [MPCSP];
GRANT EXECUTE ON dbo.SP_RegistrarImagenCierrePij TO [MPCSP];
GRANT SELECT ON dbo.registrarSeguimientoLead_compra TO [MPCSP];
GRANT SELECT ON dbo.registrarSeguimientoLead_imagen TO [MPCSP];
GO

/* Diagnóstico */
SELECT
    tabla = t.name,
    estado = N'OK'
FROM sys.tables t
WHERE t.name IN (N'registrarSeguimientoLead_compra', N'registrarSeguimientoLead_imagen')
  AND t.schema_id = SCHEMA_ID(N'dbo');
GO
