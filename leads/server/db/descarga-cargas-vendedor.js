import { getDb } from './sqlite.js';

function initSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS descarga_cargas_vendedor (
      usuario_id TEXT PRIMARY KEY,
      fecha_descarga TEXT,
      ultima_fecha_descarga TEXT
    );
  `);
}

function mapRow(row) {
  if (!row) return { fechaDescarga: null, ultimaFechaDescarga: null };
  return {
    fechaDescarga: row.fecha_descarga || null,
    ultimaFechaDescarga: row.ultima_fecha_descarga || null,
  };
}

export function leerDescargaCargas(usuarioId) {
  const id = String(usuarioId ?? '').trim();
  if (!id) return { fechaDescarga: null, ultimaFechaDescarga: null };
  initSchema();
  const row = getDb()
    .prepare(
      `SELECT fecha_descarga, ultima_fecha_descarga
       FROM descarga_cargas_vendedor
       WHERE usuario_id = ?`,
    )
    .get(id);
  return mapRow(row);
}

/** Guarda esta descarga y corre la anterior a «última». */
export function registrarDescargaCargas(usuarioId) {
  const id = String(usuarioId ?? '').trim();
  if (!id) {
    throw new Error('No se pudo identificar al vendedor para guardar la descarga.');
  }
  initSchema();
  const previa = leerDescargaCargas(id);
  const ahora = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO descarga_cargas_vendedor (usuario_id, fecha_descarga, ultima_fecha_descarga)
       VALUES (@usuario_id, @fecha_descarga, @ultima_fecha_descarga)
       ON CONFLICT(usuario_id) DO UPDATE SET
         fecha_descarga = excluded.fecha_descarga,
         ultima_fecha_descarga = excluded.ultima_fecha_descarga`,
    )
    .run({
      usuario_id: id,
      fecha_descarga: ahora,
      ultima_fecha_descarga: previa.fechaDescarga,
    });
  return {
    fechaDescarga: ahora,
    ultimaFechaDescarga: previa.fechaDescarga,
  };
}
