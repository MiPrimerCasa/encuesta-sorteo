/*
============================================================================
 DBA — encuestaCargaSorteo01: permitir MODIFICAR el número en carga manual
============================================================================

 La app (botón "Modificar número") NO agrega parámetros nuevos: usa los 20
 parámetros existentes del SP. Al cambiar el teléfono envía:

   @telefono     = teléfono NUEVO          (el que debe quedar guardado)
   @encuesta     = sorteo01 / sorteo02 ...
   @origen       = '2'                      (carga manual desde la app)
   @usuario      = código promotor          (ej. SORTEO01S21P01)
   @campo1Valor  = nombre del lead          (sirve para localizar la fila)
   @campo2Valor  = domicilio
   @campo3Valor / @campo4Valor = NULL en manual
   @campo5Valor  = 'NO'
   @campo6Valor  = fecha/hora entrevista  (AAAA/MM/DD hh:mm) o ''
   @campo7Valor  = 2=sucursal / 3=domicilio o ''
   @campo8Valor  = dirección sucursal / domicilio cliente o ''

 PROBLEMA con el SP actual:
   - Localiza la fila por (telefono = @telefono). Como @telefono ya es el NUEVO
     (que aún no existe), cae en el ELSE y hace INSERT → crea un DUPLICADO.
   - El branch @origen='2' actualiza campo1..campo8 pero NO la columna telefono.

 SOLUCIÓN (sin parámetros extra):
   En @origen='2', si NO existe por teléfono, localizar la fila manual por
   @encuesta + @usuario + @campo1Valor (origen '2') y hacer UPDATE incluyendo
   telefono = @telefono.

============================================================================
*/

USE [STRSYSTEM]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [dbo].[encuestaCargaSorteo01]
  @telefono     nvarchar(50),
  @encuesta     nvarchar(50),
  @origen       char(1),
  @usuario      nvarchar(100),
  @campo1Codigo int, @campo1Valor nvarchar(100),  -- apellido y nombres
  @campo2Codigo int, @campo2Valor nvarchar(100),  -- direccion
  @campo3Codigo int, @campo3Valor nvarchar(100),  -- Conoce Mi Primer Casa ?
  @campo4Codigo int, @campo4Valor nvarchar(100),  -- conoce Plan Inversion Joven
  @campo5Codigo int, @campo5Valor nvarchar(100),  -- queres mas informacion ?
  @campo6Codigo int, @campo6Valor nvarchar(100),  -- fecha y hora entrevista
  @campo7Codigo int, @campo7Valor nvarchar(100),  -- modo contacto 2=sucursal 3=domicilio
  @campo8Codigo int, @campo8Valor nvarchar(100)   -- sucursal supervisor / domicilio cliente
AS
BEGIN
  DECLARE @idEncuesta int
  DECLARE @gestionCodigo int
  DECLARE @gestionDescripcion nvarchar(max)

  -- ¿Existe por teléfono (el que llega) en esta encuesta?
  IF EXISTS (SELECT 1 FROM encuesta WHERE telefono = @telefono AND encuesta = @encuesta)
  BEGIN
    -- Solo se actualiza con carga manual (origen 2). Otros orígenes => "ya registrado".
    IF @origen = '2'
    BEGIN
      SELECT TOP 1 @idEncuesta = id
      FROM encuesta
      WHERE telefono = @telefono AND encuesta = @encuesta

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
    ELSE
    BEGIN
      SET @gestionCodigo = 0
      SET @gestionDescripcion = 'El telefono ' + @telefono + ' ya se ha registrado en la presente encuesta '
        + @encuesta + ' Si desea darse de baja, envie el mensaje > BAJA ' + @encuesta + ' a este numero'
    END
  END
  ELSE IF @origen = '2'
     AND EXISTS (SELECT 1 FROM encuesta
                 WHERE encuesta = @encuesta AND origen = '2'
                   AND usuario = @usuario AND campo1Valor = @campo1Valor)
  BEGIN
    -- Cambio de número: la fila tiene el teléfono VIEJO; la localizamos por
    -- promotor (@usuario) + nombre (@campo1Valor) y le ponemos @telefono (nuevo).
    SELECT TOP 1 @idEncuesta = id
    FROM encuesta
    WHERE encuesta = @encuesta AND origen = '2'
      AND usuario = @usuario AND campo1Valor = @campo1Valor
    ORDER BY id DESC

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
    SET @gestionDescripcion = 'Se ha modificado el telefono del lead id :' + STR(@idEncuesta, 5, 0)
      + ' al numero ' + @telefono
  END
  ELSE
  BEGIN
    -- Alta nueva (igual que el SP original)
    INSERT INTO encuesta
      (telefono, encuesta, origen, fechaAlta, usuario,
       campo1Codigo, campo1Valor, campo2Codigo, campo2Valor,
       campo3Codigo, campo3Valor, campo4Codigo, campo4Valor,
       campo5Codigo, campo5Valor, campo6Codigo, campo6Valor,
       campo7Codigo, campo7Valor, campo8Codigo, campo8Valor)
    VALUES
      (@telefono, @encuesta, @origen, GETDATE(), @usuario,
       @campo1Codigo, @campo1Valor, @campo2Codigo, @campo2Valor,
       @campo3Codigo, @campo3Valor, @campo4Codigo, @campo4Valor,
       @campo5Codigo, @campo5Valor, @campo6Codigo, @campo6Valor,
       @campo7Codigo, @campo7Valor, @campo8Codigo, @campo8Valor)

    SET @idEncuesta = SCOPE_IDENTITY()

    IF NOT EXISTS (SELECT 1 FROM encuestaSorteo01NotificacionCliente WHERE idEncuesta = @idEncuesta)
    BEGIN
      INSERT INTO encuestaSorteo01NotificacionCliente (idEncuesta, fechaNotificacion, telefono)
      VALUES (@idEncuesta, GETDATE(), @telefono)

      INSERT INTO mensajeria.dbo.saliente (idCliente, idPlantilla, phone)
      VALUES ('1079183438617944', 24, @telefono)
    END

    SET @gestionCodigo = 1
    SET @gestionDescripcion = 'El telefono ' + @telefono + ' se ha registrado exitosamente en la encuesta '
      + @encuesta + ' con el identificador ' + STR(@idEncuesta, 5, 0)
      + '  Felicitaciones por participar !! .  Si desea darse de baja, envie el mensaje > BAJA '
      + @encuesta + ' a este numero'
  END

  SELECT @gestionCodigo AS codigo, @gestionDescripcion AS mensaje
END
GO

/*
 Nota: para leads manuales, campo3Valor / campo4Valor llegan NULL desde la app
 (no se exponen en el CRM). El botón "Modificar número" solo aparece en leads de
 carga manual, así que el UPDATE no pierde datos de negocio relevantes.

 Riesgo: dos leads del mismo promotor (@usuario) con el MISMO nombre (@campo1Valor)
 y distinto teléfono → el ORDER BY id DESC actualiza el más reciente. Si fuese un
 caso real, conviene desambiguar por id (requeriría pasar el id como parámetro).
*/
