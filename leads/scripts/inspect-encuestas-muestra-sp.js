#!/usr/bin/env node
/** Inspecciona dbo.encuestasMuestra (sin parámetros). */
import '../server/load-env.js';
import { closeSqlPool, getSqlPoolEncuestas, isSqlServerConfigured } from '../server/db/mssql.js';
import {
  analyzeEncuestasIdColumns,
  mapEncuestaRowToLead,
  serializeEncuestaRow,
} from '../server/db/encuestas.js';

if (!isSqlServerConfigured()) {
  console.error('Falta .env con DB_HOST, DB_USER, DB_NAME.');
  process.exit(1);
}

const proc = process.env.SP_ENCUESTAS_ADMIN || 'encuestasMuestra';

try {
  const pool = await getSqlPoolEncuestas();
  const result = await pool.request().execute(proc.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, ''));
  const rows = result.recordset ?? result.recordsets?.[0] ?? [];

  console.log(`\n=== ${proc} (sin params) ===\n`);
  console.log(`Filas: ${rows.length}\n`);

  if (!rows.length) {
    process.exit(0);
  }

  const columnas = Object.keys(rows[0]);
  console.log('Columnas:', columnas.join(', '));

  console.log('\n=== id / supervisor / vendedor / promotor ===\n');
  for (const { columna, ejemplos } of analyzeEncuestasIdColumns(rows.slice(0, 500))) {
    console.log(`  ${columna}:`, ejemplos.slice(0, 5).join(' | '));
  }

  const sups = new Map();
  for (const r of rows) {
    const id = r.idSupervisor ?? r.IdSupervisor;
    const nom = r.supervisor ?? r.Supervisor;
    if (id != null) sups.set(String(id), String(nom ?? '').trim());
  }
  console.log('\n=== Supervisores distintos ===\n');
  for (const [id, nom] of [...sups.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))) {
    console.log(`  ${id}: ${nom || '(sin nombre)'}`);
  }

  console.log('\n=== Primera fila → lead ===\n');
  console.log(JSON.stringify(mapEncuestaRowToLead(rows[0]), null, 2));
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
} finally {
  await closeSqlPool();
}
