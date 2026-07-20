/**
 * Payload CRM → caja según contrato SistemaCajaPIJ
 * (docs/CRM_FLUJO_ENVIO_VPS_CAJA.md §5 · crm-ingest-types.ts).
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { resolveCierrePijPath } from '../domain/cierres-pij-storage.js';

const TIPO_IMG_A_ADJUNTO = {
  img1: 'DNI_FRENTE',
  img2: 'DNI_DORSO',
  img5: 'PAPEL_ADHESION',
  img6: 'PAPEL_ANEXO',
  img7: 'COMPROBANTE_TRANSFERENCIA',
};

/** "Apellido Nombres" → { apellido, nombrePila } (convención AR del CRM). */
export function splitNombreCliente(nombreCompleto) {
  const raw = String(nombreCompleto ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return { apellido: '', nombrePila: '' };
  const parts = raw.split(' ');
  if (parts.length === 1) return { apellido: parts[0], nombrePila: '' };
  return { apellido: parts[0], nombrePila: parts.slice(1).join(' ') };
}

function parseIdOrNull(val) {
  const n = Number.parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

function numOrUndef(val) {
  if (val == null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

/** Zona horaria de negocio para fechas hacia la caja (contrato §5). */
function cajaFechaTimeZone() {
  const raw = String(process.env.CAJA_FECHA_TZ ?? 'America/Argentina/Buenos_Aires').trim();
  return raw || 'America/Argentina/Buenos_Aires';
}

/**
 * Contrato caja: ISO local sin `Z`, ej. `2026-07-18T15:30:00` (hora Argentina).
 * Evita que Electron muestre UTC crudo o con el huso de la PC mal configurado.
 */
export function formatFechaCierreParaCaja(raw) {
  const d = raw instanceof Date ? raw : new Date(String(raw ?? '').trim() || Date.now());
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: cajaFechaTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(safe).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function fechaSoloDia(isoOrText) {
  if (!isoOrText) return undefined;
  const s = String(isoOrText).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return formatFechaCierreParaCaja(d).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return undefined;
}

function appBasePath() {
  const raw = String(process.env.APP_BASE_PATH ?? '/leads').trim();
  if (!raw || raw === '/') return '';
  return raw.replace(/\/$/, '');
}

/**
 * URL de descarga alineada al contrato: /api/caja/imagenes/{id_imagen}
 * @param {string} idImagen
 * @param {string} [basePath]
 */
export function urlDescargaImagenCaja(idImagen, basePath) {
  const base = basePath != null ? String(basePath) : appBasePath();
  return `${base}/api/caja/imagenes/${encodeURIComponent(idImagen)}`;
}

/**
 * @param {{ id?: string, tipo?: string, mimeType?: string, nombreOriginal?: string|null, storagePath?: string, tamanoBytes?: number, ventaKey?: string }} img
 * @param {string} [basePath]
 */
export function mapImagenCierreAAdjunto(img, basePath) {
  const tipoSlot = String(img?.tipo ?? '');
  const tipoAdjunto = TIPO_IMG_A_ADJUNTO[tipoSlot];
  if (!tipoAdjunto || !img?.id) return null;
  return {
    tipo: tipoAdjunto,
    nombreOriginal: String(img.nombreOriginal || `${tipoSlot}.jpg`).slice(0, 260),
    mimeType: String(img.mimeType || 'image/jpeg').slice(0, 32),
    urlDescarga: urlDescargaImagenCaja(String(img.id), basePath),
    // Metadatos internos (no rompen el contrato; la caja puede ignorarlos)
    idImagen: String(img.id),
    tipoImagen: tipoSlot,
    storagePath: img.storagePath ? String(img.storagePath) : undefined,
    tamanoBytes: Number(img.tamanoBytes) || undefined,
  };
}

function buildPagos(seguimiento) {
  const montoEfectivo = numOrUndef(seguimiento?.montoEfectivo) ?? 0;
  const montoTransferencia = numOrUndef(seguimiento?.montoTransferencia) ?? 0;
  const montoTotal =
    numOrUndef(seguimiento?.montoCierre) ??
    (montoEfectivo + montoTransferencia > 0 ? montoEfectivo + montoTransferencia : undefined);

  const pagos = {
    montoEfectivo,
    montoTransferencia,
  };
  if (montoTotal != null) pagos.montoTotal = montoTotal;
  if (seguimiento?.titularTransferencia) {
    pagos.titularTransferencia = String(seguimiento.titularTransferencia).slice(0, 200);
  }
  if (seguimiento?.bancoTransferencia) {
    pagos.bancoTransferencia = String(seguimiento.bancoTransferencia).slice(0, 120);
  }
  if (seguimiento?.referenciaTransferencia) {
    pagos.referenciaTransferencia = String(seguimiento.referenciaTransferencia).slice(0, 120);
  }
  return pagos;
}

function buildAdjuntos(seguimiento, ventaKey, basePath) {
  const list = Array.isArray(seguimiento?.imagenesCierre) ? seguimiento.imagenesCierre : [];
  return list
    .filter((i) => i && (i.ventaKey === ventaKey || (!i.ventaKey && ventaKey === 'principal')))
    .map((i) => mapImagenCierreAAdjunto(i, basePath))
    .filter(Boolean);
}

function buildCompraAdicional(compra, seguimiento, basePath) {
  const id = String(compra?.id || randomUUID());
  const item = {
    id,
    idProducto: String(compra.idProducto),
    estadoPago: String(compra.estadoPago),
    numeroRecibo: String(compra.numeroRecibo || ''),
    fechaCierre: formatFechaCierreParaCaja(
      compra.fechaCierre || seguimiento?.fechaCierre || new Date(),
    ),
  };
  if (compra.idBarrio) item.idBarrio = String(compra.idBarrio);
  if (compra.observaciones) item.observaciones = String(compra.observaciones).slice(0, 500);
  const fechaPapel = fechaSoloDia(compra.fechaAdhesionPapel || compra.fechaCierre);
  if (fechaPapel) item.fechaAdhesionPapel = fechaPapel;
  item.pagos = buildPagos(compra);
  const adjuntos = buildAdjuntos(
    { imagenesCierre: seguimiento?.imagenesCierre },
    id,
    basePath,
  );
  if (adjuntos.length) item.adjuntos = adjuntos;
  return item;
}

/**
 * Arma el body POST /api/v1/crm/leads (también va en crm_venta_pendiente.payload_json).
 *
 * @param {{ lead: object, seguimiento: object, usuario?: object, sucursalCodigo: string, basePath?: string }} args
 * @returns {object|null} null si no hay leadId válido
 */
export function buildCrmIngestPayload({ lead, seguimiento, usuario, sucursalCodigo, basePath }) {
  const leadId = Number.parseInt(String(lead?.id ?? ''), 10);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;

  const nombreCompleto = String(lead?.nombre ?? '').trim();
  const { apellido, nombrePila } = splitNombreCliente(nombreCompleto);
  const promotorId =
    parseIdOrNull(lead?.promotorId ?? lead?.idVendedor) ??
    (usuario?.rol === 'promotor' ? parseIdOrNull(usuario?.id) : null);
  const supervisorId = parseIdOrNull(lead?.idSupervisor);

  const leadData = {
    nombre: nombreCompleto || `${apellido} ${nombrePila}`.trim(),
    apellido: apellido || undefined,
    nombrePila: nombrePila || undefined,
    telefono: lead?.telefono ? String(lead.telefono).slice(0, 32) : undefined,
    domicilio: lead?.domicilio ? String(lead.domicilio).slice(0, 200) : undefined,
    documentoNumero: seguimiento?.dniCliente
      ? String(seguimiento.dniCliente).replace(/\D/g, '').slice(0, 20)
      : undefined,
    fechaAlta: lead?.fechaAlta || lead?.fechaObtencion || undefined,
    codigoCampania: String(lead?.codigoCampania || lead?.encuesta || 'sorteo01').slice(0, 64),
    origen: lead?.origen ? String(lead.origen) : lead?.origenEncuesta ? String(lead.origenEncuesta) : undefined,
    sabiaPlanInversionJoven:
      lead?.sabiaPlanInversionJoven != null ? Boolean(lead.sabiaPlanInversionJoven) : null,
    promotorId: promotorId ?? undefined,
    promotorNombre: lead?.promotorNombre
      ? String(lead.promotorNombre).slice(0, 200)
      : usuario?.rol === 'promotor' && usuario?.nombre
        ? String(usuario.nombre).slice(0, 200)
        : undefined,
    supervisorNombre: lead?.supervisorNombre
      ? String(lead.supervisorNombre).slice(0, 200)
      : undefined,
    // Extra útil para mapeo comisión (caja puede ignorar)
    supervisorId: supervisorId ?? undefined,
    promotorCodigo:
      String(lead?.codigoPromotorCarga || lead?.encuestaUsuario || '').trim().slice(0, 64) ||
      undefined,
  };

  const seg = {
    resultadoEntrevista: String(seguimiento.resultadoEntrevista),
    fechaCierre: formatFechaCierreParaCaja(seguimiento.fechaCierre || new Date()),
    idProducto: String(seguimiento.idProducto),
    estadoPago: String(seguimiento.estadoPago || ''),
    numeroRecibo: String(seguimiento.numeroRecibo || ''),
    observaciones: seguimiento.observaciones
      ? String(seguimiento.observaciones).slice(0, 500)
      : undefined,
    operadorRol:
      usuario?.rol === 'supervisor' || usuario?.rol === 'promotor'
        ? usuario.rol
        : seguimiento.operadorRol === 'supervisor' || seguimiento.operadorRol === 'promotor'
          ? seguimiento.operadorRol
          : undefined,
    pagos: buildPagos(seguimiento),
    adjuntos: buildAdjuntos(seguimiento, 'principal', basePath),
    comprasAdicionales: [],
  };

  if (seguimiento.idBarrio) seg.idBarrio = String(seguimiento.idBarrio);
  const fechaPapel = fechaSoloDia(seguimiento.fechaAdhesionPapel || seguimiento.fechaCierre);
  if (fechaPapel) seg.fechaAdhesionPapel = fechaPapel;

  // Compat: campos planos útiles para UI caja / parseo
  if (seguimiento.seriePij) seg.seriePij = String(seguimiento.seriePij);
  if (seguimiento.nroAdhesion) seg.nroAdhesion = String(seguimiento.nroAdhesion);
  if (seguimiento.nroAnexo) seg.nroAnexo = String(seguimiento.nroAnexo);
  if (seguimiento.formaPago) seg.formaPago = String(seguimiento.formaPago);

  const extras = Array.isArray(seguimiento.comprasAdicionales)
    ? seguimiento.comprasAdicionales
    : [];
  for (const c of extras) {
    if (c?.idProducto && c?.estadoPago) {
      seg.comprasAdicionales.push(buildCompraAdicional(c, seguimiento, basePath));
    }
  }

  const operadorId = parseIdOrNull(usuario?.id ?? seguimiento?.operadorId);
  const operador = {
    usuarioId: operadorId ?? undefined,
    nombre: String(usuario?.nombre ?? seguimiento?.operadorNombre ?? 'Operador').slice(0, 200),
    rol:
      usuario?.rol === 'supervisor' || usuario?.rol === 'promotor'
        ? usuario.rol
        : 'promotor',
  };

  return {
    leadId,
    sucursalCodigo: String(sucursalCodigo).slice(0, 40),
    lead: leadData,
    seguimiento: seg,
    operador,
  };
}

/**
 * Calcula sha256 de un archivo en disco (best-effort).
 * @param {string|null|undefined} storagePath
 * @returns {Promise<string|null>}
 */
export async function sha256DeStoragePath(storagePath) {
  const filePath = resolveCierrePijPath(storagePath);
  if (!filePath || !existsSync(filePath)) return null;
  return new Promise((resolve) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', () => resolve(null));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export { TIPO_IMG_A_ADJUNTO };
