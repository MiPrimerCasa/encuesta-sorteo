/*
 Obsoleto — reemplazado por encuestaSorteo01Update (sql/encuestaSorteo01Update.sql).
 La app usa SP_MODIFICAR_ENCUESTA=encuestaSorteo01Update

 El script de abajo se conserva solo como referencia histórica.
*/

USE [STRSYSTEM]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[encuestaModificarSorteo01]
  @idEncuesta   int,
  @telefono     nvarchar(50),
  @encuesta     nvarchar(50),
  @usuario      nvarchar(100),
  @campo1Codigo int, @campo1Valor nvarchar(100),
  @campo2Codigo int, @campo2Valor nvarchar(100),
  @campo3Codigo int, @campo3Valor nvarchar(100),
  @campo4Codigo int, @campo4Valor nvarchar(100),
  @campo5Codigo int, @campo5Valor nvarchar(100),
  @campo6Codigo int, @campo6Valor nvarchar(100),
  @campo7Codigo int, @campo7Valor nvarchar(100),
  @campo8Codigo int, @campo8Valor nvarchar(100)
AS
BEGIN
  DECLARE @gestionCodigo int
  DECLARE @gestionDescripcion nvarchar(max)

  IF NOT EXISTS (
    SELECT 1 FROM encuesta
    WHERE id = @idEncuesta AND encuesta = @encuesta AND origen = '2'
  )
  BEGIN
    SET @gestionCodigo = 0
    SET @gestionDescripcion = 'No se encontró el lead manual id '
      + STR(@idEncuesta, 5, 0) + ' en la encuesta ' + @encuesta
  END
  ELSE IF EXISTS (
    SELECT 1 FROM encuesta
    WHERE telefono = @telefono AND encuesta = @encuesta AND id <> @idEncuesta
  )
  BEGIN
    SET @gestionCodigo = 0
    SET @gestionDescripcion = 'El telefono ' + @telefono + ' ya se ha registrado en la presente encuesta '
      + @encuesta + ' Si desea darse de baja, envie el mensaje > BAJA ' + @encuesta + ' a este numero'
  END
  ELSE
  BEGIN
    UPDATE encuesta SET
      telefono    = @telefono,
      campo1Valor = @campo1Valor,
      campo2Valor = @campo2Valor,
      campo3Valor = @campo3Valor,
      campo4Valor = @campo4Valor,
      campo5Valor = @campo5Valor,
      campo6Valor = @campo6Valor,
      campo7Valor = @campo7Valor,
      campo8Valor = @campo8Valor
    WHERE id = @idEncuesta

    SET @gestionCodigo = 1
    SET @gestionDescripcion = 'Se ha modificado el lead id :' + STR(@idEncuesta, 5, 0)
      + ' para el telefono ' + @telefono
  END

  SELECT @gestionCodigo AS codigo, @gestionDescripcion AS mensaje
END
GO

-- GRANT EXECUTE ON dbo.encuestaModificarSorteo01 TO [MPCSP];
-- GO
