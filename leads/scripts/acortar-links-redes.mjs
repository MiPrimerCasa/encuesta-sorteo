#!/usr/bin/env node
/**
 * Genera links acortados de Instagram para el catálogo links-redes.json (Facebook no se acorta).
 * node scripts/acortar-links-redes.mjs
 */
import '../server/load-env.js';
import {
  acortarTodosPendientes,
  sincronizarCatalogoEnDb,
} from '../server/db/links-acortados-store.js';
import { pausaEntreAcortadosMs } from '../server/lib/url-shortener.js';

const n = sincronizarCatalogoEnDb();
console.log(`Catálogo sincronizado: ${n} filas (solo Instagram).`);

const resultados = await acortarTodosPendientes();
let ok = 0;
for (const r of resultados) {
  if (r.estado === 'ok') ok += 1;
  console.log(
    `${r.codigo}/${r.red}: ${r.estado}${r.urlCorto ? ` (${r.servicio}) ${r.urlCorto}` : ''}`,
  );
  await new Promise((resolve) => setTimeout(resolve, pausaEntreAcortadosMs()));
}

console.log(`\nAcortados OK: ${ok}/${resultados.length}`);
