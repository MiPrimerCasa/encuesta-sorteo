import sql from 'mssql';
import { enriquecerUsuarioConCodigoCarga } from './operadores-catalog.js';
import { extraerCodigoPromotorDesdeFilaLogin } from './codigo-promotor.js';

let pool;
let poolEncuestas;

function sqlConfig(database) {
  const dbName = database || process.env.DB_NAME;
  return {
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    database: dbName,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
    },
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
  };
}

/** Activo si hay host y credenciales en .env */
export function isSqlServerConfigured() {
  return Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
}

export function getSqlServerProcedureName() {
  const raw = process.env.SP_LOGIN || 'dbo.operadorAccesoCategoria';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

export function getEncuestasDatabase() {
  return process.env.ENCUESTAS_DB_NAME || process.env.DB_NAME;
}

export async function getSqlPool() {
  if (!isSqlServerConfigured()) {
    throw new Error('SQL Server no configurado (faltan DB_HOST, DB_USER o DB_NAME).');
  }
  if (!pool) {
    pool = await sql.connect(sqlConfig(process.env.DB_NAME));
  }
  return pool;
}

/** Pool para el SP de encuestas (puede vivir en otra base, ej. mensajeria). */
export async function getSqlPoolEncuestas() {
  if (!isSqlServerConfigured()) {
    throw new Error('SQL Server no configurado (faltan DB_HOST, DB_USER o DB_NAME).');
  }
  const dbEncuestas = getEncuestasDatabase();
  if (dbEncuestas === process.env.DB_NAME && pool) {
    return pool;
  }
  if (!poolEncuestas) {
    poolEncuestas = await sql.connect(sqlConfig(dbEncuestas));
  }
  return poolEncuestas;
}

function pickField(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const name of candidates.filter(Boolean)) {
    const key = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

export function parseIdEntero(valor) {
  const n = Number.parseInt(String(valor ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeCategoria(categoria) {
  return String(categoria ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Regla de negocio (ids del SP de encuestas):
 * idOperador (login) === idVendedor (fila encuesta) → supervisor; si no → promotor.
 */
export function mapOperadorVendedorToRol(idOperador, idVendedor) {
  const op = parseIdEntero(idOperador);
  const ven = parseIdEntero(idVendedor);
  if (op == null || ven == null) return null;
  return op === ven ? 'supervisor' : 'promotor';
}

/** Categoria del SP operadorAccesoCategoria (valores acordados con DBA). */
export function mapCategoriaToRol(categoria) {
  const raw = normalizeCategoria(categoria);
  if (raw === 'PROMOTOR') return 'promotor';
  if (raw === 'SUPERVISOR') return 'supervisor';
  return null;
}

/**
 * Rol al iniciar sesión: ids del SP operadorAccesoCategoria y luego Categoria.
 * Evita marcar promotor de prueba como supervisor si Categoria viene vacía o distinta.
 */
export function resolveRolDesdeLoginRow({ idOperador, idVendedor, idSupervisor, categoria }) {
  const porVendedor = mapOperadorVendedorToRol(idOperador, idVendedor);
  if (porVendedor) {
    return { rol: porVendedor, rolOrigen: 'login_id_vendedor' };
  }

  const op = parseIdEntero(idOperador);
  const sup = parseIdEntero(idSupervisor);
  if (op != null && sup != null && op !== sup) {
    return { rol: 'promotor', rolOrigen: 'login_id_supervisor' };
  }

  const porCat = mapCategoriaToRol(categoria);
  if (porCat) {
    return { rol: porCat, rolOrigen: 'categoria' };
  }

  return { rol: 'supervisor', rolOrigen: 'default' };
}

/**
 * Mapea la fila de [dbo].[operadorAccesoCategoria].
 * Columnas conocidas: idOperador, operadorCodigo, operadorDescripcion, operadorFUM, Categoria.
 * Para el rol (regla DBA): idSupervisor e idVendedor (nombres pueden variar; ver pickField).
 */
export function mapOperadorRow(row) {
  const idOperador = pickField(row, 'idOperador', 'IdOperador');
  const idSupervisor = pickField(
    row,
    process.env.SP_LOGIN_COL_SUPERVISOR,
    'idSupervisor',
    'IdSupervisor',
    'id_supervisor',
    'IDSupervisor',
    'idOperadorSupervisor',
  );
  const idVendedor = pickField(
    row,
    process.env.SP_LOGIN_COL_VENDEDOR,
    'idVendedor',
    'IdVendedor',
    'id_vendedor',
    'IDVendedor',
    'idOperadorVendedor',
  );
  const loginIdRaw = pickField(row, 'operadorCodigo', 'OperadorCodigo');
  const loginId = loginIdRaw != null ? String(loginIdRaw).trim() : null;
  const codigoCarga = extraerCodigoPromotorDesdeFilaLogin(row);
  const nombreRaw = pickField(row, 'operadorDescripcion', 'OperadorDescripcion');
  const nombre = (nombreRaw != null ? String(nombreRaw).trim() : null) || loginId || String(idOperador ?? 'Operador');
  const categoriaRaw = pickField(row, 'Categoria', 'categoria');
  const categoria = categoriaRaw != null ? String(categoriaRaw).trim() : null;

  if (!idOperador && !loginId) return null;

  const { rol, rolOrigen } = resolveRolDesdeLoginRow({
    idOperador,
    idVendedor,
    idSupervisor,
    categoria,
  });

  return {
    id: String(idOperador ?? loginId),
    nombre: String(nombre).trim(),
    rol,
    rolOrigen,
    categoria: categoria ? String(categoria).trim() : undefined,
    loginId: loginId ? String(loginId).trim() : undefined,
    codigoCarga,
    idOperador: idOperador != null ? String(idOperador) : undefined,
    idSupervisor: idSupervisor != null ? String(idSupervisor) : undefined,
    idVendedor: idVendedor != null ? String(idVendedor) : undefined,
  };
}

/**
 * exec [dbo].[operadorAccesoCategoria] @LoginID, @PasID
 * @returns {{ raw: object, mapped: object } | null}
 */
export async function fetchLoginOperadorRaw(loginId, password) {
  const dbPool = await getSqlPool();
  const proc = getSqlServerProcedureName();
  const paramUser = process.env.SP_LOGIN_PARAM_USER || 'LoginID';
  const paramPass = process.env.SP_LOGIN_PARAM_PASS || 'PasID';

  const request = dbPool.request();
  request.input(paramUser, sql.NVarChar, loginId);
  request.input(paramPass, sql.NVarChar, password);

  const result = await request.execute(proc);
  const rows = result.recordset ?? result.recordsets?.[0] ?? [];
  const row = rows[0];
  if (!row) return null;

  const raw = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
  );
  const mapped = mapOperadorRow(row);
  return { raw, mapped, columnas: Object.keys(row) };
}

/** Solo el usuario mapeado (uso en API). */
export async function verifyLoginSqlServer(loginId, password) {
  const data = await fetchLoginOperadorRaw(loginId, password);
  if (!data?.mapped) return null;
  return enriquecerUsuarioConCodigoCarga(data.mapped);
}

/** Ping liviano para /api/health en producción. */
export async function pingSqlServer() {
  const dbPool = await getSqlPool();
  await dbPool.request().query('SELECT 1 AS ok');
  return true;
}

export async function closeSqlPool() {
  if (pool) {
    await pool.close();
    pool = null;
  }
  if (poolEncuestas && poolEncuestas !== pool) {
    await poolEncuestas.close();
    poolEncuestas = null;
  }
}
