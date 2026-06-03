import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { barriosCatalog, productosCatalog } from '../catalog.js';
import {
  filaHistorialDesdeEstado,
  normalizarOperadorHistorial,
} from './seguimiento-historial.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dataDir, 'app-cache.db');

let db;

function openDatabase() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema();
  syncCatalog();
}

/** SQLite local solo para caché de seguimiento y catálogo de formulario. */
export function getDb() {
  if (!db) openDatabase();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      roles_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS barrios (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seguimiento_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      usuario_id TEXT,
      tipo TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lead_seguimiento_externo (
      lead_id TEXT PRIMARY KEY,
      seguimiento_json TEXT NOT NULL DEFAULT '{}',
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lead_seguimiento_historial (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      operador_id TEXT,
      operador_rol TEXT,
      operador_nombre TEXT NOT NULL,
      estado_etiqueta TEXT NOT NULL,
      resultado_entrevista TEXT,
      pestana TEXT,
      seguimiento_json TEXT NOT NULL,
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_seguimiento_historial_lead
      ON lead_seguimiento_historial (lead_id, creado_en DESC);
  `);
}

function mapHistorialRow(row) {
  if (!row) return null;
  let snapshot = {};
  try {
    snapshot = JSON.parse(row.seguimiento_json || '{}');
  } catch {
    snapshot = {};
  }
  return {
    id: row.id,
    leadId: row.lead_id,
    operadorId: row.operador_id ?? undefined,
    operadorRol: row.operador_rol ?? undefined,
    operadorNombre: row.operador_nombre,
    estadoEtiqueta: row.estado_etiqueta,
    resultadoEntrevista: row.resultado_entrevista ?? undefined,
    pestana: row.pestana ?? undefined,
    seguimientoSnapshot: snapshot,
    creadoEn: row.creado_en,
  };
}

/** Mantiene productos y barrios alineados con server/catalog.js (también en DB ya creada). */
function syncCatalog() {
  const upsertProd = db.prepare(
    `INSERT INTO productos (id, codigo, nombre, roles_json) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       codigo = excluded.codigo,
       nombre = excluded.nombre,
       roles_json = excluded.roles_json`,
  );
  for (const pr of productosCatalog) {
    upsertProd.run(pr.id, pr.codigo, pr.nombre, JSON.stringify(pr.rolesPermitidos));
  }

  const upsertBarrio = db.prepare(
    `INSERT INTO barrios (id, nombre) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre`,
  );
  for (const b of barriosCatalog) {
    upsertBarrio.run(b.id, b.nombre);
  }

  const ids = barriosCatalog.map((b) => b.id);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM barrios WHERE id NOT IN (${placeholders})`).run(...ids);
  }
}

export function getSeguimientoExterno(leadId) {
  const row = getDb()
    .prepare('SELECT seguimiento_json FROM lead_seguimiento_externo WHERE lead_id = ?')
    .get(leadId);
  if (!row) return {};
  try {
    return JSON.parse(row.seguimiento_json || '{}');
  } catch {
    return {};
  }
}

export function appendSeguimientoHistorial(leadId, merged, { usuario, usuarioId, lead } = {}) {
  const prevJson = getSeguimientoExterno(leadId);
  const mergedJson = JSON.stringify(merged);
  if (JSON.stringify(prevJson) === mergedJson) {
    return null;
  }

  const operador = normalizarOperadorHistorial(usuario, usuarioId);
  const fila = filaHistorialDesdeEstado({
    leadId,
    seguimiento: merged,
    lead: lead ?? {},
    operador,
  });

  const info = getDb()
    .prepare(
      `INSERT INTO lead_seguimiento_historial (
        lead_id, operador_id, operador_rol, operador_nombre,
        estado_etiqueta, resultado_entrevista, pestana, seguimiento_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fila.leadId,
      fila.operadorId,
      fila.operadorRol,
      fila.operadorNombre,
      fila.estadoEtiqueta,
      fila.resultadoEntrevista,
      fila.pestana,
      JSON.stringify(fila.seguimientoSnapshot),
    );

  return mapHistorialRow({
    id: info.lastInsertRowid,
    lead_id: fila.leadId,
    operador_id: fila.operadorId,
    operador_rol: fila.operadorRol,
    operador_nombre: fila.operadorNombre,
    estado_etiqueta: fila.estadoEtiqueta,
    resultado_entrevista: fila.resultadoEntrevista,
    pestana: fila.pestana,
    seguimiento_json: JSON.stringify(fila.seguimientoSnapshot),
    creado_en: new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
}

export function listSeguimientoHistorial(leadId, { limit = 50 } = {}) {
  const rows = getDb()
    .prepare(
      `SELECT id, lead_id, operador_id, operador_rol, operador_nombre,
              estado_etiqueta, resultado_entrevista, pestana, seguimiento_json, creado_en
       FROM lead_seguimiento_historial
       WHERE lead_id = ?
       ORDER BY creado_en DESC, id DESC
       LIMIT ?`,
    )
    .all(String(leadId), Math.min(Math.max(limit, 1), 200));
  return rows.map(mapHistorialRow);
}

export function upsertSeguimientoExterno(leadId, seguimiento, usuario, leadContext) {
  const dbi = getDb();
  const prev = getSeguimientoExterno(leadId);
  const merged = { ...prev, ...seguimiento };
  const usuarioId =
    typeof usuario === 'string' || usuario == null
      ? usuario
      : String(usuario.id ?? '');

  appendSeguimientoHistorial(leadId, merged, {
    usuario: typeof usuario === 'object' && usuario ? usuario : null,
    usuarioId,
    lead: leadContext,
  });

  dbi.prepare(
    `INSERT INTO lead_seguimiento_externo (lead_id, seguimiento_json, actualizado_en)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(lead_id) DO UPDATE SET
       seguimiento_json = excluded.seguimiento_json,
       actualizado_en = datetime('now')`,
  ).run(leadId, JSON.stringify(merged));

  const opId = typeof usuario === 'object' && usuario ? usuario.id : usuarioId;
  dbi.prepare(
    `INSERT INTO seguimiento_eventos (lead_id, usuario_id, tipo, payload_json)
     VALUES (?, ?, 'seguimiento', ?)`,
  ).run(leadId, opId ?? null, JSON.stringify(seguimiento));

  return merged;
}

/** Espejo local del seguimiento SQL (lectura cuando MPCSP no tiene SELECT en STRSYSTEM). */
export function writeSeguimientoExternoMerged(leadId, merged, usuario, leadContext) {
  const prev = getSeguimientoExterno(leadId);
  if (JSON.stringify(prev) === JSON.stringify(merged)) {
    return merged;
  }
  const usuarioId =
    typeof usuario === 'string' || usuario == null ? usuario : String(usuario.id ?? '');
  appendSeguimientoHistorial(leadId, merged, {
    usuario: typeof usuario === 'object' && usuario ? usuario : null,
    usuarioId,
    lead: leadContext,
  });
  getDb()
    .prepare(
      `INSERT INTO lead_seguimiento_externo (lead_id, seguimiento_json, actualizado_en)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(lead_id) DO UPDATE SET
         seguimiento_json = excluded.seguimiento_json,
         actualizado_en = datetime('now')`,
    )
    .run(String(leadId), JSON.stringify(merged));
  return merged;
}

export function batchSeguimientoExterno(leadIds) {
  const map = {};
  for (const id of leadIds) {
    const key = String(id);
    const seg = getSeguimientoExterno(key);
    if (seg && Object.keys(seg).length > 0) {
      map[key] = seg;
    }
  }
  return map;
}

export function listBarrios() {
  return getDb().prepare('SELECT id, nombre FROM barrios ORDER BY nombre').all();
}

export function listProductos() {
  return getDb()
    .prepare('SELECT id, codigo, nombre, roles_json FROM productos')
    .all()
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      rolesPermitidos: JSON.parse(r.roles_json),
    }));
}

export function productoPermitidoParaRol(idProducto, rol) {
  const row = getDb().prepare('SELECT roles_json FROM productos WHERE id = ?').get(idProducto);
  if (!row) return false;
  const roles = JSON.parse(row.roles_json);
  return roles.includes(rol);
}
