-- Historial append-only de seguimiento CRM (migración desde SQLite local).
-- Una fila por cada guardado distinto; el estado actual sigue en lead_seguimiento (snapshot).

/*
CREATE TABLE dbo.lead_seguimiento_historial (
  id                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  lead_id           INT NOT NULL,              -- PK encuesta.id
  encuesta          NVARCHAR(64) NOT NULL,     -- sorteo01, sorteo02…
  operador_id       INT NULL,
  operador_rol      NVARCHAR(16) NULL,         -- promotor | supervisor
  operador_nombre   NVARCHAR(200) NOT NULL,
  estado_etiqueta   NVARCHAR(500) NOT NULL,    -- resumen UI
  resultado_entrevista NVARCHAR(16) NULL,
  pestana           NVARCHAR(32) NULL,         -- prioridad | contactado | seguimiento | cierres
  seguimiento_json  NVARCHAR(MAX) NOT NULL,    -- snapshot completo post-merge
  creado_en         DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_lead_seguimiento_historial_lead
  ON dbo.lead_seguimiento_historial (lead_id, creado_en DESC);

-- Estado actual (reemplaza lead_seguimiento_externo en VPS):
CREATE TABLE dbo.lead_seguimiento (
  lead_id           INT NOT NULL PRIMARY KEY,
  encuesta          NVARCHAR(64) NOT NULL,
  seguimiento_json  NVARCHAR(MAX) NOT NULL,
  actualizado_en    DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  actualizado_por   INT NULL
);
*/
