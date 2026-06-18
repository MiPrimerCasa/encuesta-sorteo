/*
  DBA — Modificar leads manuales existentes (PATCH /api/leads/:id/telefono)
  Base: STRSYSTEM

  La app invoca vía SP_MODIFICAR_ENCUESTA=encuestaSorteo01Update
  Ver server/db/encuesta-carga.js → execEncuestaSorteo01Update

  GRANT EXECUTE ON dbo.encuestaSorteo01Update TO [MPCSP];
*/

USE STRSYSTEM;
GO

CREATE OR ALTER PROCEDURE [dbo].[encuestaSorteo01Update]
  @id int,
  @telefono nvarchar(50),
  @encuesta nvarchar(50),
  @origen char(1),
  @usuario nvarchar(100),
  @campo1Codigo int,
  @campo1Valor nvarchar(100),  -- apellido y nombres
  @campo2Codigo int,
  @campo2Valor nvarchar(100),  -- direccion
  @campo3Codigo int,
  @campo3Valor nvarchar(100),  -- Conoce Mi primer casa ?
  @campo4Codigo int,
  @campo4Valor nvarchar(100),  -- conoce Plan inversion Joven
  @campo5Codigo int,
  @campo5Valor nvarchar(100),  -- queres mas informacion ?
  @campo6Codigo int,
  @campo6Valor nvarchar(100),  -- fecha y hora entrevista
  @campo7Codigo int,
  @campo7Valor nvarchar(100),  -- Modo de contacto 2=sucursal / 3=domicilio
  @campo8Codigo int,
  @campo8Valor nvarchar(100)   -- sucursal o domicilio según campo7
WITH EXECUTE AS 'dbo'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @gestionCodigo int;
  DECLARE @gestionDescripcion nvarchar(max);

  IF EXISTS (SELECT 1 FROM dbo.encuesta WHERE id = @id)
  BEGIN
    -- 1. Actualizar encuesta principal
    UPDATE dbo.encuesta SET
      telefono    = @telefono,
      usuario     = @usuario,   -- Modifica propietario/campaña
      campo1Valor = @campo1Valor,
      campo2Valor = @campo2Valor,
      campo3Valor = @campo3Valor,
      campo4Valor = @campo4Valor,
      campo5Valor = @campo5Valor,
      campo6Valor = @campo6Valor,
      campo7Valor = @campo7Valor,
      campo8Valor = @campo8Valor
    WHERE id = @id;

    -- 2. Resolver ids de vendedor y supervisor del nuevo propietario
    DECLARE @id_vendedor INT;
    DECLARE @id_supervisor INT;

    SELECT
      @id_vendedor = TRY_CAST(v.idVendedor AS INT),
      @id_supervisor = TRY_CAST(v.idSupervisor AS INT)
    FROM mensajeria.dbo.vendedor v
    WHERE v.codigo = @usuario;

    -- 3. Si es referido, actualizar la asignación comercial en lead_referido
    IF EXISTS (SELECT 1 FROM dbo.lead_referido WHERE id_encuesta_referido = @id)
    BEGIN
      UPDATE dbo.lead_referido SET
        codigo_promotor = @usuario,
        id_vendedor = @id_vendedor,
        id_supervisor = @id_supervisor
      WHERE id_encuesta_referido = @id;
    END

    SET @gestionCodigo = 1;
    SET @gestionDescripcion = N'Se ha modificado/reasignado el lead id :' + STR(@id, 5, 0);
  END
  ELSE
  BEGIN
    SET @gestionCodigo = 0;
    SET @gestionDescripcion = N'No existe el lead ' + STR(@id, 5, 0) + N' requerido';
  END

  SELECT @gestionCodigo AS codigo, @gestionDescripcion AS mensaje;
END;
GO

GRANT EXECUTE ON dbo.encuestaSorteo01Update TO [MPCSP];
GO
