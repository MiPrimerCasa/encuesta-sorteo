/*
============================================================================
 DBA — SP exclusivo: modificar datos de leads manuales ya existentes
============================================================================

 Nombre sugerido: [dbo].[encuestaModificarSorteo01]
 Base: STRSYSTEM

 La app lo usa en PATCH /api/leads/:id/telefono (botón "Modificar número").
 NO reemplaza encuestaCargaSorteo01 (alta / re-guardar con mismo teléfono).

 Parámetros que envía la API (execEncuestaModificarSorteo01):

   @idEncuesta   = id del lead en tabla encuesta (leadId del CRM)
   @telefono     = teléfono NUEVO (o el mismo si solo cambian otros campos)
   @encuesta     = sorteo01 / sorteo02 ...
   @usuario      = código promotor (ej. SORTEO01S21P01)
   @campo1Valor  = nombre
   @campo2Valor  = domicilio
   @campo3/4     = NULL en manual
   @campo5Valor  = 'NO'
   @campo6/7/8   = entrevista (fecha, modo, dirección) o vacío

 Retorno (igual que encuestaCargaSorteo01):
   SELECT codigo, mensaje
   codigo = 1 → OK
   codigo = 0 → error (lead no encontrado, no es origen 2, teléfono duplicado)

 Permiso app:
   GRANT EXECUTE ON dbo.encuestaModificarSorteo01 TO [MPCSP];

 Variable en la app:
   SP_MODIFICAR_ENCUESTA=encuestaModificarSorteo01

============================================================================
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
