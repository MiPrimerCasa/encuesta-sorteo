-- =============================================================================
-- Restaurar TODAS las columnas planas desde auditoría (snapshot pre_migracion)
-- Base: STRSYSTEM
-- =============================================================================
-- IMPORTANTE:
--   La auditoría guarda el estado de dbo.registrarSeguimientoLead (columnas planas).
--   NO guarda un dump completo de las tablas hijas compra/imagen.
--   Opcionalmente podés borrar filas hijas insertadas por la migración
--   (@limpiar_tablas_hijas = 1) para volver al estado "solo JSON".
--
-- USO:
--   1) Dry-run (no escribe):
--        EXEC dbo.SP_RestaurarTodasPlanasDesdeAuditoria @dry_run = 1;
--   2) Aplicar restore:
--        EXEC dbo.SP_RestaurarTodasPlanasDesdeAuditoria
--             @dry_run = 0,
--             @limpiar_tablas_hijas = 1;   -- recomendado si la migración ya insertó hijas
-- =============================================================================

USE [STRSYSTEM];
GO

CREATE OR ALTER PROCEDURE dbo.SP_RestaurarTodasPlanasDesdeAuditoria
    @dry_run              BIT = 1,           -- 1 = solo muestra; 0 = aplica
    @motivo_fuente        NVARCHAR(40) = N'pre_migracion',  -- de dónde restaurar
    @limpiar_tablas_hijas BIT = 0,           -- 1 = DELETE compra/imagen de esos seguimientos
    @lead_id              INT = NULL          -- NULL = todos; o un lead de prueba
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @motivo_fuente NOT IN (N'pre_migracion', N'update_trigger')
    BEGIN
        RAISERROR(N'@motivo_fuente debe ser pre_migracion o update_trigger.', 16, 1);
        RETURN;
    END;

    IF OBJECT_ID(N'dbo.registrarSeguimientoLead_auditoria_planas', N'U') IS NULL
    BEGIN
        RAISERROR(N'No existe dbo.registrarSeguimientoLead_auditoria_planas.', 16, 1);
        RETURN;
    END;

    /* Último (o único) snapshot por id_seguimiento según motivo */
    ;WITH candidatas AS (
        SELECT
            a.*,
            rn = ROW_NUMBER() OVER (
                PARTITION BY a.id_seguimiento
                ORDER BY a.auditado_en DESC, a.id_auditoria DESC
            )
        FROM dbo.registrarSeguimientoLead_auditoria_planas a
        WHERE a.motivo = @motivo_fuente
          AND (@lead_id IS NULL OR a.lead_id = @lead_id)
    )
    SELECT *
    INTO #restore
    FROM candidatas
    WHERE rn = 1;

    DECLARE @n INT = (SELECT COUNT(*) FROM #restore);

    SELECT
        accion = CASE WHEN @dry_run = 1 THEN N'PREVIEW (no escribe)' ELSE N'APLICAR' END,
        motivo_fuente = @motivo_fuente,
        filas_a_restaurar = @n,
        limpiar_tablas_hijas = @limpiar_tablas_hijas,
        lead_filtro = @lead_id;

    SELECT TOP 50
        id_auditoria, id_seguimiento, lead_id, auditado_en,
        serie_pij_antes, nro_adhesion_antes, nro_anexo_antes,
        numero_recibo_antes, forma_pago_antes, dni_cliente_antes
    FROM #restore
    ORDER BY id_seguimiento DESC;

    IF @n = 0
    BEGIN
        SELECT mensaje = N'No hay filas en auditoría con motivo=' + @motivo_fuente
            + N'. ¿Corriste EXEC dbo.SP_SnapshotSeguimientoPlanasAntesMigracion ?';
        RETURN;
    END;

    IF @dry_run = 1
    BEGIN
        SELECT mensaje = N'dry_run=1: no se modificó nada. Para aplicar:'
            + N' EXEC dbo.SP_RestaurarTodasPlanasDesdeAuditoria @dry_run=0, @limpiar_tablas_hijas=1;';
        RETURN;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        /* Opcional: quitar hijas creadas por la migración (metadatos/compras) */
        IF @limpiar_tablas_hijas = 1
        BEGIN
            DELETE c
            FROM dbo.registrarSeguimientoLead_compra c
            INNER JOIN #restore r ON r.id_seguimiento = c.id_seguimiento;

            DECLARE @del_compras INT = @@ROWCOUNT;

            DELETE i
            FROM dbo.registrarSeguimientoLead_imagen i
            INNER JOIN #restore r ON r.id_seguimiento = i.id_seguimiento;

            DECLARE @del_imgs INT = @@ROWCOUNT;

            SELECT
                compras_borradas = @del_compras,
                imagenes_borradas = @del_imgs;
        END;

        UPDATE s
        SET
            forma_pago               = r.forma_pago_antes,
            monto_cierre             = r.monto_cierre_antes,
            monto_efectivo           = r.monto_efectivo_antes,
            monto_transferencia      = r.monto_transferencia_antes,
            fecha_cierre             = r.fecha_cierre_antes,
            fuente                   = r.fuente_antes,
            serie_pij                = r.serie_pij_antes,
            nro_adhesion             = r.nro_adhesion_antes,
            nro_anexo                = r.nro_anexo_antes,
            numero_recibo            = r.numero_recibo_antes,
            id_producto              = r.id_producto_antes,
            estado_pago              = r.estado_pago_antes,
            id_barrio                = r.id_barrio_antes,
            dni_cliente              = r.dni_cliente_antes,
            compras_adicionales_json = r.compras_adicionales_json_antes,
            imagenes_cierre_json     = r.imagenes_cierre_json_antes,
            caja_estado              = r.caja_estado_antes,
            caja_verificado_en       = r.caja_verificado_en_antes,
            caja_comprobante_id      = r.caja_comprobante_id_antes,
            caja_motivo_rechazo      = r.caja_motivo_rechazo_antes,
            caja_sucursal            = r.caja_sucursal_antes,
            caja_confirmado_por      = r.caja_confirmado_por_antes
        FROM dbo.registrarSeguimientoLead s
        INNER JOIN #restore r ON r.id_seguimiento = s.id;

        DECLARE @upd INT = @@ROWCOUNT;

        /* Marca de restore masivo (el trigger también registrará cada UPDATE) */
        INSERT INTO dbo.registrarSeguimientoLead_auditoria_planas (
            id_seguimiento, lead_id, motivo, evento,
            auditado_por, app_name, host_name
        )
        SELECT
            r.id_seguimiento,
            r.lead_id,
            N'restore_masivo',
            N'RESTORE_ALL',
            SUSER_SNAME(),
            APP_NAME(),
            HOST_NAME()
        FROM #restore r;

        COMMIT TRANSACTION;

        SELECT
            mensaje = N'Restore masivo OK.',
            filas_actualizadas = @upd,
            fuente = @motivo_fuente,
            hijas_limpiadas = @limpiar_tablas_hijas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(N'Error en restore masivo: %s', 16, 1, @msg);
    END CATCH
END;
GO

PRINT N'Listo. Probar: EXEC dbo.SP_RestaurarTodasPlanasDesdeAuditoria @dry_run = 1;';
GO
