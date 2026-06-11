-- =============================================================================
-- Lectura de seguimiento SOLO vía SP (sin GRANT SELECT a MPCSP en la tabla)
-- Panel superadmin + métricas globales (RF-35)
-- Base: STRSYSTEM | Usuario API: MPCSP → solo GRANT EXECUTE
-- =============================================================================
--
-- Prerequisitos:
--   - dbo.registrarSeguimientoLead con columna creado_en (ver SP_RegistrarSeguimientoLead-notas.sql)
--   - dbo.SP_RegistrarSeguimientoLead (INSERT vía SP, no GRANT INSERT al usuario)
--
USE STRSYSTEM;
GO

/* ---------------------------------------------------------------------------
   SP 3 — Historial global desde una fecha (panel superadmin)
   Uso app: GET /api/admin/dashboard — gráficos, KPIs hoy, rankings semana
   Sin filtro operador: la app valida rol superadmin antes de llamar.
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_HistorialSeguimientoAdmin
  @desde DATETIME2 = NULL
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
    s.seguimiento_json,
    s.fechaAlta AS creado_en
  FROM dbo.registrarSeguimientoLead s
  WHERE s.fechaAlta >= @desde
  ORDER BY s.lead_id, s.id DESC;
END;
GO

/* ---------------------------------------------------------------------------
   SP 4 — Último seguimiento de TODOS los leads (sin filtro operador)
   Uso app: listado superadmin cuando encuestasMuestra no trae idSupervisor
   Alternativa a N llamadas a SP_UltimoSeguimientoOperador por supervisor.
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_UltimoSeguimientoGlobal
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH ranked AS (
    SELECT
      s.*,
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
    fechaAlta AS creado_en
  FROM ranked
  WHERE rn = 1
  ORDER BY lead_id;
END;
GO

GRANT EXECUTE ON dbo.SP_HistorialSeguimientoAdmin TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoGlobal TO [MPCSP];
GO

-- Pruebas (como MPCSP):
-- EXEC dbo.SP_HistorialSeguimientoAdmin @desde = '2025-01-01';
-- EXEC dbo.SP_UltimoSeguimientoGlobal;
