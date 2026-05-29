import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const rootEnv = path.join(root, '.env');
const srcEnv = path.join(root, 'src', '.env');

if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}
/** Desarrollo local: src/.env siempre pisa (VPS solo usa .env en raíz). */
if (existsSync(srcEnv)) {
  dotenv.config({ path: srcEnv, override: true });
}
