import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isProd = process.env.NODE_ENV === 'production';
const envFiles = isProd
  ? ['.env']
  : ['.env', path.join('src', '.env')];

for (const file of envFiles) {
  const full = path.join(root, file);
  if (existsSync(full)) {
    const isSrcEnv = !isProd && file.replace(/\\/g, '/').includes('src/');
    dotenv.config({ path: full, override: isSrcEnv });
  }
}
