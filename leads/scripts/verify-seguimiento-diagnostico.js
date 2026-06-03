#!/usr/bin/env node
import '../server/load-env.js';
import { getSqlPoolEncuestas, closeSqlPool, getEncuestasDatabase } from '../server/db/mssql.js';

console.log(`Host: ${process.env.DB_HOST} | User: ${process.env.DB_USER} | DB: ${getEncuestasDatabase()}\n`);

try {
  const pool = await getSqlPoolEncuestas();

  const sesion = await pool.request().query(`
    SELECT
      DB_NAME() AS db_actual,
      SUSER_SNAME() AS login_actual,
      USER_NAME() AS usuario_db,
      HAS_PERMS_BY_NAME('dbo.registrarSeguimientoLead', 'OBJECT', 'SELECT') AS can_select,
      HAS_PERMS_BY_NAME('dbo.registrarSeguimientoLead', 'OBJECT', 'INSERT') AS can_insert,
      HAS_PERMS_BY_NAME('dbo.SP_RegistrarSeguimientoLead', 'OBJECT', 'EXECUTE') AS can_exec_sp
  `);
  console.log('Sesión:', sesion.recordset[0]);

  let perms = { recordset: [] };
  try {
    perms = await pool.request().query(`
      SELECT dp.state_desc, dp.permission_name, o.name AS objeto
      FROM sys.database_permissions dp
      JOIN sys.objects o ON dp.major_id = o.object_id
      JOIN sys.database_principals u ON dp.grantee_principal_id = u.principal_id
      WHERE u.name = 'MPCSP'
        AND o.name IN ('registrarSeguimientoLead', 'SP_RegistrarSeguimientoLead')
      ORDER BY o.name, dp.permission_name
    `);
  } catch {
    console.log('\n(No se pudo consultar sys.database_permissions — MPCSP sin permiso en catálogo)');
  }
  console.log('\nPermisos explícitos MPCSP:', perms.recordset.length ? perms.recordset : '(ninguno visible)');

  let user = { recordset: [] };
  try {
    user = await pool.request().query(`
      SELECT name, type_desc, default_schema_name
      FROM sys.database_principals
      WHERE name = 'MPCSP'
    `);
  } catch {
    /* sin permiso catálogo */
  }
  console.log('\nUsuario MPCSP en esta base:', user.recordset[0] ?? '(no consultable o no existe)');

  const tbl = await pool.request().query(`
    SELECT s.name AS schema_name, t.name AS table_name
    FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE t.name LIKE '%eguimiento%'
  `);
  console.log('\nTablas *eguimiento*:', tbl.recordset);

  console.log('\n--- SELECT TOP 1 ---');
  const sample = await pool.request().query(
    'SELECT TOP 1 id, lead_id FROM dbo.registrarSeguimientoLead ORDER BY id DESC',
  );
  console.log('OK. Filas:', sample.recordset.length, sample.recordset[0] ?? '(vacía)');
} catch (error) {
  console.error('\nFALLÓ:', error.message);
  process.exitCode = 1;
} finally {
  await closeSqlPool();
}
