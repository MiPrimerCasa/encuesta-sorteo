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

/** Códigos SORTEO que devuelve operadorAccesoCategoria (jun. 2026 — columnas Pablo). */
export function extraerCodigosSorteoDesdeFilaLogin(row) {
  if (!row) return { codigoPromotor: null, codigoSupervisor: null };
  const codigoPromotor = extraerCodigoSorteoDeTexto(
    pickField(
      row,
      process.env.SP_LOGIN_COL_CODIGO_PROMOTOR,
      'codigoPromotor',
      'CodigoPromotor',
    ),
  );
  const codigoSupervisor = extraerCodigoSorteoDeTexto(
    pickField(
      row,
      process.env.SP_LOGIN_COL_CODIGO_SUPERVISOR,
      'codigoSupervisor',
      'CodigoSupervisor',
    ),
  );
  return { codigoPromotor, codigoSupervisor };
}

/**
 * Código de carga según rol: promotor → codigoPromotor (Pxx); supervisor → codigoSupervisor (…00).
 */
/**
 * Código SORTEO para links de redes: solo desde login (operadorAccesoCategoria).
 * Promotor → codigoPromotor; supervisor → codigoSupervisor; respaldo codigoCarga.
 */
export function codigoSorteoLinksDesdeSesion(usuario) {
  if (!usuario) return null;
  const rol = usuario.rol;
  const candidatos =
    rol === 'promotor'
      ? [usuario.codigoPromotor, usuario.codigoCarga]
      : rol === 'supervisor'
        ? [usuario.codigoSupervisor, usuario.codigoCarga]
        : [usuario.codigoCarga, usuario.codigoPromotor, usuario.codigoSupervisor];

  for (const c of candidatos) {
    const norm = extraerCodigoSorteoDeTexto(c);
    if (esCodigoUsuarioCargaValido(norm)) return norm;
  }
  return null;
}

/**
 * Código CRM para consultar stock PIJ C+ en erp-sync.
 * Nunca usa loginId numérico. Supervisores-vendedores: preferir …Sxx00 (acta C+).
 */
export function codigoCrmStockPijDesdeSesion(usuario) {
  if (!usuario) return null;
  const rol = usuario.rol;
  const candidatos =
    rol === 'supervisor'
      ? [usuario.codigoSupervisor, usuario.codigoCarga, usuario.codigoPromotor]
      : rol === 'promotor'
        ? [usuario.codigoPromotor, usuario.codigoCarga]
        : [usuario.codigoCarga, usuario.codigoPromotor, usuario.codigoSupervisor];

  for (const c of candidatos) {
    const norm = extraerCodigoSorteoDeTexto(c);
    if (esCodigoUsuarioCargaValido(norm)) return norm;
  }
  return null;
}

export function resolverCodigoCargaDesdeFilaLogin(row, rol) {
  const { codigoPromotor, codigoSupervisor } = extraerCodigosSorteoDesdeFilaLogin(row);
  if (rol === 'promotor' && esCodigoUsuarioCargaValido(codigoPromotor)) {
    return codigoPromotor;
  }
  if (rol === 'supervisor' && esCodigoUsuarioCargaValido(codigoSupervisor)) {
    return codigoSupervisor;
  }
  if (esCodigoUsuarioCargaValido(codigoPromotor)) return codigoPromotor;
  if (esCodigoUsuarioCargaValido(codigoSupervisor)) return codigoSupervisor;
  return extraerCodigoPromotorDesdeFilaLogin(row);
}

export function extraerCodigoPromotorDesdeFilaLogin(row) {
  if (!row) return null;
  const { codigoPromotor } = extraerCodigosSorteoDesdeFilaLogin(row);
  if (esCodigoUsuarioCargaValido(codigoPromotor)) return codigoPromotor;

  const envCol = process.env.SP_LOGIN_COL_CODIGO;
  const direct = pickField(
    row,
    envCol,
    'codigo',
    'Codigo',
    'codigoVendedor',
    'CodigoVendedor',
    'operadorCodigoSorteo',
    'OperadorCodigoSorteo',
  );
  const desdeDirecto = extraerCodigoSorteoDeTexto(direct);
  if (desdeDirecto) return desdeDirecto;

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
