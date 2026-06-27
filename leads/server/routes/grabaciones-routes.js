import { createReadStream, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import multer from 'multer';
import { parseFile } from 'music-metadata';
import {
  extensionPermitida,
  getGrabacionesMaxBytes,
  getGrabacionesMinDurationSec,
  getGrabacionesPromotoresConfig,
  getCuotaDiaria,
  getMaxAudiosMes,
  isGrabacionesEnabled,
  mimePermitido,
  resolvePromotorIdGrabaciones,
  usuarioPromotorTieneGrabaciones,
} from '../config/grabaciones-config.js';
import {
  buildCumplimientoAdmin,
  getGrabacionById,
  insertGrabacion,
  listGrabacionesPromotorDia,
  listPromocionesOcupanCuotaPromotorDia,
  countGrabacionesMesSubidas,
  aprobarGrabacion,
  rechazarYEliminarGrabacion,
  resumenPromotorDia,
  resumenTopeMesPromotor,
} from '../db/grabaciones-store.js';
import { calcularFranja, fechaDiaKey, fechaMesKey } from '../domain/grabaciones.js';
import { esSuperadminUsuario, esSupervisorPanelGlobal } from '../db/superadmin-auth.js';

function getGrabacionesRoot() {
  const raw = process.env.GRABACIONES_DIR || path.join(process.cwd(), 'data', 'grabaciones');
  return path.resolve(raw);
}

function createUploadMiddleware() {
  const root = getGrabacionesRoot();
  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      const now = new Date();
      const sub = path.join(
        root,
        String(now.getFullYear()),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      );
      mkdirSync(sub, { recursive: true });
      cb(null, sub);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.m4a';
      cb(null, `${randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: getGrabacionesMaxBytes() },
    fileFilter(_req, file, cb) {
      const extOk = extensionPermitida(file.originalname);
      const mimeOk = mimePermitido(file.mimetype);
      if (extOk || mimeOk) cb(null, true);
      else cb(new Error('Formato no permitido. Use .m4a, .mp3, .wav u .ogg'));
    },
  });
}

const upload = createUploadMiddleware();

function puedeAuditarGrabaciones(usuario) {
  if (!usuario) return false;
  if (esSuperadminUsuario(usuario)) return true;
  if (usuario.rol === 'supervisor' && esSupervisorPanelGlobal(usuario.loginId)) return true;
  if (usuario.panelGlobal) return true;
  return false;
}

async function resolveFechaYDuracion(filePath, uploadedAt) {
  let duracionSeg = null;
  let fechaGrab = uploadedAt;
  try {
    const meta = await parseFile(filePath);
    if (typeof meta.format?.duration === 'number') {
      duracionSeg = meta.format.duration;
    }
    if (meta.common?.year) {
      const d = new Date(
        meta.common.year,
        (meta.common.month ?? 1) - 1,
        meta.common.day ?? 1,
        meta.common.hour ?? uploadedAt.getHours(),
        meta.common.minute ?? uploadedAt.getMinutes(),
        meta.common.second ?? uploadedAt.getSeconds(),
      );
      if (!Number.isNaN(d.getTime())) fechaGrab = d;
    }
  } catch {
    // ignore
  }
  if (duracionSeg == null) {
    duracionSeg = await getDuracionSegundos(filePath);
  }
  if (fechaGrab === uploadedAt) {
    try {
      const st = statSync(filePath);
      if (st.birthtime && !Number.isNaN(st.birthtime.getTime())) {
        fechaGrab = st.birthtime;
      }
    } catch {
      // ignore
    }
  }
  return { fechaGrab, duracionSeg };
}

async function getDuracionSegundos(filePath) {
  try {
    const meta = await parseFile(filePath);
    const d = meta.format?.duration;
    if (typeof d === 'number' && Number.isFinite(d)) return d;
  } catch {
    // ignore
  }
  return null;
}

export function registerGrabacionesRoutes(api, { usuarioDesdeRequest }) {
  api.get('/grabaciones/config', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });

    const moduloActivo = isGrabacionesEnabled();
    const habilitado =
      moduloActivo && usuario.rol === 'promotor' && usuarioPromotorTieneGrabaciones(usuario);
    const diaKey = fechaDiaKey(new Date());
    const mesKey = fechaMesKey(new Date());
    const promotorId = resolvePromotorIdGrabaciones(usuario);
    const resumen =
      habilitado && promotorId ? resumenPromotorDia(promotorId, diaKey) : null;
    const resumenTopeMes =
      habilitado && promotorId ? resumenTopeMesPromotor(promotorId, mesKey) : null;

    res.json({
      moduloActivo,
      habilitado,
      puedeAuditar: moduloActivo && puedeAuditarGrabaciones(usuario),
      cuotaDiaria: getCuotaDiaria(),
      cuotaFranja: 2,
      maxAudiosMes: getMaxAudiosMes(),
      minDuracionSeg: getGrabacionesMinDurationSec(),
      formatos: ['.m4a', '.mp3', '.wav', '.ogg'],
      maxMb: Math.round(getGrabacionesMaxBytes() / (1024 * 1024)),
      resumenHoy: resumen,
      resumenTopeMes,
    });
  });

  if (!isGrabacionesEnabled()) {
    return;
  }

  api.get('/grabaciones/mias', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario || usuario.rol !== 'promotor') {
      return res.status(403).json({ error: 'Solo promotores' });
    }
    if (!usuarioPromotorTieneGrabaciones(usuario)) {
      return res.status(403).json({ error: 'Grabaciones no habilitadas' });
    }
    const diaKey = String(req.query.fecha ?? fechaDiaKey(new Date())).slice(0, 10);
    const mesKey = diaKey.slice(0, 7);
    const promotorId = resolvePromotorIdGrabaciones(usuario);
    const grabaciones = listGrabacionesPromotorDia(promotorId, diaKey);
    res.json({
      diaKey,
      resumen: resumenPromotorDia(promotorId, diaKey),
      resumenTopeMes: resumenTopeMesPromotor(promotorId, mesKey),
      grabaciones,
    });
  });

  api.post('/grabaciones/upload', (req, res) => {
    upload.single('audio')(req, res, async (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Error al subir archivo';
        return res.status(400).json({ error: msg });
      }

      const usuario = usuarioDesdeRequest(req);
      if (!usuario || usuario.rol !== 'promotor') {
        if (req.file?.path) try { unlinkSync(req.file.path); } catch { /* ignore */ }
        return res.status(403).json({ error: 'Solo promotores pueden subir audios' });
      }
      if (!usuarioPromotorTieneGrabaciones(usuario)) {
        if (req.file?.path) try { unlinkSync(req.file.path); } catch { /* ignore */ }
        return res.status(403).json({ error: 'Grabaciones no habilitadas para este usuario' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Falta el archivo de audio' });
      }

      const tipo = String(req.body?.tipo ?? '').trim().toLowerCase();
      if (tipo !== 'promocion' && tipo !== 'entrevista') {
        try { unlinkSync(req.file.path); } catch { /* ignore */ }
        return res.status(400).json({ error: 'Tipo inválido (promocion o entrevista)' });
      }

      const leadId = String(req.body?.leadId ?? '').trim() || null;
      const leadNombre = String(req.body?.leadNombre ?? '').trim() || null;

      if (tipo === 'entrevista' && !leadId) {
        try { unlinkSync(req.file.path); } catch { /* ignore */ }
        return res.status(400).json({ error: 'Seleccioná el lead de la entrevista' });
      }

      try {
        const uploadedAt = new Date();
        const { fechaGrab, duracionSeg: duracionRaw } = await resolveFechaYDuracion(
          req.file.path,
          uploadedAt,
        );
        const duracionSeg =
          typeof duracionRaw === 'number' && Number.isFinite(duracionRaw) ? duracionRaw : 0;
        const minDuracion = getGrabacionesMinDurationSec();
        if (minDuracion > 0 && duracionSeg < minDuracion) {
          try {
            unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
          return res.status(400).json({
            error: `El audio debe durar al menos ${minDuracion} segundos`,
          });
        }

        const franja = calcularFranja(fechaGrab);
        const diaKey = fechaDiaKey(fechaGrab);
        const mesKey = fechaMesKey(fechaGrab);
        const promotorId = resolvePromotorIdGrabaciones(usuario);

        const enMes = countGrabacionesMesSubidas(promotorId, mesKey);
        if (enMes >= getMaxAudiosMes()) {
          try {
            unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
          return res.status(400).json({
            error: `Alcanzaste el tope de ${getMaxAudiosMes()} audios del mes (promoción + entrevista)`,
          });
        }

        if (tipo === 'promocion') {
          const promosHoy = listPromocionesOcupanCuotaPromotorDia(promotorId, diaKey);
          if (promosHoy.length >= getCuotaDiaria()) {
            try {
              unlinkSync(req.file.path);
            } catch {
              /* ignore */
            }
            return res.status(400).json({
              error: `Ya subiste los ${getCuotaDiaria()} audios de promoción de ese día`,
            });
          }
        }

        const grabacion = insertGrabacion({
          promotorId,
          promotorNombre: usuario.nombre,
          leadId,
          leadNombre,
          tipo,
          franja,
          fechaGrabacion: fechaGrab.toISOString(),
          diaKey,
          duracionSeg: Math.round(duracionSeg * 10) / 10,
          mimeType: req.file.mimetype || 'application/octet-stream',
          storagePath: req.file.path,
          tamanoBytes: req.file.size,
        });

        res.json({
          grabacion,
          resumen: resumenPromotorDia(promotorId, diaKey),
          resumenTopeMes: resumenTopeMesPromotor(promotorId, mesKey),
        });
      } catch (e) {
        if (req.file?.path) try { unlinkSync(req.file.path); } catch { /* ignore */ }
        console.error('[grabaciones] upload error:', e);
        res.status(500).json({ error: 'No se pudo guardar la grabación' });
      }
    });
  });

  api.get('/grabaciones/admin/cumplimiento', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!puedeAuditarGrabaciones(usuario)) {
      return res.status(403).json({ error: 'Sin permiso para auditar grabaciones' });
    }
    const diaKey = String(req.query.fecha ?? fechaDiaKey(new Date())).slice(0, 10);
    let promotorIds = null;
    const rawIds = req.query.promotorIds;
    if (typeof rawIds === 'string' && rawIds.trim()) {
      promotorIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const filas = buildCumplimientoAdmin(diaKey, promotorIds);
    res.json({ diaKey, filas, promotoresConfig: getGrabacionesPromotoresConfig() });
  });

  api.get('/grabaciones/:id/audio', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });

    const id = Number.parseInt(String(req.params.id), 10);
    const grabacion = getGrabacionById(id);
    if (!grabacion) return res.status(404).json({ error: 'Grabación no encontrada' });

    const esDueno =
      usuario.rol === 'promotor' &&
      usuarioPromotorTieneGrabaciones(usuario) &&
      String(grabacion.promotorId) === resolvePromotorIdGrabaciones(usuario);
    if (!esDueno && !puedeAuditarGrabaciones(usuario)) {
      return res.status(403).json({ error: 'Sin permiso' });
    }

    try {
      statSync(grabacion.storagePath);
    } catch {
      return res.status(404).json({ error: 'Archivo no encontrado en el servidor' });
    }

    res.setHeader('Content-Type', grabacion.mimeType || 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(grabacion.storagePath).pipe(res);
  });

  api.post('/grabaciones/:id/aprobar', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!puedeAuditarGrabaciones(usuario)) {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    const id = Number.parseInt(String(req.params.id), 10);
    const actualizada = aprobarGrabacion(id, { aprobadoPor: usuario.nombre });
    if (!actualizada || actualizada.estado !== 'activo') {
      return res.status(404).json({ error: 'Grabación no encontrada o ya procesada' });
    }
    res.json({ grabacion: actualizada });
  });

  api.post('/grabaciones/:id/rechazar', (req, res) => {
    const usuario = usuarioDesdeRequest(req);
    if (!puedeAuditarGrabaciones(usuario)) {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    const id = Number.parseInt(String(req.params.id), 10);
    void String(req.body?.motivo ?? '').trim();
    const resultado = rechazarYEliminarGrabacion(id, {
      rechazadoPor: usuario.nombre,
      motivo: String(req.body?.motivo ?? '').trim() || null,
    });
    if (!resultado) return res.status(404).json({ error: 'Grabación no encontrada' });
    res.json({ ok: true, eliminado: true, id: resultado.id });
  });
}
