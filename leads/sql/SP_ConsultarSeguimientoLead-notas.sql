-- =============================================================================
-- SP DE LECTURA — Seguimiento CRM Mi Primer Casa
-- Base: STRSYSTEM | Usuario API: MPCSP (solo GRANT EXECUTE)
-- =============================================================================
--
-- YA EXISTE (guardar):
--   dbo.SP_RegistrarSeguimientoLead
--
-- CREAR (leer):
--   dbo.SP_HistorialSeguimientoLead   → historial de UN lead (tarjeta / detalle)
--   dbo.SP_UltimoSeguimientoOperador    → último seguimiento de TODOS los leads
--                                         visibles para el operador logueado
--
-- REGLA DE NEGOCIO (igual que encuestasMuestraOperador):
--   @id_operador = idOperador del login (header x-usuario-id).
--   SUPERVISOR: ve seguimiento de todos los leads de su equipo (idSupervisor).
--   PROMOTOR:   ve solo seguimiento de sus propios leads (idVendedor).
--
-- IMPORTANTE DBA: reemplazar [TABLA_ENCUESTA] y nombres de columnas por los
-- mismos que usa encuestasMuestraOperador (id, idVendedor, idSupervisor).
-- =============================================================================

USE STRSYSTEM;
GO

/* ---------------------------------------------------------------------------
   Helper (opcional): leads que puede ver el operador.
   Debe coincidir con el filtro de encuestasMuestraOperador.
--------------------------------------------------------------------------- */
/*
CREATE OR ALTER VIEW dbo.vw_LeadsVisiblesOperador AS
SELECT
  e.id AS lead_id,
  e.idVendedor,
  e.idSupervisor
FROM dbo.[TABLA_ENCUESTA] e;  -- ej. encuesta / vista del SP de listado
GO
*/

/* ---------------------------------------------------------------------------
   SP 1 — Historial de seguimiento de UN lead
   Uso app: historial en tarjeta del lead, GET /api/leads/:id/historial
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_HistorialSeguimientoLead
  @lead_id     INT,
  @id_operador INT,
  @lim         INT = 50
AS
BEGIN
  SET NOCOUNT ON;
  SET @lim = CASE WHEN @lim < 1 THEN 50 WHEN @lim > 200 THEN 200 ELSE @lim END;

  -- Seguridad: el operador solo ve historial si el lead es suyo o de su equipo
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.[TABLA_ENCUESTA] e
    WHERE e.id = @lead_id
      AND (
        e.idVendedor = @id_operador      -- promotor: lead propio
        OR e.idSupervisor = @id_operador -- supervisor: lead del equipo
      )
  )
  BEGIN
    RETURN; -- sin filas = lead no autorizado
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
    s.creado_en
  FROM dbo.registrarSeguimientoLead s
  WHERE s.lead_id = @lead_id
  ORDER BY s.id DESC;
END;
GO

/* ---------------------------------------------------------------------------
   SP 2 — Último seguimiento de todos los leads del operador
   Uso app: listado GET /api/leads (pestañas Prioridad, Contactado, etc.)
   
   Lógica:
   1) Tomar leads visibles para @id_operador (supervisor → equipo; promotor → propios)
   2) Por cada lead_id, traer la fila más reciente de registrarSeguimientoLead (MAX id)
   3) Si un lead nunca tuvo seguimiento guardado, no devuelve fila (app usa encuesta)
--------------------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.SP_UltimoSeguimientoOperador
  @id_operador INT
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH leads_visibles AS (
    SELECT e.id AS lead_id
    FROM dbo.[TABLA_ENCUESTA] e
    WHERE e.idVendedor = @id_operador
       OR e.idSupervisor = @id_operador
  ),
  ranked AS (
    SELECT
      s.*,
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
    creado_en
  FROM ranked
  WHERE rn = 1
  ORDER BY lead_id;
END;
GO

GRANT EXECUTE ON dbo.SP_HistorialSeguimientoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_UltimoSeguimientoOperador TO [MPCSP];
GO

-- Pruebas
-- EXEC dbo.SP_HistorialSeguimientoLead @lead_id = 206, @id_operador = 132, @lim = 20;
-- EXEC dbo.SP_UltimoSeguimientoOperador @id_operador = 132;   -- supervisor
-- EXEC dbo.SP_UltimoSeguimientoOperador @id_operador = 3;    -- promotor
