/**
 * Publica un cierre del CRM al ingest HTTP de la caja (Electron :3847).
 * Contrato: POST /api/v1/crm/leads + X-CRM-Api-Key.
 *
 * Piloto local: no usa MySQL del VPS; impacta erp_sucursal al instante.
 * Preferencia de fotos: contenidoBase64 → rutaLocal (mismo PC) → urlDescarga localhost.
 */
import { readFileSync } from 'node:fs';
import { resolveCierrePijPath } from '../domain/cierres-pij-storage.js';
import {
  getCajaIngestHttpConfig,
  isCajaIngestHttpEnabled,
} from '../config/caja-ingest-config.js';
import { buildCrmIngestPayload } from './caja-payload.js';
import {
  esCierrePublicableACaja,
  resolveSucursalParaCaja,
} from './caja-publicar-cierre.js';

/**
 * Enriquece adjuntos del payload para piloto local.
 * @param {object} payload
 * @param {{ preferBase64?: boolean, allowRutaLocal?: boolean, maxBase64Bytes?: number, publicBase?: string }} opts
 */
export function enrichAdjuntosParaIngestLocal(payload, opts = {}) {
  if (!payload?.seguimiento) return payload;
  const preferBase64 = opts.preferBase64 !== false;
  const allowRutaLocal = opts.allowRutaLocal !== false;
  const maxBytes = Number(opts.maxBase64Bytes) || 1_500_000;
  const publicBase = String(opts.publicBase || '').replace(/\/+$/, '');

  const enrichList = (list) => {
    if (!Array.isArray(list)) return list;
    return list.map((adj) => enrichOneAdjunto(adj, { preferBase64, allowRutaLocal, maxBytes, publicBase }));
  };

  const seg = { ...payload.seguimiento };
  if (Array.isArray(seg.adjuntos)) seg.adjuntos = enrichList(seg.adjuntos);
  if (Array.isArray(seg.comprasAdicionales)) {
    seg.comprasAdicionales = seg.comprasAdicionales.map((c) => ({
      ...c,
      adjuntos: enrichList(c.adjuntos),
    }));
  }
  return { ...payload, seguimiento: seg };
}

function enrichOneAdjunto(adj, opts) {
  if (!adj || typeof adj !== 'object') return adj;
  const out = { ...adj };
  const filePath = resolveCierrePijPath(out.storagePath);
  if (!filePath) {
    // Si solo hay path relativo de API caja, armar URL localhost al CRM.
    if (publicUrlFromAdjunto(out, opts.publicBase)) {
      out.urlDescarga = publicUrlFromAdjunto(out, opts.publicBase);
    }
    return sanitizeAdjuntoContrato(out);
  }

  try {
    const buf = readFileSync(filePath);
    if (opts.preferBase64 && buf.length > 0 && buf.length <= opts.maxBytes) {
      out.contenidoBase64 = buf.toString('base64');
      delete out.urlDescarga;
      delete out.rutaLocal;
    } else if (opts.allowRutaLocal) {
      out.rutaLocal = filePath;
      delete out.contenidoBase64;
      delete out.urlDescarga;
    } else {
      const url = publicUrlFromAdjunto(out, opts.publicBase);
      if (url) out.urlDescarga = url;
      delete out.contenidoBase64;
      delete out.rutaLocal;
    }
  } catch (err) {
    console.warn(
      '[caja-ingest] No se pudo leer adjunto',
      out.storagePath,
      err instanceof Error ? err.message : err,
    );
    const url = publicUrlFromAdjunto(out, opts.publicBase);
    if (url) out.urlDescarga = url;
  }

  return sanitizeAdjuntoContrato(out);
}

function publicUrlFromAdjunto(adj, publicBase) {
  if (!publicBase) return null;
  if (adj?.urlDescarga && /^https?:\/\//i.test(String(adj.urlDescarga))) {
    return String(adj.urlDescarga);
  }
  if (adj?.urlDescarga && String(adj.urlDescarga).startsWith('/')) {
    return `${publicBase}${adj.urlDescarga}`;
  }
  if (adj?.idImagen) {
    return `${publicBase}/api/caja/imagenes/${encodeURIComponent(String(adj.idImagen))}`;
  }
  return null;
}

/** Quita campos internos que la caja no necesita en el wire. */
function sanitizeAdjuntoContrato(adj) {
  const {
    tipo,
    nombreOriginal,
    mimeType,
    urlDescarga,
    contenidoBase64,
    rutaLocal,
    sha256,
  } = adj;
  const out = { tipo, nombreOriginal, mimeType };
  if (contenidoBase64) out.contenidoBase64 = contenidoBase64;
  else if (rutaLocal) out.rutaLocal = rutaLocal;
  else if (urlDescarga) out.urlDescarga = urlDescarga;
  if (sha256) out.sha256 = sha256;
  return out;
}

/**
 * @returns {Promise<{
 *   skipped: boolean,
 *   reason?: string,
 *   ok?: boolean,
 *   status?: number,
 *   accion?: string|null,
 *   error?: string|null,
 *   response?: object|null,
 * }>}
 */
export async function publicarCierreAIngestHttp({
  lead,
  seguimiento,
  usuario,
  origenRegistroId,
}) {
  if (!isCajaIngestHttpEnabled()) {
    return { skipped: true, reason: 'disabled', error: null };
  }
  if (!esCierrePublicableACaja(seguimiento)) {
    return { skipped: true, reason: 'no_aplica', error: null };
  }

  const cfg = getCajaIngestHttpConfig();
  if (!cfg.apiKey) {
    return {
      skipped: false,
      ok: false,
      error: 'Falta ERP_CAJA_API_KEY para el ingest local de caja.',
    };
  }

  const sucursalCodigo = resolveSucursalParaCaja(usuario, lead);
  if (!sucursalCodigo || !/^\d{2}$/.test(String(sucursalCodigo))) {
    return {
      skipped: false,
      ok: false,
      error:
        'No se pudo resolver sucursalCodigo ERP (01/02/03). Revisá CAJA_DEFAULT_SUCURSAL / CAJA_ERP_SUCURSAL_MAP.',
    };
  }

  let payload = await buildCrmIngestPayload({
    lead,
    seguimiento,
    usuario,
    sucursalCodigo,
    basePath: '',
  });
  if (!payload) {
    return { skipped: false, ok: false, error: 'lead_id inválido para ingest de caja.' };
  }

  if (origenRegistroId != null && Number(origenRegistroId) > 0) {
    payload = {
      ...payload,
      crmVentaExternalId: String(origenRegistroId),
    };
  }

  payload = enrichAdjuntosParaIngestLocal(payload, cfg);

  const url = `${cfg.baseUrl}/api/v1/crm/leads`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-CRM-Api-Key': cfg.apiKey,
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text?.slice(0, 500) };
    }

    if (!res.ok) {
      const errMsg =
        body?.error ||
        body?.message ||
        (typeof body?.raw === 'string' ? body.raw : null) ||
        `HTTP ${res.status}`;
      console.error(
        '[caja-ingest] POST falló lead=%s status=%s:',
        lead?.id,
        res.status,
        errMsg,
      );
      return {
        skipped: false,
        ok: false,
        status: res.status,
        error: String(errMsg),
        response: body,
      };
    }

    const accion = body?.data?.accion ?? body?.accion ?? null;
    console.info(
      '[caja-ingest] OK lead=%s accion=%s sucursal=%s adjuntos=%s',
      lead?.id,
      accion,
      sucursalCodigo,
      payload?.seguimiento?.adjuntos?.length ?? 0,
    );
    return {
      skipped: false,
      ok: true,
      status: res.status,
      accion,
      error: null,
      response: body,
    };
  } catch (err) {
    const msg =
      err?.name === 'AbortError'
        ? `Timeout (${cfg.timeoutMs}ms) al llamar ${url}`
        : err instanceof Error
          ? err.message
          : 'Error de red al ingest de caja';
    console.error('[caja-ingest] error lead=%s:', lead?.id, msg);
    return { skipped: false, ok: false, error: msg, response: null };
  } finally {
    clearTimeout(timer);
  }
}
