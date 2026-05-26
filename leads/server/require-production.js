import { getEncuestasDatabase, isSqlServerConfigured, pingSqlServer } from './db/mssql.js';

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
    dbLogin: process.env.DB_NAME,
    dbEncuestas: getEncuestasDatabase(),
    cacheLocal: 'data/app-cache.db (seguimiento en app hasta SP en SQL)',
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
