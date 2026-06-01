/**
 * Genera server/data/links-redes.json y src/data/links-redes.json desde:
 *   data/planilla/operadores-codigos.csv  (exportar Excel → CSV UTF-8)
 *
 * Columnas CSV:
 *   login_id, id_operador, nombre_operador, nombre_planilla, rol, codigo_carga
 *
 * Ejecutar: node scripts/generate-operadores-planilla.mjs
 *           node scripts/generate-operadores-planilla.mjs ruta/al/archivo.csv
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWaMeUrl,
  compactarCodigoSorteo,
} from '../server/db/whatsapp-link-text.js';

const WA_PHONE = '5493705229067';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultCsv = join(root, 'data', 'planilla', 'operadores-codigos.csv');
const csvPath = process.argv[2] ? join(process.cwd(), process.argv[2]) : defaultCsv;

function normalizeNombre(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeLoginId(valor) {
  return String(valor ?? '').trim().toLowerCase();
}

function normalizeCodigo(valor) {
  return compactarCodigoSorteo(valor);
}

function inferRol(codigo, rolCsv) {
  const rol = String(rolCsv ?? '').trim().toLowerCase();
  if (rol === 'promotor' || rol === 'supervisor') return rol;
  if (/P\d{2}$/i.test(codigo)) return 'promotor';
  if (/00$/.test(codigo) || /ROTATIVO/i.test(codigo)) return 'supervisor';
  return null;
}

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

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.some(Boolean)) continue;
    const codigo = normalizeCodigo(cols[idx('codigo_carga')] ?? cols[idx('codigo')] ?? '');
    if (!codigo) continue;
    rows.push({
      loginId: cols[idx('login_id')] ?? cols[idx('loginid')] ?? '',
      idOperador: cols[idx('id_operador')] ?? cols[idx('idoperador')] ?? '',
      nombreOperador: cols[idx('nombre_operador')] ?? cols[idx('nombreoperador')] ?? '',
      nombrePlanilla: cols[idx('nombre_planilla')] ?? cols[idx('nombreplanilla')] ?? cols[idx('vendedor')] ?? '',
      rol: cols[idx('rol')] ?? '',
      codigo,
    });
  }
  return rows;
}

function buildWaUrl(codigo, red) {
  const canal = red === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK';
  const text = `Gracias por su atencion!!.ENVIE este codigo ${canal} y PARTICIPE GRATIS del: ${codigo}`;
  return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`;
}

if (!existsSync(csvPath)) {
  console.error(`No existe: ${csvPath}`);
  console.error('Exportá el Excel como CSV UTF-8 en data/planilla/operadores-codigos.csv');
  process.exit(1);
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
if (!rows.length) {
  console.error('El CSV no tiene filas con codigo_carga.');
  process.exit(1);
}

const byCodigo = {};
const byLoginId = {};
const byIdOperador = {};
const byNombre = {};

for (const row of rows) {
  const vendedor = row.nombrePlanilla || row.nombreOperador || row.codigo;
  const rol = inferRol(row.codigo, row.rol);

  byCodigo[row.codigo] = {
    vendedor,
    codigo: row.codigo,
    rol,
    instagram: buildWaMeUrl(WA_PHONE, row.codigo, 'instagram'),
    facebook: buildWaMeUrl(WA_PHONE, row.codigo, 'facebook'),
  };

  const meta = { codigo: row.codigo, vendedor, rol };

  if (row.loginId) {
    byLoginId[normalizeLoginId(row.loginId)] = meta;
  }
  if (row.idOperador) {
    byIdOperador[String(row.idOperador).trim()] = meta;
  }
  if (row.nombrePlanilla) {
    byNombre[normalizeNombre(row.nombrePlanilla)] = meta;
  }
  if (row.nombreOperador) {
    byNombre[normalizeNombre(row.nombreOperador)] = meta;
  }
}

const payload = {
  version: 2,
  updatedAt: new Date().toISOString().slice(0, 10),
  source: `Planilla operadores (${csvPath.replace(/\\/g, '/')})`,
  byCodigo,
  byLoginId,
  byIdOperador,
  byNombre,
};

const json = JSON.stringify(payload, null, 2);
const outputs = [
  join(root, 'server', 'data', 'links-redes.json'),
  join(root, 'src', 'data', 'links-redes.json'),
];
for (const outPath of outputs) {
  writeFileSync(outPath, json, 'utf8');
}

console.log(`OK: ${rows.length} filas → ${Object.keys(byCodigo).length} códigos`);
console.log(`  byLoginId: ${Object.keys(byLoginId).length}`);
console.log(`  byIdOperador: ${Object.keys(byIdOperador).length}`);
console.log(`  byNombre: ${Object.keys(byNombre).length}`);
