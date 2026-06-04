/*
  Referidos vinculados a encuesta — Mi Primer Casa S.A.
  Ejecutar en STRSYSTEM (o base acordada con DBA).

  Objetivo:
  - Cada referido brindado en seguimiento → fila en encuesta + vínculo en lead_referido
  - Árbol: un referido puede referir a otros (nivel, id_encuesta_raiz)
  - Visibilidad: cargado por supervisor → NO lo ve el promotor; cargado por promotor → SÍ lo ve el supervisor
  - Base para descuentos por cuota según referidos (directos e indirectos)

  La app llama SP_RegistrarReferidoLead (ver server/db/referidos-carga.js).
  encuestasMuestraOperador debe filtrar según lead_referido (ver docs/FUNCIONALIDAD_REFERIDOS_ENCUESTA.md).
*/

USE STRSYSTEM;
GO

-- =============================================================================
-- 1. Tabla de vínculos referido ↔ encuesta
-- =============================================================================
IF OBJECT_ID(N'dbo.lead_referido', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_referido (
    id                      INT IDENTITY(1,1) NOT NULL
      CONSTRAINT PK_lead_referido PRIMARY KEY,

    -- Lead nuevo (referido) ya insertado/actualizado en dbo.encuesta
    id_encuesta_referido    INT NOT NULL,

    -- Lead que brindó el referido (puede ser otro referido → cadena)
    id_encuesta_origen      INT NOT NULL,

    -- Raíz del árbol (primer cliente de la cadena; útil para descuentos)
    id_encuesta_raiz        INT NULL,

    -- 1 = referido directo del origen; 2 = referido de un referido; etc.
    nivel                   INT NOT NULL
      CONSTRAINT DF_lead_referido_nivel DEFAULT (1),

    encuesta                NVARCHAR(64) NOT NULL,
    telefono_referido       NVARCHAR(32) NOT NULL,
    nombre_referido         NVARCHAR(200) NOT NULL,

    -- Equipo comercial (heredado del lead origen al momento del alta)
    id_vendedor             INT NULL,
    id_supervisor           INT NULL,
    codigo_promotor         NVARCHAR(120) NULL,

    -- Quién registró el referido desde la app
    operador_id             INT NOT NULL,
    operador_rol            NVARCHAR(16) NOT NULL,  -- promotor | supervisor

    -- Fila de registrarSeguimientoLead que disparó el alta (opcional)
    id_registro_seguimiento INT NULL,

    /*
      Visibilidad en bandejas:
      - Referido cargado por SUPERVISOR → promotor NO lo ve (visible_promotor = 0)
      - Referido cargado por PROMOTOR → supervisor SÍ lo ve (visible_supervisor = 1)
    */
    visible_promotor        AS (
      CASE WHEN operador_rol = N'promotor' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
    ) PERSISTED,
    visible_supervisor      BIT NOT NULL
      CONSTRAINT DF_lead_referido_vis_sup DEFAULT (1),

    creado_en               DATETIME2(3) NOT NULL
      CONSTRAINT DF_lead_referido_creado DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT UQ_lead_referido_encuesta_tel UNIQUE (encuesta, telefono_referido)
  );

  CREATE INDEX IX_lead_referido_origen
    ON dbo.lead_referido (id_encuesta_origen);

  CREATE INDEX IX_lead_referido_raiz
    ON dbo.lead_referido (id_encuesta_raiz)
    WHERE id_encuesta_raiz IS NOT NULL;

  CREATE INDEX IX_lead_referido_vendedor
    ON dbo.lead_referido (id_vendedor, encuesta);

  CREATE INDEX IX_lead_referido_supervisor
    ON dbo.lead_referido (id_supervisor, encuesta);
END;
GO

-- =============================================================================
-- 2. SP: registrar referido (encuesta + vínculo)
-- =============================================================================
/*
  Flujo:
  1. Valida lead origen
  2. EXEC encuestaCargaSorteo01 (@origen configurable, default '2')
  3. Obtiene @id_encuesta_referido (OUTPUT del SP de carga o SELECT por tel+encuesta)
  4. INSERT lead_referido (nivel / raíz según padre)
  5. Retorna codigo, gestionCodigo, id_encuesta_referido, id_lead_referido

  NOTA DBA: adaptar nombres de columnas idVendedor/idSupervisor en encuesta si difieren.
*/
CREATE OR ALTER PROCEDURE dbo.SP_RegistrarReferidoLead
  @id_encuesta_origen       INT,
  @telefono                 NVARCHAR(50),
  @nombre                   NVARCHAR(200),
  @encuesta                 NVARCHAR(50),
  @usuario                  NVARCHAR(100),   -- código promotor (SORTEO01S21P01)
  @operador_id              INT,
  @operador_rol             NVARCHAR(16),    -- promotor | supervisor
  @id_registro_seguimiento  INT = NULL,
  @origen_carga             CHAR(1) = '2',   -- mismo que carga manual; DBA puede usar otro para referidos
  @campo2_valor             NVARCHAR(200) = NULL,
  @id_encuesta_referido     INT = NULL OUTPUT,
  @id_lead_referido         INT = NULL OUTPUT,
  @codigo                   INT = NULL OUTPUT,
  @gestionCodigo            INT = NULL OUTPUT,
  @mensaje                  NVARCHAR(500) = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @id_vendedor INT;
  DECLARE @id_supervisor INT;
  DECLARE @id_raiz INT;
  DECLARE @nivel INT = 1;
  DECLARE @tel_norm NVARCHAR(50) = LTRIM(RTRIM(@telefono));
  DECLARE @nombre_trim NVARCHAR(200) = LTRIM(RTRIM(@nombre));
  DECLARE @enc_norm NVARCHAR(50) = LOWER(LTRIM(RTRIM(@encuesta)));
  DECLARE @rol_norm NVARCHAR(16) = LOWER(LTRIM(RTRIM(@operador_rol)));

  SET @codigo = 0;
  SET @gestionCodigo = 0;
  SET @mensaje = N'';

  IF @id_encuesta_origen IS NULL OR @id_encuesta_origen <= 0
  BEGIN
    SET @mensaje = N'id_encuesta_origen inválido.';
    RETURN;
  END;

  IF @nombre_trim = N'' OR @tel_norm = N''
  BEGIN
    SET @mensaje = N'Nombre y teléfono son obligatorios.';
    RETURN;
  END;

  IF @rol_norm NOT IN (N'promotor', N'supervisor')
  BEGIN
    SET @mensaje = N'operador_rol debe ser promotor o supervisor.';
    RETURN;
  END;

  -- Datos del lead origen (ajustar columnas según esquema real de encuesta)
  SELECT
    @id_vendedor = TRY_CAST(e.idVendedor AS INT),
    @id_supervisor = TRY_CAST(e.idSupervisor AS INT)
  FROM dbo.encuesta e
  WHERE e.id = @id_encuesta_origen;

  IF @@ROWCOUNT = 0
  BEGIN
    SET @mensaje = N'Lead origen no encontrado en encuesta.';
    RETURN;
  END;

  -- Cadena: si el origen ya es un referido, subir nivel y conservar raíz
  SELECT TOP (1)
    @nivel = lr.nivel + 1,
    @id_raiz = COALESCE(lr.id_encuesta_raiz, lr.id_encuesta_origen)
  FROM dbo.lead_referido lr
  WHERE lr.id_encuesta_referido = @id_encuesta_origen
  ORDER BY lr.id DESC;

  IF @id_raiz IS NULL
    SET @id_raiz = @id_encuesta_origen;

  -- Ya vinculado como referido en esta campaña
  IF EXISTS (
    SELECT 1 FROM dbo.lead_referido lr
    WHERE lr.encuesta = @encuesta AND lr.telefono_referido = @tel_norm
  )
  BEGIN
    SELECT TOP (1)
      @id_encuesta_referido = lr.id_encuesta_referido,
      @id_lead_referido = lr.id
    FROM dbo.lead_referido lr
    WHERE lr.encuesta = @encuesta AND lr.telefono_referido = @tel_norm;

    SET @codigo = 1;
    SET @gestionCodigo = 0;
    SET @mensaje = N'El referido ya estaba registrado en esta campaña.';
    RETURN;
  END;

  BEGIN TRY
    BEGIN TRAN;

    -- Alta/upsert en encuesta (mismo SP que carga manual)
    DECLARE @campo3 NVARCHAR(200) = LEFT(N'Referido de lead #' + CAST(@id_encuesta_origen AS NVARCHAR(20)), 200);
    DECLARE @campo4 NVARCHAR(200) = LEFT(N'Raíz #' + CAST(@id_raiz AS NVARCHAR(20)), 200);

    EXEC dbo.encuestaCargaSorteo01
      @telefono = @tel_norm,
      @encuesta = @encuesta,
      @usuario = @usuario,
      @campo1Codigo = 1, @campo1Valor = @nombre_trim,
      @campo2Codigo = 2, @campo2Valor = @campo2_valor,
      @campo3Codigo = 3, @campo3Valor = @campo3,
      @campo4Codigo = 4, @campo4Valor = @campo4,
      @campo5Codigo = 5, @campo5Valor = N'NO',
      @campo6Codigo = 6, @campo6Valor = N'',
      @campo7Codigo = 7, @campo7Valor = N'',
      @campo8Codigo = 8, @campo8Valor = N'',
      @origen = @origen_carga;

    -- Resolver id del referido en encuesta (ajustar si encuestaCargaSorteo01 devuelve OUTPUT)
    SELECT TOP (1) @id_encuesta_referido = e.id
    FROM dbo.encuesta e
    WHERE LOWER(LTRIM(RTRIM(e.encuesta))) = @enc_norm
      AND REPLACE(REPLACE(REPLACE(e.telefono, N' ', N''), N'-', N''), N'+', N'') =
          REPLACE(REPLACE(REPLACE(@tel_norm, N' ', N''), N'-', N''), N'+', N'')
    ORDER BY e.id DESC;

    IF @id_encuesta_referido IS NULL
    BEGIN
      ROLLBACK TRAN;
      SET @mensaje = N'encuestaCargaSorteo01 ejecutó pero no se encontró el referido en encuesta.';
      RETURN;
    END;

    INSERT dbo.lead_referido (
      id_encuesta_referido,
      id_encuesta_origen,
      id_encuesta_raiz,
      nivel,
      encuesta,
      telefono_referido,
      nombre_referido,
      id_vendedor,
      id_supervisor,
      codigo_promotor,
      operador_id,
      operador_rol,
      id_registro_seguimiento,
      visible_supervisor
    )
    VALUES (
      @id_encuesta_referido,
      @id_encuesta_origen,
      @id_raiz,
      @nivel,
      @encuesta,
      @tel_norm,
      @nombre_trim,
      @id_vendedor,
      @id_supervisor,
      @usuario,
      @operador_id,
      @rol_norm,
      @id_registro_seguimiento,
      1
    );

    SET @id_lead_referido = SCOPE_IDENTITY();
    SET @codigo = 1;
    SET @gestionCodigo = 1;
    SET @mensaje = N'Referido registrado correctamente.';

    COMMIT TRAN;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    SET @mensaje = ERROR_MESSAGE();
    SET @codigo = 0;
    SET @gestionCodigo = 0;
  END CATCH;
END;
GO

-- =============================================================================
-- 3. SP auxiliar: conteo para descuento por cuota (directos + cadena)
-- =============================================================================
CREATE OR ALTER PROCEDURE dbo.SP_ContarReferidosLead
  @id_encuesta          INT,
  @solo_con_cierre      BIT = 0,   -- 1 = solo referidos que cerraron venta
  @incluir_cadena       BIT = 1,   -- 1 = nietos, bisnietos, etc.
  @total                INT = NULL OUTPUT,
  @total_directos       INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH arbol AS (
    SELECT lr.id, lr.id_encuesta_referido, lr.id_encuesta_origen, lr.nivel
    FROM dbo.lead_referido lr
    WHERE lr.id_encuesta_origen = @id_encuesta
       OR (@incluir_cadena = 1 AND lr.id_encuesta_raiz = @id_encuesta)

    UNION ALL

    SELECT lr.id, lr.id_encuesta_referido, lr.id_encuesta_origen, lr.nivel
    FROM dbo.lead_referido lr
    INNER JOIN arbol a ON lr.id_encuesta_origen = a.id_encuesta_referido
    WHERE @incluir_cadena = 1
  )
  SELECT
    @total = COUNT(DISTINCT a.id_encuesta_referido),
    @total_directos = COUNT(DISTINCT CASE WHEN a.nivel = 1 THEN a.id_encuesta_referido END)
  FROM arbol a
  WHERE @solo_con_cierre = 0
     OR EXISTS (
       SELECT 1
       FROM dbo.registrarSeguimientoLead s
       WHERE s.lead_id = a.id_encuesta_referido
         AND s.resultado_entrevista = N'compro'
     );
END;
GO

-- =============================================================================
-- 4. SP consulta metadatos (app no accede directo a lead_referido)
-- =============================================================================
CREATE OR ALTER PROCEDURE dbo.SP_ObtenerMetaReferidosLead
  @ids_encuesta NVARCHAR(MAX)  -- ids separados por coma: '100,201,202'
AS
BEGIN
  SET NOCOUNT ON;

  IF @ids_encuesta IS NULL OR LTRIM(RTRIM(@ids_encuesta)) = N''
    RETURN;

  ;WITH ids AS (
    SELECT TRY_CAST(LTRIM(RTRIM(ss.value)) AS INT) AS id_encuesta
    FROM STRING_SPLIT(@ids_encuesta, N',') ss
    WHERE TRY_CAST(LTRIM(RTRIM(ss.value)) AS INT) IS NOT NULL
      AND TRY_CAST(LTRIM(RTRIM(ss.value)) AS INT) > 0
  )
  SELECT
    lr.id_encuesta_referido,
    lr.id_encuesta_origen,
    lr.id_encuesta_raiz,
    lr.nivel,
    lr.operador_rol,
    lr.visible_promotor
  FROM dbo.lead_referido lr
  INNER JOIN ids i ON i.id_encuesta = lr.id_encuesta_referido;
END;
GO

-- =============================================================================
-- 5. Permisos app (MPCSP) — solo EXECUTE en SP, sin acceso directo a tablas
-- =============================================================================
GRANT EXECUTE ON dbo.SP_RegistrarReferidoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ContarReferidosLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ObtenerMetaReferidosLead TO [MPCSP];
GO

/*
  =============================================================================
  6. CAMBIO REQUERIDO en encuestasMuestraOperador (DBA — pseudocódigo)
  =============================================================================

  Al listar filas de encuesta para @idVendedor:

  -- Promotor: ocultar referidos cargados por supervisor del mismo equipo
  AND NOT EXISTS (
    SELECT 1 FROM dbo.lead_referido lr
    WHERE lr.id_encuesta_referido = e.id
      AND lr.operador_rol = N'supervisor'
      AND lr.id_vendedor = @idVendedor
  )

  -- Supervisor (@idOperador = idSupervisor): incluir referidos del equipo
  -- (promotor y supervisor), además de su listado habitual.

  Opcional: devolver columna es_referido, id_encuesta_origen, nivel
  LEFT JOIN dbo.lead_referido lr ON lr.id_encuesta_referido = e.id

  =============================================================================
*/
