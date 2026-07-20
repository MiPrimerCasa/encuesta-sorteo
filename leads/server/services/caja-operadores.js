/**
 * Catálogo de promotores/supervisores en MySQL nube (tabla `operador`).
 * La caja lo baja por GET /api/caja/operadores.
 */
import { isCajaMysqlEnabled } from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import { loadOperadoresCatalogAsync } from '../db/operadores-catalog.js';

export function equipoDesdeCodigo(codigo) {
  const m = String(codigo ?? '')
    .toUpperCase()
    .match(/S(\d{2})/);
  return m ? `S${m[1]}` : null;
}

/**
 * Upsert de uno o más operadores en MySQL.
 * @param {Array<{ codigo: string, nombre?: string|null, rol: string, idSql?: number|null }>} items
 */
export async function upsertOperadoresCaja(items) {
  if (!isCajaMysqlEnabled()) return { upserted: 0 };
  const list = (items || []).filter((o) => o?.codigo && o?.rol);
  if (!list.length) return { upserted: 0 };

  const pool = getCajaMysqlPool();
  let upserted = 0;
  for (const o of list) {
    const codigo = String(o.codigo).trim().slice(0, 64);
    if (!codigo) continue;
    const equipo = equipoDesdeCodigo(codigo);
    const idSql =
      o.idSql != null && Number.isFinite(Number(o.idSql)) ? Number(o.idSql) : null;
    await pool.query(
      `INSERT INTO operador (codigo, nombre, rol, equipo, id_sql, activo)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         nombre = COALESCE(VALUES(nombre), nombre),
         rol = VALUES(rol),
         equipo = COALESCE(VALUES(equipo), equipo),
         id_sql = COALESCE(VALUES(id_sql), id_sql),
         activo = 1`,
      [
        codigo,
        o.nombre ? String(o.nombre).trim().slice(0, 200) : null,
        String(o.rol).slice(0, 16),
        equipo,
        idSql,
      ],
    );
    upserted += 1;
  }
  return { upserted };
}

/**
 * Sincroniza el catálogo completo del CRM (links-redes / JSON) hacia MySQL.
 */
export async function sincronizarCatalogoOperadoresDesdeCrm() {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const catalog = await loadOperadoresCatalogAsync();
  const items = Object.values(catalog.byCodigo ?? {}).map((o) => ({
    codigo: o.codigo,
    nombre: o.vendedor ?? null,
    rol: o.rol === 'supervisor' ? 'supervisor' : 'promotor',
    idSql: null,
  }));

  // Completar id_sql desde byIdOperador si existe
  for (const [idOp, entry] of Object.entries(catalog.byIdOperador ?? {})) {
    const codigo = entry?.codigo;
    if (!codigo) continue;
    const found = items.find((i) => i.codigo === codigo);
    if (found && Number.isFinite(Number(idOp))) {
      found.idSql = Number(idOp);
    }
  }

  const result = await upsertOperadoresCaja(items);
  console.info('[caja-mysql] catálogo operadores sync=%s', result.upserted);
  return { ...result, total: items.length };
}

/**
 * Lista operadores desde MySQL para pull de la caja.
 * @param {{ equipo?: string|null, rol?: string|null }} [filtros]
 */
export async function listarOperadoresParaCaja(filtros = {}) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const pool = getCajaMysqlPool();
  const where = ['activo = 1'];
  const params = [];

  if (filtros.equipo) {
    where.push('equipo = ?');
    params.push(String(filtros.equipo).slice(0, 8));
  }
  if (filtros.rol) {
    where.push('rol = ?');
    params.push(String(filtros.rol).slice(0, 16));
  }

  const [rows] = await pool.query(
    `SELECT codigo, nombre, rol, equipo, id_sql, actualizado_en
     FROM operador
     WHERE ${where.join(' AND ')}
     ORDER BY rol, equipo, nombre`,
    params,
  );

  return {
    operadores: (rows || []).map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      rol: r.rol,
      equipo: r.equipo,
      idSql: r.id_sql != null ? Number(r.id_sql) : null,
      actualizadoEn: r.actualizado_en,
    })),
    count: rows?.length ?? 0,
  };
}
