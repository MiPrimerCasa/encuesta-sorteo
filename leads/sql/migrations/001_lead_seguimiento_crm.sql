/*
  Tablas CRM — Seguimiento de Leads (Mi Primer Casa S.A.)
  Ejecutar en SQL Server acordado con el DBA (STRSYSTEM o base CRM dedicada).
  NO modifica la tabla encuesta de la landing.

  Permisos sugeridos para usuario de la app:
    - SELECT en encuesta / vistas de lectura
    - EXEC en operadorAccesoCategoria, encuestasMuestraOperador
    - CRUD en tablas de este script
*/

-- Estado de seguimiento comercial (independiente de campo5–8 de encuesta)
IF OBJECT_ID('dbo.lead_seguimiento_crm', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_seguimiento_crm (
    id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    lead_key        NVARCHAR(120) NOT NULL,  -- ej. telefono|sorteo01 o usuario encuesta
    telefono        NVARCHAR(32) NULL,
    encuesta        NVARCHAR(64) NULL,
    estado          NVARCHAR(32) NOT NULL DEFAULT 'nuevo',
    -- nuevo | en_gestion | contactado | no_interesado | cerrado | compro
    asignado_a      NVARCHAR(120) NULL,
    id_operador     INT NULL,
    seguimiento_json NVARCHAR(MAX) NULL,
    creado_en       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    actualizado_en  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    actualizado_por NVARCHAR(120) NULL,
    CONSTRAINT UQ_lead_seguimiento_crm_key UNIQUE (lead_key)
  );
  CREATE INDEX IX_lead_seguimiento_crm_estado ON dbo.lead_seguimiento_crm (estado);
  CREATE INDEX IX_lead_seguimiento_crm_encuesta ON dbo.lead_seguimiento_crm (encuesta);
END;
GO

IF OBJECT_ID('dbo.lead_nota_crm', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_nota_crm (
    id           INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    lead_key     NVARCHAR(120) NOT NULL,
    texto        NVARCHAR(MAX) NOT NULL,
    autor_id     NVARCHAR(64) NULL,
    autor_nombre NVARCHAR(200) NULL,
    creado_en    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_lead_nota_crm_seguimiento
      FOREIGN KEY (lead_key) REFERENCES dbo.lead_seguimiento_crm (lead_key)
  );
  CREATE INDEX IX_lead_nota_crm_lead_key ON dbo.lead_nota_crm (lead_key);
END;
GO

/*
  Vista de lectura (ejemplo — ajustar nombres de columnas reales en encuesta):

  CREATE OR ALTER VIEW dbo.vw_leads_encuesta_crm AS
  SELECT
    e.id,
    e.telefono,
    e.encuesta,
    e.fechaAlta,
    e.usuario,
    e.campo1Valor AS apellido_nombres,
    e.campo2Valor AS domicilio_barrio,
    e.campo5Valor AS quiere_mas_info,
    e.campo6Valor AS fecha_hora_entrevista,
    e.campo7Valor AS modalidad_contacto,
    e.campo8Valor AS domicilio_entrevista
  FROM dbo.encuesta e;
*/
