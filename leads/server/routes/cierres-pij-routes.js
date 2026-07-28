import { createReadStream, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import multer from 'multer';
import {
  extensionPermitidaCierrePij,
  getCierresPijMaxBytes,
  mimePermitidoCierrePij,
} from '../config/cierres-pij-config.js';
import {
  archivoCierrePijDisponible,
  ensureCierresPijStorageReady,
  getCierresPijRoot,
  moveCierrePijToLeadDir,
  resolveCierrePijPath,
  toRelativeCierrePijPath,
} from '../domain/cierres-pij-storage.js';

const TIPOS_IMAGEN = new Set(['img1', 'img2', 'img5', 'img6', 'img7', 'recibo', 'comprobante_transferencia']);

/** Sube primero a _inbox; luego se mueve a carpeta del lead. */
function createUploadMiddleware() {
  const root = getCierresPijRoot();
  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      const inbox = path.join(root, '_inbox');
      mkdirSync(inbox, { recursive: true });
      cb(null, inbox);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: getCierresPijMaxBytes() },
    fileFilter(_req, file, cb) {
      const extOk = extensionPermitidaCierrePij(file.originalname);
      const mimeOk = mimePermitidoCierrePij(file.mimetype);
      if (extOk || mimeOk) cb(null, true);
      else cb(new Error('Formato no permitido. Usá JPG, PNG o WEBP.'));
    },
  });
}

const upload = createUploadMiddleware();

function usuarioLogueado(usuario) {
  return Boolean(usuario?.id && usuario?.rol);
}

function borrarSiExiste(filePath) {
  if (!filePath) return;
  try {
    unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/**
 * Registra rutas de imágenes de cierre PIJ.
 * Persistencia: volumen Docker `./data` → `data/cierres-pij/{leadId}/...`
 * @param {import('express').Router} api
 * @param {{ usuarioDesdeRequest: (req: import('express').Request) => object | null }} deps
 */
export function registerCierresPijRoutes(api, { usuarioDesdeRequest }) {
  ensureCierresPijStorageReady();

  api.post('/cierres-pij/imagenes', (req, res) => {
    upload.single('imagen')(req, res, async (err) => {
      if (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
        let msg = err instanceof Error ? err.message : 'Error al subir imagen';
        if (code === 'LIMIT_FILE_SIZE' || /file too large/i.test(msg)) {
          msg = `La imagen supera el máximo (${Math.round(getCierresPijMaxBytes() / (1024 * 1024))} MB). Sacá la foto de nuevo o elegí una más liviana.`;
        }
        const status = /formato|tamaño|file too large|supera el máximo/i.test(msg) ? 400 : 500;
        return res.status(status).json({ error: msg });
      }

      const usuario = usuarioDesdeRequest(req);
      if (!usuarioLogueado(usuario)) {
        borrarSiExiste(req.file?.path);
        return res.status(401).json({ error: 'Sesión inválida. Volvé a iniciar sesión.' });
      }

      if (!req.file?.path) {
        return res.status(400).json({ error: 'Falta el archivo de imagen' });
      }

      const leadId = String(req.body?.leadId ?? '').trim();
      const ventaKey = String(req.body?.ventaKey ?? '').trim();
      const tipo = String(req.body?.tipo ?? '').trim();

      if (!leadId) {
        borrarSiExiste(req.file.path);
        return res.status(400).json({ error: 'Falta leadId' });
      }
      if (!ventaKey) {
        borrarSiExiste(req.file.path);
        return res.status(400).json({ error: 'Falta ventaKey (principal o id de compra adicional)' });
      }
      if (!TIPOS_IMAGEN.has(tipo)) {
        borrarSiExiste(req.file.path);
        return res.status(400).json({ error: 'tipo inválido (img1 | img2 | img5 | img6 | img7)' });
      }

      try {
        const stInbox = statSync(req.file.path);
        if (!stInbox.isFile() || stInbox.size <= 0) {
          borrarSiExiste(req.file.path);
          return res.status(500).json({ error: 'El archivo no se guardó correctamente en el servidor' });
        }

        const finalPath = moveCierrePijToLeadDir(req.file.path, { leadId, tipo, ventaKey });
        const st = statSync(finalPath);

        const imagen = {
          id: randomUUID(),
          leadId,
          ventaKey,
          tipo,
          storagePath: toRelativeCierrePijPath(finalPath),
          mimeType: req.file.mimetype || 'image/jpeg',
          tamanoBytes: st.size,
          nombreOriginal: req.file.originalname?.slice(0, 120) ?? null,
          subidoEn: new Date().toISOString(),
          operadorId: usuario.id != null ? String(usuario.id) : null,
        };

        if (!archivoCierrePijDisponible(imagen.storagePath)) {
          console.error(
            '[cierres-pij] Archivo no persistido tras upload lead=%s path=%s',
            leadId,
            imagen.storagePath,
          );
          return res.status(500).json({ error: 'No se pudo verificar la imagen en el disco del servidor' });
        }

        console.info(
          '[cierres-pij] guardada lead=%s tipo=%s path=%s',
          leadId,
          tipo,
          imagen.storagePath,
        );
        return res.json({ imagen });
      } catch (e) {
        borrarSiExiste(req.file?.path);
        console.error('[cierres-pij] upload error:', e);
        return res.status(500).json({ error: 'Error al guardar la imagen' });
      }
    });
  });

  api.get('/cierres-pij/imagenes/:imageId', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuarioLogueado(usuario)) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    const storagePath = String(req.query?.path ?? '').trim();
    if (!storagePath) {
      return res.status(400).json({ error: 'Falta path de la imagen' });
    }

    const filePath = resolveCierrePijPath(storagePath);
    if (!filePath) {
      return res.status(404).json({ error: 'Imagen no encontrada en el servidor' });
    }

    try {
      const st = statSync(filePath);
      const mime =
        String(req.query?.mime ?? '').trim() ||
        (filePath.endsWith('.png')
          ? 'image/png'
          : filePath.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', st.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      createReadStream(filePath).pipe(res);
    } catch (e) {
      console.error('[cierres-pij] serve error:', e);
      return res.status(500).json({ error: 'Error al leer la imagen' });
    }
  });
}
