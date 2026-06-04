#!/usr/bin/env node
/**
 * Regenera TODOS los links acortados de Instagram (promotores + supervisores del catálogo).
 * Crea notificaciones para cada cambio (supervisores ven todo; promotor solo el suyo).
 *
 * node scripts/actualizar-todos-links-instagram.mjs
 */
import '../server/load-env.js';
import { actualizarTodosLinksInstagram } from '../server/db/links-acortados-store.js';

console.log('Sincronizando catálogo y regenerando todos los Instagram…');
const res = await actualizarTodosLinksInstagram();

let ok = 0;
let notif = 0;
for (const r of res.resultados) {
  if (r.estado === 'ok') ok += 1;
  if (r.notificado) notif += 1;
  console.log(
    `${r.codigo} (${r.rolCatalogo ?? '?'}) ${r.vendedor ?? ''}: ${r.estado}${r.urlCorto ? ` → ${r.urlCorto}` : ''}`,
  );
}

console.log(
  `\nFilas en catálogo: ${res.totalSync}. Procesados: ${res.total}. OK: ${ok}. Con aviso: ${notif}.`,
);
