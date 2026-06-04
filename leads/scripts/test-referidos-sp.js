#!/usr/bin/env node
/**
 * Prueba SPs de referidos (MPCSP solo EXECUTE, sin acceso directo a tablas).
 *
 * Uso:
 *   node --env-file=src/.env scripts/test-referidos-sp.js [idVendedor]
 *   node --env-file=src/.env scripts/test-referidos-sp.js 132 --solo-lectura
 */
import '../server/load-env.js';
import sql from 'mssql';
import {
  execRegistrarReferidoLead,
  fetchReferidosMetaPorIds,
  referidosUseSpVinculo,
} from '../server/db/referidos-carga.js';
import { fetchEncuestasMuestraRaw, listLeadsFromEncuestas } from '../server/db/encuestas.js';
import { closeSqlPool, getSqlPoolEncuestas, isSqlServerConfigured } from '../server/db/mssql.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const soloLectura = process.argv.includes('--solo-lectura');
const idVendedor = args[0] || '132';

function ok(msg) {
  console.log(`  OK  ${msg}`);
}
function fail(msg) {
  console.error(`  FAIL ${msg}`);
}

async function testSpEjecutable(nombre, runner) {
  try {
    await runner();
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/could not find stored procedure|does not exist/i.test(msg)) {
      fail(`${nombre}: no existe`);
    } else {
      fail(`${nombre}: ${msg}`);
    }
    return false;
  }
}

async function testContarReferidos(idEncuesta) {
  const pool = await getSqlPoolEncuestas();
  const proc = process.env.SP_CONTAR_REFERIDOS || 'SP_ContarReferidosLead';
  const request = pool.request();
  request.input('id_encuesta', sql.Int, idEncuesta);
  request.input('solo_con_cierre', sql.Bit, 0);
  request.input('incluir_cadena', sql.Bit, 1);
  request.output('total', sql.Int);
  request.output('total_directos', sql.Int);
  await request.execute(proc);
  return {
    total: request.parameters.total?.value ?? null,
    totalDirectos: request.parameters.total_directos?.value ?? null,
  };
}

async function main() {
  if (!isSqlServerConfigured()) {
    console.error('Falta .env con DB_HOST, DB_USER, DB_NAME.');
    process.exit(1);
  }

  console.log('\n=== Test referidos SP (STRSYSTEM / MPCSP) ===\n');
  console.log(`idVendedor: ${idVendedor}`);
  console.log(`REFERIDOS_USE_SP: ${referidosUseSpVinculo()}`);
  console.log(`SP_REGISTRAR_REFERIDO: ${process.env.SP_REGISTRAR_REFERIDO || 'SP_RegistrarReferidoLead'}`);
  console.log(`SP_OBTENER_META_REFERIDO: ${process.env.SP_OBTENER_META_REFERIDO || 'SP_ObtenerMetaReferidosLead'}`);
  console.log('');

  const sps = [
    process.env.SP_REGISTRAR_REFERIDO || 'SP_RegistrarReferidoLead',
    process.env.SP_OBTENER_META_REFERIDO || 'SP_ObtenerMetaReferidosLead',
    process.env.SP_CONTAR_REFERIDOS || 'SP_ContarReferidosLead',
  ];
  console.log(`SPs: ${sps.join(', ')}\n`);

  console.log('1) SPs ejecutables (MPCSP)');
  const spMeta = process.env.SP_OBTENER_META_REFERIDO || 'SP_ObtenerMetaReferidosLead';
  const spContar = process.env.SP_CONTAR_REFERIDOS || 'SP_ContarReferidosLead';

  const metaOk = await testSpEjecutable(spMeta, async () => {
    await fetchReferidosMetaPorIds([1]);
  });
  if (!metaOk) process.exit(1);
  ok(spMeta);

  const conteoProbe = await testSpEjecutable(spContar, async () => {
    await testContarReferidos(1);
  });
  if (!conteoProbe) process.exit(1);
  ok(spContar);

  const usuario = { id: String(idVendedor), nombre: 'TestReferidos', rol: 'supervisor' };
  const rows = await fetchEncuestasMuestraRaw(usuario);
  if (!rows.length) {
    fail(`encuestasMuestraOperador sin filas para id ${idVendedor}`);
    process.exit(1);
  }
  const padre = rows[0];
  const idPadre = Number(padre.id ?? padre.Id ?? padre.ID);
  const codigoPromotor = padre.usuario ?? padre.Usuario;
  ok(`Lead padre id=${idPadre} "${padre['Apellido y nombres'] ?? padre.nombre}" promotor=${codigoPromotor}`);

  console.log('\n2) SP_ObtenerMetaReferidosLead (lectura)');
  const metaVacio = await fetchReferidosMetaPorIds([idPadre]);
  ok(`Meta lead padre: ${metaVacio.size} fila(s) (esperado 0 si no es referido)`);

  console.log('\n3) SP_ContarReferidosLead');
  const conteo = await testContarReferidos(idPadre);
  ok(`Referidos de #${idPadre}: total=${conteo.total}, directos=${conteo.totalDirectos}`);

  if (soloLectura) {
    console.log('\n--solo-lectura: no se ejecuta alta de prueba.\n');
    return;
  }

  const telPrueba = `3799${String(Date.now()).slice(-7)}`;
  const nombrePrueba = `TEST REF CRM ${new Date().toISOString().slice(11, 19)}`;

  console.log('\n4) SP_RegistrarReferidoLead (alta prueba)');
  console.log(`   tel=${telPrueba} nombre=${nombrePrueba}`);

  const out = await execRegistrarReferidoLead({
    idEncuestaOrigen: idPadre,
    telefono: telPrueba,
    nombre: nombrePrueba,
    encuesta: process.env.ENCUESTA_CARGA_ID || 'sorteo01',
    usuario: String(codigoPromotor),
    operadorId: Number(idVendedor),
    operadorRol: 'supervisor',
    idRegistroSeguimiento: null,
  });

  console.log('   Respuesta SP:', JSON.stringify(out, null, 2));

  if (!out.codigo && !out.gestionCodigo) {
    fail(out.mensaje || 'SP no devolvió codigo/gestionCodigo');
    process.exit(1);
  }
  ok(out.mensaje || 'Referido registrado');

  const idReferido = out.idEncuestaReferido;
  if (!idReferido) {
    fail('Sin id_encuesta_referido en OUTPUT');
    process.exit(1);
  }

  console.log('\n5) Verificar meta del referido creado');
  const meta = await fetchReferidosMetaPorIds([idReferido]);
  const m = meta.get(String(idReferido));
  if (!m) {
    fail('SP_ObtenerMetaReferidosLead no devolvió el referido');
    process.exit(1);
  }
  ok(`esReferido nivel=${m.nivel} origen=${m.idEncuestaOrigen} rol=${m.operadorRol}`);

  console.log('\n6) Listado app (supervisor) incluye referido');
  const leads = await listLeadsFromEncuestas(usuario);
  const enLista = leads.find((l) => String(l.id) === String(idReferido));
  if (!enLista) {
    fail(
      `Referido #${idReferido} no aparece en listLeadsFromEncuestas — revisar encuestasMuestraOperador`,
    );
  } else {
    ok(`Lead en bandeja: "${enLista.nombre}" esReferido=${Boolean(enLista.esReferido)}`);
  }

  const conteo2 = await testContarReferidos(idPadre);
  ok(`Conteo post-alta: total=${conteo2.total} (antes ${conteo.total})`);

  console.log('\n=== Prueba completada ===\n');
}

main()
  .catch((e) => {
    console.error('\nError:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => closeSqlPool());
