#!/usr/bin/env node
import '../server/load-env.js';
import { getSqlPoolEncuestas, closeSqlPool, getEncuestasDatabase } from '../server/db/mssql.js';

console.log(`Host: ${process.env.DB_HOST} | User: ${process.env.DB_USER} | DB: ${getEncuestasDatabase()}\n`);

try {
  const pool = await getSqlPoolEncuestas();

  const sesion = await pool.request().query(`
    SELECT DB_NAME() AS db, SUSER_SNAME() AS login, USER_NAME() AS usuario_db
  `);
  console.log('Sesión:', sesion.recordset[0]);

  try {
    const myPerms = await pool.request().query(`
      SELECT permission_name
      FROM fn_my_permissions('dbo.registrarSeguimientoLead', 'OBJECT')
      ORDER BY permission_name
    `);
    console.log('\nfn_my_permissions en registrarSeguimientoLead:', myPerms.recordset);
  } catch (e) {
    console.log('\nfn_my_permissions tabla:', e.message);
  }

  try {
    const myPermsSp = await pool.request().query(`
      SELECT permission_name
      FROM fn_my_permissions('dbo.SP_RegistrarSeguimientoLead', 'OBJECT')
      ORDER BY permission_name
    `);
    console.log('\nfn_my_permissions en SP:', myPermsSp.recordset);
  } catch (e) {
    console.log('\nfn_my_permissions SP:', e.message);
  }

  try {
    const tables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%eguimiento%'
    `);
    console.log('\nTablas *eguimiento* (INFORMATION_SCHEMA):', tables.recordset);
  } catch (e) {
    console.log('\nINFORMATION_SCHEMA:', e.message);
  }

  console.log('\n--- SELECT TOP 1 ---');
  const sample = await pool.request().query(
    'SELECT TOP 1 id, lead_id FROM dbo.registrarSeguimientoLead ORDER BY id DESC',
  );
  console.log('OK:', sample.recordset[0] ?? '(tabla vacía)');
} catch (error) {
  console.error('\nFALLÓ SELECT:', error.message);
  process.exitCode = 1;
} finally {
  await closeSqlPool();
}
