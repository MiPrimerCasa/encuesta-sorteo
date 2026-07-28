/**
 * Catálogo de operadores activos vía dbo.operadorRPT (STRSYSTEM).
 * Nombre completo en columna "Apellido y Nombres" (no abreviaturas de planilla).
 */
import { getSqlPool, isSqlServerConfigured } from './mssql.js';

/** @type {Map<number, { idOperador: number, nombreCompleto: string, observacion: string|null, telefono: string|null, correo: string|null }>|null} */
let cacheById = null;
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

/**
 * Recarga el mapa idOperador → datos (TTL).
 * @param {{ force?: boolean }} [opts]
 */
export async function loadOperadorRptMap(opts = {}) {
  if (!isSqlServerConfigured()) {
    cacheById = new Map();
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
    }
    cacheById = map;
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
 * @param {number|string|null|undefined} idOperador
 * @returns {Promise<string|null>} nombre completo o null
 */
export async function getOperadorNombreCompleto(idOperador) {
  const id = Number.parseInt(String(idOperador ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const map = await loadOperadorRptMap();
  return map.get(id)?.nombreCompleto || null;
}

/**
 * Label para UI / validación en caja: "132 - CAJAL JESUS LEONEL"
 * @param {number|string|null|undefined} idOperador
 * @param {string|null|undefined} [fallbackNombre]
 */
export async function formatOperadorIdNombre(idOperador, fallbackNombre) {
  const id = Number.parseInt(String(idOperador ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) {
    const fb = String(fallbackNombre ?? '').trim();
    return fb || null;
  }
  const full = (await getOperadorNombreCompleto(id)) || String(fallbackNombre ?? '').trim();
  if (!full) return String(id);
  return `${id} - ${full}`;
}

export function invalidateOperadorRptCache() {
  cacheById = null;
  cacheLoadedAt = 0;
  loadPromise = null;
}
