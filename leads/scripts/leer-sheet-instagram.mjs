#!/usr/bin/env node
/**
 * Lee links Instagram desde Google Sheets (export CSV público).
 * Port del script Python. Uso:
 *   GOOGLE_SHEET_ID=... GOOGLE_SHEET_NAME="Hoja 1" node scripts/leer-sheet-instagram.mjs
 */
import '../server/load-env.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '156m55PgtJB2dex_4iJA6AlJ7kNICUgrQkfrJYVnBLX8';
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Hoja 1';
const outPath =
  process.argv[2] ||
  join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'planilla', 'links-sheet-instagram.csv');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

async function leerHoja() {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', SHEET_NAME);

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Sheet HTTP ${resp.status}`);
  const text = await resp.text();
  const filas = text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);

  let inicio = 0;
  for (let i = 0; i < filas.length; i += 1) {
    const cols = filas[i].map((c) => c.toLowerCase());
    if (cols.includes('vendedor') && cols.some((c) => c.includes('instagram'))) {
      inicio = i + 1;
      break;
    }
  }

  const registros = [];
  for (let i = inicio; i < filas.length; i += 1) {
    const fila = filas[i];
    if (!fila[0]?.trim()) continue;
    let instagram = '';
    for (const celda of fila) {
      if (celda.includes('INSTAGRAM') && celda.startsWith('http')) {
        instagram = celda.trim();
        break;
      }
    }
    if (!instagram) continue;
    registros.push({
      fila: i + 1,
      vendedor: fila[0].trim(),
      codigo: fila[1]?.trim() ?? '',
      instagram,
    });
  }
  return registros;
}

const registros = await leerHoja();
const header = 'fila,vendedor,codigo,instagram\n';
const body = registros
  .map((r) => `${r.fila},"${r.vendedor.replace(/"/g, '""')}",${r.codigo},"${r.instagram}"`)
  .join('\n');
writeFileSync(outPath, header + body, 'utf8');
console.log(`Exportados ${registros.length} links → ${outPath}`);
