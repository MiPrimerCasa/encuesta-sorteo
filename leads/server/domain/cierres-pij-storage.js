import {
  copyFileSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Raíz donde se guardan fotos de comprobantes PIJ (debe estar bajo data/). */
export function getCierresPijRoot() {
  const raw = process.env.CIERRES_PIJ_DIR || path.join(process.cwd(), 'data', 'cierres-pij');
  return path.resolve(raw);
}

/**
 * Crea la carpeta de imágenes PIJ y verifica escritura.
 * Llamar al arranque del servidor.
 */
export function ensureCierresPijStorageReady() {
  const root = getCierresPijRoot();
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!root.startsWith(dataDir + path.sep) && root !== dataDir) {
    console.warn(
      `[cierres-pij] CIERRES_PIJ_DIR fuera de data/ (${root}) — las imágenes podrían perderse en deploy. Usá data/cierres-pij`,
    );
  }
  mkdirSync(root, { recursive: true });
  const probe = path.join(root, '.write_probe');
  try {
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
  } catch (err) {
    console.error('[cierres-pij] No se puede escribir en', root, err);
    throw err;
  }
  return root;
}

/** Guarda en metadatos solo la ruta relativa a la raíz (portable entre deploys). */
export function toRelativeCierrePijPath(absolutePath) {
  const root = getCierresPijRoot();
  const normalized = path.normalize(String(absolutePath ?? ''));
  if (!normalized) return '';
  if (normalized.startsWith(root + path.sep) || normalized === root) {
    return normalized.slice(root.length).replace(/^[/\\]+/, '');
  }
  const unix = normalized.replace(/\\/g, '/');
  const marker = '/cierres-pij/';
  const idx = unix.indexOf(marker);
  if (idx >= 0) {
    return unix.slice(idx + marker.length);
  }
  return normalized;
}

/** Resuelve ruta en disco probando variantes (absoluta legacy, relativa a raíz). */
export function resolveCierrePijPath(storagePath) {
  const raw = String(storagePath ?? '').trim();
  if (!raw) return null;

  const root = getCierresPijRoot();
  const candidates = new Set([
    raw,
    path.join(root, raw),
    path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw),
  ]);

  const unix = raw.replace(/\\/g, '/');
  const marker = 'cierres-pij/';
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

export function archivoCierrePijDisponible(storagePath) {
  return resolveCierrePijPath(storagePath) != null;
}

/** Solo caracteres seguros para carpeta por lead (ej. "3906"). */
export function sanitizeLeadIdForPath(leadId) {
  const s = String(leadId ?? '').trim().replace(/[^\w.-]+/g, '_');
  return s.slice(0, 64) || 'sin-lead';
}

/**
 * Mueve un archivo subido (inbox) a data/cierres-pij/{leadId}/{tipo}__{venta}__{uuid}.ext
 * Así en el VPS queda agrupado por lead bajo el volumen Docker ./data.
 */
export function moveCierrePijToLeadDir(tempAbsolutePath, { leadId, tipo, ventaKey }) {
  const root = getCierresPijRoot();
  const leadDir = path.join(root, sanitizeLeadIdForPath(leadId));
  mkdirSync(leadDir, { recursive: true });

  const ext = path.extname(tempAbsolutePath).toLowerCase() || '.jpg';
  const safeVenta = String(ventaKey ?? 'principal')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 40) || 'principal';
  const safeTipo = String(tipo ?? 'img')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 32) || 'img';
  const destName = `${safeTipo}__${safeVenta}__${randomUUID()}${ext}`;
  const destAbsolute = path.join(leadDir, destName);

  try {
    renameSync(tempAbsolutePath, destAbsolute);
  } catch {
    copyFileSync(tempAbsolutePath, destAbsolute);
    try {
      unlinkSync(tempAbsolutePath);
    } catch {
      /* ignore */
    }
  }
  return destAbsolute;
}
