import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { barriosCatalog, productosCatalog } from '../catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.join(dataDir, 'app-cache.db');

let db;

function openDatabase() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema();
  seedCatalogIfEmpty();
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
  `);
}

function seedCatalogIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM productos').get().c;
  if (n > 0) return;

  const insProd = db.prepare(
    'INSERT INTO productos (id, codigo, nombre, roles_json) VALUES (?, ?, ?, ?)',
  );
  for (const pr of productosCatalog) {
    insProd.run(pr.id, pr.codigo, pr.nombre, JSON.stringify(pr.rolesPermitidos));
  }

  const insBarrio = db.prepare('INSERT INTO barrios (id, nombre) VALUES (?, ?)');
  for (const b of barriosCatalog) {
    insBarrio.run(b.id, b.nombre);
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

export function upsertSeguimientoExterno(leadId, seguimiento, usuarioId) {
  const dbi = getDb();
  const prev = getSeguimientoExterno(leadId);
  const merged = { ...prev, ...seguimiento };
  dbi.prepare(
    `INSERT INTO lead_seguimiento_externo (lead_id, seguimiento_json, actualizado_en)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(lead_id) DO UPDATE SET
       seguimiento_json = excluded.seguimiento_json,
       actualizado_en = datetime('now')`,
  ).run(leadId, JSON.stringify(merged));
  dbi.prepare(
    `INSERT INTO seguimiento_eventos (lead_id, usuario_id, tipo, payload_json)
     VALUES (?, ?, 'seguimiento', ?)`,
  ).run(leadId, usuarioId ?? null, JSON.stringify(seguimiento));
  return merged;
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
