import { getEncuestasDatabase, isSqlServerConfigured, pingSqlServer } from './db/mssql.js';
import { useSeguimientoSql } from './db/seguimiento-sql.js';

const MSG =
  'Sistema configurado solo para producción. Definí DB_HOST, DB_USER, DB_PASSWORD y DB_NAME en .env (o src/.env).';

export function assertSqlServerConfigured() {
  if (!isSqlServerConfigured()) {
    throw new Error(MSG);
  }
}

export function respondIfNotConfigured(res) {
  if (!isSqlServerConfigured()) {
    res.status(503).json({ message: MSG });
    return false;
  }
  return true;
}

export async function getHealthInfo() {
  if (!isSqlServerConfigured()) {
    return {
      ok: false,
      mode: 'sin-configurar',
      message: MSG,
    };
  }

  const base = {
    mode: 'produccion',
    login: process.env.SP_LOGIN || 'dbo.operadorAccesoCategoria',
    leads: process.env.SP_ENCUESTAS || 'encuestasMuestraOperador',
    seguimiento: process.env.SP_SEGUIMIENTO || null,
    seguimientoTabla: process.env.SEGUIMIENTO_TABLE || 'registrarSeguimientoLead',
    dbLogin: process.env.DB_NAME,
    dbEncuestas: getEncuestasDatabase(),
    cacheLocal: useSeguimientoSql()
      ? 'seguimiento en SQL Server (registrarSeguimientoLead)'
      : 'data/app-cache.db (seguimiento local SQLite)',
    host: process.env.LEADS_PUBLIC_HOST || null,
  };

  try {
    await pingSqlServer();
    return { ok: true, sql: 'ok', ...base };
  } catch (error) {
    return {
      ok: false,
      sql: 'error',
      ...base,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
