-- =============================================================================
-- MIGRACIÓN — seguimiento_json → columnas planas (registrarSeguimientoLead)
-- Base: STRSYSTEM
-- =============================================================================
-- Objetivo:
--   Rellenar columnas planas de TODAS las filas de historial de seguimiento
--   a partir de seguimiento_json (y numero_recibo donde aplica).
--
-- IMPORTANTE:
--   Cada fila de registrarSeguimientoLead es un snapshot del historial
--   (no solo el último estado del lead). Este script migra TODAS las filas.
--
-- PREREQUISITOS (ejecutar antes):
--   1) sql/registrarSeguimientoLead-tablas-hijas.sql
--   2) sql/registrarSeguimientoLead-columnas-planas-completas.sql
--   3) sql/SP_ExportarCierresParaBloqueo.sql  (crea fn_ParseReciboPij)
--
-- FLUJO RECOMENDADO DBA:
--   1) EXEC SP_MigrarSeguimientoJsonAPlano @modo = N'preview'
--   2) Revisar conteos y muestra de diferencias
--   3) EXEC SP_MigrarSeguimientoJsonAPlano @modo = N'aplicar', @solo_vacios = 1
--   4) EXEC SP_MigrarSeguimientoJsonAPlano @modo = N'verificar'
--   5) Si quedan huecos: @modo = N'aplicar', @priorizar_json = 1 (con cuidado)
--
-- @solo_vacios = 1 (default): solo completa columnas NULL/vacías (idempotente).
-- @priorizar_json = 1: el JSON pisa la columna plana si el JSON trae valor.
-- =============================================================================

USE [STRSYSTEM];
GO

CREATE OR ALTER PROCEDURE dbo.SP_MigrarSeguimientoJsonAPlano
    @modo             NVARCHAR(16) = N'preview',  -- preview | aplicar | verificar
    @solo_vacios      BIT          = 1,           -- 1 = no pisar planos ya cargados
    @priorizar_json   BIT          = 0,           -- 1 = JSON gana sobre plano existente
    @lead_id          INT          = NULL,        -- filtrar un lead (prueba)
    @lote_max         INT          = NULL         -- límite de filas a actualizar (NULL = todas)
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;

    IF @modo NOT IN (N'preview', N'aplicar', N'verificar')
    BEGIN
        RAISERROR(N'@modo debe ser preview, aplicar o verificar.', 16, 1);
        RETURN;
    END;

    IF @lote_max IS NOT NULL AND (@lote_max < 1 OR @lote_max > 500000)
    BEGIN
        RAISERROR(N'@lote_max debe estar entre 1 y 500000.', 16, 1);
        RETURN;
    END;

    /* ------------------------------------------------------------------
       Vista de trabajo: valores destino calculados desde JSON + recibo
    ------------------------------------------------------------------ */
    IF OBJECT_ID('tempdb..#mig') IS NOT NULL DROP TABLE #mig;

    ;WITH candidatos AS (
        SELECT
            s.*,
            rn = ROW_NUMBER() OVER (ORDER BY s.id)
        FROM dbo.registrarSeguimientoLead s
        WHERE (@lead_id IS NULL OR s.lead_id = @lead_id)
          AND ISJSON(s.seguimiento_json) = 1
    ),
    limitados AS (
        SELECT *
        FROM candidatos
        WHERE @lote_max IS NULL OR rn <= @lote_max
    ),
    calc AS (
        SELECT
            s.id,
            s.lead_id,

            /* --- Campos base desde JSON --- */
            j_confirmo = CASE JSON_VALUE(s.seguimiento_json, '$.confirmoEntrevista')
                            WHEN 'true'  THEN CAST(1 AS BIT)
                            WHEN 'false' THEN CAST(0 AS BIT)
                            ELSE NULL END,
            j_canal               = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.canal'))), N''),
            j_hubo_entrevista     = CASE JSON_VALUE(s.seguimiento_json, '$.huboEntrevista')
                                        WHEN 'true'  THEN CAST(1 AS BIT)
                                        WHEN 'false' THEN CAST(0 AS BIT)
                                        ELSE NULL END,
            j_resultado           = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.resultadoEntrevista'))), N''),
            j_horario             = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.horarioEntrevistaPropuesto'))), N''),
            j_fecha_reagenda      = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.fechaReagenda'))), N''),
            j_pij_promotor        = CASE JSON_VALUE(s.seguimiento_json, '$.seguimientoPijPromotor')
                                        WHEN 'true'  THEN CAST(1 AS BIT)
                                        WHEN 'false' THEN CAST(0 AS BIT)
                                        ELSE NULL END,
            j_id_producto         = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.idProducto'))), N''),
            j_estado_pago         = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.estadoPago'))), N''),
            j_id_barrio           = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.idBarrio'))), N''),
            j_numero_recibo       = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.numeroRecibo'))), N''),
            j_brindo_referidos    = CASE JSON_VALUE(s.seguimiento_json, '$.brindoReferidos')
                                        WHEN 'true'  THEN CAST(1 AS BIT)
                                        WHEN 'false' THEN CAST(0 AS BIT)
                                        ELSE NULL END,
            j_referidos_json      = JSON_QUERY(s.seguimiento_json, '$.referidos'),
            j_observaciones       = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.observaciones'))), N''),
            j_operador_id         = TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.operadorId') AS INT),
            j_operador_rol        = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.operadorRol'))), N''),
            j_operador_nombre     = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.operadorNombre'))), N''),
            j_fuente              = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.fuente'))), N''),
            j_forma_pago          = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.formaPago'))), N''),
            j_monto_cierre        = TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.montoCierre') AS DECIMAL(12, 2)),
            j_monto_efectivo      = TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.montoEfectivo') AS DECIMAL(12, 2)),
            j_monto_transferencia = TRY_CAST(JSON_VALUE(s.seguimiento_json, '$.montoTransferencia') AS DECIMAL(12, 2)),
            j_fecha_cierre        = COALESCE(
                                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(s.seguimiento_json, '$.fechaCierre'), 126),
                                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(s.seguimiento_json, '$.fechaCierre'), 127)
                                    ),
            j_compras_json        = JSON_QUERY(s.seguimiento_json, '$.comprasAdicionales'),
            j_imagenes_json       = COALESCE(
                CASE
                    WHEN ISJSON(JSON_QUERY(s.seguimiento_json, '$.imagenesCierre')) = 1
                         AND (SELECT COUNT(*) FROM OPENJSON(JSON_QUERY(s.seguimiento_json, '$.imagenesCierre'))) > 0
                    THEN JSON_QUERY(s.seguimiento_json, '$.imagenesCierre')
                END,
                CASE
                    WHEN ISJSON(s.imagenes_cierre_json) = 1
                         AND (SELECT COUNT(*) FROM OPENJSON(s.imagenes_cierre_json)) > 0
                    THEN s.imagenes_cierre_json
                END
            ),
            j_dni_cliente         = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.dniCliente'))), N''),

            /* Serie / adhesión / anexo explícitos en JSON (además del parseo del recibo) */
            j_serie_pij_raw = COALESCE(
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.seriePij'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.serie'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.grupo'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.grupoPij'))), N'')
            ),
            j_nro_adhesion = COALESCE(
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.nroAdhesion'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.adhesion'))), N'')
            ),
            j_nro_anexo = COALESCE(
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.nroAnexo'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.anexo'))), N'')
            ),

            /* --- Verificación en caja de sucursal --- */
            j_caja_estado         = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.cajaEstado'))), N''),
            j_caja_verificado_en  = COALESCE(
                                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(s.seguimiento_json, '$.cajaVerificadoEn'), 126),
                                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(s.seguimiento_json, '$.cajaVerificadoEn'), 127)
                                    ),
            j_caja_comprobante_id = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.cajaComprobanteId'))), N''),
            j_caja_motivo_rechazo = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.cajaMotivoRechazo'))), N''),
            j_caja_sucursal       = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.cajaSucursal'))), N''),
            j_caja_confirmado_por = NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.cajaConfirmadoPor'))), N''),

            /* Recibo efectivo para parseo PIJ */
            recibo_efectivo = COALESCE(
                NULLIF(LTRIM(RTRIM(s.numero_recibo)), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.numeroRecibo'))), N'')
            ),
            producto_efectivo = COALESCE(
                NULLIF(LTRIM(RTRIM(s.id_producto)), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.idProducto'))), N'')
            )
        FROM limitados s
    )
    SELECT
        c.*,
        /* Grupo A/B: prioriza JSON (seriePij/serie/grupo), luego parseo del recibo */
        serie = COALESCE(
            CASE
                WHEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(c.j_serie_pij_raw, N''), N'GRUPO', N''), N' ', N''), 1)) IN (N'A', N'B')
                    THEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(c.j_serie_pij_raw, N''), N'GRUPO', N''), N' ', N''), 1))
                ELSE NULL
            END,
            p.serie
        ),
        nro_adhesion = COALESCE(
            NULLIF(REPLACE(REPLACE(ISNULL(c.j_nro_adhesion, N''), N'/', N''), N' ', N''), N''),
            p.nro_adhesion
        ),
        nro_anexo = COALESCE(
            NULLIF(REPLACE(REPLACE(ISNULL(c.j_nro_anexo, N''), N'/', N''), N' ', N''), N''),
            p.nro_anexo
        ),
        compras_adicionales_destino = CASE
            WHEN ISJSON(COALESCE(c.j_compras_json, N'[]')) = 1
                 AND (SELECT COUNT(*) FROM OPENJSON(c.j_compras_json)) > 0
            THEN (
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
                    serie = COALESCE(
                        CASE
                            WHEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(COALESCE(j.seriePij, j.serie, j.grupo), N''), N'GRUPO', N''), N' ', N''), 1)) IN (N'A', N'B')
                                THEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(COALESCE(j.seriePij, j.serie, j.grupo), N''), N'GRUPO', N''), N' ', N''), 1))
                            ELSE NULL
                        END,
                        px.serie
                    ),
                    nroAdhesion = COALESCE(
                        NULLIF(REPLACE(REPLACE(ISNULL(COALESCE(j.nroAdhesion, j.adhesion), N''), N'/', N''), N' ', N''), N''),
                        px.nro_adhesion
                    ),
                    nroAnexo = COALESCE(
                        NULLIF(REPLACE(REPLACE(ISNULL(COALESCE(j.nroAnexo, j.anexo), N''), N'/', N''), N' ', N''), N''),
                        px.nro_anexo
                    )
                FROM OPENJSON(c.j_compras_json)
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
                    montoTransferencia DECIMAL(12, 2) '$.montoTransferencia',
                    seriePij           NVARCHAR(8)    '$.seriePij',
                    serie              NVARCHAR(8)    '$.serie',
                    grupo              NVARCHAR(16)   '$.grupo',
                    nroAdhesion        NVARCHAR(16)   '$.nroAdhesion',
                    adhesion           NVARCHAR(16)   '$.adhesion',
                    nroAnexo           NVARCHAR(16)   '$.nroAnexo',
                    anexo              NVARCHAR(16)   '$.anexo'
                ) AS j
                OUTER APPLY dbo.fn_ParseReciboPij(j.numeroRecibo) px
                FOR JSON PATH
            )
            ELSE NULL
        END
    INTO #mig
    FROM calc c
    OUTER APPLY dbo.fn_ParseReciboPij(
        CASE WHEN c.producto_efectivo = N'prod-pij' THEN c.recibo_efectivo ELSE NULL END
    ) p;

    /* ------------------------------------------------------------------
       PREVIEW — cuántas filas se tocarían por campo
    ------------------------------------------------------------------ */
    IF @modo = N'preview'
    BEGIN
        SELECT
            total_filas_json = (SELECT COUNT(*) FROM #mig),
            filas_con_compras_adicionales = (
                SELECT COUNT(*) FROM #mig WHERE compras_adicionales_destino IS NOT NULL
            ),
            filas_con_imagenes = (
                SELECT COUNT(*) FROM #mig WHERE j_imagenes_json IS NOT NULL
            ),
            filas_pij_con_serie = (
                SELECT COUNT(*)
                FROM #mig
                WHERE producto_efectivo = N'prod-pij' AND serie IS NOT NULL
            ),
            filas_pij_sin_serie = (
                SELECT COUNT(*)
                FROM #mig
                WHERE producto_efectivo = N'prod-pij'
                  AND recibo_efectivo IS NOT NULL
                  AND serie IS NULL
            ),
            filas_sin_compras_en_tabla = (
                SELECT COUNT(*)
                FROM #mig m
                WHERE m.compras_adicionales_destino IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id
                  )
            ),
            filas_sin_imagenes_en_tabla = (
                SELECT COUNT(*)
                FROM #mig m
                WHERE m.j_imagenes_json IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id
                  )
            );

        SELECT campo, filas_a_completar
        FROM (
            SELECT campo = N'canal', filas_a_completar = COUNT(*)
            FROM #mig m
            INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE (@solo_vacios = 0 OR s.canal IS NULL)
              AND (@priorizar_json = 1 OR s.canal IS NULL)
              AND m.j_canal IS NOT NULL
              AND (s.canal IS NULL OR (@priorizar_json = 1 AND s.canal <> m.j_canal))

            UNION ALL SELECT N'numero_recibo', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.j_numero_recibo IS NOT NULL
              AND (@solo_vacios = 0 OR NULLIF(LTRIM(RTRIM(s.numero_recibo)), N'') IS NULL
                   OR (@priorizar_json = 1 AND s.numero_recibo <> m.j_numero_recibo))

            UNION ALL SELECT N'forma_pago', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.j_forma_pago IS NOT NULL
              AND (@solo_vacios = 0 OR s.forma_pago IS NULL
                   OR (@priorizar_json = 1 AND s.forma_pago <> m.j_forma_pago))

            UNION ALL SELECT N'fecha_cierre', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.j_fecha_cierre IS NOT NULL
              AND (@solo_vacios = 0 OR s.fecha_cierre IS NULL
                   OR (@priorizar_json = 1 AND s.fecha_cierre <> m.j_fecha_cierre))

            UNION ALL SELECT N'nro_adhesion', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.nro_adhesion IS NOT NULL
              AND (@solo_vacios = 0 OR s.nro_adhesion IS NULL
                   OR (@priorizar_json = 1 AND s.nro_adhesion <> m.nro_adhesion))

            UNION ALL SELECT N'serie_pij', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.serie IS NOT NULL
              AND (@solo_vacios = 0 OR s.serie_pij IS NULL
                   OR (@priorizar_json = 1 AND s.serie_pij <> m.serie))

            UNION ALL SELECT N'nro_anexo', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.nro_anexo IS NOT NULL
              AND (@solo_vacios = 0 OR s.nro_anexo IS NULL
                   OR (@priorizar_json = 1 AND ISNULL(s.nro_anexo, N'') <> ISNULL(m.nro_anexo, N'')))

            UNION ALL SELECT N'dni_cliente', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.j_dni_cliente IS NOT NULL
              AND (@solo_vacios = 0 OR s.dni_cliente IS NULL
                   OR (@priorizar_json = 1 AND s.dni_cliente <> m.j_dni_cliente))

            UNION ALL SELECT N'compras_adicionales_json', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.compras_adicionales_destino IS NOT NULL
              AND (@solo_vacios = 0 OR s.compras_adicionales_json IS NULL
                   OR (@priorizar_json = 1 AND s.compras_adicionales_json <> m.compras_adicionales_destino))

            UNION ALL SELECT N'caja_estado', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.j_caja_estado IS NOT NULL
              AND (@solo_vacios = 0 OR s.caja_estado IS NULL
                   OR (@priorizar_json = 1 AND s.caja_estado <> m.j_caja_estado))

            UNION ALL SELECT N'caja_confirmado_por', COUNT(*)
            FROM #mig m INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
            WHERE m.j_caja_confirmado_por IS NOT NULL
              AND (@solo_vacios = 0 OR s.caja_confirmado_por IS NULL
                   OR (@priorizar_json = 1 AND s.caja_confirmado_por <> m.j_caja_confirmado_por))
        ) x
        ORDER BY filas_a_completar DESC;

        /* Muestra de 30 filas con huecos más comunes */
        SELECT TOP 30
            s.id,
            s.lead_id,
            s.resultado_entrevista,
            plano_numero_recibo = s.numero_recibo,
            json_numero_recibo  = m.j_numero_recibo,
            plano_forma_pago    = s.forma_pago,
            json_forma_pago     = m.j_forma_pago,
            plano_fecha_cierre  = s.fecha_cierre,
            json_fecha_cierre   = m.j_fecha_cierre,
            plano_adhesion      = s.nro_adhesion,
            parse_adhesion      = m.nro_adhesion,
            plano_anexo         = s.nro_anexo,
            parse_anexo         = m.nro_anexo,
            tiene_compras_json  = CASE WHEN m.compras_adicionales_destino IS NOT NULL THEN 1 ELSE 0 END
        FROM #mig m
        INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
        WHERE
            (s.numero_recibo IS NULL AND m.j_numero_recibo IS NOT NULL)
            OR (s.forma_pago IS NULL AND m.j_forma_pago IS NOT NULL)
            OR (s.fecha_cierre IS NULL AND m.j_fecha_cierre IS NOT NULL)
            OR (s.nro_adhesion IS NULL AND m.nro_adhesion IS NOT NULL)
            OR (s.compras_adicionales_json IS NULL AND m.compras_adicionales_destino IS NOT NULL)
        ORDER BY s.id DESC;

        RETURN;
    END;

    /* ------------------------------------------------------------------
       APLICAR — UPDATE masivo (idempotente con @solo_vacios = 1)
    ------------------------------------------------------------------ */
    IF @modo = N'aplicar'
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            UPDATE s
            SET
                confirmo_entrevista = CASE
                    WHEN @priorizar_json = 1 AND m.j_confirmo IS NOT NULL THEN m.j_confirmo
                    WHEN @solo_vacios = 1 THEN COALESCE(s.confirmo_entrevista, m.j_confirmo)
                    ELSE COALESCE(m.j_confirmo, s.confirmo_entrevista)
                END,
                canal = CASE
                    WHEN @priorizar_json = 1 AND m.j_canal IS NOT NULL THEN m.j_canal
                    WHEN @solo_vacios = 1 THEN COALESCE(s.canal, m.j_canal)
                    ELSE COALESCE(m.j_canal, s.canal)
                END,
                hubo_entrevista = CASE
                    WHEN @priorizar_json = 1 AND m.j_hubo_entrevista IS NOT NULL THEN m.j_hubo_entrevista
                    WHEN @solo_vacios = 1 THEN COALESCE(s.hubo_entrevista, m.j_hubo_entrevista)
                    ELSE COALESCE(m.j_hubo_entrevista, s.hubo_entrevista)
                END,
                resultado_entrevista = CASE
                    WHEN @priorizar_json = 1 AND m.j_resultado IS NOT NULL THEN m.j_resultado
                    WHEN @solo_vacios = 1 THEN COALESCE(s.resultado_entrevista, m.j_resultado)
                    ELSE COALESCE(m.j_resultado, s.resultado_entrevista)
                END,
                horario_entrevista_propuesto = CASE
                    WHEN @priorizar_json = 1 AND m.j_horario IS NOT NULL THEN m.j_horario
                    WHEN @solo_vacios = 1 THEN COALESCE(s.horario_entrevista_propuesto, m.j_horario)
                    ELSE COALESCE(m.j_horario, s.horario_entrevista_propuesto)
                END,
                fecha_reagenda = CASE
                    WHEN @priorizar_json = 1 AND m.j_fecha_reagenda IS NOT NULL THEN m.j_fecha_reagenda
                    WHEN @solo_vacios = 1 THEN COALESCE(s.fecha_reagenda, m.j_fecha_reagenda)
                    ELSE COALESCE(m.j_fecha_reagenda, s.fecha_reagenda)
                END,
                seguimiento_pij_promotor = CASE
                    WHEN @priorizar_json = 1 AND m.j_pij_promotor IS NOT NULL THEN m.j_pij_promotor
                    WHEN @solo_vacios = 1 THEN COALESCE(s.seguimiento_pij_promotor, m.j_pij_promotor)
                    ELSE COALESCE(m.j_pij_promotor, s.seguimiento_pij_promotor)
                END,
                id_producto = CASE
                    WHEN @priorizar_json = 1 AND m.j_id_producto IS NOT NULL THEN m.j_id_producto
                    WHEN @solo_vacios = 1 THEN COALESCE(s.id_producto, m.j_id_producto)
                    ELSE COALESCE(m.j_id_producto, s.id_producto)
                END,
                estado_pago = CASE
                    WHEN @priorizar_json = 1 AND m.j_estado_pago IS NOT NULL THEN m.j_estado_pago
                    WHEN @solo_vacios = 1 THEN COALESCE(s.estado_pago, m.j_estado_pago)
                    ELSE COALESCE(m.j_estado_pago, s.estado_pago)
                END,
                id_barrio = CASE
                    WHEN @priorizar_json = 1 AND m.j_id_barrio IS NOT NULL THEN m.j_id_barrio
                    WHEN @solo_vacios = 1 THEN COALESCE(s.id_barrio, m.j_id_barrio)
                    ELSE COALESCE(m.j_id_barrio, s.id_barrio)
                END,
                numero_recibo = CASE
                    WHEN @priorizar_json = 1 AND m.j_numero_recibo IS NOT NULL THEN m.j_numero_recibo
                    WHEN @solo_vacios = 1 THEN COALESCE(NULLIF(LTRIM(RTRIM(s.numero_recibo)), N''), m.j_numero_recibo)
                    ELSE COALESCE(m.j_numero_recibo, s.numero_recibo)
                END,
                brindo_referidos = CASE
                    WHEN @priorizar_json = 1 AND m.j_brindo_referidos IS NOT NULL THEN m.j_brindo_referidos
                    WHEN @solo_vacios = 1 THEN COALESCE(s.brindo_referidos, m.j_brindo_referidos)
                    ELSE COALESCE(m.j_brindo_referidos, s.brindo_referidos)
                END,
                referidos_json = CASE
                    WHEN @priorizar_json = 1 AND m.j_referidos_json IS NOT NULL THEN m.j_referidos_json
                    WHEN @solo_vacios = 1 THEN COALESCE(s.referidos_json, m.j_referidos_json)
                    ELSE COALESCE(m.j_referidos_json, s.referidos_json)
                END,
                observaciones = CASE
                    WHEN @priorizar_json = 1 AND m.j_observaciones IS NOT NULL THEN LEFT(m.j_observaciones, 500)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.observaciones, LEFT(m.j_observaciones, 500))
                    ELSE COALESCE(LEFT(m.j_observaciones, 500), s.observaciones)
                END,
                operador_id = CASE
                    WHEN @priorizar_json = 1 AND m.j_operador_id IS NOT NULL THEN m.j_operador_id
                    WHEN @solo_vacios = 1 THEN COALESCE(s.operador_id, m.j_operador_id)
                    ELSE COALESCE(m.j_operador_id, s.operador_id)
                END,
                operador_rol = CASE
                    WHEN @priorizar_json = 1 AND m.j_operador_rol IS NOT NULL THEN m.j_operador_rol
                    WHEN @solo_vacios = 1 THEN COALESCE(s.operador_rol, m.j_operador_rol)
                    ELSE COALESCE(m.j_operador_rol, s.operador_rol)
                END,
                operador_nombre = CASE
                    WHEN @priorizar_json = 1 AND m.j_operador_nombre IS NOT NULL THEN LEFT(m.j_operador_nombre, 200)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.operador_nombre, LEFT(m.j_operador_nombre, 200))
                    ELSE COALESCE(LEFT(m.j_operador_nombre, 200), s.operador_nombre)
                END,
                fuente = CASE
                    WHEN @priorizar_json = 1 AND m.j_fuente IS NOT NULL THEN m.j_fuente
                    WHEN @solo_vacios = 1 THEN COALESCE(s.fuente, m.j_fuente)
                    ELSE COALESCE(m.j_fuente, s.fuente)
                END,
                forma_pago = CASE
                    WHEN @priorizar_json = 1 AND m.j_forma_pago IS NOT NULL THEN m.j_forma_pago
                    WHEN @solo_vacios = 1 THEN COALESCE(s.forma_pago, m.j_forma_pago)
                    ELSE COALESCE(m.j_forma_pago, s.forma_pago)
                END,
                monto_cierre = CASE
                    WHEN @priorizar_json = 1 AND m.j_monto_cierre IS NOT NULL THEN m.j_monto_cierre
                    WHEN @solo_vacios = 1 THEN COALESCE(s.monto_cierre, m.j_monto_cierre)
                    ELSE COALESCE(m.j_monto_cierre, s.monto_cierre)
                END,
                monto_efectivo = CASE
                    WHEN @priorizar_json = 1 AND m.j_monto_efectivo IS NOT NULL THEN m.j_monto_efectivo
                    WHEN @solo_vacios = 1 THEN COALESCE(s.monto_efectivo, m.j_monto_efectivo)
                    ELSE COALESCE(m.j_monto_efectivo, s.monto_efectivo)
                END,
                monto_transferencia = CASE
                    WHEN @priorizar_json = 1 AND m.j_monto_transferencia IS NOT NULL THEN m.j_monto_transferencia
                    WHEN @solo_vacios = 1 THEN COALESCE(s.monto_transferencia, m.j_monto_transferencia)
                    ELSE COALESCE(m.j_monto_transferencia, s.monto_transferencia)
                END,
                fecha_cierre = CASE
                    WHEN @priorizar_json = 1 AND m.j_fecha_cierre IS NOT NULL THEN m.j_fecha_cierre
                    WHEN @solo_vacios = 1 THEN COALESCE(s.fecha_cierre, m.j_fecha_cierre)
                    ELSE COALESCE(m.j_fecha_cierre, s.fecha_cierre)
                END,
                serie_pij = CASE
                    WHEN @priorizar_json = 1 AND m.serie IS NOT NULL THEN m.serie
                    WHEN @solo_vacios = 1 THEN COALESCE(s.serie_pij, m.serie)
                    ELSE COALESCE(m.serie, s.serie_pij)
                END,
                nro_adhesion = CASE
                    WHEN @priorizar_json = 1 AND m.nro_adhesion IS NOT NULL THEN m.nro_adhesion
                    WHEN @solo_vacios = 1 THEN COALESCE(s.nro_adhesion, m.nro_adhesion)
                    ELSE COALESCE(m.nro_adhesion, s.nro_adhesion)
                END,
                nro_anexo = CASE
                    WHEN @priorizar_json = 1 AND m.nro_anexo IS NOT NULL THEN m.nro_anexo
                    WHEN @solo_vacios = 1 THEN COALESCE(s.nro_anexo, m.nro_anexo)
                    ELSE COALESCE(m.nro_anexo, s.nro_anexo)
                END,
                compras_adicionales_json = CASE
                    WHEN @priorizar_json = 1 AND m.compras_adicionales_destino IS NOT NULL THEN m.compras_adicionales_destino
                    WHEN @solo_vacios = 1 THEN COALESCE(s.compras_adicionales_json, m.compras_adicionales_destino)
                    ELSE COALESCE(m.compras_adicionales_destino, s.compras_adicionales_json)
                END,
                dni_cliente = CASE
                    WHEN @priorizar_json = 1 AND m.j_dni_cliente IS NOT NULL THEN LEFT(m.j_dni_cliente, 16)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.dni_cliente, LEFT(m.j_dni_cliente, 16))
                    ELSE COALESCE(LEFT(m.j_dni_cliente, 16), s.dni_cliente)
                END,
                caja_estado = CASE
                    WHEN @priorizar_json = 1 AND m.j_caja_estado IS NOT NULL THEN m.j_caja_estado
                    WHEN @solo_vacios = 1 THEN COALESCE(s.caja_estado, m.j_caja_estado)
                    ELSE COALESCE(m.j_caja_estado, s.caja_estado)
                END,
                caja_verificado_en = CASE
                    WHEN @priorizar_json = 1 AND m.j_caja_verificado_en IS NOT NULL THEN m.j_caja_verificado_en
                    WHEN @solo_vacios = 1 THEN COALESCE(s.caja_verificado_en, m.j_caja_verificado_en)
                    ELSE COALESCE(m.j_caja_verificado_en, s.caja_verificado_en)
                END,
                caja_comprobante_id = CASE
                    WHEN @priorizar_json = 1 AND m.j_caja_comprobante_id IS NOT NULL THEN LEFT(m.j_caja_comprobante_id, 64)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.caja_comprobante_id, LEFT(m.j_caja_comprobante_id, 64))
                    ELSE COALESCE(LEFT(m.j_caja_comprobante_id, 64), s.caja_comprobante_id)
                END,
                caja_motivo_rechazo = CASE
                    WHEN @priorizar_json = 1 AND m.j_caja_motivo_rechazo IS NOT NULL THEN LEFT(m.j_caja_motivo_rechazo, 300)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.caja_motivo_rechazo, LEFT(m.j_caja_motivo_rechazo, 300))
                    ELSE COALESCE(LEFT(m.j_caja_motivo_rechazo, 300), s.caja_motivo_rechazo)
                END,
                caja_sucursal = CASE
                    WHEN @priorizar_json = 1 AND m.j_caja_sucursal IS NOT NULL THEN LEFT(m.j_caja_sucursal, 32)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.caja_sucursal, LEFT(m.j_caja_sucursal, 32))
                    ELSE COALESCE(LEFT(m.j_caja_sucursal, 32), s.caja_sucursal)
                END,
                caja_confirmado_por = CASE
                    WHEN @priorizar_json = 1 AND m.j_caja_confirmado_por IS NOT NULL THEN LEFT(m.j_caja_confirmado_por, 200)
                    WHEN @solo_vacios = 1 THEN COALESCE(s.caja_confirmado_por, LEFT(m.j_caja_confirmado_por, 200))
                    ELSE COALESCE(LEFT(m.j_caja_confirmado_por, 200), s.caja_confirmado_por)
                END
            FROM dbo.registrarSeguimientoLead s
            INNER JOIN #mig m ON m.id = s.id;

            DECLARE @actualizadas INT = @@ROWCOUNT;

            /* --- Tablas hijas: compras adicionales --- */
            INSERT INTO dbo.registrarSeguimientoLead_compra (
                id_seguimiento, lead_id, id_compra, orden,
                id_producto, estado_pago, id_barrio, numero_recibo,
                serie_pij, nro_adhesion, nro_anexo,
                forma_pago, monto_cierre, monto_efectivo, monto_transferencia, fecha_cierre
            )
            SELECT
                m.id,
                m.lead_id,
                j.id_compra,
                j.orden,
                j.id_producto,
                j.estado_pago,
                j.id_barrio,
                j.numero_recibo,
                COALESCE(
                    CASE
                        WHEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(j.serie_pij, N''), N'GRUPO', N''), N' ', N''), 1)) IN (N'A', N'B')
                            THEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(j.serie_pij, N''), N'GRUPO', N''), N' ', N''), 1))
                        ELSE NULL
                    END,
                    px.serie
                ),
                COALESCE(j.nro_adhesion, px.nro_adhesion),
                COALESCE(j.nro_anexo, px.nro_anexo),
                j.forma_pago,
                j.monto_cierre,
                j.monto_efectivo,
                j.monto_transferencia,
                j.fecha_cierre
            FROM #mig m
            CROSS APPLY OPENJSON(COALESCE(m.compras_adicionales_destino, m.j_compras_json)) AS arr
            CROSS APPLY (
                SELECT
                    orden               = TRY_CAST(arr.[key] AS SMALLINT),
                    id_compra           = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.id'))), N''),
                    id_producto         = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.idProducto'))), N''),
                    estado_pago         = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.estadoPago'))), N''),
                    id_barrio           = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.idBarrio'))), N''),
                    numero_recibo       = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.numeroRecibo'))), N''),
                    serie_pij           = COALESCE(
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.seriePij'))), N''),
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.serie'))), N''),
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.grupo'))), N'')
                    ),
                    nro_adhesion        = COALESCE(
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.nroAdhesion'))), N''),
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.adhesion'))), N'')
                    ),
                    nro_anexo           = COALESCE(
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.nroAnexo'))), N''),
                        NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.anexo'))), N'')
                    ),
                    forma_pago          = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.formaPago'))), N''),
                    monto_cierre        = TRY_CAST(JSON_VALUE(arr.value, '$.montoCierre') AS DECIMAL(12, 2)),
                    monto_efectivo      = TRY_CAST(JSON_VALUE(arr.value, '$.montoEfectivo') AS DECIMAL(12, 2)),
                    monto_transferencia = TRY_CAST(JSON_VALUE(arr.value, '$.montoTransferencia') AS DECIMAL(12, 2)),
                    fecha_cierre        = COALESCE(
                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(arr.value, '$.fechaCierre'), 126),
                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(arr.value, '$.fechaCierre'), 127)
                    )
            ) AS j
            OUTER APPLY dbo.fn_ParseReciboPij(
                CASE WHEN j.id_producto = N'prod-pij' THEN j.numero_recibo ELSE NULL END
            ) AS px
            WHERE ISJSON(COALESCE(m.compras_adicionales_destino, m.j_compras_json)) = 1
              AND j.id_compra IS NOT NULL
              AND (
                  @solo_vacios = 0
                  OR NOT EXISTS (
                      SELECT 1 FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id
                  )
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.registrarSeguimientoLead_compra c
                  WHERE c.id_seguimiento = m.id AND c.id_compra = j.id_compra
              );

            DECLARE @compras_insertadas INT = @@ROWCOUNT;

            /* --- Tablas hijas: imágenes (metadatos; contenido NULL en migración) --- */
            INSERT INTO dbo.registrarSeguimientoLead_imagen (
                id_seguimiento, lead_id, id_imagen, venta_key, tipo_imagen,
                mime_type, nombre_original, tamano_bytes, storage_path, operador_id, subido_en
            )
            SELECT
                m.id,
                m.lead_id,
                j.id_imagen,
                j.venta_key,
                j.tipo_imagen,
                j.mime_type,
                j.nombre_original,
                j.tamano_bytes,
                j.storage_path,
                j.operador_id,
                j.subido_en
            FROM #mig m
            CROSS APPLY OPENJSON(m.j_imagenes_json) AS arr
            CROSS APPLY (
                SELECT
                    id_imagen       = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.id'))), N''),
                    venta_key       = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.ventaKey'))), N''),
                    tipo_imagen     = CASE LOWER(NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.tipo'))), N''))
                        WHEN N'recibo' THEN N'img6'
                        WHEN N'comprobante_transferencia' THEN N'img7'
                        ELSE NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.tipo'))), N'')
                    END,
                    mime_type       = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.mimeType'))), N''),
                    nombre_original = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.nombreOriginal'))), N''),
                    tamano_bytes    = TRY_CAST(JSON_VALUE(arr.value, '$.tamanoBytes') AS INT),
                    storage_path    = NULLIF(LTRIM(RTRIM(JSON_VALUE(arr.value, '$.storagePath'))), N''),
                    operador_id     = TRY_CAST(JSON_VALUE(arr.value, '$.operadorId') AS INT),
                    subido_en       = COALESCE(
                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(arr.value, '$.subidoEn'), 126),
                        TRY_CONVERT(DATETIME2(0), JSON_VALUE(arr.value, '$.subidoEn'), 127)
                    )
            ) AS j
            WHERE ISJSON(m.j_imagenes_json) = 1
              AND j.id_imagen IS NOT NULL
              AND j.venta_key IS NOT NULL
              AND j.tipo_imagen IS NOT NULL
              AND (
                  @solo_vacios = 0
                  OR NOT EXISTS (
                      SELECT 1 FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id
                  )
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.registrarSeguimientoLead_imagen i
                  WHERE i.id_seguimiento = m.id
                    AND i.venta_key = j.venta_key
                    AND i.tipo_imagen = j.tipo_imagen
              );

            DECLARE @imagenes_insertadas INT = @@ROWCOUNT;

            COMMIT TRANSACTION;

            SELECT
                modo               = @modo,
                filas_actualizadas = @actualizadas,
                compras_insertadas = @compras_insertadas,
                imagenes_insertadas = @imagenes_insertadas,
                solo_vacios        = @solo_vacios,
                priorizar_json     = @priorizar_json,
                mensaje            = N'Migración aplicada (columnas planas + tablas hijas). Ejecutar @modo = verificar.';
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            THROW;
        END CATCH;

        RETURN;
    END;

    /* ------------------------------------------------------------------
       VERIFICAR — filas donde plano sigue distinto o vacío vs JSON
    ------------------------------------------------------------------ */
    IF @modo = N'verificar'
    BEGIN
        SELECT
            total_con_json = (SELECT COUNT(*) FROM #mig),
            sin_numero_recibo_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.j_numero_recibo IS NOT NULL
                  AND NULLIF(LTRIM(RTRIM(s.numero_recibo)), N'') IS NULL
            ),
            sin_forma_pago_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.j_forma_pago IS NOT NULL AND s.forma_pago IS NULL
            ),
            sin_fecha_cierre_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.j_fecha_cierre IS NOT NULL AND s.fecha_cierre IS NULL
            ),
            sin_adhesion_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.nro_adhesion IS NOT NULL AND s.nro_adhesion IS NULL
            ),
            sin_serie_pij_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.serie IS NOT NULL AND s.serie_pij IS NULL
            ),
            sin_anexo_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.nro_anexo IS NOT NULL AND s.nro_anexo IS NULL
            ),
            sin_compras_adicionales_plano = (
                SELECT COUNT(*)
                FROM #mig m
                INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
                WHERE m.compras_adicionales_destino IS NOT NULL
                  AND (s.compras_adicionales_json IS NULL OR LTRIM(RTRIM(s.compras_adicionales_json)) = N'')
            ),
            sin_compras_en_tabla_hija = (
                SELECT COUNT(*)
                FROM #mig m
                WHERE m.compras_adicionales_destino IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id
                  )
            ),
            sin_imagenes_en_tabla_hija = (
                SELECT COUNT(*)
                FROM #mig m
                WHERE m.j_imagenes_json IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id
                  )
            );

        SELECT TOP 50
            s.id,
            s.lead_id,
            discrepancia = CASE
                WHEN m.j_numero_recibo IS NOT NULL
                     AND NULLIF(LTRIM(RTRIM(s.numero_recibo)), N'') IS NULL THEN N'falta numero_recibo'
                WHEN m.j_forma_pago IS NOT NULL AND s.forma_pago IS NULL THEN N'falta forma_pago'
                WHEN m.j_fecha_cierre IS NOT NULL AND s.fecha_cierre IS NULL THEN N'falta fecha_cierre'
                WHEN m.nro_adhesion IS NOT NULL AND s.nro_adhesion IS NULL THEN N'falta nro_adhesion'
                WHEN m.compras_adicionales_destino IS NOT NULL
                     AND NOT EXISTS (
                         SELECT 1 FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id
                     )
                    THEN N'falta tabla compras adicionales'
                WHEN m.j_imagenes_json IS NOT NULL
                     AND NOT EXISTS (
                         SELECT 1 FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id
                     )
                    THEN N'falta tabla imagenes'
                ELSE N'otro'
            END,
            s.numero_recibo,
            m.j_numero_recibo,
            s.forma_pago,
            m.j_forma_pago,
            s.nro_adhesion,
            m.nro_adhesion,
            s.nro_anexo,
            m.nro_anexo
        FROM #mig m
        INNER JOIN dbo.registrarSeguimientoLead s ON s.id = m.id
        WHERE
            (m.j_numero_recibo IS NOT NULL AND NULLIF(LTRIM(RTRIM(s.numero_recibo)), N'') IS NULL)
            OR (m.j_forma_pago IS NOT NULL AND s.forma_pago IS NULL)
            OR (m.j_fecha_cierre IS NOT NULL AND s.fecha_cierre IS NULL)
            OR (m.nro_adhesion IS NOT NULL AND s.nro_adhesion IS NULL)
            OR (
                m.compras_adicionales_destino IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM dbo.registrarSeguimientoLead_compra c WHERE c.id_seguimiento = m.id
                )
            )
            OR (
                m.j_imagenes_json IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM dbo.registrarSeguimientoLead_imagen i WHERE i.id_seguimiento = m.id
                )
            )
        ORDER BY s.id DESC;

        RETURN;
    END;
END;
GO

GRANT EXECUTE ON dbo.SP_MigrarSeguimientoJsonAPlano TO [MPCSP];
GO

/* ---------------------------------------------------------------------------
   EJEMPLOS DE USO (DBA)
--------------------------------------------------------------------------- */
/*
-- 1) Vista previa global (no modifica nada)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'preview';

-- 2) Probar con un solo lead
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'preview',
    @lead_id = 12345;

-- 3) Aplicar migración segura (solo completa vacíos)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'aplicar',
    @solo_vacios = 1,
    @priorizar_json = 0;

-- 4) Auditar qué quedó pendiente
EXEC dbo.SP_MigrarSeguimientoJsonAPlano @modo = N'verificar';

-- 5) Segunda pasada forzando JSON (solo si hace falta corregir planos viejos)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'aplicar',
    @solo_vacios = 0,
    @priorizar_json = 1;

-- 6) Migrar en lotes (ej. 5000 filas por corrida)
EXEC dbo.SP_MigrarSeguimientoJsonAPlano
    @modo = N'aplicar',
    @solo_vacios = 1,
    @lote_max = 5000;

NOTAS:
- Los registros NUEVOS que guarde la app ya llenan columnas planas solos.
- Este SP es para historial cargado antes de los scripts de columnas planas.
- seguimiento_json NO se borra: queda como respaldo/auditoría.
- Si fn_ParseReciboPij no existe, ejecutar SP_ExportarCierresParaBloqueo.sql antes.
- Recomendado: backup de registrarSeguimientoLead antes del primer @modo = aplicar.
- Ejecutar con usuario DBO en SSMS (no es una operación de la app en producción).
*/
