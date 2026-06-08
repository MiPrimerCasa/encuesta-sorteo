#!/usr/bin/env node
/** Copia el instructivo HTML a public/ para que Vite lo publique en /instructivo.html */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'docs', 'INSTRUCTIVO_USO_APLICACION.html');
const dest = path.join(root, 'public', 'instructivo.html');

fs.copyFileSync(src, dest);
console.log('Instructivo → public/instructivo.html');
