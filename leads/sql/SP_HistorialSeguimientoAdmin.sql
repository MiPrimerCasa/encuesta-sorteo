-- =============================================================================
-- Lectura de seguimiento SOLO vía SP (sin GRANT SELECT a MPCSP en la tabla)
-- Panel superadmin + métricas globales (RF-35)
-- Base: STRSYSTEM | Usuario API: MPCSP → solo GRANT EXECUTE
-- =============================================================================
-- Actualizado: sin seguimiento_json; proyecta columnas planas (cierres/caja/PIJ).
-- Script DBA unificado: sql/SP_LecturaSeguimiento-columnas-planas.sql
-- =============================================================================

USE STRSYSTEM;
GO

/* ---------------------------------------------------------------------------
   SP 3 — Historial global desde una fecha (panel superadmin)
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
   SP 4 — Último seguimiento de TODOS los leads (sin filtro operador)
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

GRANT EXECUTE ON dbo.SP_HistorialSeguimientoAdmin TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoGlobal TO [MPCSP];
GO

-- EXEC dbo.SP_HistorialSeguimientoAdmin @desde = '2025-01-01';
-- EXEC dbo.SP_UltimoSeguimientoGlobal;
