/*
 Obsoleto: no modificar encuestaCargaSorteo01 para cambiar teléfono.

 El DBA crea un SP exclusivo para actualizar datos preexistentes:
   sql/encuestaModificarSorteo01.sql  →  [dbo].[encuestaModificarSorteo01]

 La app lo invoca vía SP_MODIFICAR_ENCUESTA (ver .env.example).
 encuestaCargaSorteo01 queda solo para alta manual y re-guardar con mismo teléfono.
*/
