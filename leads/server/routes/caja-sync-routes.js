import { z } from 'zod';
import { createReadStream, statSync } from 'node:fs';
import {
  isCajaMysqlEnabled,
  resolveSucursalDesdeToken,
} from '../config/caja-mysql-config.js';
import { pingCajaMysql } from '../db/caja-mysql.js';
import { aplicarConfirmacionCaja } from '../services/caja-confirmacion.js';
import {
  ackPullCaja,
  listarCierresParaCaja,
  resolverImagenCierreCaja,
  resolverImagenPorIdImagen,
} from '../services/caja-pull.js';
import {
  equipoDesdeCodigo,
  listarOperadoresParaCaja,
  sincronizarCatalogoOperadoresDesdeCrm,
} from '../services/caja-operadores.js';

const confirmacionSchema = z
  .object({
    /** Compat: id numérico de crm_venta_pendiente */
    cierreId: z.coerce.number().int().positive().optional(),
    /** Contrato: uuid de crm_venta_pendiente */
    pendienteUuid: z.string().uuid().optional(),
    /** CONFIRMADA|RECHAZADA o cerrado|rechazado (compat) */
    estado: z.string().trim().min(1),
    idCaja: z.string().trim().max(64).nullable().optional(),
    reciboNumero: z.string().trim().max(40).nullable().optional(),
    contratoUuid: z.string().uuid().nullable().optional(),
    motivoRechazo: z.string().trim().max(500).nullable().optional(),
    confirmadoPor: z.string().trim().min(1).max(200).optional(),
    verificadoPor: z.string().trim().min(1).max(200).optional(),
  })
  .refine((d) => d.cierreId || d.pendienteUuid, {
    message: 'Indicá cierreId o pendienteUuid.',
  })
  .refine((d) => d.confirmadoPor || d.verificadoPor, {
    message: 'confirmadoPor (o verificadoPor) es obligatorio.',
  });

const ackSchema = z.object({
  ultimoId: z.coerce.number().int().nonnegative(),
});

function appBasePath() {
  const raw = String(process.env.APP_BASE_PATH ?? '/leads').trim();
  if (!raw || raw === '/') return '';
  return raw.replace(/\/$/, '');
}

/** Extrae Bearer token del header Authorization. */
export function bearerTokenDesdeRequest(req) {
  const raw = String(req.headers.authorization ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Middleware: exige Bearer token válido de CAJA_SYNC_TOKENS.
 * Deja `req.cajaSucursal` con el código de sucursal ERP.
 */
export function requireCajaSyncToken(req, res, next) {
  const token = bearerTokenDesdeRequest(req);
  const sucursal = resolveSucursalDesdeToken(token);
  if (!sucursal) {
    return res.status(401).json({
      message: 'Token de sync de caja inválido o ausente. Usá Authorization: Bearer <token>.',
    });
  }
  req.cajaSucursal = sucursal;
  return next();
}

function respondCajaError(res, error) {
  const code = error?.code;
  if (code === 'VALIDATION') {
    return res.status(400).json({ message: error.message, code });
  }
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ message: error.message, code });
  }
  if (code === 'FORBIDDEN') {
    return res.status(403).json({ message: error.message, code });
  }
  if (code === 'CAJA_MYSQL_DISABLED') {
    return res.status(503).json({ message: error.message, code });
  }
  if (code === 'CRM_PATCH_FAILED') {
    return res.status(502).json({
      message: error.message,
      code,
      confirmacionId: error.confirmacionId ?? null,
      cierreId: error.cierreId ?? null,
      pendienteUuid: error.pendienteUuid ?? null,
      leadId: error.leadId ?? null,
    });
  }
  console.error('[caja-sync]', error);
  return res.status(500).json({
    message: error instanceof Error ? error.message : 'Error en sync de caja.',
  });
}

function streamImagen(res, meta) {
  const st = statSync(meta.filePath);
  res.setHeader('Content-Type', meta.mimeType || 'image/jpeg');
  res.setHeader('Content-Length', st.size);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (meta.sha256) {
    res.setHeader('X-Content-SHA256', meta.sha256);
  }
  if (meta.nombreOriginal) {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(meta.nombreOriginal).replace(/"/g, '')}"`,
    );
  }
  createReadStream(meta.filePath).pipe(res);
}

/**
 * Rutas de sincronización CRM ↔ caja de sucursal (HTTPS + token).
 * Prefijo: /api/caja/*
 * Contrato: SistemaCajaPIJ docs/CRM_FLUJO_ENVIO_VPS_CAJA.md
 * @param {import('express').Router} api
 */
export function registerCajaSyncRoutes(api) {
  api.get('/caja/health', requireCajaSyncToken, async (req, res) => {
    try {
      let mysql = 'disabled';
      if (isCajaMysqlEnabled()) {
        await pingCajaMysql();
        mysql = 'ok';
      }
      return res.json({
        ok: true,
        sucursal: req.cajaSucursal,
        mysql,
        contrato: 'crm_venta_pendiente+caja_cierre_imagen',
      });
    } catch (error) {
      console.error('[caja-sync] health:', error);
      return res.status(503).json({
        ok: false,
        sucursal: req.cajaSucursal,
        mysql: 'error',
        message: error instanceof Error ? error.message : 'Error MySQL caja',
      });
    }
  });

  /**
   * Pull VPS → caja: pendientes incremental (payload_json completo).
   * Query: ?desde=<id>&limit=<n>
   */
  api.get('/caja/cierres', requireCajaSyncToken, async (req, res) => {
    try {
      const result = await listarCierresParaCaja(req.cajaSucursal, {
        desde: req.query?.desde,
        limit: req.query?.limit,
        basePath: appBasePath(),
      });
      return res.json(result);
    } catch (error) {
      return respondCajaError(res, error);
    }
  });

  /** Alias explícito del contrato. */
  api.get('/caja/pendientes', requireCajaSyncToken, async (req, res) => {
    try {
      const result = await listarCierresParaCaja(req.cajaSucursal, {
        desde: req.query?.desde,
        limit: req.query?.limit,
        basePath: appBasePath(),
      });
      return res.json(result);
    } catch (error) {
      return respondCajaError(res, error);
    }
  });

  /**
   * Catálogo de promotores/supervisores.
   * Query: ?rol=promotor|supervisor&equipo=S21&refresh=1
   */
  api.get('/caja/operadores', requireCajaSyncToken, async (req, res) => {
    try {
      const refresh =
        req.query?.refresh === '1' ||
        String(req.query?.refresh || '').toLowerCase() === 'true';
      if (refresh) {
        await sincronizarCatalogoOperadoresDesdeCrm();
      }

      const equipoFiltro =
        String(req.query?.equipo ?? '').trim() ||
        equipoDesdeCodigo(req.cajaSucursal) ||
        (String(req.cajaSucursal).match(/^S\d{2}$/i)
          ? String(req.cajaSucursal).toUpperCase()
          : null);

      const result = await listarOperadoresParaCaja({
        equipo: equipoFiltro || null,
        rol: req.query?.rol ? String(req.query.rol) : null,
      });

      if (equipoFiltro && result.count === 0 && !req.query?.equipo) {
        const all = await listarOperadoresParaCaja({
          rol: req.query?.rol ? String(req.query.rol) : null,
        });
        return res.json({
          sucursal: req.cajaSucursal,
          equipo: equipoFiltro,
          refreshed: refresh,
          ...all,
        });
      }

      return res.json({
        sucursal: req.cajaSucursal,
        equipo: equipoFiltro,
        refreshed: refresh,
        ...result,
      });
    } catch (error) {
      return respondCajaError(res, error);
    }
  });

  /**
   * Contrato: GET /api/caja/imagenes/:idImagen
   */
  api.get('/caja/imagenes/:idImagen', requireCajaSyncToken, async (req, res) => {
    try {
      const meta = await resolverImagenPorIdImagen(req.params.idImagen, req.cajaSucursal);
      return streamImagen(res, meta);
    } catch (error) {
      return respondCajaError(res, error);
    }
  });

  /**
   * Compat: descarga por pendiente id + img id.
   */
  api.get('/caja/cierres/:id/imagenes/:imgId', requireCajaSyncToken, async (req, res) => {
    try {
      const meta = await resolverImagenCierreCaja(
        req.params.id,
        req.params.imgId,
        req.cajaSucursal,
      );
      return streamImagen(res, meta);
    } catch (error) {
      return respondCajaError(res, error);
    }
  });

  /**
   * Ack tras pull OK: avanza cursor y marca PENDIENTE → DESCARGADA.
   */
  api.post('/caja/ack', requireCajaSyncToken, async (req, res) => {
    const parsed = ackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos de ack inválidos.',
        details: parsed.error.flatten(),
      });
    }
    try {
      const result = await ackPullCaja(req.cajaSucursal, parsed.data.ultimoId);
      return res.json({ message: 'Cursor de sync actualizado.', ...result });
    } catch (error) {
      return respondCajaError(res, error);
    }
  });

  /**
   * Push caja → CRM.
   * Body preferido: { pendienteUuid, estado: CONFIRMADA|RECHAZADA, confirmadoPor, ... }
   * Compat: { cierreId, estado: cerrado|rechazado, confirmadoPor, ... }
   */
  api.post('/caja/confirmaciones', requireCajaSyncToken, async (req, res) => {
    const parsed = confirmacionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Datos de confirmación inválidos.',
        details: parsed.error.flatten(),
      });
    }

    try {
      const data = {
        ...parsed.data,
        confirmadoPor: parsed.data.confirmadoPor || parsed.data.verificadoPor,
      };
      const result = await aplicarConfirmacionCaja(data, req.cajaSucursal);
      return res.json({
        message:
          result.cajaEstado === 'verificado'
            ? 'Cierre verificado en caja y actualizado en el CRM.'
            : 'Cierre rechazado por caja y actualizado en el CRM.',
        ...result,
      });
    } catch (error) {
      return respondCajaError(res, error);
    }
  });
}
