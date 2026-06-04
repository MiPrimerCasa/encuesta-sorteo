-- DBA: modificar teléfono en carga manual (@origen = '2') SIN parámetro extra.
-- La app envía solo los 20 parámetros del SP; @telefono = teléfono NUEVO.
--
-- Problema actual: el UPDATE no incluye `telefono`, y el EXISTS busca solo @telefono.
-- Si el teléfono nuevo no existe, el SP hace INSERT (duplicado).

-- Opción recomendada: en el branch IF @origen = '2', localizar la fila manual
-- por usuario + campo1Valor + encuesta cuando @telefono aún no está en la tabla:

/*
if @origen = '2'
begin
  if not exists (select 1 from encuesta where telefono = @telefono and encuesta = @encuesta)
  begin
    select top 1 @idEncuesta = id
    from encuesta
    where encuesta = @encuesta
      and usuario = @usuario
      and campo1Valor = @campo1Valor
      and origen = '2'
    order by id desc
  end
  else
    select top 1 @idEncuesta = id
    from encuesta where telefono = @telefono and encuesta = @encuesta

  update encuesta set
    telefono = @telefono,
    campo1Valor = @campo1Valor,
    campo2Valor = @campo2Valor,
    ...
  where id = @idEncuesta

  set @gestionCodigo = 1
  ...
end
*/

-- NO agregar @telefonoNuevo: la app ya no lo envía (evita "too many arguments").
