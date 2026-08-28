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
  fetchHistorialAdminDesde,
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

const reciboArg = args.find((a) => a.startsWith('--recibo='))?.split('=')[1]?.trim();

function usage() {
  console.log(
    'Uso: node --env-file=src/.env scripts/repair-lead-cierre.js (--lead-id=ID | --nombre="APELLIDO" | --recibo=A200) [--apply]',
  );
  process.exit(1);
}

function esOperadorCajaSeguimiento(seg) {
  const opId = seg?.operadorId;
  if (opId === 0 || opId === '0') return true;
  if (opId == null || String(opId).trim() === '') {
    return /^caja\s*\d/i.test(String(seg?.operadorNombre ?? ''));
  }
  return /^caja\s*\d/i.test(String(seg?.operadorNombre ?? ''));
}

function numeroReciboCoincide(lead, q) {
  const seg = lead?.seguimiento ?? {};
  const qUp = String(q).trim().toUpperCase();
  const principal = String(seg.numeroRecibo ?? '').toUpperCase();
  if (principal.includes(qUp)) return true;
  const extras = Array.isArray(seg.comprasAdicionales) ? seg.comprasAdicionales : [];
  return extras.some((c) => String(c?.numeroRecibo ?? '').toUpperCase().includes(qUp));
}

async function buscarLeadIdPorReciboEnHistorial(reciboQuery) {
  const q = String(reciboQuery).trim().toUpperCase();
  const desde = new Date(Date.now() - 90 * 86400000);
  const rows = await fetchHistorialAdminDesde(desde);
  let bestLeadId = null;
  let bestId = 0;
  for (const row of rows) {
    if (row.resultado_entrevista !== 'compro' && row.resultadoEntrevista !== 'compro') continue;
    const recibo = String(row.numero_recibo ?? row.numeroRecibo ?? '').toUpperCase();
    if (!recibo.includes(q)) continue;
    const rid = Number(row.id ?? row.idRegistrarSeguimientoLead ?? 0);
    const leadId = String(row.lead_id ?? row.leadId ?? '');
    if (leadId && rid >= bestId) {
      bestId = rid;
      bestLeadId = leadId;
    }
  }
  return bestLeadId;
}

async function resolverLeadId() {
  if (leadIdArg) return leadIdArg;

  const leads = await listAllLeadsFromEncuestas();

  if (reciboArg) {
    const q = reciboArg.toUpperCase();
    const matches = leads.filter((l) => numeroReciboCoincide(l, q));
    if (!matches.length) {
      const fromHist = await buscarLeadIdPorReciboEnHistorial(reciboArg);
      if (fromHist) return fromHist;
      console.error(`No se encontró lead con recibo/adhesión que contenga: ${reciboArg}`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.log('Varios leads coinciden por recibo:');
      for (const m of matches.slice(0, 10)) {
        console.log(
          `  id=${m.id}  ${m.nombre}  recibo=${m.seguimiento?.numeroRecibo ?? '-'}`,
        );
      }
      console.error('Especificá --lead-id= con el id correcto.');
      process.exit(1);
    }
    return String(matches[0].id);
  }

  if (!nombreArg) usage();
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

  if (actual.resultadoEntrevista === 'compro' && !esOperadorCajaSeguimiento(actual)) {
    console.log('\nEl lead ya está en cierre con operador vendedor. No hace falta reparar.');
    await closeSqlPool();
    return;
  }

  if (actual.resultadoEntrevista === 'compro' && esOperadorCajaSeguimiento(actual)) {
    console.log('\nCierre presente pero operador es Caja; se restaurará el vendedor del historial.');
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
  console.log(
    `  operador: ${patch.operadorNombre ?? comproHist.operadorNombre ?? '?'} (id ${patch.operadorId ?? comproHist.operadorId ?? '?'})`,
  );

  if (!APPLY) {
    console.log('\nDry-run. Agregá --apply para registrar el seguimiento reparado.');
    await closeSqlPool();
    return;
  }

  const leads = await listAllLeadsFromEncuestas();
  const lead = leads.find((l) => String(l.id) === leadId) || { id: leadId };

  const operadorId = patch.operadorId ?? comproHist.operadorId;
  const usuarioRepair = {
    id: operadorId != null && String(operadorId) !== '0' ? String(operadorId) : undefined,
    rol: patch.operadorRol ?? comproHist.operadorRol ?? 'supervisor',
    nombre: patch.operadorNombre ?? comproHist.operadorNombre ?? 'Operador',
  };

  const res = await persistirSeguimientoLead(
    leadId,
    patch,
    usuarioRepair,
    { ...lead, seguimiento: actual },
  );

  if (res.saved) {
    console.log(`\nReparación OK. Nuevo registro id=${res.registroId ?? '?'}`);
  } else {
    console.log('\nNo se guardó (estado ya igual al calculado).');
  }

  const post = (await getLatestSeguimientoSql(leadId, null)) || {};
  console.log(
    `  Post-reparación: resultado=${post.resultadoEntrevista ?? '(vacío)'}  operador=${post.operadorNombre ?? '?'} (id ${post.operadorId ?? '?'})`,
  );

  await closeSqlPool();
}

main().catch((err) => {
  console.error(err);
  closeSqlPool().finally(() => process.exit(1));
});
