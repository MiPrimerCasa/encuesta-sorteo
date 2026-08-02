import { randomUUID } from 'node:crypto';
import { getDb } from './sqlite.js';

const ESTADOS_VALIDOS = new Set(['nuevo', 'visto', 'aprobado', 'tratado', 'resuelto']);

function initFeedbackSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_feedback (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      anonimo INTEGER NOT NULL DEFAULT 0,
      usuario_id TEXT,
      usuario_nombre TEXT,
      usuario_rol TEXT,
      usuario_login_id TEXT,
      captura_path TEXT,
      captura_mime TEXT,
      url_vista TEXT,
      user_agent TEXT,
      estado TEXT NOT NULL DEFAULT 'nuevo',
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_app_feedback_creado
      ON app_feedback (creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_app_feedback_tipo
      ON app_feedback (tipo, estado, creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_app_feedback_usuario
      ON app_feedback (usuario_id, usuario_login_id, creado_en DESC);
  `);
}

initFeedbackSchema();

function normalizarEstado(estado) {
  if (estado === 'resuelto') return 'tratado';
  return estado;
}

function mapRow(row, { ocultarIdentidadAnonima = true } = {}) {
  if (!row) return null;
  const anonimo = Boolean(row.anonimo);
  const estado = normalizarEstado(row.estado);
  return {
    id: row.id,
    tipo: row.tipo,
    mensaje: row.mensaje,
    anonimo,
    usuarioId: ocultarIdentidadAnonima && anonimo ? null : row.usuario_id || null,
    usuarioNombre: ocultarIdentidadAnonima && anonimo ? null : row.usuario_nombre || null,
    usuarioRol: ocultarIdentidadAnonima && anonimo ? null : row.usuario_rol || null,
    usuarioLoginId: ocultarIdentidadAnonima && anonimo ? null : row.usuario_login_id || null,
    tieneCaptura: Boolean(row.captura_path),
    capturaMime: row.captura_mime || null,
    urlVista: row.url_vista || null,
    userAgent: row.user_agent || null,
    estado,
    creadoEn: row.creado_en,
  };
}

export function insertFeedback(input) {
  const id = randomUUID();
  const db = getDb();
  // Siempre guardamos id/login para que el operador vea «mis reportes»,
  // aunque sea anónimo (el admin no ve el nombre).
  db.prepare(
    `INSERT INTO app_feedback (
      id, tipo, mensaje, anonimo,
      usuario_id, usuario_nombre, usuario_rol, usuario_login_id,
      captura_path, captura_mime, url_vista, user_agent, estado
    ) VALUES (
      @id, @tipo, @mensaje, @anonimo,
      @usuario_id, @usuario_nombre, @usuario_rol, @usuario_login_id,
      @captura_path, @captura_mime, @url_vista, @user_agent, 'nuevo'
    )`,
  ).run({
    id,
    tipo: input.tipo,
    mensaje: input.mensaje,
    anonimo: input.anonimo ? 1 : 0,
    usuario_id: input.usuarioId || null,
    usuario_nombre: input.anonimo ? null : input.usuarioNombre || null,
    usuario_rol: input.anonimo ? null : input.usuarioRol || null,
    usuario_login_id: input.usuarioLoginId || null,
    captura_path: input.capturaPath || null,
    captura_mime: input.capturaMime || null,
    url_vista: input.urlVista || null,
    user_agent: input.userAgent || null,
  });
  return getFeedbackById(id);
}

export function getFeedbackById(id) {
  const row = getDb().prepare('SELECT * FROM app_feedback WHERE id = ?').get(id);
  return mapRow(row);
}

export function getFeedbackRowRaw(id) {
  return getDb().prepare('SELECT * FROM app_feedback WHERE id = ?').get(id);
}

export function getFeedbackCapturaMeta(id) {
  const row = getDb()
    .prepare('SELECT captura_path, captura_mime FROM app_feedback WHERE id = ?')
    .get(id);
  if (!row?.captura_path) return null;
  return { path: row.captura_path, mime: row.captura_mime || 'image/jpeg' };
}

export function listFeedback({ tipo, estado, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (tipo === 'bug' || tipo === 'mejora') {
    clauses.push('tipo = ?');
    params.push(tipo);
  }
  const est = normalizarEstado(estado);
  if (ESTADOS_VALIDOS.has(estado) || ESTADOS_VALIDOS.has(est)) {
    if (est === 'tratado') {
      clauses.push(`(estado = 'tratado' OR estado = 'resuelto')`);
    } else {
      clauses.push('estado = ?');
      params.push(est);
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const rows = getDb()
    .prepare(`SELECT * FROM app_feedback ${where} ORDER BY creado_en DESC LIMIT ?`)
    .all(...params, lim);
  return rows.map((r) => mapRow(r));
}

export function listFeedbackMios({ usuarioId, loginId, limit = 100 } = {}) {
  const id = String(usuarioId || '').trim();
  const login = String(loginId || '').trim();
  if (!id && !login) return [];
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const rows = getDb()
    .prepare(
      `SELECT * FROM app_feedback
       WHERE (usuario_id = ? AND ? != '')
          OR (usuario_login_id = ? AND ? != '')
       ORDER BY creado_en DESC
       LIMIT ?`,
    )
    .all(id, id, login, login, lim);
  // El dueño ve sus reportes aunque hayan sido anónimos hacia el admin
  return rows.map((r) => mapRow(r, { ocultarIdentidadAnonima: false }));
}

export function esDuenoFeedback(row, usuario) {
  if (!row || !usuario) return false;
  const uid = String(usuario.id || '').trim();
  const login = String(usuario.loginId || '').trim();
  if (uid && row.usuario_id && String(row.usuario_id) === uid) return true;
  if (login && row.usuario_login_id && String(row.usuario_login_id) === login) return true;
  return false;
}

export function updateFeedbackEstado(id, estado) {
  const est = normalizarEstado(String(estado || '').trim());
  if (!['nuevo', 'visto', 'aprobado', 'tratado'].includes(est)) return null;
  const db = getDb();
  const info = db.prepare('UPDATE app_feedback SET estado = ? WHERE id = ?').run(est, id);
  if (!info.changes) return null;
  return getFeedbackById(id);
}

export function countFeedbackNuevos() {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM app_feedback WHERE estado = 'nuevo'`)
    .get();
  return Number(row?.n || 0);
}
