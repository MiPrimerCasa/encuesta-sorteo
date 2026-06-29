import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Raíz donde se guardan los archivos de audio (debe estar bajo el volumen data/). */
export function getGrabacionesRoot() {
  const raw = process.env.GRABACIONES_DIR || path.join(process.cwd(), 'data', 'grabaciones');
  return path.resolve(raw);
}

/**
 * Crea la carpeta de grabaciones y verifica que esté bajo data/ (volumen Docker).
 * Llamar al arranque cuando GRABACIONES_ENABLED=true.
 */
export function ensureGrabacionesStorageReady() {
  const root = getGrabacionesRoot();
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!root.startsWith(dataDir + path.sep) && root !== dataDir) {
    console.warn(
      `[grabaciones] GRABACIONES_DIR fuera de data/ (${root}) — los audios podrían perderse en deploy. Usá data/grabaciones`,
    );
  }
  mkdirSync(root, { recursive: true });
  const probe = path.join(root, '.write_probe');
  try {
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
  } catch (err) {
    console.error('[grabaciones] No se puede escribir en', root, err);
    throw err;
  }
  return root;
}

/** Guarda en BD solo la ruta relativa a la raíz (portable entre deploys). */
export function toRelativeStoragePath(absolutePath) {
  const root = getGrabacionesRoot();
  const normalized = path.normalize(String(absolutePath ?? ''));
  if (!normalized) return '';
  if (normalized.startsWith(root + path.sep) || normalized === root) {
    return normalized.slice(root.length).replace(/^[/\\]+/, '');
  }
  const unix = normalized.replace(/\\/g, '/');
  const marker = '/grabaciones/';
  const idx = unix.indexOf(marker);
  if (idx >= 0) {
    return unix.slice(idx + marker.length);
  }
  return normalized;
}

/**
 * Resuelve la ruta del archivo en disco probando varias variantes
 * (ruta absoluta legacy, relativa a GRABACIONES_DIR, cola tras grabaciones/).
 */
export function resolveStoragePath(storagePath) {
  const raw = String(storagePath ?? '').trim();
  if (!raw) return null;

  const root = getGrabacionesRoot();
  const candidates = new Set([
    raw,
    path.join(root, raw),
    path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw),
  ]);

  const unix = raw.replace(/\\/g, '/');
  const marker = 'grabaciones/';
  const idx = unix.indexOf(marker);
  if (idx >= 0) {
    const tail = unix.slice(idx + marker.length);
    candidates.add(path.join(root, tail));
  }

  for (const candidate of candidates) {
    try {
      const st = statSync(candidate);
      if (st.isFile()) return candidate;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

export function archivoGrabacionDisponible(storagePath) {
  return resolveStoragePath(storagePath) != null;
}
