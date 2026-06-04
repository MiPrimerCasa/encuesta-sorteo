-- Referencia DBA: carga manual desde la app (@origen = '2') actualiza si teléfono+encuesta ya existen.
-- Producción: STRSYSTEM.dbo.encuestaCargaSorteo01

-- Fragmento relevante (cuando ya existe fila):
-- IF @origen = '2'
--   UPDATE encuesta SET campo1Valor..campo8Valor WHERE id = @idEncuesta
--   SET @gestionCodigo = 1

-- La app envía @origen = '2' en POST /api/leads (ver server/db/encuesta-carga.js).
