/**
 * Genera server/data/links-redes.json desde el listado de códigos (planilla links redes).
 * Ejecutar: node scripts/generate-links-redes.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WA_PHONE = '5493705229067';

const ROWS = [
  ['Martin Q', 'SORTEO01ROTATIVO'],
  ['Norma M', 'SORTEO01S0100'],
  ['PROMOTOR S1P1', 'SORTEO01S01P01'],
  ['PROMOTOR S1P2', 'SORTEO01S01P02'],
  ['Adela Alcaraz', 'SORTEO01S0200'],
  ['Marina L', 'SORTEO01S0300'],
  ['PROMOTOR S03P1', 'SORTEO01S03P01'],
  ['PROMOTOR S3P2', 'SORTEO01S03P02'],
  ['Federico C', 'SORTEO01S0400'],
  ['Fatima Farias', 'SORTEO01S0500'],
  ['PROMOTOR 05P01', 'SORTEO01S05P01'],
  ['Catherine Contreras', 'SORTEO01S0600'],
  ['PROMOTOR 06P01', 'SORTEO01S06P01'],
  ['Cecilia Fernandez', 'SORTEO01S0700'],
  ['PROMOTOR 07P01', 'SORTEO01S07P01'],
  ['Tania García', 'SORTEO01S0800'],
  ['Giselle Roa', 'SORTEO01S0900'],
  ['Naara Pona', 'SORTEO01S1000'],
  ['Christian R', 'SORTEO01S1100'],
  ['Carlos G', 'SORTEO01S1200'],
  ['Johnatan O', 'SORTEO01S1300'],
  ['Lucia N', 'SORTEO01S1400'],
  ['Santiago M', 'SORTEO01S1500'],
  ['Favio F', 'SORTEO01S1600'],
  ['Francisco Z', 'SORTEO01S1700'],
  ['Belen A', 'SORTEO01S1800'],
  ['Estefania G', 'SORTEO01S1900'],
  ['Dahiana C', 'SORTEO01S2000'],
  ['Nildo C', 'SORTEO01S2100'],
  ['Leonel C', 'SORTEO01S21P01'],
  ['Martiniano S', 'SORTEO01S2200'],
  ['Patricia A', 'SORTEO01S2300'],
];

function buildWaUrl(codigo, red) {
  const canal = red === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK';
  const text = `Gracias por su atencion!!.ENVIE este codigo ${canal} y PARTICIPE GRATIS del: ${codigo}`;
  return `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`;
}

const byCodigo = {};
for (const [vendedor, codigo] of ROWS) {
  const key = codigo.toUpperCase();
  byCodigo[key] = {
    vendedor,
    codigo: key,
    instagram: buildWaUrl(key, 'instagram'),
    facebook: buildWaUrl(key, 'facebook'),
  };
}

const payload = JSON.stringify(
  {
    version: 1,
    updatedAt: '2026-05-29',
    source: 'Planilla links redes (Google Sheets)',
    byCodigo,
  },
  null,
  2,
);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = [
  join(root, 'server', 'data', 'links-redes.json'),
  join(root, 'src', 'data', 'links-redes.json'),
];
for (const outPath of paths) {
  writeFileSync(outPath, payload, 'utf8');
}
console.log(`Escrito ${Object.keys(byCodigo).length} códigos en server/data y src/data`);
