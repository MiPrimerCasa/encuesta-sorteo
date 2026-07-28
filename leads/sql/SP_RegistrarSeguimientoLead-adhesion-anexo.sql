-- =============================================================================
-- AMPLIACIÓN registrarSeguimientoLead — adhesión / anexo PIJ + compras adicionales
-- Base: STRSYSTEM
-- =============================================================================
-- NOTA (jul 2026): Si medio de pago YA está aplicado, usar el script unificado:
--   sql/registrarSeguimientoLead-columnas-planas-completas.sql
-- Ese archivo verifica qué falta, agrega solo columnas pendientes y actualiza el SP.
--
-- Este archivo se mantiene como referencia; el contenido es equivalente al unificado.
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------------------------------------------------------------------------
   1) Nuevas columnas en la tabla
--------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.registrarSeguimientoLead', 'serie_pij') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD serie_pij NVARCHAR(1) NULL;
END;
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'nro_adhesion') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD nro_adhesion NVARCHAR(10) NULL;
END;
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'nro_anexo') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD nro_anexo NVARCHAR(10) NULL;
END;
GO

IF COL_LENGTH('dbo.registrarSeguimientoLead', 'compras_adicionales_json') IS NULL
BEGIN
    ALTER TABLE dbo.registrarSeguimientoLead
        ADD compras_adicionales_json NVARCHAR(MAX) NULL;
END;
GO

/* ---------------------------------------------------------------------------
   2) SP de registro — parámetros adhesión/anexo + compras adicionales
   Incluye parámetros de medio de pago (medio-pago.sql) para un solo ALTER.
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
      -- Medio de pago (medio-pago.sql)
      @forma_pago NVARCHAR(16) = NULL,
      @monto_cierre DECIMAL(12, 2) = NULL,
      @monto_efectivo DECIMAL(12, 2) = NULL,
      @monto_transferencia DECIMAL(12, 2) = NULL,
      @fecha_cierre DATETIME2(0) = NULL,
      @fuente NVARCHAR(16) = NULL,
      -- Adhesión / anexo PIJ (venta principal)
      @serie_pij NVARCHAR(1) = NULL,
      @nro_adhesion NVARCHAR(10) = NULL,
      @nro_anexo NVARCHAR(10) = NULL,
      -- Compras adicionales (array JSON plano para el DBA)
      @compras_adicionales_json NVARCHAR(MAX) = NULL
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
            compras_adicionales_json
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
            @compras_adicionales_json
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
   3) Backfill opcional — rellenar columnas planas desde numero_recibo / JSON
   (Ejecutar una vez; revisar antes en entorno de prueba)
--------------------------------------------------------------------------- */
/*
-- 3a) Venta principal PIJ: parsear numero_recibo
UPDATE s
SET
    serie_pij    = p.serie,
    nro_adhesion = p.nro_adhesion,
    nro_anexo    = p.nro_anexo
FROM dbo.registrarSeguimientoLead s
OUTER APPLY dbo.fn_ParseReciboPij(s.numero_recibo) p
WHERE COALESCE(s.id_producto, JSON_VALUE(s.seguimiento_json, '$.idProducto')) = N'prod-pij'
  AND NULLIF(LTRIM(RTRIM(s.numero_recibo)), N'') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(s.numero_recibo)), N'-') IS NOT NULL
  AND (s.serie_pij IS NULL OR s.nro_adhesion IS NULL);

-- 3b) Compras adicionales: armar compras_adicionales_json desde seguimiento_json
;WITH filas AS (
    SELECT
        s.id,
        compras_json = COALESCE(
            NULLIF(LTRIM(RTRIM(s.compras_adicionales_json)), N''),
            JSON_QUERY(s.seguimiento_json, '$.comprasAdicionales')
        )
    FROM dbo.registrarSeguimientoLead s
    WHERE ISJSON(s.seguimiento_json) = 1
      AND ISJSON(COALESCE(JSON_QUERY(s.seguimiento_json, '$.comprasAdicionales'), N'[]')) = 1
      AND (SELECT COUNT(*) FROM OPENJSON(JSON_QUERY(s.seguimiento_json, '$.comprasAdicionales'))) > 0
)
UPDATE s
SET compras_adicionales_json = (
    SELECT
        j.id,
        j.idProducto,
        j.estadoPago,
        j.idBarrio,
        j.numeroRecibo,
        j.fechaCierre,
        j.formaPago,
        j.montoCierre,
        j.montoEfectivo,
        j.montoTransferencia,
        serie       = p.serie,
        nroAdhesion = p.nro_adhesion,
        nroAnexo    = p.nro_anexo
    FROM OPENJSON(f.compras_json)
    WITH (
        id                 NVARCHAR(64)   '$.id',
        idProducto         NVARCHAR(32)   '$.idProducto',
        estadoPago         NVARCHAR(16)   '$.estadoPago',
        idBarrio           NVARCHAR(32)   '$.idBarrio',
        numeroRecibo       NVARCHAR(80)   '$.numeroRecibo',
        fechaCierre        NVARCHAR(32)   '$.fechaCierre',
        formaPago          NVARCHAR(16)   '$.formaPago',
        montoCierre        DECIMAL(12, 2) '$.montoCierre',
        montoEfectivo      DECIMAL(12, 2) '$.montoEfectivo',
        montoTransferencia DECIMAL(12, 2) '$.montoTransferencia'
    ) AS j
    OUTER APPLY dbo.fn_ParseReciboPij(j.numeroRecibo) p
    FOR JSON PATH
)
FROM dbo.registrarSeguimientoLead s
INNER JOIN filas f ON f.id = s.id
WHERE s.compras_adicionales_json IS NULL
   OR LTRIM(RTRIM(s.compras_adicionales_json)) = N'';
*/

/* ---------------------------------------------------------------------------
   4) Consulta de verificación para el DBA
--------------------------------------------------------------------------- */
/*
SELECT TOP 50
    s.id,
    s.lead_id,
    s.id_producto,
    s.numero_recibo,
    s.serie_pij,
    s.nro_adhesion,
    s.nro_anexo,
    s.compras_adicionales_json,
    -- Comparar con parseo en vivo
    p.serie        AS parse_serie,
    p.nro_adhesion AS parse_adhesion,
    p.nro_anexo    AS parse_anexo,
    JSON_VALUE(s.seguimiento_json, '$.numeroRecibo') AS json_numero_recibo
FROM dbo.registrarSeguimientoLead s
OUTER APPLY dbo.fn_ParseReciboPij(s.numero_recibo) p
WHERE s.resultado_entrevista = N'compro'
ORDER BY s.id DESC;

-- Desglosar compras adicionales planas:
SELECT
    s.id AS seguimiento_id,
    s.lead_id,
    c.id,
    c.idProducto,
    c.serie,
    c.nroAdhesion,
    c.nroAnexo,
    c.numeroRecibo,
    c.fechaCierre,
    c.formaPago,
    c.montoCierre
FROM dbo.registrarSeguimientoLead s
CROSS APPLY OPENJSON(s.compras_adicionales_json)
WITH (
    id                 NVARCHAR(64)   '$.id',
    idProducto         NVARCHAR(32)   '$.idProducto',
    serie              NVARCHAR(1)    '$.serie',
    nroAdhesion        NVARCHAR(10)   '$.nroAdhesion',
    nroAnexo           NVARCHAR(10)   '$.nroAnexo',
    numeroRecibo       NVARCHAR(80)   '$.numeroRecibo',
    fechaCierre        NVARCHAR(32)   '$.fechaCierre',
    formaPago          NVARCHAR(16)   '$.formaPago',
    montoCierre        DECIMAL(12, 2) '$.montoCierre'
) AS c
WHERE ISJSON(s.compras_adicionales_json) = 1
ORDER BY s.id DESC;
*/

/*
  --- Esquema esperado de compras_adicionales_json (ejemplo) ---

  [
    {
      "id": "uuid-compra-1",
      "idProducto": "prod-pij",
      "estadoPago": "entrega_33",
      "serie": "B",
      "nroAdhesion": "200",
      "nroAnexo": "45",
      "numeroRecibo": "B200/300 ANEXO 45/300",
      "fechaCierre": "2026-07-01T15:30:00",
      "formaPago": "efectivo",
      "montoCierre": 33000
    },
    {
      "id": "uuid-compra-2",
      "idProducto": "prod-terreno",
      "estadoPago": "sena",
      "idBarrio": "barrio-12",
      "numeroRecibo": "45892",
      "serie": null,
      "nroAdhesion": null,
      "nroAnexo": null,
      "fechaCierre": "2026-07-05T10:00:00"
    }
  ]
*/
