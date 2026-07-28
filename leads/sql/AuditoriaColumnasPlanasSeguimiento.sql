-- =============================================================================
-- Auditoría de columnas planas — registrarSeguimientoLead
-- Base: STRSYSTEM
-- =============================================================================
-- Objetivo:
--   Guardar el valor ANTERIOR (y el nuevo) cuando se modifican columnas planas,
--   para poder recuperar si la migración o la app escriben mal.
--
-- CUÁNDO CORRER:
--   Después de:
--     1) registrarSeguimientoLead-tablas-hijas.sql
--     2) registrarSeguimientoLead-columnas-planas-completas.sql
--     3) SP_ExportarCierresParaBloqueo.sql
--   ANTES de:
--     4) MigrarSeguimientoJsonAColumnasPlanas.sql  (@modo = aplicar)
--
-- FLUJO RECOMENDADO:
--   A) Ejecutar este script (crea tabla + trigger)
--   B) EXEC dbo.SP_SnapshotSeguimientoPlanasAntesMigracion;  -- foto completa
--   C) EXEC SP_MigrarSeguimientoJsonAPlano @modo = N'preview';
--   D) EXEC SP_MigrarSeguimientoJsonAPlano @modo = N'aplicar', @solo_vacios = 1;
--
-- NOTA: con @solo_vacios = 1 la migración solo llena NULL→valor; el snapshot
--       de (B) es el respaldo real. El trigger cubre sobrescrituras posteriores
--       o un @priorizar_json = 1 que pise datos ya cargados.
-- =============================================================================

USE [STRSYSTEM];
GO

/* ---------------------------------------------------------------------------
   1) Tabla de auditoría
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.registrarSeguimientoLead_auditoria_planas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.registrarSeguimientoLead_auditoria_planas (
        id_auditoria            BIGINT IDENTITY(1, 1) NOT NULL,
        id_seguimiento          INT            NOT NULL,  -- id de registrarSeguimientoLead
        lead_id                 INT            NULL,
        motivo                  NVARCHAR(40)   NOT NULL,  -- pre_migracion | update_trigger | restore
        evento                  NVARCHAR(16)   NOT NULL CONSTRAINT DF_rSL_aud_evento DEFAULT (N'UPDATE'),
        -- Quién / cuándo
        auditado_en             DATETIME2(3)   NOT NULL CONSTRAINT DF_rSL_aud_en DEFAULT (SYSUTCDATETIME()),
        auditado_por            NVARCHAR(128)  NULL,
        app_name                NVARCHAR(128)  NULL,
        host_name               NVARCHAR(128)  NULL,
        -- Snapshot JSON (fuente de verdad previa)
        seguimiento_json_antes  NVARCHAR(MAX)  NULL,
        -- Valores ANTERIORES (antes del UPDATE)
        forma_pago_antes            NVARCHAR(16)    NULL,
        monto_cierre_antes          DECIMAL(12, 2)  NULL,
        monto_efectivo_antes        DECIMAL(12, 2)  NULL,
        monto_transferencia_antes   DECIMAL(12, 2)  NULL,
        fecha_cierre_antes          DATETIME2(0)    NULL,
        fuente_antes                NVARCHAR(16)    NULL,
        serie_pij_antes             NVARCHAR(1)     NULL,
        nro_adhesion_antes          NVARCHAR(10)    NULL,
        nro_anexo_antes             NVARCHAR(10)    NULL,
        numero_recibo_antes         NVARCHAR(80)    NULL,
        id_producto_antes           NVARCHAR(32)    NULL,
        estado_pago_antes           NVARCHAR(16)    NULL,
        id_barrio_antes             NVARCHAR(32)    NULL,
        dni_cliente_antes           NVARCHAR(16)    NULL,
        compras_adicionales_json_antes NVARCHAR(MAX) NULL,
        imagenes_cierre_json_antes     NVARCHAR(MAX) NULL,
        caja_estado_antes           NVARCHAR(16)    NULL,
        caja_verificado_en_antes    DATETIME2(0)    NULL,
        caja_comprobante_id_antes   NVARCHAR(64)    NULL,
        caja_motivo_rechazo_antes   NVARCHAR(300)   NULL,
        caja_sucursal_antes         NVARCHAR(32)    NULL,
        caja_confirmado_por_antes   NVARCHAR(200)   NULL,
        -- Valores NUEVOS (después del UPDATE; NULL en snapshot)
        forma_pago_despues          NVARCHAR(16)    NULL,
        monto_cierre_despues        DECIMAL(12, 2)  NULL,
        monto_efectivo_despues      DECIMAL(12, 2)  NULL,
        monto_transferencia_despues DECIMAL(12, 2)  NULL,
        fecha_cierre_despues        DATETIME2(0)    NULL,
        fuente_despues              NVARCHAR(16)    NULL,
        serie_pij_despues           NVARCHAR(1)     NULL,
        nro_adhesion_despues        NVARCHAR(10)    NULL,
        nro_anexo_despues           NVARCHAR(10)    NULL,
        numero_recibo_despues       NVARCHAR(80)    NULL,
        id_producto_despues         NVARCHAR(32)    NULL,
        estado_pago_despues         NVARCHAR(16)    NULL,
        id_barrio_despues           NVARCHAR(32)    NULL,
        dni_cliente_despues         NVARCHAR(16)    NULL,
        compras_adicionales_json_despues NVARCHAR(MAX) NULL,
        imagenes_cierre_json_despues     NVARCHAR(MAX) NULL,
        caja_estado_despues         NVARCHAR(16)    NULL,
        caja_verificado_en_despues  DATETIME2(0)    NULL,
        caja_comprobante_id_despues NVARCHAR(64)    NULL,
        caja_motivo_rechazo_despues NVARCHAR(300)   NULL,
        caja_sucursal_despues       NVARCHAR(32)    NULL,
        caja_confirmado_por_despues NVARCHAR(200)   NULL,
        CONSTRAINT PK_rSL_auditoria_planas PRIMARY KEY (id_auditoria)
    );

    CREATE INDEX IX_rSL_aud_seguimiento
        ON dbo.registrarSeguimientoLead_auditoria_planas (id_seguimiento, auditado_en DESC);
    CREATE INDEX IX_rSL_aud_lead
        ON dbo.registrarSeguimientoLead_auditoria_planas (lead_id, auditado_en DESC);
    CREATE INDEX IX_rSL_aud_motivo
        ON dbo.registrarSeguimientoLead_auditoria_planas (motivo, auditado_en DESC);
END
GO

/* ---------------------------------------------------------------------------
   2) Trigger AFTER UPDATE — solo si cambió alguna columna plana relevante
--------------------------------------------------------------------------- */
CREATE OR ALTER TRIGGER dbo.tr_registrarSeguimientoLead_auditoria_planas
ON dbo.registrarSeguimientoLead
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Evitar ruido si no cambió ninguna columna plana que nos importa
    IF NOT (
           UPDATE(forma_pago) OR UPDATE(monto_cierre) OR UPDATE(monto_efectivo)
        OR UPDATE(monto_transferencia) OR UPDATE(fecha_cierre) OR UPDATE(fuente)
        OR UPDATE(serie_pij) OR UPDATE(nro_adhesion) OR UPDATE(nro_anexo)
        OR UPDATE(numero_recibo) OR UPDATE(id_producto) OR UPDATE(estado_pago)
        OR UPDATE(id_barrio) OR UPDATE(dni_cliente)
        OR UPDATE(compras_adicionales_json) OR UPDATE(imagenes_cierre_json)
        OR UPDATE(caja_estado) OR UPDATE(caja_verificado_en) OR UPDATE(caja_comprobante_id)
        OR UPDATE(caja_motivo_rechazo) OR UPDATE(caja_sucursal) OR UPDATE(caja_confirmado_por)
    )
        RETURN;

    INSERT INTO dbo.registrarSeguimientoLead_auditoria_planas (
        id_seguimiento, lead_id, motivo, evento,
        auditado_por, app_name, host_name,
        seguimiento_json_antes,
        forma_pago_antes, monto_cierre_antes, monto_efectivo_antes, monto_transferencia_antes,
        fecha_cierre_antes, fuente_antes,
        serie_pij_antes, nro_adhesion_antes, nro_anexo_antes, numero_recibo_antes,
        id_producto_antes, estado_pago_antes, id_barrio_antes, dni_cliente_antes,
        compras_adicionales_json_antes, imagenes_cierre_json_antes,
        caja_estado_antes, caja_verificado_en_antes, caja_comprobante_id_antes,
        caja_motivo_rechazo_antes, caja_sucursal_antes, caja_confirmado_por_antes,
        forma_pago_despues, monto_cierre_despues, monto_efectivo_despues, monto_transferencia_despues,
        fecha_cierre_despues, fuente_despues,
        serie_pij_despues, nro_adhesion_despues, nro_anexo_despues, numero_recibo_despues,
        id_producto_despues, estado_pago_despues, id_barrio_despues, dni_cliente_despues,
        compras_adicionales_json_despues, imagenes_cierre_json_despues,
        caja_estado_despues, caja_verificado_en_despues, caja_comprobante_id_despues,
        caja_motivo_rechazo_despues, caja_sucursal_despues, caja_confirmado_por_despues
    )
    SELECT
        d.id,
        d.lead_id,
        N'update_trigger',
        N'UPDATE',
        SUSER_SNAME(),
        APP_NAME(),
        HOST_NAME(),
        d.seguimiento_json,
        d.forma_pago, d.monto_cierre, d.monto_efectivo, d.monto_transferencia,
        d.fecha_cierre, d.fuente,
        d.serie_pij, d.nro_adhesion, d.nro_anexo, d.numero_recibo,
        d.id_producto, d.estado_pago, d.id_barrio, d.dni_cliente,
        d.compras_adicionales_json, d.imagenes_cierre_json,
        d.caja_estado, d.caja_verificado_en, d.caja_comprobante_id,
        d.caja_motivo_rechazo, d.caja_sucursal, d.caja_confirmado_por,
        i.forma_pago, i.monto_cierre, i.monto_efectivo, i.monto_transferencia,
        i.fecha_cierre, i.fuente,
        i.serie_pij, i.nro_adhesion, i.nro_anexo, i.numero_recibo,
        i.id_producto, i.estado_pago, i.id_barrio, i.dni_cliente,
        i.compras_adicionales_json, i.imagenes_cierre_json,
        i.caja_estado, i.caja_verificado_en, i.caja_comprobante_id,
        i.caja_motivo_rechazo, i.caja_sucursal, i.caja_confirmado_por
    FROM deleted d
    INNER JOIN inserted i ON i.id = d.id
    WHERE
           ISNULL(d.forma_pago, N'')              <> ISNULL(i.forma_pago, N'')
        OR ISNULL(d.monto_cierre, -1)             <> ISNULL(i.monto_cierre, -1)
        OR ISNULL(d.monto_efectivo, -1)           <> ISNULL(i.monto_efectivo, -1)
        OR ISNULL(d.monto_transferencia, -1)      <> ISNULL(i.monto_transferencia, -1)
        OR ISNULL(d.fecha_cierre, '19000101')     <> ISNULL(i.fecha_cierre, '19000101')
        OR ISNULL(d.fuente, N'')                  <> ISNULL(i.fuente, N'')
        OR ISNULL(d.serie_pij, N'')               <> ISNULL(i.serie_pij, N'')
        OR ISNULL(d.nro_adhesion, N'')            <> ISNULL(i.nro_adhesion, N'')
        OR ISNULL(d.nro_anexo, N'')               <> ISNULL(i.nro_anexo, N'')
        OR ISNULL(d.numero_recibo, N'')           <> ISNULL(i.numero_recibo, N'')
        OR ISNULL(d.id_producto, N'')             <> ISNULL(i.id_producto, N'')
        OR ISNULL(d.estado_pago, N'')             <> ISNULL(i.estado_pago, N'')
        OR ISNULL(d.id_barrio, N'')               <> ISNULL(i.id_barrio, N'')
        OR ISNULL(d.dni_cliente, N'')             <> ISNULL(i.dni_cliente, N'')
        OR ISNULL(d.compras_adicionales_json, N'') <> ISNULL(i.compras_adicionales_json, N'')
        OR ISNULL(d.imagenes_cierre_json, N'')    <> ISNULL(i.imagenes_cierre_json, N'')
        OR ISNULL(d.caja_estado, N'')             <> ISNULL(i.caja_estado, N'')
        OR ISNULL(d.caja_verificado_en, '19000101') <> ISNULL(i.caja_verificado_en, '19000101')
        OR ISNULL(d.caja_comprobante_id, N'')     <> ISNULL(i.caja_comprobante_id, N'')
        OR ISNULL(d.caja_motivo_rechazo, N'')     <> ISNULL(i.caja_motivo_rechazo, N'')
        OR ISNULL(d.caja_sucursal, N'')           <> ISNULL(i.caja_sucursal, N'')
        OR ISNULL(d.caja_confirmado_por, N'')     <> ISNULL(i.caja_confirmado_por, N'');
END;
GO

/* ---------------------------------------------------------------------------
   3) Snapshot completo ANTES de migrar (recomendado)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_SnapshotSeguimientoPlanasAntesMigracion
    @lead_id INT = NULL  -- NULL = todas las filas
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.registrarSeguimientoLead_auditoria_planas (
        id_seguimiento, lead_id, motivo, evento,
        auditado_por, app_name, host_name,
        seguimiento_json_antes,
        forma_pago_antes, monto_cierre_antes, monto_efectivo_antes, monto_transferencia_antes,
        fecha_cierre_antes, fuente_antes,
        serie_pij_antes, nro_adhesion_antes, nro_anexo_antes, numero_recibo_antes,
        id_producto_antes, estado_pago_antes, id_barrio_antes, dni_cliente_antes,
        compras_adicionales_json_antes, imagenes_cierre_json_antes,
        caja_estado_antes, caja_verificado_en_antes, caja_comprobante_id_antes,
        caja_motivo_rechazo_antes, caja_sucursal_antes, caja_confirmado_por_antes
    )
    SELECT
        s.id,
        s.lead_id,
        N'pre_migracion',
        N'SNAPSHOT',
        SUSER_SNAME(),
        APP_NAME(),
        HOST_NAME(),
        s.seguimiento_json,
        s.forma_pago, s.monto_cierre, s.monto_efectivo, s.monto_transferencia,
        s.fecha_cierre, s.fuente,
        s.serie_pij, s.nro_adhesion, s.nro_anexo, s.numero_recibo,
        s.id_producto, s.estado_pago, s.id_barrio, s.dni_cliente,
        s.compras_adicionales_json, s.imagenes_cierre_json,
        s.caja_estado, s.caja_verificado_en, s.caja_comprobante_id,
        s.caja_motivo_rechazo, s.caja_sucursal, s.caja_confirmado_por
    FROM dbo.registrarSeguimientoLead s
    WHERE (@lead_id IS NULL OR s.lead_id = @lead_id);

    SELECT
        filas_snapshot = @@ROWCOUNT,
        mensaje = N'Snapshot pre_migracion guardado en registrarSeguimientoLead_auditoria_planas.';
END;
GO

/* ---------------------------------------------------------------------------
   4) Restaurar UNA fila desde un id_auditoria (valores _antes)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_RestaurarSeguimientoPlanasDesdeAuditoria
    @id_auditoria BIGINT,
    @dry_run      BIT = 1  -- 1 = solo muestra; 0 = aplica UPDATE
       WITH EXECUTE AS 'dbo'
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM dbo.registrarSeguimientoLead_auditoria_planas WHERE id_auditoria = @id_auditoria
    )
    BEGIN
        RAISERROR(N'id_auditoria no encontrado.', 16, 1);
        RETURN;
    END;

    SELECT *
    FROM dbo.registrarSeguimientoLead_auditoria_planas
    WHERE id_auditoria = @id_auditoria;

    IF @dry_run = 1
    BEGIN
        SELECT mensaje = N'dry_run=1: no se modificó nada. Ejecutá con @dry_run=0 para restaurar.';
        RETURN;
    END;

    UPDATE s
    SET
        forma_pago              = a.forma_pago_antes,
        monto_cierre            = a.monto_cierre_antes,
        monto_efectivo          = a.monto_efectivo_antes,
        monto_transferencia     = a.monto_transferencia_antes,
        fecha_cierre            = a.fecha_cierre_antes,
        fuente                  = a.fuente_antes,
        serie_pij               = a.serie_pij_antes,
        nro_adhesion            = a.nro_adhesion_antes,
        nro_anexo               = a.nro_anexo_antes,
        numero_recibo           = a.numero_recibo_antes,
        id_producto             = a.id_producto_antes,
        estado_pago             = a.estado_pago_antes,
        id_barrio               = a.id_barrio_antes,
        dni_cliente             = a.dni_cliente_antes,
        compras_adicionales_json = a.compras_adicionales_json_antes,
        imagenes_cierre_json    = a.imagenes_cierre_json_antes,
        caja_estado             = a.caja_estado_antes,
        caja_verificado_en      = a.caja_verificado_en_antes,
        caja_comprobante_id     = a.caja_comprobante_id_antes,
        caja_motivo_rechazo     = a.caja_motivo_rechazo_antes,
        caja_sucursal           = a.caja_sucursal_antes,
        caja_confirmado_por     = a.caja_confirmado_por_antes
    FROM dbo.registrarSeguimientoLead s
    INNER JOIN dbo.registrarSeguimientoLead_auditoria_planas a
        ON a.id_seguimiento = s.id
    WHERE a.id_auditoria = @id_auditoria;

    INSERT INTO dbo.registrarSeguimientoLead_auditoria_planas (
        id_seguimiento, lead_id, motivo, evento, auditado_por, app_name, host_name
    )
    SELECT
        a.id_seguimiento, a.lead_id, N'restore', N'RESTORE',
        SUSER_SNAME(), APP_NAME(), HOST_NAME()
    FROM dbo.registrarSeguimientoLead_auditoria_planas a
    WHERE a.id_auditoria = @id_auditoria;

    SELECT mensaje = N'Restaurado desde id_auditoria=' + CAST(@id_auditoria AS NVARCHAR(20));
END;
GO

/* ---------------------------------------------------------------------------
   5) Verificación rápida
--------------------------------------------------------------------------- */
SELECT
    objeto = N'tabla auditoria',
    estado = CASE WHEN OBJECT_ID(N'dbo.registrarSeguimientoLead_auditoria_planas', N'U') IS NOT NULL
                  THEN N'OK' ELSE N'FALTA' END
UNION ALL
SELECT N'trigger',
       CASE WHEN OBJECT_ID(N'dbo.tr_registrarSeguimientoLead_auditoria_planas', N'TR') IS NOT NULL
            THEN N'OK' ELSE N'FALTA' END
UNION ALL
SELECT N'SP_Snapshot…',
       CASE WHEN OBJECT_ID(N'dbo.SP_SnapshotSeguimientoPlanasAntesMigracion', N'P') IS NOT NULL
            THEN N'OK' ELSE N'FALTA' END
UNION ALL
SELECT N'SP_Restaurar…',
       CASE WHEN OBJECT_ID(N'dbo.SP_RestaurarSeguimientoPlanasDesdeAuditoria', N'P') IS NOT NULL
            THEN N'OK' ELSE N'FALTA' END;
GO

PRINT N'Listo. Siguiente paso: EXEC dbo.SP_SnapshotSeguimientoPlanasAntesMigracion;';
GO
