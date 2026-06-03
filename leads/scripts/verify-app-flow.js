#!/usr/bin/env node
/**
 * Chequeo end-to-end backend (sin levantar HTTP): encuestas + seguimiento + mapeo.
 * Uso: node scripts/verify-app-flow.js [idOperador]
 */
import '../server/load-env.js';
import { listLeadsFromEncuestas, fetchEncuestasMuestraRaw } from '../server/db/encuestas.js';
import { closeSqlPool } from '../server/db/mssql.js';
import {
  consumeSeguimientoLecturaDegradada,
  listHistorialForLead,
  useSeguimientoSql,
} from '../server/db/seguimiento-sql.js';

const idOperador = process.argv[2] || '132';
const usuario = { id: idOperador, nombre: 'Verify', rol: 'supervisor' };

console.log('=== verify-app-flow ===');
console.log('SP_SEGUIMIENTO:', process.env.SP_SEGUIMIENTO || '(off)');
console.log('useSeguimientoSql:', useSeguimientoSql());
console.log('idOperador:', idOperador);
console.log('');

const issues = [];

try {
  const rows = await fetchEncuestasMuestraRaw(usuario);
  console.log(`encuestasMuestraOperador: ${rows.length} fila(s)`);
  if (!rows.length) issues.push('SP encuestas devuelve 0 filas para este idOperador');

  const leads = await listLeadsFromEncuestas(usuario);
  const degraded = consumeSeguimientoLecturaDegradada();
  console.log(`listLeadsFromEncuestas: ${leads.length} lead(s), seguimiento degradado: ${degraded}`);
  if (!leads.length && rows.length) issues.push('Hay filas SP pero mapLeads devolvió 0');

  if (leads[0]) {
    const lead = leads[0];
    console.log(`  ejemplo: id=${lead.id} nombre=${lead.nombre} lista=${lead.lista}`);
    console.log(`  seguimiento keys: ${Object.keys(lead.seguimiento || {}).join(', ') || '(vacío)'}`);

    if (useSeguimientoSql()) {
      try {
        const historial = await listHistorialForLead(lead.id, lead);
        console.log(`historial lead ${lead.id}: ${historial.length} entrada(s)`);
      } catch (e) {
        issues.push(`historial falla: ${e.message}`);
        console.log(`historial lead ${lead.id}: ERROR ${e.message}`);
      }
    }
  }
} catch (e) {
  issues.push(`flujo principal: ${e.message}`);
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await closeSqlPool();
}

console.log('');
if (issues.length) {
  console.log('Problemas detectados:');
  issues.forEach((i) => console.log(' -', i));
  process.exitCode = 1;
} else {
  console.log('OK — flujo principal sin errores bloqueantes.');
}
