import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import {
  countFeedbackNuevos,
  esDuenoFeedback,
  getFeedbackById,
  getFeedbackCapturaMeta,
  getFeedbackRowRaw,
  insertFeedback,
  listFeedback,
  listFeedbackMios,
  updateFeedbackEstado,
} from '../db/feedback-store.js';
import { esFeedbackAdminUsuario } from '../db/superadmin-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDBACK_ROOT = path.resolve(__dirname, '../../data/feedback');
const MAX_CAPTURA_BYTES = 8 * 1024 * 1024;

function puedeVerFeedback(usuario) {
  return esFeedbackAdminUsuario(usuario);
}

function ensureFeedbackRoot() {
  if (!existsSync(FEEDBACK_ROOT)) mkdirSync(FEEDBACK_ROOT, { recursive: true });
}

function createUploadMiddleware() {
  ensureFeedbackRoot();
  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      const now = new Date();
      const sub = path.join(
        FEEDBACK_ROOT,
        String(now.getFullYear()),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      );
      mkdirSync(sub, { recursive: true });
      cb(null, sub);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const safe =
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      cb(null, `${randomUUID()}${safe}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_CAPTURA_BYTES },
    fileFilter(_req, file, cb) {
      const mime = String(file.mimetype || '').toLowerCase();
      if (mime.startsWith('image/')) cb(null, true);
      else cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP).'));
    },
  });
}

function toRelativePath(absPath) {
  return path.relative(FEEDBACK_ROOT, absPath).split(path.sep).join('/');
}

function resolveCapturaAbs(rel) {
  if (!rel || rel.includes('..')) return null;
  const abs = path.resolve(FEEDBACK_ROOT, rel);
  if (!abs.startsWith(FEEDBACK_ROOT)) return null;
  return abs;
}

/**
 * @param {import('express').Router} api
 * @param {{ usuarioDesdeRequest: (req: import('express').Request) => object | null }} opts
 */
export function registerFeedbackRoutes(api, { usuarioDesdeRequest }) {
  const upload = createUploadMiddleware();

  api.post('/feedback', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión requerida para enviar el reporte.' });
    }

    upload.single('captura')(req, res, (err) => {
      if (err) {
        const msg =
          err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
            ? 'La captura supera el límite de 8 MB.'
            : err.message || 'Error al subir la captura.';
        return res.status(400).json({ message: msg });
      }

      try {
        const tipo = String(req.body?.tipo || '').trim();
        if (tipo !== 'bug' && tipo !== 'mejora') {
          if (req.file?.path) {
            try {
              unlinkSync(req.file.path);
            } catch {
              /* ignore */
            }
          }
          return res.status(400).json({ message: 'Tipo inválido. Use bug o mejora.' });
        }

        const mensaje = String(req.body?.mensaje || '').trim();
        if (mensaje.length < 5) {
          if (req.file?.path) {
            try {
              unlinkSync(req.file.path);
            } catch {
              /* ignore */
            }
          }
          return res
            .status(400)
            .json({ message: 'Escribí al menos unas palabras describiendo el caso.' });
        }
        if (mensaje.length > 4000) {
          if (req.file?.path) {
            try {
              unlinkSync(req.file.path);
            } catch {
              /* ignore */
            }
          }
          return res.status(400).json({ message: 'El mensaje es demasiado largo (máx. 4000).' });
        }

        const anonimoRaw = String(req.body?.anonimo || '').toLowerCase();
        const anonimo = anonimoRaw === '1' || anonimoRaw === 'true' || anonimoRaw === 'si';

        const item = insertFeedback({
          tipo,
          mensaje,
          anonimo,
          usuarioId: usuario.id,
          usuarioNombre: usuario.nombre,
          usuarioRol: usuario.rol,
          usuarioLoginId: usuario.loginId,
          capturaPath: req.file ? toRelativePath(req.file.path) : null,
          capturaMime: req.file?.mimetype || null,
          urlVista: String(req.body?.urlVista || '').slice(0, 500) || null,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 400) || null,
        });

        return res.status(201).json({ ok: true, item });
      } catch (error) {
        if (req.file?.path) {
          try {
            unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
        }
        console.error('[feedback] Error al guardar:', error);
        return res.status(500).json({
          message: 'No se pudo guardar el reporte.',
          detail: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    });
  });

  api.get('/feedback/mios', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario) {
      return res.status(401).json({ message: 'Sesión requerida.' });
    }
    const items = listFeedbackMios({
      usuarioId: usuario.id,
      loginId: usuario.loginId,
      limit: req.query.limit,
    });
    return res.json({ items });
  });

  api.get('/feedback', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!puedeVerFeedback(usuario)) {
      return res.status(403).json({ message: 'Sin permiso para ver reportes.' });
    }
    const items = listFeedback({
      tipo: req.query.tipo,
      estado: req.query.estado,
      limit: req.query.limit,
    });
    return res.json({
      items,
      nuevos: countFeedbackNuevos(),
    });
  });

  api.get('/feedback/resumen', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!puedeVerFeedback(usuario)) {
      return res.status(403).json({ message: 'Sin permiso.' });
    }
    return res.json({ nuevos: countFeedbackNuevos() });
  });

  api.patch('/feedback/:id/estado', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!puedeVerFeedback(usuario)) {
      return res.status(403).json({ message: 'Sin permiso.' });
    }
    const estado = String(req.body?.estado || '').trim();
    const item = updateFeedbackEstado(req.params.id, estado);
    if (!item) return res.status(404).json({ message: 'Reporte no encontrado o estado inválido.' });
    return res.json({ ok: true, item });
  });

  api.get('/feedback/:id/captura', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario) return res.status(401).json({ message: 'Sesión requerida.' });
    const raw = getFeedbackRowRaw(req.params.id);
    if (!raw) return res.status(404).json({ message: 'Reporte no encontrado.' });
    if (!puedeVerFeedback(usuario) && !esDuenoFeedback(raw, usuario)) {
      return res.status(403).json({ message: 'Sin permiso.' });
    }
    const meta = getFeedbackCapturaMeta(req.params.id);
    if (!meta) return res.status(404).json({ message: 'Sin captura.' });
    const abs = resolveCapturaAbs(meta.path);
    if (!abs || !existsSync(abs)) return res.status(404).json({ message: 'Archivo no encontrado.' });
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(abs).pipe(res);
  });

  api.get('/feedback/:id', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario) return res.status(401).json({ message: 'Sesión requerida.' });
    const raw = getFeedbackRowRaw(req.params.id);
    if (!raw) return res.status(404).json({ message: 'Reporte no encontrado.' });
    if (!puedeVerFeedback(usuario) && !esDuenoFeedback(raw, usuario)) {
      return res.status(403).json({ message: 'Sin permiso.' });
    }
    const item = getFeedbackById(req.params.id);
    return res.json({ item });
  });
}
