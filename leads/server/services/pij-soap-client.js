import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  getPijSoapNamespace,
  getPijSoapTimeoutMs,
  getPijSoapUrl,
} from '../config/pij-soap-config.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toBase64(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return '';
  return buffer.toString('base64');
}

function bytesLen(buffer) {
  return Buffer.isBuffer(buffer) ? buffer.length : 0;
}

function debeIncluirImagenesEnSoap(payload) {
  // El ASMX actual NO declara params de imagen; mandar tags (aunque vacíos) puede romper el binding.
  if (payload?.enviarImagenes === true) return true;
  return false;
}

/** Resume campos enviados (sin Base64) para logs y UI. */
export function resumirPayloadPij(payload) {
  const conImagenes = debeIncluirImagenesEnSoap(payload);
  return {
    idVenta: Number(payload.idVenta) || 0,
    idVendedor: Number(payload.idVendedor) || 0,
    solicitud: String(payload.solicitud ?? ''),
    anexo: Number(payload.anexo) || 0,
    montoEfectivo: Number(payload.montoEfectivo) || 0,
    montoTransferencia: Number(payload.montoTransferencia) || 0,
    fechaAnexo: String(payload.fechaAnexo ?? ''),
    nombreCliente: String(payload.nombreCliente ?? ''),
    numeroDocumentoCliente: String(payload.numeroDocumentoCliente ?? ''),
    domicilioCliente: String(payload.domicilioCliente ?? ''),
    numeroTelefonoCliente: String(payload.numeroTelefonoCliente ?? ''),
    imagenesEnXml: conImagenes,
    imagenesBytes: conImagenes
      ? {
          imgDocumentoAnverso: bytesLen(payload.imgDocumentoAnverso),
          imgDocumentoReverso: bytesLen(payload.imgDocumentoReverso),
          imgSolicitud: bytesLen(payload.imgSolicitud),
          imgAnexo: bytesLen(payload.imgAnexo),
          imgcomprobanteMEP: bytesLen(payload.imgcomprobanteMEP),
        }
      : null,
  };
}

/** Quita Base64 pesado del XML para archivarlo legible. */
export function redactarSoapXml(xml) {
  return String(xml ?? '').replace(
    /<(imgDocumentoAnverso|imgDocumentoReverso|imgSolicitud|imgAnexo|imgcomprobanteMEP)>([\s\S]*?)<\/\1>/gi,
    (_, tag, content) => {
      const len = String(content || '').trim().length;
      return `<${tag}><!-- base64 omitido, ${len} chars --></${tag}>`;
    },
  );
}

function getPijSoapLogDir() {
  const raw = process.env.PIJ_SOAP_LOG_DIR || path.join(process.cwd(), 'data', 'pij-soap-logs');
  return path.resolve(raw);
}

/**
 * Guarda request/response redactados para diagnóstico.
 * @returns {string|null} ruta del archivo
 */
export function guardarLogPijSoap({ paso, leadId, summary, requestXml, responseXml, httpStatus, error }) {
  try {
    const dir = getPijSoapLogDir();
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLead = String(leadId ?? 'sin-lead').replace(/[^\w.-]+/g, '_');
    const file = path.join(dir, `${stamp}_${safeLead}_${paso || 'call'}.json`);
    const doc = {
      when: new Date().toISOString(),
      paso: paso || null,
      leadId: leadId != null ? String(leadId) : null,
      url: getPijSoapUrl(),
      httpStatus: httpStatus ?? null,
      error: error ?? null,
      payloadResumen: summary ?? null,
      requestXmlRedacted: redactarSoapXml(requestXml),
      responseXml: String(responseXml ?? '').slice(0, 20_000),
    };
    writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8');
    return file;
  } catch (e) {
    console.error('[pij-soap] no se pudo escribir log:', e);
    return null;
  }
}

/**
 * @typedef {object} AltaModificaPlanJovenPayload
 * @property {number} idVenta
 * @property {number} idVendedor
 * @property {string} [solicitud]
 * @property {number} anexo
 * @property {number} montoEfectivo
 * @property {number} montoTransferencia
 * @property {string} fechaAnexo ISO o dateTime
 * @property {string} [nombreCliente]
 * @property {string} [numeroDocumentoCliente]
 * @property {string} [domicilioCliente]
 * @property {string} [numeroTelefonoCliente]
 * @property {boolean} [enviarImagenes] si true incluye nodos img* (el ASMX actual no los declara)
 * @property {Buffer|null} [imgDocumentoAnverso]
 * @property {Buffer|null} [imgDocumentoReverso]
 * @property {Buffer|null} [imgSolicitud]
 * @property {Buffer|null} [imgAnexo]
 * @property {Buffer|null} [imgcomprobanteMEP]
 */

function buildSoapEnvelope(payload) {
  const ns = getPijSoapNamespace();
  const fecha = String(payload.fechaAnexo ?? '').trim() || new Date().toISOString();
  const imgs = debeIncluirImagenesEnSoap(payload)
    ? `
      <imgDocumentoAnverso>${toBase64(payload.imgDocumentoAnverso)}</imgDocumentoAnverso>
      <imgDocumentoReverso>${toBase64(payload.imgDocumentoReverso)}</imgDocumentoReverso>
      <imgSolicitud>${toBase64(payload.imgSolicitud)}</imgSolicitud>
      <imgAnexo>${toBase64(payload.imgAnexo)}</imgAnexo>
      <imgcomprobanteMEP>${toBase64(payload.imgcomprobanteMEP)}</imgcomprobanteMEP>`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <altaModificaPlanJoven xmlns="${escapeXml(ns)}">
      <idVenta>${Number(payload.idVenta) || 0}</idVenta>
      <idVendedor>${Number(payload.idVendedor) || 0}</idVendedor>
      <solicitud>${escapeXml(payload.solicitud ?? '')}</solicitud>
      <anexo>${Number(payload.anexo) || 0}</anexo>
      <montoEfectivo>${Number(payload.montoEfectivo) || 0}</montoEfectivo>
      <montoTransferencia>${Number(payload.montoTransferencia) || 0}</montoTransferencia>
      <fechaAnexo>${escapeXml(fecha)}</fechaAnexo>
      <nombreCliente>${escapeXml(payload.nombreCliente ?? '')}</nombreCliente>
      <numeroDocumentoCliente>${escapeXml(payload.numeroDocumentoCliente ?? '')}</numeroDocumentoCliente>
      <domicilioCliente>${escapeXml(payload.domicilioCliente ?? '')}</domicilioCliente>
      <numeroTelefonoCliente>${escapeXml(payload.numeroTelefonoCliente ?? '')}</numeroTelefonoCliente>${imgs}
    </altaModificaPlanJoven>
  </soap:Body>
</soap:Envelope>`;
}

function parseFault(xml) {
  const fault =
    xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1] ||
    xml.match(/<soap:Fault>[\s\S]*?<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1];
  return fault ? fault.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim() : null;
}

function parseIdVentaResult(xml) {
  const m = xml.match(
    /<altaModificaPlanJovenResult[^>]*>([\s\S]*?)<\/altaModificaPlanJovenResult>/i,
  );
  if (!m) return null;
  const n = Number(String(m[1]).trim());
  return Number.isFinite(n) ? n : null;
}

export class PijSoapError extends Error {
  constructor(message, extras = {}) {
    super(message);
    this.name = 'PijSoapError';
    this.paso = extras.paso ?? null;
    this.resultCode = extras.resultCode ?? null;
    this.httpStatus = extras.httpStatus ?? null;
    this.logPath = extras.logPath ?? null;
    this.payloadResumen = extras.payloadResumen ?? null;
    this.responseXml = extras.responseXml ?? null;
  }
}

/**
 * Llama al ASMX altaModificaPlanJoven.
 * @param {AltaModificaPlanJovenPayload} payload
 * @param {{ paso?: string, leadId?: string|number }} [meta]
 * @returns {Promise<{ idVenta: number, rawXml: string, logPath: string|null, summary: object }>}
 */
export async function altaModificaPlanJoven(payload, meta = {}) {
  const url = getPijSoapUrl();
  const ns = getPijSoapNamespace();
  const soapAction = `${ns}/altaModificaPlanJoven`;
  const body = buildSoapEnvelope(payload);
  const summary = resumirPayloadPij(payload);
  const timeoutMs = getPijSoapTimeoutMs();
  const paso = meta.paso || 'altaModificaPlanJoven';
  const leadId = meta.leadId;

  console.info('[pij-soap] → %s lead=%s', paso, leadId ?? '-', JSON.stringify(summary));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let rawXml = '';
  let httpStatus = null;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"${soapAction}"`,
      },
      body,
      signal: controller.signal,
    });
    httpStatus = res.status;
    rawXml = await res.text();
  } catch (err) {
    const msg =
      err?.name === 'AbortError'
        ? `Timeout SOAP PIJ (${timeoutMs} ms)`
        : err instanceof Error
          ? err.message
          : 'Error de red SOAP PIJ';
    const logPath = guardarLogPijSoap({
      paso,
      leadId,
      summary,
      requestXml: body,
      responseXml: '',
      httpStatus: null,
      error: msg,
    });
    throw new PijSoapError(`${msg}${logPath ? ` | log: ${logPath}` : ''}`, {
      paso,
      httpStatus: null,
      logPath,
      payloadResumen: summary,
    });
  } finally {
    clearTimeout(timer);
  }

  const fault = parseFault(rawXml);
  const idVenta = parseIdVentaResult(rawXml);

  if (!res.ok || fault || idVenta == null || idVenta <= 0) {
    const resultCode = idVenta;
    let msg;
    if (fault) {
      msg = `SOAP Fault: ${fault}`;
    } else if (!res.ok) {
      msg = `SOAP HTTP ${httpStatus}`;
    } else if (idVenta === 0) {
      msg =
        'Sistema integral devolvió idVenta=0 (rechazó el alta). Revisá adhesión/anexo, idVendedor, DNI o reglas del lado del ingeniero.';
    } else {
      msg = 'Respuesta SOAP sin altaModificaPlanJovenResult válido.';
    }

    const logPath = guardarLogPijSoap({
      paso,
      leadId,
      summary,
      requestXml: body,
      responseXml: rawXml,
      httpStatus,
      error: msg,
    });
    console.error(
      '[pij-soap] ✗ %s lead=%s http=%s result=%s log=%s',
      paso,
      leadId ?? '-',
      httpStatus,
      resultCode,
      logPath,
    );
    throw new PijSoapError(`${msg}${logPath ? ` | Detalle: ${logPath}` : ''}`, {
      paso,
      resultCode,
      httpStatus,
      logPath,
      payloadResumen: summary,
      responseXml: rawXml.slice(0, 2000),
    });
  }

  const logPath =
    String(process.env.PIJ_SOAP_LOG_OK ?? '').toLowerCase() === 'true'
      ? guardarLogPijSoap({
          paso,
          leadId,
          summary,
          requestXml: body,
          responseXml: rawXml,
          httpStatus,
          error: null,
        })
      : null;

  console.info('[pij-soap] ✓ %s lead=%s idVenta=%s', paso, leadId ?? '-', idVenta);
  return { idVenta, rawXml, logPath, summary };
}
