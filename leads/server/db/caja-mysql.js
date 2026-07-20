import mysql from 'mysql2/promise';
import { getCajaMysqlConfig, isCajaMysqlEnabled } from '../config/caja-mysql-config.js';

let pool;

/** Pool perezoso hacia la MySQL "nube" de caja (dentro del VPS). */
export function getCajaMysqlPool() {
  if (!isCajaMysqlEnabled()) {
    throw new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED != true).');
  }
  if (!pool) {
    const cfg = getCajaMysqlConfig();
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: 'Z',
      enableKeepAlive: true,
    });
  }
  return pool;
}

/** Ping liviano (verifica conexión). */
export async function pingCajaMysql() {
  const p = getCajaMysqlPool();
  await p.query('SELECT 1 AS ok');
  return true;
}

export async function closeCajaMysqlPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
