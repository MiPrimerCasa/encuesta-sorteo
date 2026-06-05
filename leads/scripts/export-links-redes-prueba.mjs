#!/usr/bin/env node
/**
 * Exporta links del SP a Excel (.xlsx) para prueba antes de producción.
 *
 * Uso:
 *   node scripts/export-links-redes-prueba.mjs
 *   node scripts/export-links-redes-prueba.mjs --verificar
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import '../server/load-env.js';
import {
  buildCatalogFromSpRows,
  fetchLinksRedesRowsFromSql,
} from '../server/db/links-redes-sp.js';
import { verificarUrl } from '../server/lib/link-health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const verificar = process.argv.includes('--verificar');

function pickRaw(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') return String(row[key]).trim();
  }
  return '';
}

function pausa(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const HEADERS = [
  'Código',
  'Vendedor',
  'Rol',
  'Instagram',
  'Facebook',
  'WhatsApp',
  'TikTok',
  'QR',
  ...(verificar
    ? [
        'Instagram HTTP',
        'Facebook HTTP',
        'WhatsApp HTTP',
        'TikTok HTTP',
        'Error Instagram',
        'Error Facebook',
        'Error WhatsApp',
        'Error TikTok',
      ]
    : []),
  'Probado Instagram (SI/NO)',
  'Probado Facebook (SI/NO)',
  'Probado WhatsApp (SI/NO)',
  'Probado TikTok (SI/NO)',
  'Observaciones',
];

const rows = await fetchLinksRedesRowsFromSql();
const catalog = buildCatalogFromSpRows(rows);
const codigos = Object.keys(catalog.byCodigo).sort();
const data = [HEADERS];

for (let i = 0; i < codigos.length; i += 1) {
  const codigo = codigos[i];
  const entry = catalog.byCodigo[codigo];
  const raw = rows.find(
    (r) => String(r.codigo ?? r.Codigo ?? '').toUpperCase().replace(/[\s_\-]+/g, '') === codigo,
  );

  const fila = [
    entry.codigo,
    entry.vendedor,
    entry.rol ?? '',
    entry.instagram ?? '',
    entry.facebook ?? '',
    entry.whatsapp ?? '',
    entry.tiktok ?? '',
    raw ? pickRaw(raw, 'QR', 'qr') : '',
  ];

  if (verificar) {
    const urls = [entry.instagram, entry.facebook, entry.whatsapp, entry.tiktok];
    const errores = [];
    for (const url of urls) {
      if (!url?.startsWith('http')) {
        fila.push('SIN_URL');
        errores.push('');
        continue;
      }
      const check = await verificarUrl(url);
      fila.push(check.ok ? 'OK' : 'ERROR');
      errores.push(check.error ?? '');
      await pausa(300);
    }
    fila.push(...errores);
  }

  fila.push('', '', '', '', '');
  data.push(fila);
  process.stdout.write(`\r${i + 1}/${codigos.length} ${codigo}   `);
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(data);

ws['!cols'] = [
  { wch: 18 },
  { wch: 22 },
  { wch: 12 },
  { wch: 55 },
  { wch: 55 },
  { wch: 55 },
  { wch: 55 },
  { wch: 55 },
  ...(verificar
    ? [
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
      ]
    : []),
  { wch: 22 },
  { wch: 22 },
  { wch: 22 },
  { wch: 22 },
  { wch: 40 },
];

ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}${data.length}` };

XLSX.utils.book_append_sheet(wb, ws, 'Links redes');

const fecha = new Date().toISOString().slice(0, 10);
const outDir = join(__dirname, '..', 'data');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `links-redes-prueba-${fecha}.xlsx`);
XLSX.writeFile(wb, outPath);

console.log(`\nExportado: ${outPath}`);
console.log(`Filas: ${codigos.length}${verificar ? ' (con verificación HTTP)' : ''}`);
console.log('Abrí el .xlsx en Excel: cada link en su columna, una fila por operador.');
