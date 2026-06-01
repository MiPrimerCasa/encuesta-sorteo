#!/usr/bin/env node
/**
 * Muestra la fila CRUDA del SP operadorAccesoCategoria y cómo la interpreta la app.
 *
 * Uso (desde la raíz del proyecto):
 *   node scripts/inspect-login-sp.js tu@email.com tu_clave
 */
import '../server/load-env.js';
import {
  enrichOperadorRolDesdeEncuestas,
  resolveRolFromEncuestasRows,
  fetchEncuestasMuestraRaw,
} from '../server/db/encuestas.js';
import {
  closeSqlPool,
  fetchLoginOperadorRaw,
  isSqlServerConfigured,
  mapCategoriaToRol,
  mapOperadorVendedorToRol,
} from '../server/db/mssql.js';

const [loginId, password] = process.argv.slice(2);

if (!loginId || !password) {
  console.error('Uso: node scripts/inspect-login-sp.js <LoginID> <PasID>');
  process.exit(1);
}

if (!isSqlServerConfigured()) {
  console.error('Falta .env con DB_HOST, DB_USER, DB_NAME (o src/.env en desarrollo).');
  process.exit(1);
}

try {
  const data = await fetchLoginOperadorRaw(loginId, password);
  if (!data) {
    console.log('El SP no devolvió filas → usuario/clave incorrectos.');
    process.exit(2);
  }

  const { raw, mapped, columnas } = data;
  const rolCat = mapCategoriaToRol(mapped.categoria);
  let rowsEnc = [];
  try {
    rowsEnc = await fetchEncuestasMuestraRaw({
      id: mapped.idOperador ?? mapped.id,
      nombre: mapped.nombre,
      rol: 'supervisor',
    });
  } catch (e) {
    console.warn('Encuestas no disponible:', e instanceof Error ? e.message : e);
  }
  const enriched = await enrichOperadorRolDesdeEncuestas(mapped);
  const idVendedorFila = rowsEnc[0]?.idVendedor ?? rowsEnc[0]?.IdVendedor;
  const rolVendedor = mapOperadorVendedorToRol(mapped.idOperador, idVendedorFila);
  const rolEncuesta = resolveRolFromEncuestasRows(rowsEnc, mapped.idOperador, mapped.categoria);

  console.log('\n=== Columnas que devolvió SQL ===\n');
  console.log(columnas.join(', '));

  console.log('\n=== Fila cruda (tal cual viene del SP) ===\n');
  console.log(JSON.stringify(raw, null, 2));

  console.log('\n=== Cómo lo interpreta la app ===\n');
  console.log(JSON.stringify(mapped, null, 2));

  console.log('\n=== Regla rol (encuestasMuestraOperador) ===\n');
  console.log(`  idOperador (login)     = ${mapped.idOperador ?? '(no viene)'}`);
  console.log(`  idVendedor (1ª fila)   = ${idVendedorFila ?? '(sin filas / no viene)'}`);
  console.log(`  Filas encuesta         = ${rowsEnc.length}`);
  if (rolVendedor) {
    console.log(
      `  Comparación ids: ${mapped.idOperador} ${rolVendedor === 'supervisor' ? '===' : '!=='} ${idVendedorFila}`,
    );
    console.log(`  → solo por ids: ${rolVendedor}`);
  } else {
    console.log('  → no se pudo comparar ids (falta idVendedor en filas)');
  }
  if (rolEncuesta) {
    console.log(`  → con Categoria (${mapped.categoria}): ${rolEncuesta.rol} (${rolEncuesta.rolOrigen})`);
  }

  console.log('\n=== Respaldo por Categoria (si falla encuestas) ===\n');
  console.log(`  Categoria = ${mapped.categoria ?? '(vacía)'}`);
  console.log(`  → rol por categoría: ${rolCat}`);

  console.log('\n=== Pantallas en la app (tras enrich) ===\n');
  console.log(`  rol final: ${enriched.rol} (origen: ${enriched.rolOrigen})`);
  if (enriched.rol === 'supervisor') {
    console.log('  Pestañas: Leads + Promotores');
  } else {
    console.log('  Pestañas: solo Leads');
  }

  console.log(`\n  @idVendedor al SP = idOperador ${mapped.id}\n`);
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await closeSqlPool();
}
