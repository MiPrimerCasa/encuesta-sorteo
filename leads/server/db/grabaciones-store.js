import { unlinkSync } from 'node:fs';
import { getDb } from './sqlite.js';
import { buildResumenCumplimiento } from '../domain/grabaciones.js';
import {
  getGrabacionesPromotoresConfig,
  getGrabacionesRetentionDays,
  getGrabacionesRetentionRechazadoEntrevistaDays,
  getGrabacionesRetentionRechazadoPromocionDays,
  getMaxAudiosMes,
} from '../config/grabaciones-config.js';
import { fechaMesKey } from '../domain/grabaciones.js';

const GRABACIONES_DDL = `
    CREATE TABLE IF NOT EXISTS promotor_grabaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotor_id TEXT NOT NULL,
      promotor_nombre TEXT NOT NULL,
      lead_id TEXT,
      lead_nombre TEXT,
      tipo TEXT NOT NULL CHECK(tipo IN ('promocion', 'entrevista')),
      franja TEXT NOT NULL CHECK(franja IN ('manana', 'tarde')),
      fecha_grabacion TEXT NOT NULL,
      dia_key TEXT NOT NULL,
      duracion_seg REAL NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL UNIQUE,
      tamano_bytes INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      rechazado_por TEXT,
      rechazado_en TEXT,
      motivo_rechazo TEXT,
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_grabaciones_promotor_dia
      ON promotor_grabaciones (promotor_id, dia_key, estado);
    CREATE INDEX IF NOT EXISTS idx_grabaciones_dia
      ON promotor_grabaciones (dia_key, estado);
`;

function migrateGrabacionesEstados() {
  const db = getDb();
  const ddl = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='promotor_grabaciones'`)
    .get();
  if (!ddl?.sql || ddl.sql.includes("'pendiente'")) return;

  db.exec(`
    PRAGMA foreign_keys=off;
    BEGIN;
    CREATE TABLE promotor_grabaciones_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotor_id TEXT NOT NULL,
      promotor_nombre TEXT NOT NULL,
      lead_id TEXT,
      lead_nombre TEXT,
      tipo TEXT NOT NULL CHECK(tipo IN ('promocion', 'entrevista')),
      franja TEXT NOT NULL CHECK(franja IN ('manana', 'tarde')),
      fecha_grabacion TEXT NOT NULL,
      dia_key TEXT NOT NULL,
      duracion_seg REAL NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL UNIQUE,
      tamano_bytes INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      rechazado_por TEXT,
      rechazado_en TEXT,
      motivo_rechazo TEXT,
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO promotor_grabaciones_v2
      SELECT * FROM promotor_grabaciones;
    DROP TABLE promotor_grabaciones;
    ALTER TABLE promotor_grabaciones_v2 RENAME TO promotor_grabaciones;
    CREATE INDEX IF NOT EXISTS idx_grabaciones_promotor_dia
      ON promotor_grabaciones (promotor_id, dia_key, estado);
    CREATE INDEX IF NOT EXISTS idx_grabaciones_dia
      ON promotor_grabaciones (dia_key, estado);
    COMMIT;
    PRAGMA foreign_keys=on;
  `);
}

function initGrabacionesSchema() {
  getDb().exec(GRABACIONES_DDL);
  migrateGrabacionesEstados();
}

let schemaReady = false;
function ensureSchema() {
  if (!schemaReady) {
    initGrabacionesSchema();
    schemaReady = true;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    promotorId: row.promotor_id,
    promotorNombre: row.promotor_nombre,
    leadId: row.lead_id ?? null,
    leadNombre: row.lead_nombre ?? null,
    tipo: row.tipo,
    franja: row.franja,
    fechaGrabacion: row.fecha_grabacion,
    diaKey: row.dia_key,
    duracionSeg: row.duracion_seg,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    tamanoBytes: row.tamano_bytes,
    estado: row.estado,
    rechazadoPor: row.rechazado_por ?? null,
    rechazadoEn: row.rechazado_en ?? null,
    motivoRechazo: row.motivo_rechazo ?? null,
    creadoEn: row.creado_en,
  };
}

export function insertGrabacion(data) {
  ensureSchema();
  const info = getDb()
    .prepare(
      `INSERT INTO promotor_grabaciones (
        promotor_id, promotor_nombre, lead_id, lead_nombre, tipo, franja,
        fecha_grabacion, dia_key, duracion_seg, mime_type, storage_path, tamano_bytes, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
    )
    .run(
      data.promotorId,
      data.promotorNombre,
      data.leadId ?? null,
      data.leadNombre ?? null,
      data.tipo,
      data.franja,
      data.fechaGrabacion,
      data.diaKey,
      data.duracionSeg,
      data.mimeType,
      data.storagePath,
      data.tamanoBytes,
    );
  return getGrabacionById(Number(info.lastInsertRowid));
}

export function getGrabacionById(id) {
  ensureSchema();
  const row = getDb().prepare('SELECT * FROM promotor_grabaciones WHERE id = ?').get(id);
  return mapRow(row);
}

export function listGrabacionesPromotorDia(promotorId, diaKey) {
  ensureSchema();
  const rows = getDb()
    .prepare(
      `SELECT * FROM promotor_grabaciones
       WHERE promotor_id = ? AND dia_key = ?
       ORDER BY fecha_grabacion ASC`,
    )
    .all(String(promotorId), diaKey);
  return rows.map(mapRow);
}

/** Promociones aprobadas del día — cuentan para cumplimiento (objetivo 4/día). */
export function listGrabacionesActivasPromotorDia(promotorId, diaKey) {
  return listGrabacionesPromotorDia(promotorId, diaKey).filter((g) => g.estado === 'activo');
}

/** Promociones del día que ocupan cupo diario (pendientes + aprobadas). */
export function listPromocionesOcupanCuotaPromotorDia(promotorId, diaKey) {
  return listGrabacionesPromotorDia(promotorId, diaKey).filter(
    (g) => g.tipo === 'promocion' && g.estado !== 'rechazado',
  );
}

/** Tope mensual de subidas (promoción + entrevista). Rechazados no cuentan. */
export function countGrabacionesMesSubidas(promotorId, mesKey) {
  ensureSchema();
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM promotor_grabaciones
       WHERE promotor_id = ? AND substr(dia_key, 1, 7) = ?
         AND estado IN ('pendiente', 'activo')`,
    )
    .get(String(promotorId), mesKey);
  return Number(row?.n ?? 0);
}

export function resumenTopeMesPromotor(promotorId, mesKey = fechaMesKey(new Date())) {
  const usados = countGrabacionesMesSubidas(promotorId, mesKey);
  const maximo = getMaxAudiosMes();
  return {
    mesKey,
    usados,
    maximo,
    restantes: Math.max(0, maximo - usados),
  };
}

export function resumenPromotorDia(promotorId, diaKey) {
  const promocionesActivas = listGrabacionesActivasPromotorDia(promotorId, diaKey).filter(
    (g) => g.tipo === 'promocion',
  );
  return buildResumenCumplimiento(promocionesActivas);
}

export function listGrabacionesAdminDia(diaKey, promotorIds = null) {
  ensureSchema();
  let rows;
  if (promotorIds?.length) {
    const placeholders = promotorIds.map(() => '?').join(',');
    rows = getDb()
      .prepare(
        `SELECT * FROM promotor_grabaciones
         WHERE dia_key = ? AND promotor_id IN (${placeholders})
         ORDER BY promotor_nombre, fecha_grabacion ASC`,
      )
      .all(diaKey, ...promotorIds.map(String));
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM promotor_grabaciones
         WHERE dia_key = ?
         ORDER BY promotor_nombre, fecha_grabacion ASC`,
      )
      .all(diaKey);
  }
  return rows.map(mapRow);
}

export function buildCumplimientoAdmin(diaKey, promotorIdsFiltro = null) {
  const config = getGrabacionesPromotoresConfig();
  const promotoresBase = promotorIdsFiltro?.length
    ? config.filter((p) => promotorIdsFiltro.includes(p.id))
    : config;

  const grabaciones = listGrabacionesAdminDia(
    diaKey,
    promotoresBase.map((p) => p.id),
  );

  return promotoresBase.map((promotor) => {
    const delPromotor = grabaciones.filter((g) => g.promotorId === promotor.id);
    const promocionesActivas = delPromotor.filter(
      (g) => g.estado === 'activo' && g.tipo === 'promocion',
    );
    const resumen = buildResumenCumplimiento(promocionesActivas);
    return {
      promotorId: promotor.id,
      promotorNombre: promotor.nombre,
      ...resumen,
      grabaciones: delPromotor,
    };
  });
}

export function aprobarGrabacion(id, { aprobadoPor } = {}) {
  ensureSchema();
  getDb()
    .prepare(
      `UPDATE promotor_grabaciones
       SET estado = 'activo', rechazado_por = NULL, rechazado_en = NULL, motivo_rechazo = NULL
       WHERE id = ? AND estado IN ('pendiente', 'rechazado')`,
    )
    .run(id);
  void aprobadoPor;
  return getGrabacionById(id);
}

/** Marca como rechazado con motivo; conserva archivo hasta la limpieza programada. */
export function rechazarGrabacion(id, { rechazadoPor, motivo } = {}) {
  ensureSchema();
  const grabacion = getGrabacionById(id);
  if (!grabacion || grabacion.estado !== 'pendiente') return null;

  const motivoTexto = String(motivo ?? '').trim();
  if (!motivoTexto) return null;

  getDb()
    .prepare(
      `UPDATE promotor_grabaciones
       SET estado = 'rechazado',
           rechazado_por = ?,
           rechazado_en = datetime('now'),
           motivo_rechazo = ?
       WHERE id = ? AND estado = 'pendiente'`,
    )
    .run(String(rechazadoPor ?? '').trim() || null, motivoTexto.slice(0, 500), id);

  return getGrabacionById(id);
}

export function listGrabacionesAntesDe(cutoffIso) {
  ensureSchema();
  const rows = getDb()
    .prepare(
      `SELECT * FROM promotor_grabaciones
       WHERE creado_en < ?
         AND estado IN ('pendiente', 'activo')
       ORDER BY creado_en ASC`,
    )
    .all(cutoffIso);
  return rows.map(mapRow);
}

function cutoffIsoFromDays(days) {
  const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 19).replace('T', ' ');
}

export function listGrabacionesRechazadasAntesDe(cutoffIso, tipo) {
  ensureSchema();
  const rows = getDb()
    .prepare(
      `SELECT * FROM promotor_grabaciones
       WHERE estado = 'rechazado'
         AND tipo = ?
         AND rechazado_en IS NOT NULL
         AND rechazado_en < ?
       ORDER BY rechazado_en ASC`,
    )
    .all(tipo, cutoffIso);
  return rows.map(mapRow);
}

export function deleteGrabacionRecord(id) {
  ensureSchema();
  getDb().prepare(`DELETE FROM promotor_grabaciones WHERE id = ?`).run(id);
}

/** Elimina archivo en disco (si existe) y fila en SQLite. */
export function purgeGrabacion(grabacion) {
  if (grabacion?.storagePath) {
    try {
      unlinkSync(grabacion.storagePath);
    } catch {
      // archivo ya ausente — continuar con baja en BD
    }
  }
  if (grabacion?.id != null) {
    deleteGrabacionRecord(grabacion.id);
  }
}

export function ejecutarLimpiezaGrabaciones(retentionDays = getGrabacionesRetentionDays()) {
  ensureSchema();
  const diasAprobados = Math.max(1, Number(retentionDays) || getGrabacionesRetentionDays());
  const diasRechazadoPromo = getGrabacionesRetentionRechazadoPromocionDays();
  const diasRechazadoEntrevista = getGrabacionesRetentionRechazadoEntrevistaDays();

  const cutoffAprobadosIso = cutoffIsoFromDays(diasAprobados);
  const cutoffRechazadoPromoIso = cutoffIsoFromDays(diasRechazadoPromo);
  const cutoffRechazadoEntrevistaIso = cutoffIsoFromDays(diasRechazadoEntrevista);

  const candidatasAprobadas = listGrabacionesAntesDe(cutoffAprobadosIso);
  const candidatasRechazadasPromo = listGrabacionesRechazadasAntesDe(
    cutoffRechazadoPromoIso,
    'promocion',
  );
  const candidatasRechazadasEntrevista = listGrabacionesRechazadasAntesDe(
    cutoffRechazadoEntrevistaIso,
    'entrevista',
  );

  const candidatas = [
    ...candidatasAprobadas,
    ...candidatasRechazadasPromo,
    ...candidatasRechazadasEntrevista,
  ];

  let archivosEliminados = 0;
  let registrosEliminados = 0;
  let bytesLiberados = 0;

  for (const g of candidatas) {
    bytesLiberados += g.tamanoBytes ?? 0;
    purgeGrabacion(g);
    archivosEliminados += 1;
    registrosEliminados += 1;
  }

  return {
    retentionDays: diasAprobados,
    retentionRechazadoPromocionDays: diasRechazadoPromo,
    retentionRechazadoEntrevistaDays: diasRechazadoEntrevista,
    cutoffAprobadosIso,
    cutoffRechazadoPromoIso,
    cutoffRechazadoEntrevistaIso,
    candidatas: candidatas.length,
    candidatasAprobadas: candidatasAprobadas.length,
    candidatasRechazadasPromo: candidatasRechazadasPromo.length,
    candidatasRechazadasEntrevista: candidatasRechazadasEntrevista.length,
    archivosEliminados,
    registrosEliminados,
    bytesLiberados,
  };
}
