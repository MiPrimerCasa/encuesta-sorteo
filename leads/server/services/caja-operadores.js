/**
 * Catálogo de promotores/supervisores en MySQL nube (tabla `operador`).
 * La caja lo baja por GET /api/caja/operadores (contrato CRM_OPERADORES_ENVIAMOS.md).
 */
import { isCajaMysqlEnabled } from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import {
  loadOperadoresCatalogAsync,
  normalizeCodigoCatalog,
  nombresCoinciden,
} from '../db/operadores-catalog.js';
import { loadOperadorRptMap } from '../db/operador-rpt.js';

export function equipoDesdeCodigo(codigo) {
  const m = String(codigo ?? '')
    .toUpperCase()
    .match(/S(\d{2})/);
  return m ? `S${m[1]}` : null;
}

function inferRolDesdeCodigo(codigo) {
  const c = String(codigo ?? '');
  if (/P\d{2}$/i.test(c)) return 'promotor';
  if (/00$/.test(c) || /ROTATIVO/i.test(c)) return 'supervisor';
  return null;
}

function inferRolDesdeObservacion(obs) {
  const o = String(obs ?? '').trim().toUpperCase();
  if (!o) return null;
  if (/\bPROMOTOR\b/.test(o)) return 'promotor';
  if (/\bSUPERVISOR\b/.test(o)) return 'supervisor';
  if (/\bADMINISTRATIV/.test(o)) return 'supervisor';
  return null;
}

function idsSupervisorDesdeEnv() {
  try {
    const raw = process.env.PROMOTOR_EQUIPO_SUPERVISOR_IDS;
    if (!raw) return new Set();
    return new Set(Object.values(JSON.parse(raw)).map((v) => String(v)));
  } catch {
    return new Set();
  }
}

/**
 * Asegura columnas opcionales del catálogo (idempotente).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureOperadorExtraColumns(pool) {
  const alters = [
    `ALTER TABLE operador ADD COLUMN observacion VARCHAR(200) NULL`,
    `ALTER TABLE operador ADD COLUMN telefono VARCHAR(40) NULL`,
    `ALTER TABLE operador ADD COLUMN correo VARCHAR(120) NULL`,
  ];
  for (const sql of alters) {
    try {
      await pool.query(sql);
    } catch (err) {
      // 1060 = Duplicate column name
      if (err?.errno !== 1060 && err?.code !== 'ER_DUP_FIELDNAME') {
        console.warn('[caja-operadores] ALTER operador:', err?.message || err);
      }
    }
  }
}

/**
 * Upsert de uno o más operadores en MySQL.
 * @param {Array<{
 *   codigo: string,
 *   nombre?: string|null,
 *   rol: string,
 *   idSql?: number|null,
 *   observacion?: string|null,
 *   telefono?: string|null,
 *   correo?: string|null,
 * }>} items
 */
export async function upsertOperadoresCaja(items) {
  if (!isCajaMysqlEnabled()) return { upserted: 0 };
  const list = (items || []).filter((o) => o?.codigo && o?.rol);
  if (!list.length) return { upserted: 0 };

  const pool = getCajaMysqlPool();
  await ensureOperadorExtraColumns(pool);

  let upserted = 0;
  for (const o of list) {
    const codigo = String(o.codigo).trim().slice(0, 64);
    if (!codigo) continue;
    const equipo = equipoDesdeCodigo(codigo);
    const idSql =
      o.idSql != null && Number.isFinite(Number(o.idSql)) ? Number(o.idSql) : null;
    await pool.query(
      `INSERT INTO operador (codigo, nombre, rol, equipo, id_sql, observacion, telefono, correo, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         nombre = COALESCE(VALUES(nombre), nombre),
         rol = VALUES(rol),
         equipo = COALESCE(VALUES(equipo), equipo),
         id_sql = COALESCE(VALUES(id_sql), id_sql),
         observacion = COALESCE(VALUES(observacion), observacion),
         telefono = COALESCE(VALUES(telefono), telefono),
         correo = COALESCE(VALUES(correo), correo),
         activo = 1`,
      [
        codigo,
        o.nombre ? String(o.nombre).trim().slice(0, 200) : null,
        String(o.rol).slice(0, 16),
        equipo,
        idSql,
        o.observacion ? String(o.observacion).trim().slice(0, 200) : null,
        o.telefono ? String(o.telefono).trim().slice(0, 40) : null,
        o.correo ? String(o.correo).trim().slice(0, 120) : null,
      ],
    );
    upserted += 1;
  }
  return { upserted };
}

/**
 * Arma el listado contrato desde operadorRPT + catálogo links-redes.
 * Incluye sinRol (la caja los ignora).
 */
export async function construirCatalogoOperadoresContrato() {
  const catalog = await loadOperadoresCatalogAsync();
  const rptMap = await loadOperadorRptMap({ force: false });
  const idsSupEnv = idsSupervisorDesdeEnv();
  const catalogEntries = Object.values(catalog.byCodigo ?? {});

  function matchCatalog(nombreCompleto, idOperador) {
    const byId = catalog.byIdOperador?.[String(idOperador)];
    if (byId) return byId;
    for (const entry of catalogEntries) {
      if (entry?.vendedor && nombresCoinciden(nombreCompleto, entry.vendedor)) {
        return entry;
      }
    }
    return null;
  }

  const operadores = [];
  for (const row of rptMap.values()) {
    const id = Number(row.idOperador);
    if (!Number.isFinite(id) || id <= 0) continue;
    const nombre = String(row.nombreCompleto ?? '').trim().replace(/\s+/g, ' ');
    const match = matchCatalog(nombre, id);
    const codigo = match?.codigo ? normalizeCodigoCatalog(match.codigo) : null;

    let rol =
      match?.rol === 'promotor' || match?.rol === 'supervisor'
        ? match.rol
        : inferRolDesdeCodigo(codigo) || inferRolDesdeObservacion(row.observacion);
    if (!rol && idsSupEnv.has(String(id))) rol = 'supervisor';

    operadores.push({
      id,
      nombre: nombre || null,
      rol: rol || null,
      codigo: codigo || null,
      observacion: row.observacion || null,
      telefono: row.telefono || null,
      correo: row.correo || null,
      equipo: codigo ? equipoDesdeCodigo(codigo) : null,
    });
  }

  operadores.sort((a, b) => {
    const ra = a.rol === 'supervisor' ? 0 : a.rol === 'promotor' ? 1 : 2;
    const rb = b.rol === 'supervisor' ? 0 : b.rol === 'promotor' ? 1 : 2;
    if (ra !== rb) return ra - rb;
    return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');
  });

  return {
    generadoEn: new Date().toISOString(),
    fuente: 'dbo.operadorRPT + catálogo links-redes',
    total: operadores.length,
    supervisores: operadores.filter((o) => o.rol === 'supervisor').length,
    promotores: operadores.filter((o) => o.rol === 'promotor').length,
    sinRol: operadores.filter((o) => !o.rol).length,
    operadores,
  };
}

/**
 * Sincroniza el catálogo completo del CRM hacia MySQL (solo promotor/supervisor con código).
 */
export async function sincronizarCatalogoOperadoresDesdeCrm() {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const catalogo = await construirCatalogoOperadoresContrato();
  const items = catalogo.operadores
    .filter((o) => o.codigo && (o.rol === 'promotor' || o.rol === 'supervisor'))
    .map((o) => ({
      codigo: o.codigo,
      nombre: o.nombre,
      rol: o.rol,
      idSql: o.id,
      observacion: o.observacion,
      telefono: o.telefono,
      correo: o.correo,
    }));

  const result = await upsertOperadoresCaja(items);
  console.info('[caja-mysql] catálogo operadores sync=%s', result.upserted);
  return { ...result, total: items.length, catalogo };
}

/**
 * Lista operadores para pull de la caja (shape CRM_OPERADORES_ENVIAMOS.md).
 * @param {{ equipo?: string|null, rol?: string|null, preferLive?: boolean }} [filtros]
 */
export async function listarOperadoresParaCaja(filtros = {}) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  // Preferimos el catálogo en vivo (RPT) para que `id`/`correo`/`telefono` estén completos.
  const live = await construirCatalogoOperadoresContrato();
  let operadores = live.operadores;

  if (filtros.rol) {
    const rol = String(filtros.rol).slice(0, 16);
    operadores = operadores.filter((o) => o.rol === rol);
  }
  if (filtros.equipo) {
    const eq = String(filtros.equipo).slice(0, 8).toUpperCase();
    operadores = operadores.filter((o) => String(o.equipo || '').toUpperCase() === eq);
  }

  return {
    generadoEn: live.generadoEn,
    fuente: live.fuente,
    total: operadores.length,
    supervisores: operadores.filter((o) => o.rol === 'supervisor').length,
    promotores: operadores.filter((o) => o.rol === 'promotor').length,
    sinRol: operadores.filter((o) => !o.rol).length,
    operadores: operadores.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      rol: o.rol,
      codigo: o.codigo,
      observacion: o.observacion,
      telefono: o.telefono,
      correo: o.correo,
      equipo: o.equipo,
      /** Compat: algunos scripts leen idSql en lugar de id */
      idSql: o.id,
    })),
    count: operadores.length,
  };
}
