import {
  getPijBloqueoMode,
  isPijBloqueoEnabled,
  isPijSoapEnabled,
} from '../config/pij-soap-config.js';
import { ejecutarBloqueoPijSp } from '../db/pij-bloqueo-sp.js';
import { parsePijRecibo } from '../domain/pij-recibo.js';
import { altaModificaPlanJoven } from './pij-soap-client.js';

const ID_PIJ = 'prod-pij';

export function debeSincronizarPijIntegral(seguimiento) {
  if (!isPijBloqueoEnabled()) return false;
  if (!seguimiento) return false;
  return (
    seguimiento.resultadoEntrevista === 'compro' &&
    seguimiento.idProducto === ID_PIJ &&
    seguimiento.estadoPago === 'entrega_33'
  );
}

/**
 * El SP busca barrioLoteParcela = @solicitud con formato completo, ej. A200/300
 * (serie + nro adhesión + /300), no solo el número.
 */
function partesAdhesionAnexo(seguimiento) {
  const parsed = parsePijRecibo(seguimiento.numeroRecibo);
  const serieRaw = String(
    seguimiento.seriePij ?? seguimiento.serie ?? parsed.serie ?? 'A',
  )
    .trim()
    .toUpperCase();
  const serie = /^[AB]$/.test(serieRaw) ? serieRaw : 'A';

  let adhesion = '';
  let anexo = 0;
  if (seguimiento.nroAdhesion || seguimiento.nroAnexo) {
    adhesion = String(seguimiento.nroAdhesion ?? '').trim().replace(/\D/g, '');
    anexo = Number(String(seguimiento.nroAnexo ?? '').replace(/\D/g, '')) || 0;
  } else {
    adhesion = String(parsed.adhesion ?? '').trim().replace(/\D/g, '');
    anexo = Number(String(parsed.anexo ?? '').replace(/\D/g, '')) || 0;
  }

  const solicitud = adhesion ? `${serie}${adhesion}/300` : '';
  return { solicitud, anexo };
}

/** Fecha para SOAP (ISO local AR). Para SP se pasa el Date crudo en ejecutarBloqueo. */
function formatearFechaAnexoSoap(valor) {
  const d = valor ? new Date(valor) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

function buildPayload(lead, seguimiento, usuario, idVenta) {
  const { solicitud, anexo } = partesAdhesionAnexo(seguimiento);
  const idVendedor = Number(usuario?.id ?? lead?.idVendedor ?? seguimiento?.operadorId ?? 0);
  const montoEf = Number(seguimiento.montoEfectivo ?? 0) || 0;
  const montoTr = Number(seguimiento.montoTransferencia ?? 0) || 0;
  const montoCierre = Number(seguimiento.montoCierre ?? 33000) || 33000;

  let montoEfectivo = montoEf;
  let montoTransferencia = montoTr;
  if (seguimiento.formaPago === 'efectivo') {
    montoEfectivo = montoEf || montoCierre;
    montoTransferencia = 0;
  } else if (seguimiento.formaPago === 'transferencia') {
    montoEfectivo = 0;
    montoTransferencia = montoTr || montoCierre;
  }

  return {
    idVenta: Number(idVenta) || 0,
    idVendedor: Number.isFinite(idVendedor) ? idVendedor : 0,
    solicitud,
    anexo,
    montoEfectivo,
    montoTransferencia,
    fechaAnexo: seguimiento.fechaCierre || new Date().toISOString(),
    nombreCliente: String(lead?.nombre ?? '').trim(),
    numeroDocumentoCliente: String(seguimiento.dniCliente ?? '').trim(),
    domicilioCliente: String(lead?.domicilio ?? '').trim(),
    numeroTelefonoCliente: String(lead?.telefono ?? '').trim(),
  };
}

async function ejecutarBloqueo(payload, meta) {
  const mode = getPijBloqueoMode();
  if (mode === 'soap') {
    return altaModificaPlanJoven(
      { ...payload, fechaAnexo: formatearFechaAnexoSoap(payload.fechaAnexo), enviarImagenes: false },
      meta,
    );
  }
  return ejecutarBloqueoPijSp(payload, meta);
}

/**
 * @param {{ persistPatch: (leadId: string, patch: object, usuario: object, lead: object) => Promise<object> }} deps
 */
export async function syncPijSistemaIntegral(lead, seguimiento, usuario, deps) {
  if (!debeSincronizarPijIntegral(seguimiento)) {
    return {
      skipped: true,
      reason: isPijBloqueoEnabled() ? 'no_aplica' : 'disabled',
      estado: seguimiento?.pijIntegralEstado ?? null,
      idVentaIntegral: seguimiento?.idVentaIntegral ?? null,
      error: null,
    };
  }

  if (seguimiento.pijIntegralEstado === 'fotos_ok' && seguimiento.idVentaIntegral) {
    return {
      skipped: true,
      reason: 'ya_enviado',
      estado: 'fotos_ok',
      idVentaIntegral: seguimiento.idVentaIntegral,
      error: null,
    };
  }

  // Ya bloqueado con id: no re-ejecutar el SP salvo reintento explícito en error.
  if (seguimiento.pijIntegralEstado === 'bloqueado' && Number(seguimiento.idVentaIntegral) > 0) {
    return {
      skipped: true,
      reason: 'ya_bloqueado',
      estado: 'bloqueado',
      idVentaIntegral: seguimiento.idVentaIntegral,
      error: null,
    };
  }

  const leadId = String(lead.id);
  let idVenta = Number(seguimiento.idVentaIntegral) || 0;
  const mode = getPijBloqueoMode();

  try {
    const { solicitud, anexo } = partesAdhesionAnexo(seguimiento);
    if (!solicitud || !anexo) {
      throw new Error('Faltan adhesión/anexo para el bloqueo en el sistema integral.');
    }
    if (!String(seguimiento.dniCliente ?? '').trim()) {
      throw new Error('Falta DNI del cliente para el bloqueo en el sistema integral.');
    }

    if (!(idVenta > 0)) {
      const payloadBloqueo = buildPayload(lead, seguimiento, usuario, 0);
      const rBloqueo = await ejecutarBloqueo(payloadBloqueo, {
        paso: 'bloqueo',
        leadId,
      });
      idVenta = Number(rBloqueo.idVenta) || 0;
      if (!(idVenta > 0)) {
        const err = new Error(
          'Sistema integral devolvió idVenta=0 en el bloqueo. Revisá adhesión/anexo (solicitud A…/300), idVendedor y SP.',
        );
        err.paso = 'bloqueo';
        err.resultCode = rBloqueo.idVenta;
        err.payloadResumen = rBloqueo.summary ?? rBloqueo.payloadResumen ?? null;
        throw err;
      }
      const patchBloqueo = {
        idVentaIntegral: idVenta,
        pijIntegralEstado: 'bloqueado',
        pijIntegralError: null,
        pijIntegralEnviadoEn: new Date().toISOString(),
      };
      await deps.persistPatch(leadId, patchBloqueo, usuario, lead);
      console.info(
        '[pij-bloqueo] OK lead=%s idVenta=%s mode=%s',
        leadId,
        idVenta,
        mode,
      );
    }

    return {
      skipped: false,
      estado: 'bloqueado',
      idVentaIntegral: idVenta,
      error: null,
      mode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error bloqueo PIJ';
    const logPath = err?.logPath ?? null;
    const paso = err?.paso ?? null;
    const resultCode = err?.resultCode;
    console.error(
      '[pij-bloqueo] error lead=%s paso=%s mode=%s result=%s: %s',
      leadId,
      paso,
      mode,
      resultCode,
      message,
    );
    if (err?.payloadResumen) {
      console.error('[pij-bloqueo] payload resumen:', JSON.stringify(err.payloadResumen));
    }
    const patchErr = {
      idVentaIntegral: idVenta > 0 ? idVenta : (seguimiento.idVentaIntegral ?? null),
      pijIntegralEstado: 'error',
      pijIntegralError: message.slice(0, 500),
      pijIntegralEnviadoEn: new Date().toISOString(),
    };
    try {
      await deps.persistPatch(leadId, patchErr, usuario, lead);
    } catch (persistErr) {
      console.error('[pij-bloqueo] no se pudo persistir error:', persistErr);
    }
    return {
      skipped: false,
      estado: 'error',
      idVentaIntegral: patchErr.idVentaIntegral,
      error: message,
      logPath,
      paso,
      resultCode: resultCode ?? null,
      mode,
    };
  }
}

export { isPijSoapEnabled, isPijBloqueoEnabled, getPijBloqueoMode };
