/*
  Pablo — STRSYSTEM
  Fix idVendedor/idSupervisor: JOIN encuesta.usuario → mensajeria.dbo.vendedor.codigo
  (+ campo3/campo4 NULL, respaldo @id_vendedor/@id_supervisor desde app)

  Ejecutar este script completo.
*/

USE STRSYSTEM;
GO

CREATE OR ALTER PROCEDURE dbo.SP_RegistrarReferidoLead
  @id_encuesta_origen       INT,
  @telefono                 NVARCHAR(50),
  @nombre                   NVARCHAR(200),
  @encuesta                 NVARCHAR(50),
  @usuario                  NVARCHAR(100),
  @operador_id              INT,
  @operador_rol             NVARCHAR(16),
  @id_registro_seguimiento  INT = NULL,
  @id_vendedor              INT = NULL,
  @id_supervisor            INT = NULL,
  @origen_carga             CHAR(1) = '2',
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

  IF NOT EXISTS (SELECT 1 FROM dbo.encuesta e WHERE e.id = @id_encuesta_origen)
  BEGIN
    SET @mensaje = N'Lead origen no encontrado en encuesta.';
    RETURN;
  END;

  SELECT
    @id_vendedor = COALESCE(TRY_CAST(v.idVendedor AS INT), @id_vendedor),
    @id_supervisor = COALESCE(TRY_CAST(v.idSupervisor AS INT), @id_supervisor)
  FROM dbo.encuesta e
  INNER JOIN mensajeria.dbo.vendedor v ON e.usuario = v.codigo
  WHERE e.id = @id_encuesta_origen;

  SELECT TOP (1)
    @nivel = lr.nivel + 1,
    @id_raiz = COALESCE(lr.id_encuesta_raiz, lr.id_encuesta_origen),
    @id_vendedor = COALESCE(@id_vendedor, lr.id_vendedor),
    @id_supervisor = COALESCE(@id_supervisor, lr.id_supervisor)
  FROM dbo.lead_referido lr
  WHERE lr.id_encuesta_referido = @id_encuesta_origen
  ORDER BY lr.id DESC;

  IF @id_raiz IS NULL
    SET @id_raiz = @id_encuesta_origen;

  IF @id_vendedor IS NULL AND @rol_norm = N'promotor'
    SET @id_vendedor = @operador_id;
  IF @id_supervisor IS NULL AND @rol_norm = N'supervisor'
    SET @id_supervisor = @operador_id;

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

    EXEC dbo.encuestaCargaSorteo01
      @telefono = @tel_norm,
      @encuesta = @encuesta,
      @usuario = @usuario,
      @campo1Codigo = 1, @campo1Valor = @nombre_trim,
      @campo2Codigo = 2, @campo2Valor = @campo2_valor,
      @campo3Codigo = 3, @campo3Valor = NULL,
      @campo4Codigo = 4, @campo4Valor = NULL,
      @campo5Codigo = 5, @campo5Valor = N'NO',
      @campo6Codigo = 6, @campo6Valor = N'',
      @campo7Codigo = 7, @campo7Valor = N'',
      @campo8Codigo = 8, @campo8Valor = N'',
      @origen = @origen_carga;

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
      id_encuesta_referido, id_encuesta_origen, id_encuesta_raiz, nivel,
      encuesta, telefono_referido, nombre_referido,
      id_vendedor, id_supervisor, codigo_promotor,
      operador_id, operador_rol, id_registro_seguimiento, visible_supervisor
    )
    VALUES (
      @id_encuesta_referido, @id_encuesta_origen, @id_raiz, @nivel,
      @encuesta, @tel_norm, @nombre_trim,
      @id_vendedor, @id_supervisor, @usuario,
      @operador_id, @rol_norm, @id_registro_seguimiento, 1
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

GRANT EXECUTE ON dbo.SP_RegistrarReferidoLead TO [MPCSP];
GO
