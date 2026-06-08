/**
 * Código @usuario en encuestaCargaSorteo01 — mismo que ?codigo= en la landing.
 * Ejemplos reales: SORTEO01S21P01 (QR/WhatsApp), SORTEO01_V1 (docs).
 * No confundir con ?Encuesta=SORTEO01 (campaña, va en @encuesta).
 */

/** Solo campaña (query Encuesta=), no es código de operador. */
function esSoloCodigoCampania(s) {
  return /^SORTEO\d{2}$/i.test(s);
}

export function esCodigoUsuarioCargaValido(valor) {
  const s = String(valor ?? '').trim();
  if (!s || s.includes('@')) return false;
  if (!/^SORTEO/i.test(s)) return false;
  if (esSoloCodigoCampania(s)) return false;
  return s.length >= 10;
}

export function extraerCodigoSorteoDeTexto(valor) {
  if (valor == null || valor === '') return null;
  const texto = String(valor).trim();
  if (esCodigoUsuarioCargaValido(texto)) return texto;

  const tokens = texto.match(/\bSORTEO[A-Z0-9_]{3,}\b/gi) ?? [];
  for (const t of tokens) {
    const codigo = t.trim();
    if (esCodigoUsuarioCargaValido(codigo)) return codigo;
  }
  return null;
}

function pickField(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const name of candidates) {
    const key = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

/**
 * En encuestasMuestraOperador, `usuario` suele ser el ?codigo= de la landing (ej. SORTEO01S21P01),
 * compartido por todos los contactos del mismo promotor — no el PK numérico (`id`).
 */
export function extraerCodigoPromotorDesdeFilaEncuesta(row) {
  if (!row) return null;

  const usuario = pickField(row, 'usuario', 'Usuario');
  if (esCodigoUsuarioCargaValido(usuario)) return String(usuario).trim();

  const direct = pickField(
    row,
    'codigo',
    'Codigo',
    'codigoPromotor',
    'CodigoPromotor',
    'codigoVendedor',
    'CodigoVendedor',
    'codigoOperador',
    'CodigoOperador',
  );
  const desdeDirecto = extraerCodigoSorteoDeTexto(direct);
  if (desdeDirecto) return desdeDirecto;

  for (const v of Object.values(row)) {
    const codigo = extraerCodigoSorteoDeTexto(v);
    if (codigo) return codigo;
  }
  return null;
}

export function extraerCodigoPromotorDesdeFilaLogin(row) {
  if (!row) return null;
  const envCol = process.env.SP_LOGIN_COL_CODIGO;
  const direct = pickField(
    row,
    envCol,
    'codigo',
    'Codigo',
    'codigoPromotor',
    'CodigoPromotor',
    'codigoVendedor',
    'CodigoVendedor',
    'operadorCodigoSorteo',
    'OperadorCodigoSorteo',
  );
  const desdeDirecto = extraerCodigoSorteoDeTexto(direct);
  if (desdeDirecto) return desdeDirecto;

  // Supervisores/promotores: operadorCodigo suele ser SORTEO01S1100, SORTEO01S21P01, etc.
  const operadorCodigo = pickField(row, 'operadorCodigo', 'OperadorCodigo');
  const desdeOperadorCodigo = extraerCodigoSorteoDeTexto(operadorCodigo);
  if (desdeOperadorCodigo) return desdeOperadorCodigo;

  return extraerCodigoPromotorDesdeFilaEncuesta(row);
}

/** Alinea @encuesta con la landing (?Encuesta=SORTEO01 → sorteo01 si el SP usa minúsculas). */
export function normalizarEncuestaCargaId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return 'sorteo01';
  const m = s.match(/^SORTEO(\d+)$/i);
  if (m) {
    const lower = `sorteo${m[1]}`.toLowerCase();
    if (process.env.ENCUESTA_CARGA_ID_EXACT === 'true') return s.toUpperCase();
    return lower;
  }
  return s;
}
