#!/usr/bin/env node
/**
 * Repara un lead cuyo último seguimiento perdió estado "compro" (p. ej. corrección caja).
 *
 * Uso:
 *   node --env-file=src/.env scripts/repair-lead-cierre.js --lead-id=1234
 *   node --env-file=src/.env scripts/repair-lead-cierre.js --nombre="VAZQUEZ LIDIA"
 *   node --env-file=src/.env scripts/repair-lead-cierre.js --lead-id=1234 --apply
 *
 * Sin --apply solo muestra diagnóstico (dry-run).
 */
import '../server/load-env.js';
import { listAllLeadsFromEncuestas } from '../server/db/encuestas.js';
import { closeSqlPool, isSqlServerConfigured } from '../server/db/mssql.js';
import {
  buscarUltimoSeguimientoComproEnHistorial,
  getLatestSeguimientoSql,
  persistirSeguimientoLead,
  useSeguimientoSql,
} from '../server/db/seguimiento-sql.js';
import { preservarCamposCierreEnMerge } from '../server/services/caja-correccion-cliente.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const leadIdArg = args.find((a) => a.startsWith('--lead-id='))?.split('=')[1]?.trim();
const nombreArg = args
  .find((a) => a.startsWith('--nombre='))
  ?.split('=')
  .slice(1)
  .join('=')
  ?.trim();

function usage() {
  console.log(`Uso: node --env-file=src/.env scripts/repair-lead-cierre.js (--lead-id=ID | --nombre="APELLIDO") [--apply]`);
  process.exit(1);
}

async function resolverLeadId() {
  if (leadIdArg) return leadIdArg;
  if (!nombreArg) usage();

  const leads = await listAllLeadsFromEncuestas();
  const q = nombreArg.toUpperCase();
  const matches = leads.filter((l) => String(l.nombre || '').toUpperCase().includes(q));
  if (!matches.length) {
    console.error(`No se encontró lead con nombre que contenga: ${nombreArg}`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log('Varios leads coinciden:');
    for (const m of matches.slice(0, 10)) {
      console.log(`  id=${m.id}  ${m.nombre}  tel=${m.telefono}`);
    }
    console.error('Especificá --lead-id= con el id correcto.');
    process.exit(1);
  }
  return String(matches[0].id);
}

async function main() {
  if (!isSqlServerConfigured() || !useSeguimientoSql()) {
    console.error('SQL Server / SP_SEGUIMIENTO no configurado.');
    process.exit(1);
  }

  const leadId = await resolverLeadId();
  const actual = (await getLatestSeguimientoSql(leadId, null)) || {};
  const comproHist = await buscarUltimoSeguimientoComproEnHistorial(leadId);

  console.log(`\nLead ${leadId}`);
  console.log(`  Último global: resultado=${actual.resultadoEntrevista ?? '(vacío)'}  recibo=${actual.numeroRecibo ?? '-'}`);
  console.log(
    `  Último compro en historial: ${comproHist ? `recibo=${comproHist.numeroRecibo ?? '-'}  producto=${comproHist.idProducto ?? '-'}` : '(no encontrado)'}`,
  );

  if (actual.resultadoEntrevista === 'compro') {
    console.log('\nEl lead ya está en cierre. No hace falta reparar.');
    await closeSqlPool();
    return;
  }

  if (!comproHist) {
    console.error('\nNo hay registro compro en historial reciente. Revisar manualmente o ampliar días en código.');
    await closeSqlPool();
    process.exit(1);
  }

  const patch = preservarCamposCierreEnMerge(comproHist, actual);
  console.log('\nEstado a registrar:');
  console.log(
    `  compro · ${patch.idProducto ?? '?'} · ${patch.formaPago ?? '?'} · recibo ${patch.numeroRecibo ?? '?'}`,
  );

  if (!APPLY) {
    console.log('\nDry-run. Agregá --apply para registrar el seguimiento reparado.');
    await closeSqlPool();
    return;
  }

  const leads = await listAllLeadsFromEncuestas();
  const lead = leads.find((l) => String(l.id) === leadId) || { id: leadId };

  const res = await persistirSeguimientoLead(
    leadId,
    patch,
    { id: '0', rol: 'superadmin', nombre: 'Reparación cierre (script)' },
    { ...lead, seguimiento: actual },
  );

  if (res.saved) {
    console.log(`\nReparación OK. Nuevo registro id=${res.registroId ?? '?'}`);
  } else {
    console.log('\nNo se guardó (estado ya igual al calculado).');
  }

  const post = (await getLatestSeguimientoSql(leadId, null)) || {};
  console.log(`  Post-reparación: resultado=${post.resultadoEntrevista ?? '(vacío)'}`);

  await closeSqlPool();
}

main().catch((err) => {
  console.error(err);
  closeSqlPool().finally(() => process.exit(1));
});
