#!/usr/bin/env node
/**
 * Diagnóstico completo: permisos, SP guardado, SELECT, config app.
 */
import '../server/load-env.js';
import sql from 'mssql';
import { listLeadsFromEncuestas, updateLeadSeguimientoEncuesta } from '../server/db/encuestas.js';
import { closeSqlPool, getSqlPoolEncuestas } from '../server/db/mssql.js';
import {
  execRegistrarSeguimientoLead,
  useSeguimientoSql,
} from '../server/db/seguimiento-sql.js';

console.log('=== DIAGNÓSTICO SEGUIMIENTO ===');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('ENCUESTAS_DB_NAME:', process.env.ENCUESTAS_DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('SP_SEGUIMIENTO:', process.env.SP_SEGUIMIENTO || '(no definido → SQLite)');
console.log('SEGUIMIENTO_TABLE:', process.env.SEGUIMIENTO_TABLE || 'registrarSeguimientoLead');
console.log('useSeguimientoSql():', useSeguimientoSql());
console.log('');

const usuario = { id: '132', nombre: 'Diag Test', rol: 'supervisor' };

try {
  const pool = await getSqlPoolEncuestas();

  const sesion = await pool.request().query(`
    SELECT
      @@SERVERNAME AS servidor,
      DB_NAME() AS base,
      SUSER_SNAME() AS login_sql,
      USER_NAME() AS usuario_db,
      HAS_PERMS_BY_NAME('dbo.registrarSeguimientoLead', 'OBJECT', 'SELECT') AS can_select,
      HAS_PERMS_BY_NAME('dbo.registrarSeguimientoLead', 'OBJECT', 'INSERT') AS can_insert,
      HAS_PERMS_BY_NAME('dbo.SP_RegistrarSeguimientoLead', 'OBJECT', 'EXECUTE') AS can_exec_sp
  `);
  console.log('Sesión SQL:', sesion.recordset[0]);
  console.log('');

  console.log('--- 1) SP lectura (SP_UltimoSeguimientoOperador) ---');
  try {
    const ult = await pool
      .request()
      .input('id_operador', sql.Int, 132)
      .execute('SP_UltimoSeguimientoOperador');
    console.log('OK EXEC ultimos. Filas:', ult.recordset.length);
    if (ult.recordset[0]) console.log('  muestra:', ult.recordset[0].lead_id, ult.recordset[0].resultado_entrevista);
  } catch (e) {
    console.log('ERROR SP ultimos:', e.message);
    if (e.originalError?.message) console.log('  originalError:', e.originalError.message);
  }
  console.log('');

  console.log('--- 2) SP historial (SP_HistorialSeguimientoLead) ---');
  try {
    const hist = await pool
      .request()
      .input('lead_id', sql.Int, 206)
      .input('id_operador', sql.Int, 132)
      .input('lim', sql.Int, 5)
      .execute('SP_HistorialSeguimientoLead');
    console.log('OK EXEC historial. Filas:', hist.recordset.length);
  } catch (e) {
    console.log('ERROR SP historial:', e.message);
    if (e.originalError?.message) console.log('  originalError:', e.originalError.message);
  }
  console.log('');

  console.log('--- 3) Guardar vía updateLeadSeguimientoEncuesta (SP) ---');
  const leads = await listLeadsFromEncuestas(usuario);
  const lead = leads[0];
  if (!lead) {
    console.log('Sin leads para probar guardado.');
  } else {
    console.log('Lead prueba:', lead.id, lead.nombre);
    console.log('Seguimiento antes:', JSON.stringify(lead.seguimiento));
    try {
      const ts = Date.now();
      const result = await updateLeadSeguimientoEncuesta(
        lead.id,
        { observaciones: `diag test ${ts}` },
        usuario,
      );
      console.log('saved:', result?.saved);
      console.log('registroId SP:', result?.entradaHistorial?.id);
      console.log('merged.observaciones:', result?.lead?.seguimiento?.observaciones?.slice(0, 80));
    } catch (e) {
      console.log('ERROR GUARDAR:', e.message);
      if (e.originalError?.message) console.log('  originalError:', e.originalError.message);
    }
  }
  console.log('');

  console.log('--- 4) Re-listar leads (SP ultimos vía app) ---');
  const leads2 = await listLeadsFromEncuestas(usuario);
  const lead2 = leads2.find((l) => l.id === lead?.id);
  console.log('Seguimiento después re-listar:', JSON.stringify(lead2?.seguimiento));
  console.log('');

  console.log('--- 4) fn_my_permissions tabla ---');
  const perms = await pool.request().query(`
    SELECT permission_name
    FROM fn_my_permissions('dbo.registrarSeguimientoLead', 'OBJECT')
  `);
  console.log('Permisos en tabla:', perms.recordset.length ? perms.recordset : '(ninguno)');
} catch (e) {
  console.error('FALLÓ diagnóstico:', e.message);
  process.exitCode = 1;
} finally {
  await closeSqlPool();
}
