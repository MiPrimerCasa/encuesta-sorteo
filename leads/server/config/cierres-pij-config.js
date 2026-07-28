/** Tamaño máximo por imagen de cierre PIJ (MB). El front comprime antes de subir. */
export function getCierresPijMaxBytes() {
  const mb = Number(process.env.CIERRES_PIJ_MAX_MB ?? 12);
  const n = Number.isFinite(mb) && mb > 0 ? mb : 12;
  return Math.floor(n * 1024 * 1024);
}

const MIME_PERMITIDOS = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const EXT_PERMITIDAS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

export function mimePermitidoCierrePij(mime) {
  return MIME_PERMITIDOS.has(String(mime ?? '').toLowerCase());
}

export function extensionPermitidaCierrePij(filename) {
  const ext = String(filename ?? '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  return EXT_PERMITIDAS.has(ext);
}
