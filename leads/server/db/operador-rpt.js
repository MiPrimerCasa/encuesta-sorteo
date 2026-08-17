/**
 * Catálogo de operadores activos vía dbo.operadorRPT (STRSYSTEM).
 * Nombre completo en columna "Apellido y Nombres" (no abreviaturas de planilla).
 */
import { getSqlPool, isSqlServerConfigured } from './mssql.js';

/** @type {Map<number, { idOperador: number, nombreCompleto: string, observacion: string|null, telefono: string|null, correo: string|null }>|null} */
let cacheById = null;
/** @type {Map<string, number>|null} nombre normalizado → idOperador */
let cacheByNombre = null;
let cacheLoadedAt = 0;
/** @type {Promise<Map<number, any>>|null} */
let loadPromise = null;
const TTL_MS = Number(process.env.OPERADOR_RPT_TTL_MS || 5 * 60_000) || 5 * 60_000;

function pickNombre(row) {
  const keys = Object.keys(row || {});
  const key =
    keys.find((k) => /^apellido y nombres$/i.test(k)) ||
    keys.find((k) => /apellido.*nombre|nombre.*completo|nombre/i.test(k));
  return key ? String(row[key] ?? '').trim().replace(/\s+/g, ' ') : '';
}

export function normalizarNombreOperador(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Recarga el mapa idOperador → datos (TTL).
 * @param {{ force?: boolean }} [opts]
 */
export async function loadOperadorRptMap(opts = {}) {
  if (!isSqlServerConfigured()) {
    cacheById = new Map();
    cacheByNombre = new Map();
    return cacheById;
  }
  const now = Date.now();
  if (!opts.force && cacheById && now - cacheLoadedAt < TTL_MS) {
    return cacheById;
  }
  if (!opts.force && loadPromise) return loadPromise;

  loadPromise = (async () => {
    const pool = await getSqlPool();
    const result = await pool.request().execute('operadorRPT');
    const map = new Map();
    const byNombre = new Map();
    for (const row of result.recordset || []) {
      const id = Number(row.idOperador ?? row.IdOperador ?? row.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const nombreCompleto = pickNombre(row);
      map.set(id, {
        idOperador: id,
        nombreCompleto,
        observacion: row.Observacion != null ? String(row.Observacion).trim() : null,
        telefono: row.Telefono != null ? String(row.Telefono).trim() : null,
        correo: row.correo != null ? String(row.correo).trim() : null,
      });
      const key = normalizarNombreOperador(nombreCompleto);
      if (key && !byNombre.has(key)) byNombre.set(key, id);
    }
    cacheById = map;
    cacheByNombre = byNombre;
    cacheLoadedAt = Date.now();
    console.info('[operador-rpt] cargados %s operadores activos', map.size);
    return map;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/**
 * Solo acepta ids numéricos reales (ignora slugs tipo "leiva-marina").
 * @param {unknown} val
 * @returns {number|null}
 */
export function parseIdOperadorOrNull(val) {
  if (val == null || val === '') return null;
  const raw = String(val).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {number|string|null|undefined} idOperador
 * @returns {Promise<string|null>} nombre completo o null
 */
export async function getOperadorNombreCompleto(idOperador) {
  const id = parseIdOperadorOrNull(idOperador);
  if (!id) return null;
  const map = await loadOperadorRptMap();
  const nombre = map.get(id)?.nombreCompleto;
  return nombre ? String(nombre).trim() : null;
}

/**
 * Busca idOperador en RPT por nombre (para casos sin idVendedor numérico).
 * @param {string|null|undefined} nombre
 * @returns {Promise<number|null>}
 */
export async function findOperadorIdPorNombre(nombre) {
  const key = normalizarNombreOperador(nombre);
  if (!key) return null;
  await loadOperadorRptMap();
  return cacheByNombre?.get(key) ?? null;
}

/**
 * Resuelve { id, nombre } priorizando siempre operadorRPT por id.
 * Nunca mezcla un id con el nombre de otra fuente (planilla/sesión).
 * @param {{ id?: unknown, nombreHint?: string|null }} args
 * @returns {Promise<{ id: number|null, nombre: string|null }>}
 */
export async function resolveOperadorDesdeRpt({ id, nombreHint } = {}) {
  let numericId = parseIdOperadorOrNull(id);
  if (!numericId && nombreHint) {
    numericId = await findOperadorIdPorNombre(nombreHint);
  }
  if (!numericId) {
    return { id: null, nombre: null };
  }
  const nombre = await getOperadorNombreCompleto(numericId);
  return { id: numericId, nombre };
}

/**
 * Label para UI / validación en caja: "132 - CAJAL JESUS LEONEL"
 * Si hay id, el nombre SIEMPRE sale de operadorRPT (no del fallback de planilla).
 * @param {number|string|null|undefined} idOperador
 * @param {string|null|undefined} [fallbackNombre] solo si el id no está en RPT
 */
export async function formatOperadorIdNombre(idOperador, fallbackNombre) {
  const id = parseIdOperadorOrNull(idOperador);
  if (!id) {
    const fb = String(fallbackNombre ?? '').trim();
    return fb || null;
  }
  const full = (await getOperadorNombreCompleto(id)) || String(fallbackNombre ?? '').trim();
  if (!full) return String(id);
  return `${id} - ${full}`;
}

export function invalidateOperadorRptCache() {
  cacheById = null;
  cacheByNombre = null;
  cacheLoadedAt = 0;
  loadPromise = null;
}
