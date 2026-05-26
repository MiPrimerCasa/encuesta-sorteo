#!/usr/bin/env node
/**
 * Muestra columnas y valores del SP encuestasMuestraOperador para un @idVendedor.
 *
 * Uso:
 *   node scripts/inspect-leads-sp.js 132
 *   node scripts/inspect-leads-sp.js 132 --json   # solo JSON primera fila
 */
import '../server/load-env.js';
import {
  analyzeEncuestasIdColumns,
  fetchEncuestasMuestraRaw,
  mapEncuestaRowToLead,
  serializeEncuestaRow,
} from '../server/db/encuestas.js';
import { closeSqlPool, isSqlServerConfigured } from '../server/db/mssql.js';

const args = process.argv.slice(2).filter((a) => a !== '--json');
const idVendedor = args[0];

if (!idVendedor) {
  console.error('Uso: node scripts/inspect-leads-sp.js <idVendedor> [--json]');
  console.error('Ejemplo: node scripts/inspect-leads-sp.js 132');
  process.exit(1);
}

if (!isSqlServerConfigured()) {
  console.error('Falta .env con DB_HOST, DB_USER, DB_NAME.');
  process.exit(1);
}

const usuario = { id: String(idVendedor), nombre: 'Inspect', rol: 'supervisor' };

try {
  const rows = await fetchEncuestasMuestraRaw(usuario);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows[0] ? serializeEncuestaRow(rows[0]) : null, null, 2));
    process.exit(0);
  }

  console.log(`\n=== encuestasMuestraOperador @idVendedor = ${idVendedor} ===\n`);
  console.log(`Filas devueltas: ${rows.length}\n`);

  if (!rows.length) {
    console.log('Sin filas. El SP no devolvió leads para ese id.');
    process.exit(0);
  }

  const columnas = Object.keys(rows[0]);
  console.log('=== Todas las columnas ===\n');
  console.log(columnas.join(', '));

  console.log('\n=== Columnas con id / supervisor / vendedor / promotor / usuario ===\n');
  const idCols = analyzeEncuestasIdColumns(rows);
  if (!idCols.length) {
    console.log('(ninguna columna con esos nombres — solo nombres de texto Promotor/supervisor)');
  } else {
    for (const { columna, ejemplos, distintos } of idCols) {
      console.log(`  ${columna} (${distintos} valor/es distinto/s en muestra):`);
      for (const v of ejemplos) console.log(`    - ${JSON.stringify(v)}`);
    }
  }

  console.log('\n=== Valores únicos Promotor / supervisor (texto) ===\n');
  for (const col of ['Promotor', 'promotor', 'supervisor', 'Supervisor']) {
    const key = columnas.find((k) => k.toLowerCase() === col.toLowerCase());
    if (!key) continue;
    const unicos = [...new Set(rows.map((r) => String(r[key] ?? '').trim()).filter(Boolean))];
    console.log(`  ${key}: ${unicos.slice(0, 10).join(' | ') || '(vacío)'}`);
    if (unicos.length > 10) console.log(`    … y ${unicos.length - 10} más`);
  }

  console.log('\n=== Primera fila cruda ===\n');
  console.log(JSON.stringify(serializeEncuestaRow(rows[0]), null, 2));

  console.log('\n=== Primera fila mapeada a Lead (app) ===\n');
  console.log(JSON.stringify(mapEncuestaRowToLead(rows[0]), null, 2));

  if (rows.length > 1) {
    console.log('\n=== Segunda fila cruda (si hay) ===\n');
    console.log(JSON.stringify(serializeEncuestaRow(rows[1]), null, 2));
  }

  console.log('\n=== ¿Sirve para regla idSupervisor vs idVendedor? ===\n');
  const tieneIdsNumericos = idCols.some(
    (c) =>
      /id/i.test(c.columna) &&
      c.ejemplos.some((v) => typeof v === 'number' || /^\d+$/.test(String(v))),
  );
  if (tieneIdsNumericos) {
    console.log(
      'Hay columnas numéricas de id en los leads. Podrían compararse con idOperador del login.',
    );
    console.log('Decisión con DBA: qué columna es idVendedor del operador logueado en cada fila.');
  } else {
    console.log(
      'Los leads traen sobre todo NOMBRES (Promotor, supervisor), no idSupervisor/idVendedor.',
    );
    console.log(
      'Para la regla del DBA hace falta que operadorAccesoCategoria devuelva esos ids,',
    );
    console.log('o que el SP de encuestas agregue columnas idPromotor / idSupervisor.');
  }
  console.log('');
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await closeSqlPool();
}
