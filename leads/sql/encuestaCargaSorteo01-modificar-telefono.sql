-- DBA: modificar teléfono en carga manual (@origen = '2')
-- La app envía SOLO los 20 parámetros del SP (sin @telefonoNuevo).
--
-- =============================================================================
-- Mapeo app → encuestaCargaSorteo01 (tabla encuesta usa campo1Valor, campo2Valor…)
-- =============================================================================
--
-- | Parámetro SP      | Cod | Significado en encuesta (comentario del SP)     |
-- |-------------------|-----|--------------------------------------------------|
-- | @telefono         |  —  | Clave teléfono + @encuesta                       |
-- | @encuesta         |  —  | sorteo01, sorteo02, …                            |
-- | @origen           |  —  | '2' = carga manual desde la app                  |
-- | @usuario          |  —  | Código promotor (SORTEO01S21P01)                 |
-- | @campo1Codigo/Valor | 1 | Apellido y nombres                               |
-- | @campo2Codigo/Valor | 2 | Dirección / domicilio                              |
-- | @campo3Codigo/Valor | 3 | Conoce Mi Primer Casa (manual: NULL)             |
-- | @campo4Codigo/Valor | 4 | Conoce Plan Inversión Joven (manual: NULL)       |
-- | @campo5Codigo/Valor | 5 | Quiere más información (app manual: 'NO')        |
-- | @campo6Codigo/Valor | 6 | Fecha y hora entrevista AAAA/MM/DD hh:mm         |
-- | @campo7Codigo/Valor | 7 | Modo contacto: 2=sucursal, 3=domicilio           |
-- | @campo8Codigo/Valor | 8 | Sucursal supervisor o domicilio cliente          |
--
-- Modificar número: la app reenvía los mismos @campo* del lead y @telefono = NUEVO.
--
-- =============================================================================
-- Ajuste sugerido en el branch IF @origen = '2' (sin parámetros extra)
-- =============================================================================
--
-- Cuando @telefono (nuevo) aún no existe, localizar la fila manual por
-- @encuesta + @usuario + @campo1Valor (+ @origen = '2'), no por nombre de columna.
--
/*
if @origen = '2'
begin
  if exists (select 1 from encuesta where telefono = @telefono and encuesta = @encuesta)
    select top 1 @idEncuesta = id
    from encuesta where telefono = @telefono and encuesta = @encuesta
  else
    select top 1 @idEncuesta = id
    from encuesta
    where encuesta = @encuesta
      and origen = '2'
      and usuario = @usuario
      and campo1Valor = @campo1Valor
    order by id desc

  update encuesta set
    telefono    = @telefono,
    campo1Valor = @campo1Valor,
    campo2Valor = @campo2Valor,
    campo3Valor = @campo3Valor,
    campo4Valor = @campo4Valor,
    campo5Valor = @campo5Valor,
    campo6Valor = @campo6Valor,
    campo7Valor = @campo7Valor,
    campo8Valor = @campo8Valor
  where id = @idEncuesta

  set @gestionCodigo = 1
  set @gestionDescripcion = 'Se ha modificado el lead id :' + str(@idEncuesta, 5, 0)
    + ' para el telefono ' + @telefono
end
*/
