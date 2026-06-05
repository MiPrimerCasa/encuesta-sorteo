#!/usr/bin/env node
/**
 * Verifica SP encuestaSorteo01Update + tabla lead_referido / fix campo3-4.
 * Uso: node --env-file=src/.env scripts/verify-db-sp-pablo.js [idVendedor]
 */
import '../server/load-env.js';
import sql from 'mssql';
import { execEncuestaSorteo01Update } from '../server/db/encuesta-carga.js';
import { buildCargaParamsFromLead } from '../server/db/encuesta-carga.js';
import {
  execRegistrarReferidoLead,
  fetchReferidosMetaPorIds,
} from '../server/db/referidos-carga.js';
import {
  fetchEncuestasMuestraRaw,
  listLeadsFromEncuestas,
  mapEncuestaRowToLead,
} from '../server/db/encuestas.js';
import { closeSqlPool, getSqlPoolEncuestas, isSqlServerConfigured } from '../server/db/mssql.js';

const idVendedor = process.argv[2] || '132';

function ok(m) {
  console.log(`  OK  ${m}`);
}
function fail(m) {
  console.error(`  FAIL ${m}`);
}

function pickField(row, ...names) {
  if (!row) return null;
  for (const n of names) {
    const k = Object.keys(row).find((x) => x.toLowerCase() === n.toLowerCase());
    if (k != null && row[k] != null && row[k] !== '') return row[k];
  }
  return null;
}

function esManual(row) {
  const o = String(row?.origen ?? '').toLowerCase();
  return o === '2' || o.includes('manual') || o.includes('app');
}

async function testEncuestaSorteo01Update(usuario, rows) {
  const manual = rows.find((r) => esManual(r));
  if (!manual) {
    fail('No hay lead manual en listado para probar encuestaSorteo01Update');
    return false;
  }
  const id = Number(manual.id ?? manual.Id);
  const lead = mapEncuestaRowToLead(manual);
  const usuarioSp = manual.usuario ?? manual.Usuario;
  const params = buildCargaParamsFromLead(lead, lead.telefono, usuarioSp);
  const out = await execEncuestaSorteo01Update({ ...params, idEncuesta: id });
  const codigo = out.recordset?.[0]?.codigo ?? out.recordset?.[0]?.Codigo;
  if (Number(codigo) !== 1) {
    fail(`encuestaSorteo01Update id=${id} codigo=${codigo}`);
    return false;
  }
  ok(`encuestaSorteo01Update id=${id} "${lead.nombre}" → codigo=1`);
  return true;
}

async function testReferidoSinCampo3y4(usuario, idPadre, codigoPromotor, padreRow) {
  const tel = `3799${String(Date.now()).slice(-7)}`;
  const nombre = `VERIFY REF ${new Date().toISOString().slice(11, 19)}`;
  const out = await execRegistrarReferidoLead({
    idEncuestaOrigen: idPadre,
    telefono: tel,
    nombre,
    encuesta: process.env.ENCUESTA_CARGA_ID || 'sorteo01',
    usuario: String(codigoPromotor),
    operadorId: Number(idVendedor),
    operadorRol: 'supervisor',
  });
  if (!out.idEncuestaReferido || Number(out.codigo) !== 1) {
    fail(`SP_RegistrarReferidoLead: ${out.mensaje}`);
    return false;
  }
  ok(`Referido creado id=${out.idEncuestaReferido} tel=${tel}`);

  const rows = await fetchEncuestasMuestraRaw(usuario);
  const fila = rows.find((r) => String(r.id ?? r.Id) === String(out.idEncuestaReferido));
  if (!fila) {
    fail('Referido no aparece en encuestasMuestraOperador');
    return false;
  }
  const c3 = pickField(fila, 'Conoce MPC', 'campo3Valor');
  const c4 =
    pickField(fila, 'Sabias que c...') ??
    pickField(fila, 'Sabias que con MPC podes acceder a la vivienda propia') ??
    Object.entries(fila).find(([k]) => k.toLowerCase().startsWith('sabias'))?.[1];
  const malo3 = c3 && /referido|ra[ií]z/i.test(String(c3));
  const malo4 = c4 && /referido|ra[ií]z\s*#/i.test(String(c4));
  if (malo3 || malo4) {
    fail(`campo3/campo4 aún tienen texto referido: c3=${JSON.stringify(c3)} c4=${JSON.stringify(c4)}`);
    return false;
  }
  ok(`campo3/campo4 limpios (c3=${c3 ?? 'vacío'}, c4=${c4 ?? 'vacío'})`);

  const meta = await fetchReferidosMetaPorIds([out.idEncuestaReferido]);
  if (!meta.has(String(out.idEncuestaReferido))) {
    fail('lead_referido sin fila (SP_ObtenerMetaReferidosLead)');
    return false;
  }
  ok(`lead_referido OK origen=${meta.get(String(out.idEncuestaReferido)).idEncuestaOrigen}`);
  return true;
}

async function main() {
  if (!isSqlServerConfigured()) {
    console.error('Falta .env SQL');
    process.exit(1);
  }

  console.log('\n=== Verificación DB (Pablo) ===\n');

  const procUpdate = process.env.SP_MODIFICAR_ENCUESTA || 'encuestaSorteo01Update';
  console.log(`SP modificar: ${procUpdate}`);
  console.log(`SP referido:  ${process.env.SP_REGISTRAR_REFERIDO || 'SP_RegistrarReferidoLead'}\n`);

  const usuario = { id: String(idVendedor), nombre: 'Verify', rol: 'supervisor' };
  const rows = await fetchEncuestasMuestraRaw(usuario);
  if (!rows.length) {
    fail('Sin leads en encuestasMuestraOperador');
    process.exit(1);
  }

  let okCount = 0;
  if (await testEncuestaSorteo01Update(usuario, rows)) okCount++;

  const padre = rows[0];
  const idPadre = Number(padre.id ?? padre.Id);
  const codigo = padre.usuario ?? padre.Usuario;
  if (await testReferidoSinCampo3y4(usuario, idPadre, codigo, padre)) okCount++;

  // Referido #239 limpio (si existe)
  const meta239 = await fetchReferidosMetaPorIds([239]);
  if (meta239.has('239')) {
    const fila239 = rows.find((r) => String(r.id ?? r.Id) === '239');
    const c4 = fila239
      ? Object.entries(fila239).find(([k]) => k.toLowerCase().startsWith('sabias'))?.[1]
      : null;
    if (c4 && String(c4).includes('Ra')) {
      fail('Lead #239 aún tiene Raíz en pregunta PIJ — falta UPDATE limpieza');
    } else {
      ok('Lead #239: lead_referido existe y campo PIJ limpio (o no en listado)');
      okCount++;
    }
  }

  console.log(`\n=== Resultado: ${okCount} chequeos OK ===\n`);
  if (okCount < 2) process.exit(1);
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => closeSqlPool());
