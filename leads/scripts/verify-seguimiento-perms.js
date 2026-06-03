#!/usr/bin/env node
import '../server/load-env.js';
import { getSqlPoolEncuestas, closeSqlPool, getEncuestasDatabase } from '../server/db/mssql.js';

const db = getEncuestasDatabase();
console.log(`Usuario: ${process.env.DB_USER} | Base: ${db}\n`);

try {
  const pool = await getSqlPoolEncuestas();

  const perms = await pool.request().query(`
    SELECT
      HAS_PERMS_BY_NAME('dbo.registrarSeguimientoLead', 'OBJECT', 'SELECT') AS can_select,
      HAS_PERMS_BY_NAME('dbo.registrarSeguimientoLead', 'OBJECT', 'INSERT') AS can_insert,
      HAS_PERMS_BY_NAME('dbo.SP_RegistrarSeguimientoLead', 'OBJECT', 'EXECUTE') AS can_exec_sp
  `);
  console.log('Permisos (1=sí, 0=no):', perms.recordset[0]);

  console.log('\n--- SELECT TOP 1 * FROM dbo.registrarSeguimientoLead ---');
  const result = await pool.request().query(
    'SELECT TOP 1 * FROM dbo.registrarSeguimientoLead ORDER BY id DESC',
  );
  console.log('OK. Filas devueltas:', result.recordset.length);
  if (result.recordset[0]) console.log(JSON.stringify(result.recordset[0], null, 2));
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await closeSqlPool();
}
