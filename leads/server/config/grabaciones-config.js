/** Configuración de grabaciones diarias de promotores. */

const ALLOWED_EXTENSIONS = new Set(['.m4a', '.mp3', '.wav', '.ogg']);

/** Kill switch global — requiere GRABACIONES_ENABLED=true explícito en producción. */
export function isGrabacionesEnabled() {
  const raw = String(process.env.GRABACIONES_ENABLED ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
}
const ALLOWED_MIMES = new Set([
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'application/ogg',
  'video/mp4', // algunos .m4a vienen así
]);

export function getGrabacionesMaxBytes() {
  const mb = Number.parseInt(process.env.GRABACIONES_MAX_MB || '25', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
}

export function getGrabacionesRetentionDays() {
  const d = Number.parseInt(process.env.GRABACIONES_RETENTION_DAYS || '60', 10);
  return Number.isFinite(d) && d > 0 ? d : 60;
}

export function getGrabacionesMinDurationSec() {
  const s = Number.parseInt(process.env.GRABACIONES_MIN_DURATION_SEC || '20', 10);
  return Number.isFinite(s) && s > 0 ? s : 20;
}

export function getCuotaDiaria() {
  return 4;
}

export function getCuotaFranja() {
  return 2;
}

/** id:nombre|alias1|alias2 — los alias no generan fila extra en el informe. */
export function getGrabacionesPromotoresConfig() {
  const raw = String(process.env.GRABACIONES_PROMOTOR_IDS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const colon = trimmed.indexOf(':');
      if (colon > 0) {
        const id = trimmed.slice(0, colon).trim();
        const rest = trimmed.slice(colon + 1).trim();
        const segmentos = rest
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
        const nombre = segmentos[0] || id;
        const aliases = segmentos.slice(1);
        return { id, nombre, aliases };
      }
      return { id: trimmed, nombre: trimmed, aliases: [] };
    })
    .filter(Boolean);
}

function clavesConfigPromotor(p) {
  const claves = new Set();
  for (const val of [p.id, ...(p.aliases ?? [])]) {
    const s = String(val ?? '').trim();
    if (!s) continue;
    claves.add(s);
    claves.add(normalizarClavePromotor(s));
  }
  return claves;
}

function configCoincideConClaves(p, clavesUsuario) {
  for (const clave of clavesConfigPromotor(p)) {
    if (clavesUsuario.has(clave)) return true;
  }
  return false;
}

function normalizarClavePromotor(val) {
  return String(val ?? '').trim().toUpperCase();
}

/** IDs/códigos del usuario de sesión que pueden matchear la lista de grabaciones. */
export function clavesPromotorGrabaciones(usuario) {
  const claves = new Set();
  for (const val of [
    usuario?.id,
    usuario?.idOperador,
    usuario?.idVendedor,
    usuario?.codigoCarga,
    usuario?.codigoPromotor,
  ]) {
    const s = String(val ?? '').trim();
    if (s) {
      claves.add(s);
      claves.add(normalizarClavePromotor(s));
    }
  }
  return claves;
}

export function promotorTieneGrabaciones(promotorId) {
  if (!isGrabacionesEnabled()) return false;
  const config = getGrabacionesPromotoresConfig();
  if (!config.length) return false;
  const key = String(promotorId ?? '').trim();
  if (!key) return false;
  const claves = new Set([key, normalizarClavePromotor(key)]);
  return config.some((p) => configCoincideConClaves(p, claves));
}

/** Evalúa id, idVendedor, idOperador y código SORTEO del login. */
export function usuarioPromotorTieneGrabaciones(usuario) {
  if (!isGrabacionesEnabled() || !usuario) return false;
  const config = getGrabacionesPromotoresConfig();
  if (!config.length) return false;
  const claves = clavesPromotorGrabaciones(usuario);
  return config.some((p) => configCoincideConClaves(p, claves));
}

export function resolvePromotorIdGrabaciones(usuario) {
  const config = getGrabacionesPromotoresConfig();
  const claves = clavesPromotorGrabaciones(usuario);
  for (const p of config) {
    if (configCoincideConClaves(p, claves)) return p.id;
  }
  return String(usuario?.idVendedor ?? usuario?.idOperador ?? usuario?.id ?? '').trim();
}

export function extensionPermitida(filename) {
  const ext = String(filename ?? '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  return ALLOWED_EXTENSIONS.has(ext);
}

export function mimePermitido(mime) {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim();
  return ALLOWED_MIMES.has(m);
}
