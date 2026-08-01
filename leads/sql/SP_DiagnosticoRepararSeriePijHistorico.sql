-- =============================================================================
-- Diagnóstico + reparación SEGURA de serie_pij en históricos PIJ
-- Base: STRSYSTEM | Ejecutar como DBA (SELECT/UPDATE en registrarSeguimientoLead)
-- =============================================================================
-- Contexto:
--   Tras MigrarSeguimientoJsonAColumnasPlanas quedan ~N filas prod-pij con recibo
--   pero sin serie_pij (el texto no arranca en A/B o el JSON no trae serie).
--   El panel admin en planas necesita esos históricos cuando se reporte A/B.
--
-- FLUJO:
--   1) @modo = N'diagnostico'  → conteos + muestra (no escribe)
--   2) Revisar patrones
--   3) @modo = N'preview'      → cuántas se repararían con reglas seguras
--   4) @modo = N'aplicar'      → UPDATE solo recuperables (transacción)
--
-- NO inventa serie A por defecto. Solo rellena si se puede inferir A o B.
-- =============================================================================

USE [STRSYSTEM];
GO

CREATE OR ALTER PROCEDURE dbo.SP_DiagnosticoRepararSeriePijHistorico
    @modo NVARCHAR(16) = N'diagnostico'  -- diagnostico | preview | aplicar
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;

    IF @modo NOT IN (N'diagnostico', N'preview', N'aplicar')
    BEGIN
        RAISERROR(N'@modo debe ser diagnostico, preview o aplicar.', 16, 1);
        RETURN;
    END;

    IF OBJECT_ID('tempdb..#cand') IS NOT NULL DROP TABLE #cand;

    ;WITH src AS (
        SELECT
            s.id,
            s.lead_id,
            s.fechaAlta,
            s.resultado_entrevista,
            s.estado_pago,
            s.serie_pij,
            s.nro_adhesion,
            s.nro_anexo,
            recibo = COALESCE(
                NULLIF(LTRIM(RTRIM(s.numero_recibo)), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.numeroRecibo'))), N'')
            ),
            j_serie_raw = COALESCE(
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.seriePij'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.serie'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.grupo'))), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.grupoPij'))), N'')
            )
        FROM dbo.registrarSeguimientoLead s
        WHERE ISJSON(s.seguimiento_json) = 1
          AND COALESCE(
                NULLIF(LTRIM(RTRIM(s.id_producto)), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.idProducto'))), N'')
              ) = N'prod-pij'
          AND COALESCE(
                NULLIF(LTRIM(RTRIM(s.numero_recibo)), N''),
                NULLIF(LTRIM(RTRIM(JSON_VALUE(s.seguimiento_json, '$.numeroRecibo'))), N'')
              ) IS NOT NULL
          AND s.serie_pij IS NULL
    ),
    norm AS (
        SELECT
            s.*,
            clean = UPPER(LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(s.recibo, N''), CHAR(9), N' '), N'  ', N' '))))
        FROM src s
    ),
    parsed AS (
        SELECT
            n.*,
            /* Reglas SEGURAS de inferencia A/B */
            serie_inferida = COALESCE(
                /* 1) JSON / grupo explícito */
                CASE
                    WHEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(n.j_serie_raw, N''), N'GRUPO', N''), N' ', N''), 1)) IN (N'A', N'B')
                        THEN UPPER(LEFT(REPLACE(REPLACE(ISNULL(n.j_serie_raw, N''), N'GRUPO', N''), N' ', N''), 1))
                END,
                /* 2) Empieza con A/B (formato actual) */
                CASE WHEN LEFT(n.clean, 1) IN (N'A', N'B') THEN LEFT(n.clean, 1) END,
                /* 3) "GRUPO A" / "GRUPO B" en cualquier parte */
                CASE
                    WHEN n.clean LIKE N'%GRUPO%A%' AND n.clean NOT LIKE N'%GRUPO%B%' THEN N'A'
                    WHEN n.clean LIKE N'%GRUPO%B%' AND n.clean NOT LIKE N'%GRUPO%A%' THEN N'B'
                END,
                /* 4) "SERIE A" / "SERIE B" */
                CASE
                    WHEN n.clean LIKE N'%SERIE%A%' AND n.clean NOT LIKE N'%SERIE%B%' THEN N'A'
                    WHEN n.clean LIKE N'%SERIE%B%' AND n.clean NOT LIKE N'%SERIE%A%' THEN N'B'
                END,
                /* 5) Patrón " A123/" o " B45/" embebido */
                CASE
                    WHEN PATINDEX(N'%[^A-Z]A[0-9]%', N' ' + n.clean) > 0
                     AND PATINDEX(N'%[^A-Z]B[0-9]%', N' ' + n.clean) = 0
                        THEN N'A'
                    WHEN PATINDEX(N'%[^A-Z]B[0-9]%', N' ' + n.clean) > 0
                     AND PATINDEX(N'%[^A-Z]A[0-9]%', N' ' + n.clean) = 0
                        THEN N'B'
                END
            ),
            adhesion_inferida = COALESCE(
                n.nro_adhesion,
                /* A200/300 → 200 */
                CASE
                    WHEN LEFT(n.clean, 1) IN (N'A', N'B') AND CHARINDEX(N'/', n.clean) > 2
                        THEN NULLIF(SUBSTRING(n.clean, 2, CHARINDEX(N'/', n.clean) - 2), N'')
                END
            ),
            anexo_inferido = COALESCE(
                n.nro_anexo,
                CASE
                    WHEN PATINDEX(N'%ANEXO%', n.clean) > 0
                        THEN NULLIF(
                            REPLACE(
                                REPLACE(
                                    SUBSTRING(n.clean, PATINDEX(N'%ANEXO%', n.clean) + 5, 20),
                                    N'/300', N''
                                ),
                                N'/', N''
                            ),
                            N''
                        )
                END
            ),
            patron = CASE
                WHEN LEFT(n.clean, 1) IN (N'A', N'B') THEN N'empieza_AB'
                WHEN n.clean LIKE N'ANEXO%' THEN N'solo_ANEXO'
                WHEN n.clean LIKE N'[0-9]%' THEN N'solo_digitos'
                WHEN n.clean LIKE N'%GRUPO%' THEN N'texto_GRUPO'
                WHEN n.clean LIKE N'%SERIE%' THEN N'texto_SERIE'
                ELSE N'otro'
            END
        FROM norm n
    )
    SELECT *
    INTO #cand
    FROM parsed;

    /* ------------------------------------------------------------------ */
    IF @modo = N'diagnostico'
    BEGIN
        SELECT
            total_sin_serie = COUNT(*),
            recuperables = SUM(CASE WHEN serie_inferida IS NOT NULL THEN 1 ELSE 0 END),
            no_recuperables = SUM(CASE WHEN serie_inferida IS NULL THEN 1 ELSE 0 END)
        FROM #cand;

        SELECT patron, n = COUNT(*), recuperables = SUM(CASE WHEN serie_inferida IS NOT NULL THEN 1 ELSE 0 END)
        FROM #cand
        GROUP BY patron
        ORDER BY COUNT(*) DESC;

        SELECT TOP 40
            id, lead_id, fechaAlta, estado_pago, resultado_entrevista,
            recibo = LEFT(recibo, 100),
            patron, serie_inferida, adhesion_inferida, anexo_inferido
        FROM #cand
        ORDER BY
            CASE WHEN serie_inferida IS NULL THEN 0 ELSE 1 END,
            id DESC;

        RETURN;
    END;

    /* ------------------------------------------------------------------ */
    /* preview / aplicar: solo filas con serie_inferida */
    SELECT
        modo = @modo,
        a_reparar = COUNT(*)
    FROM #cand
    WHERE serie_inferida IS NOT NULL;

    SELECT TOP 50
        id, lead_id, recibo = LEFT(recibo, 100),
        serie_inferida, adhesion_inferida, anexo_inferido
    FROM #cand
    WHERE serie_inferida IS NOT NULL
    ORDER BY id DESC;

    IF @modo = N'preview'
        RETURN;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE s
        SET
            serie_pij = c.serie_inferida,
            nro_adhesion = COALESCE(s.nro_adhesion, LEFT(c.adhesion_inferida, 10)),
            nro_anexo = COALESCE(s.nro_anexo, LEFT(c.anexo_inferido, 10))
        FROM dbo.registrarSeguimientoLead s
        INNER JOIN #cand c ON c.id = s.id
        WHERE c.serie_inferida IS NOT NULL
          AND s.serie_pij IS NULL;

        DECLARE @n INT = @@ROWCOUNT;
        COMMIT TRANSACTION;

        SELECT
            modo = @modo,
            filas_actualizadas = @n,
            mensaje = N'Reparación aplicada. Volver a correr @modo = diagnostico.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

GRANT EXECUTE ON dbo.SP_DiagnosticoRepararSeriePijHistorico TO [MPCSP];
GO

/*
-- Uso DBA:
EXEC dbo.SP_DiagnosticoRepararSeriePijHistorico @modo = N'diagnostico';
EXEC dbo.SP_DiagnosticoRepararSeriePijHistorico @modo = N'preview';
EXEC dbo.SP_DiagnosticoRepararSeriePijHistorico @modo = N'aplicar';
EXEC dbo.SP_DiagnosticoRepararSeriePijHistorico @modo = N'diagnostico';  -- ver residuales
*/
