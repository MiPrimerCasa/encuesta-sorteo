-- =============================================================================
-- Lectura de seguimiento SOLO por columnas planas (sin seguimiento_json)
-- Base: STRSYSTEM | Usuario API: MPCSP → GRANT EXECUTE
-- =============================================================================
-- Objetivo: acelerar panel admin y bandejas evitando traer/parsear NVARCHAR(MAX).
-- El JSON sigue grabándose en SP_RegistrarSeguimientoLead como respaldo.
--
-- Prerrequisitos:
--   - Columnas planas aplicadas (medio pago, PIJ, caja, id_venta_integral, faltantes)
--   - Tablas hijas compra/imagen pobladas (migración OK)
--
-- Actualiza:
--   1) SP_HistorialSeguimientoAdmin
--   2) SP_UltimoSeguimientoGlobal
--   3) SP_HistorialSeguimientoLead
--   4) SP_UltimoSeguimientoOperador
-- =============================================================================

USE [STRSYSTEM];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------------
   SP 1 — Historial global desde una fecha (panel superadmin)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_HistorialSeguimientoAdmin
  @desde DATETIME2 = NULL
       WITH EXECUTE AS 'dbo'
AS
BEGIN
  SET NOCOUNT ON;

  IF @desde IS NULL
    SET @desde = DATEADD(DAY, -400, CAST(SYSUTCDATETIME() AS DATE));

  SELECT
    s.id,
    s.lead_id,
    s.telefono,
    s.encuesta,
    s.confirmo_entrevista,
    s.canal,
    s.hubo_entrevista,
    s.resultado_entrevista,
    s.horario_entrevista_propuesto,
    s.fecha_reagenda,
    s.seguimiento_pij_promotor,
    s.seguimiento_agenda_operador_rol,
    s.derivacion_terreno_activa,
    s.id_producto,
    s.estado_pago,
    s.id_barrio,
    s.numero_recibo,
    s.brindo_referidos,
    s.referidos_json,
    s.observaciones,
    s.operador_id,
    s.operador_rol,
    s.operador_nombre,
    s.forma_pago,
    s.monto_cierre,
    s.monto_efectivo,
    s.monto_transferencia,
    s.fecha_cierre,
    s.fuente,
    s.titular_transferencia,
    s.titular_coincide_cliente,
    s.banco_transferencia,
    s.referencia_transferencia,
    s.serie_pij,
    s.nro_adhesion,
    s.nro_anexo,
    s.dni_cliente,
    s.caja_estado,
    s.caja_verificado_en,
    s.caja_comprobante_id,
    s.caja_motivo_rechazo,
    s.caja_sucursal,
    s.caja_confirmado_por,
    s.id_venta_integral,
    s.pij_integral_estado,
    s.pij_integral_error,
    s.pij_integral_enviado_en,
    s.fechaAlta AS creado_en
  FROM dbo.registrarSeguimientoLead s
  WHERE s.fechaAlta >= @desde
  ORDER BY s.lead_id, s.id DESC;
END;
GO

/* ---------------------------------------------------------------------------
   SP 2 — Último seguimiento de TODOS los leads (panel / batch admin)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_UltimoSeguimientoGlobal
       WITH EXECUTE AS 'dbo'
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH ranked AS (
    SELECT
      s.id,
      s.lead_id,
      s.telefono,
      s.encuesta,
      s.confirmo_entrevista,
      s.canal,
      s.hubo_entrevista,
      s.resultado_entrevista,
      s.horario_entrevista_propuesto,
      s.fecha_reagenda,
      s.seguimiento_pij_promotor,
      s.seguimiento_agenda_operador_rol,
      s.derivacion_terreno_activa,
      s.id_producto,
      s.estado_pago,
      s.id_barrio,
      s.numero_recibo,
      s.brindo_referidos,
      s.referidos_json,
      s.observaciones,
      s.operador_id,
      s.operador_rol,
      s.operador_nombre,
      s.forma_pago,
      s.monto_cierre,
      s.monto_efectivo,
      s.monto_transferencia,
      s.fecha_cierre,
      s.fuente,
      s.titular_transferencia,
      s.titular_coincide_cliente,
      s.banco_transferencia,
      s.referencia_transferencia,
      s.serie_pij,
      s.nro_adhesion,
      s.nro_anexo,
      s.dni_cliente,
      s.caja_estado,
      s.caja_verificado_en,
      s.caja_comprobante_id,
      s.caja_motivo_rechazo,
      s.caja_sucursal,
      s.caja_confirmado_por,
      s.id_venta_integral,
      s.pij_integral_estado,
      s.pij_integral_error,
      s.pij_integral_enviado_en,
      s.fechaAlta,
      ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC) AS rn
    FROM dbo.registrarSeguimientoLead s
  )
  SELECT
    id,
    lead_id,
    telefono,
    encuesta,
    confirmo_entrevista,
    canal,
    hubo_entrevista,
    resultado_entrevista,
    horario_entrevista_propuesto,
    fecha_reagenda,
    seguimiento_pij_promotor,
    seguimiento_agenda_operador_rol,
    derivacion_terreno_activa,
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
    forma_pago,
    monto_cierre,
    monto_efectivo,
    monto_transferencia,
    fecha_cierre,
    fuente,
    titular_transferencia,
    titular_coincide_cliente,
    banco_transferencia,
    referencia_transferencia,
    serie_pij,
    nro_adhesion,
    nro_anexo,
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
    pij_integral_enviado_en,
    fechaAlta AS creado_en
  FROM ranked
  WHERE rn = 1
  ORDER BY lead_id;
END;
GO

/* ---------------------------------------------------------------------------
   SP 3 — Historial de UN lead (tarjeta / detalle)
   Visibilidad: idVendedor/idSupervisor vía vendedor + lead_referido
   (misma regla que SP_ExportarCierresParaBloqueo / referidos).
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_HistorialSeguimientoLead
  @lead_id     INT,
  @id_operador INT,
  @lim         INT = 50
       WITH EXECUTE AS 'dbo'
AS
BEGIN
  SET NOCOUNT ON;
  SET @lim = CASE WHEN @lim < 1 THEN 50 WHEN @lim > 200 THEN 200 ELSE @lim END;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.encuesta e
    LEFT JOIN dbo.lead_referido lr
      ON lr.id_encuesta_referido = e.id
    LEFT JOIN mensajeria.dbo.vendedor v
      ON v.codigo = e.usuario
    WHERE e.id = @lead_id
      AND (
        COALESCE(TRY_CAST(v.idVendedor AS INT), lr.id_vendedor) = @id_operador
        OR COALESCE(TRY_CAST(v.idSupervisor AS INT), lr.id_supervisor) = @id_operador
      )
  )
  BEGIN
    RETURN;
  END;

  SELECT TOP (@lim)
    s.id,
    s.lead_id,
    s.telefono,
    s.encuesta,
    s.confirmo_entrevista,
    s.canal,
    s.hubo_entrevista,
    s.resultado_entrevista,
    s.horario_entrevista_propuesto,
    s.fecha_reagenda,
    s.seguimiento_pij_promotor,
    s.seguimiento_agenda_operador_rol,
    s.derivacion_terreno_activa,
    s.id_producto,
    s.estado_pago,
    s.id_barrio,
    s.numero_recibo,
    s.brindo_referidos,
    s.referidos_json,
    s.observaciones,
    s.operador_id,
    s.operador_rol,
    s.operador_nombre,
    s.forma_pago,
    s.monto_cierre,
    s.monto_efectivo,
    s.monto_transferencia,
    s.fecha_cierre,
    s.fuente,
    s.titular_transferencia,
    s.titular_coincide_cliente,
    s.banco_transferencia,
    s.referencia_transferencia,
    s.serie_pij,
    s.nro_adhesion,
    s.nro_anexo,
    s.dni_cliente,
    s.caja_estado,
    s.caja_verificado_en,
    s.caja_comprobante_id,
    s.caja_motivo_rechazo,
    s.caja_sucursal,
    s.caja_confirmado_por,
    s.id_venta_integral,
    s.pij_integral_estado,
    s.pij_integral_error,
    s.pij_integral_enviado_en,
    s.fechaAlta AS creado_en
  FROM dbo.registrarSeguimientoLead s
  WHERE s.lead_id = @lead_id
  ORDER BY s.id DESC;
END;
GO

/* ---------------------------------------------------------------------------
   SP 4 — Último seguimiento de leads visibles al operador (bandejas)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_UltimoSeguimientoOperador
  @id_operador INT
       WITH EXECUTE AS 'dbo'
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH leads_visibles AS (
    SELECT e.id AS lead_id
    FROM dbo.encuesta e
    LEFT JOIN dbo.lead_referido lr
      ON lr.id_encuesta_referido = e.id
    LEFT JOIN mensajeria.dbo.vendedor v
      ON v.codigo = e.usuario
    WHERE COALESCE(TRY_CAST(v.idVendedor AS INT), lr.id_vendedor) = @id_operador
       OR COALESCE(TRY_CAST(v.idSupervisor AS INT), lr.id_supervisor) = @id_operador
  ),
  ranked AS (
    SELECT
      s.id,
      s.lead_id,
      s.telefono,
      s.encuesta,
      s.confirmo_entrevista,
      s.canal,
      s.hubo_entrevista,
      s.resultado_entrevista,
      s.horario_entrevista_propuesto,
      s.fecha_reagenda,
      s.seguimiento_pij_promotor,
      s.seguimiento_agenda_operador_rol,
      s.derivacion_terreno_activa,
      s.id_producto,
      s.estado_pago,
      s.id_barrio,
      s.numero_recibo,
      s.brindo_referidos,
      s.referidos_json,
      s.observaciones,
      s.operador_id,
      s.operador_rol,
      s.operador_nombre,
      s.forma_pago,
      s.monto_cierre,
      s.monto_efectivo,
      s.monto_transferencia,
      s.fecha_cierre,
      s.fuente,
      s.titular_transferencia,
      s.titular_coincide_cliente,
      s.banco_transferencia,
      s.referencia_transferencia,
      s.serie_pij,
      s.nro_adhesion,
      s.nro_anexo,
      s.dni_cliente,
      s.caja_estado,
      s.caja_verificado_en,
      s.caja_comprobante_id,
      s.caja_motivo_rechazo,
      s.caja_sucursal,
      s.caja_confirmado_por,
      s.id_venta_integral,
      s.pij_integral_estado,
      s.pij_integral_error,
      s.pij_integral_enviado_en,
      s.fechaAlta,
      ROW_NUMBER() OVER (PARTITION BY s.lead_id ORDER BY s.id DESC) AS rn
    FROM dbo.registrarSeguimientoLead s
    INNER JOIN leads_visibles lv ON lv.lead_id = s.lead_id
  )
  SELECT
    id,
    lead_id,
    telefono,
    encuesta,
    confirmo_entrevista,
    canal,
    hubo_entrevista,
    resultado_entrevista,
    horario_entrevista_propuesto,
    fecha_reagenda,
    seguimiento_pij_promotor,
    seguimiento_agenda_operador_rol,
    derivacion_terreno_activa,
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
    forma_pago,
    monto_cierre,
    monto_efectivo,
    monto_transferencia,
    fecha_cierre,
    fuente,
    titular_transferencia,
    titular_coincide_cliente,
    banco_transferencia,
    referencia_transferencia,
    serie_pij,
    nro_adhesion,
    nro_anexo,
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
    pij_integral_enviado_en,
    fechaAlta AS creado_en
  FROM ranked
  WHERE rn = 1
  ORDER BY lead_id;
END;
GO

GRANT EXECUTE ON dbo.SP_HistorialSeguimientoAdmin TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoGlobal TO [MPCSP];
GRANT EXECUTE ON dbo.SP_HistorialSeguimientoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoOperador TO [MPCSP];
GO

-- Verificacion rapida (como DBA o MPCSP):
-- EXEC dbo.SP_UltimoSeguimientoGlobal;
-- EXEC dbo.SP_HistorialSeguimientoAdmin @desde = '2026-01-01';
-- En el result set NO debe aparecer la columna seguimiento_json.
-- Si deben aparecer: fecha_cierre, forma_pago, serie_pij, dni_cliente, caja_estado, etc.
