/*
  Pablo — STRSYSTEM
  Fix: referidos no deben escribir en campo3/campo4 de encuesta
       (campo3 = Conoce MPC, campo4 = pregunta PIJ).

  Ejecutar TODO este archivo en SQL Server Management Studio.
  La tabla lead_referido ya existe; acá solo se actualiza el SP y se limpian filas afectadas.
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

  SELECT TOP (1)
    @nivel = lr.nivel + 1,
    @id_raiz = COALESCE(lr.id_encuesta_raiz, lr.id_encuesta_origen)
  FROM dbo.lead_referido lr
  WHERE lr.id_encuesta_referido = @id_encuesta_origen
  ORDER BY lr.id DESC;

  IF @id_raiz IS NULL
    SET @id_raiz = @id_encuesta_origen;

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

    -- FIX: campo3 y campo4 en NULL (no pisar Conoce MPC ni pregunta PIJ)
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

-- Limpiar referidos de prueba que quedaron con texto en campo3/campo4
UPDATE e
SET
  e.campo3Valor = NULL,
  e.campo4Valor = NULL
FROM dbo.encuesta e
INNER JOIN dbo.lead_referido lr ON lr.id_encuesta_referido = e.id
WHERE e.campo3Valor LIKE N'Referido de lead #%'
   OR e.campo4Valor LIKE N'Raíz #%'
   OR e.campo3Valor LIKE N'Referido de %'
   OR e.campo4Valor LIKE N'Ra%z #%';
GO

-- Permisos (solo EXECUTE — sin GRANT en tabla lead_referido)
GRANT EXECUTE ON dbo.SP_RegistrarReferidoLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ContarReferidosLead TO [MPCSP];
GRANT EXECUTE ON dbo.SP_ObtenerMetaReferidosLead TO [MPCSP];
GO

-- Verificación rápida
EXEC dbo.SP_ObtenerMetaReferidosLead @ids_encuesta = N'239';
GO
