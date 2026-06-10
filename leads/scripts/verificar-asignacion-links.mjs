#!/usr/bin/env node
/**
 * Verifica asignación de código/links por promotor contra STRSYSTEM.
 * Uso: node scripts/verificar-asignacion-links.mjs
 */
import '../server/load-env.js';
import { closeSqlPool } from '../server/db/mssql.js';
import { fetchLinksRedesRowsFromSql, buildCatalogFromSpRows } from '../server/db/links-redes-sp.js';
import {
  invalidateOperadoresCatalogCache,
  loadOperadoresCatalogAsync,
  resolveCodigoCargaPromotorStrict,
  codigoPerteneceAVendedor,
} from '../server/db/operadores-catalog.js';
import { resolveLinksRedesParaUsuario } from '../server/db/links-redes.js';

const CASOS = [
  { nombre: 'Jose G', codigoEsperado: 'SORTEO01S21P02' },
  { nombre: 'Leonel C', codigoEsperado: 'SORTEO01S21P01' },
  { nombre: 'JOSE GARCIA', codigoEsperado: 'SORTEO01S21P02' },
  { nombre: 'LEONEL CAJAL', codigoEsperado: 'SORTEO01S21P01' },
];

function ok(cond) {
  return cond ? 'OK' : 'FALLO';
}

let fallos = 0;
function check(cond, msg) {
  const r = ok(cond);
  if (!cond) fallos += 1;
  console.log(`${r} ${msg}`);
}

try {
  invalidateOperadoresCatalogCache();
  const rows = await fetchLinksRedesRowsFromSql();
  const catalog = buildCatalogFromSpRows(rows);
  await loadOperadoresCatalogAsync();

  const leonel = catalog.byCodigo.SORTEO01S21P01;
  const cristian = catalog.byCodigo.SORTEO01S1100;

  console.log('=== SP STRSYSTEM (rptLinkQRenRedesSociales) ===');
  console.log(`Filas: ${rows.length}`);
  check(Boolean(leonel), `Leonel C en SP → ${leonel?.codigo} (${leonel?.vendedor})`);
  check(Boolean(cristian), `Christian R en SP → ${cristian?.codigo} (${cristian?.vendedor})`);

  const filasMal = [{ Promotor: 'Osvaldo S', usuario: 'SORTEO01S21P01', idVendedor: 999 }];
  const filasJose = [{ Promotor: 'Osvaldo S', usuario: 'SORTEO01S21P02', idVendedor: 999 }];

  console.log('\n=== Código promotor (leads con código ajeno S21P01) ===');
  for (const c of CASOS.filter((x) => x.nombre.includes('Leonel') || x.nombre.includes('LEONEL'))) {
    const u = { id: '999', nombre: c.nombre, rol: 'promotor', idVendedor: '999' };
    const codigo = resolveCodigoCargaPromotorStrict(u, filasMal);
    check(codigo === c.codigoEsperado, `${c.nombre} → ${codigo ?? 'null'} (esperado ${c.codigoEsperado})`);
  }
  const joseMal = resolveCodigoCargaPromotorStrict(
    { id: '999', nombre: 'Jose G', rol: 'promotor', idVendedor: '999' },
    filasMal,
  );
  check(joseMal !== 'SORTEO01S21P01', `Jose G NO debe recibir S21P01 con leads ajenos → ${joseMal ?? 'null'}`);

  console.log('\n=== Código promotor (leads propios S21P02, planilla «Osvaldo S») ===');
  for (const nombre of ['Jose G', 'SOSA OSVALDO', 'Osvaldo S']) {
    const u = { id: '999', nombre, rol: 'promotor', idVendedor: '999' };
    const codigo = resolveCodigoCargaPromotorStrict(u, filasJose);
    check(codigo === 'SORTEO01S21P02', `${nombre} → ${codigo ?? 'null'} (esperado SORTEO01S21P02)`);
  }

  console.log('\n=== Validación cruzada catálogo (carga manual; links usan solo código) ===');
  check(!codigoPerteneceAVendedor('SORTEO01S21P01', 'Jose G', catalog), 'S21P01 NO es de Jose G');
  check(codigoPerteneceAVendedor('SORTEO01S21P01', 'LEONEL CAJAL', catalog), 'S21P01 SÍ es de Leonel');

  console.log('\n=== Links por código de sesión (sin nombre) ===');
  const leonelUser = {
    id: '999',
    nombre: 'Leonel C',
    rol: 'promotor',
    codigoPromotor: 'SORTEO01S21P01',
    codigoCarga: 'SORTEO01S21P01',
  };
  const links = await resolveLinksRedesParaUsuario(leonelUser);
  check(links.codigo === 'SORTEO01S21P01', `codigo resuelto: ${links.codigo ?? 'null'}`);
  check(!links.mensaje, `sin error: ${links.mensaje ?? 'ninguno'}`);
  check(Boolean(links.instagram), 'instagram presente');
  check(Boolean(links.facebook), 'facebook presente');
  check(Boolean(links.whatsapp), 'whatsapp presente');
  check(Boolean(links.tiktok), 'tiktok presente');
  check(links.whatsapp?.includes('SORTEO01S21P01'), 'whatsapp usa código S21P01');

  console.log('\n=== Links supervisor por codigoSupervisor (S1100) ===');
  const linksCristian = await resolveLinksRedesParaUsuario({
    id: '11',
    nombre: 'Cristian Rocdan',
    rol: 'supervisor',
    codigoSupervisor: 'SORTEO01S1100',
    codigoCarga: 'SORTEO01S1100',
  });
  check(linksCristian.codigo === 'SORTEO01S1100', `links Cristian → ${linksCristian.codigo ?? 'null'}`);
  check(Boolean(linksCristian.instagram), 'instagram Cristian presente');

  console.log('\n=== Sin leads: carga manual por nombre (links NO usan este camino) ===');
  const joseSinLeads = resolveCodigoCargaPromotorStrict(
    { id: '999', nombre: 'Jose G', rol: 'promotor', idVendedor: '999' },
    [],
  );
  check(
    joseSinLeads === null,
    `Jose G sin leads → ${joseSinLeads ?? 'null'} (esperado null: planilla tiene «Osvaldo S»)`,
  );

  console.log(`\n${fallos === 0 ? 'TODAS LAS VERIFICACIONES PASARON' : `FALLARON ${fallos} VERIFICACIONES`}`);
  process.exit(fallos === 0 ? 0 : 1);
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await closeSqlPool();
}
