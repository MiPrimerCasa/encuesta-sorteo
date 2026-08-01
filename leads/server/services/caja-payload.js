/**
 * Payload CRM → caja según contrato SistemaCajaPIJ
 * (docs/CRM_FLUJO_ENVIO_VPS_CAJA.md §5 · crm-ingest-types.ts).
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { resolveCierrePijPath } from '../domain/cierres-pij-storage.js';
import { parsePijRecibo } from '../domain/pij-recibo.js';
import { formatOperadorIdNombre, getOperadorNombreCompleto } from '../db/operador-rpt.js';

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
 * solicitud (parcela) + anexo para loteVentaBloqueoVendedorPIJ.
 * Formato solicitud: A200/300
 * @param {object} venta seguimiento principal o compra adicional
 */
export function partesBloqueoPijDesdeSeguimiento(venta) {
  const parsed = parsePijRecibo(venta?.numeroRecibo);
  const serieRaw = String(venta?.seriePij ?? venta?.serie ?? parsed.serie ?? 'A')
    .trim()
    .toUpperCase();
  const serie = /^[AB]$/.test(serieRaw) ? serieRaw : 'A';
  let adhesion = '';
  let anexo = 0;
  if (venta?.nroAdhesion || venta?.nroAnexo) {
    adhesion = String(venta.nroAdhesion ?? '').trim().replace(/\D/g, '');
    anexo = Number(String(venta.nroAnexo ?? '').replace(/\D/g, '')) || 0;
  } else {
    adhesion = String(parsed.adhesion ?? '').trim().replace(/\D/g, '');
    anexo = Number(String(parsed.anexo ?? '').replace(/\D/g, '')) || 0;
  }
  const solicitud = adhesion ? `${serie}${adhesion}/300` : '';
  return { serie, adhesion, solicitud, anexo };
}

/**
 * Un ítem listo para que caja ejecute loteVentaBloqueoVendedorPIJ.
 */
function buildBloqueoPijItem({
  ventaKey,
  esPrincipal,
  venta,
  leadData,
  fechaAnexoFallback,
  idVendedorBloqueo,
  idVendedorNombre,
  idVendedorLabel,
  cerradoPor,
  equipo,
  basePath,
  seguimientoParaAdjuntos,
}) {
  if (String(venta?.idProducto) !== 'prod-pij') return null;
  const { solicitud, anexo, serie, adhesion } = partesBloqueoPijDesdeSeguimiento(venta);
  if (!solicitud || !anexo) return null;

  const pagos = buildPagos(venta);
  const fechaAnexo = formatFechaCierreParaCaja(
    venta.fechaCierre || fechaAnexoFallback || new Date(),
  );
  const adjuntos = buildAdjuntos(
    { imagenesCierre: seguimientoParaAdjuntos?.imagenesCierre },
    ventaKey,
    basePath,
  );

  return {
    ventaKey,
    esPrincipal: Boolean(esPrincipal),
    idVenta: 0,
    idVendedor: idVendedorBloqueo,
    idVendedorNombre,
    idVendedorLabel,
    solicitud,
    anexo,
    serie,
    adhesion,
    numeroRecibo: String(venta.numeroRecibo || ''),
    estadoPago: String(venta.estadoPago || ''),
    montoEfectivo: Number(pagos.montoEfectivo) || 0,
    montoTransferencia: Number(pagos.montoTransferencia) || 0,
    fechaAnexo,
    nombreCliente: leadData.nombre || '',
    numeroDocumentoCliente: leadData.documentoNumero || '',
    domicilioCliente: leadData.domicilio || '',
    numeroTelefonoCliente: leadData.telefono || '',
    cerradoPor,
    equipo,
    adjuntos: adjuntos.length ? adjuntos : undefined,
  };
}

/**
 * Arma el body POST /api/v1/crm/leads (también va en crm_venta_pendiente.payload_json).
 * Resuelve nombres completos vía operadorRPT (no abreviaturas de planilla).
 *
 * @param {{ lead: object, seguimiento: object, usuario?: object, sucursalCodigo: string, basePath?: string }} args
 * @returns {Promise<object|null>} null si no hay leadId válido
 */
export async function buildCrmIngestPayload({ lead, seguimiento, usuario, sucursalCodigo, basePath }) {
  const leadId = Number.parseInt(String(lead?.id ?? ''), 10);
  if (!Number.isFinite(leadId) || leadId <= 0) return null;

  const nombreCompleto = String(lead?.nombre ?? '').trim();
  const { apellido, nombrePila } = splitNombreCliente(nombreCompleto);
  const promotorId =
    parseIdOrNull(lead?.promotorId ?? lead?.idVendedor) ??
    (usuario?.rol === 'promotor' ? parseIdOrNull(usuario?.id) : null);
  const supervisorId = parseIdOrNull(lead?.idSupervisor);
  const operadorId = parseIdOrNull(usuario?.id ?? seguimiento?.operadorId);

  const [promotorNombreFull, supervisorNombreFull, operadorNombreFull, operadorLabel, promotorLabel, supervisorLabel] =
    await Promise.all([
      getOperadorNombreCompleto(promotorId),
      getOperadorNombreCompleto(supervisorId),
      getOperadorNombreCompleto(operadorId),
      formatOperadorIdNombre(
        operadorId,
        usuario?.nombre ?? seguimiento?.operadorNombre,
      ),
      formatOperadorIdNombre(promotorId, lead?.promotorNombre),
      formatOperadorIdNombre(supervisorId, lead?.supervisorNombre),
    ]);

  const promotorNombre =
    promotorNombreFull ||
    (lead?.promotorNombre ? String(lead.promotorNombre).slice(0, 200) : undefined) ||
    (usuario?.rol === 'promotor' && usuario?.nombre
      ? String(usuario.nombre).slice(0, 200)
      : undefined);

  const supervisorNombre =
    supervisorNombreFull ||
    (lead?.supervisorNombre ? String(lead.supervisorNombre).slice(0, 200) : undefined);

  const localidad =
    lead?.localidad || seguimiento?.localidad
      ? String(lead?.localidad || seguimiento?.localidad).trim().slice(0, 120)
      : undefined;
  const email =
    lead?.email || seguimiento?.emailCliente || seguimiento?.email
      ? String(lead?.email || seguimiento?.emailCliente || seguimiento?.email)
          .trim()
          .slice(0, 120)
      : undefined;

  const leadData = {
    nombre: nombreCompleto || `${apellido} ${nombrePila}`.trim(),
    apellido: apellido || undefined,
    nombrePila: nombrePila || undefined,
    telefono: lead?.telefono ? String(lead.telefono).slice(0, 32) : undefined,
    domicilio: lead?.domicilio ? String(lead.domicilio).slice(0, 200) : undefined,
    localidad: localidad || undefined,
    email: email || undefined,
    documentoNumero: seguimiento?.dniCliente
      ? String(seguimiento.dniCliente).replace(/\D/g, '').slice(0, 20)
      : undefined,
    fechaAlta: lead?.fechaAlta || lead?.fechaObtencion || undefined,
    codigoCampania: String(lead?.codigoCampania || lead?.encuesta || 'sorteo01').slice(0, 64),
    origen: lead?.origen ? String(lead.origen) : lead?.origenEncuesta ? String(lead.origenEncuesta) : undefined,
    sabiaPlanInversionJoven:
      lead?.sabiaPlanInversionJoven != null ? Boolean(lead.sabiaPlanInversionJoven) : null,
    promotorId: promotorId ?? undefined,
    promotorNombre: promotorNombre || undefined,
    promotorLabel: promotorLabel || undefined,
    /** Rol fijo del titular de la encuesta / vendedor del lead */
    promotorRol: promotorId ? 'promotor' : undefined,
    supervisorNombre: supervisorNombre || undefined,
    supervisorLabel: supervisorLabel || undefined,
    supervisorId: supervisorId ?? undefined,
    /** Rol fijo del supervisor asignado al lead */
    supervisorRol: supervisorId ? 'supervisor' : undefined,
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

  if (seguimiento.seriePij) seg.seriePij = String(seguimiento.seriePij);
  if (seguimiento.nroAdhesion) seg.nroAdhesion = String(seguimiento.nroAdhesion);
  if (seguimiento.nroAnexo) seg.nroAnexo = String(seguimiento.nroAnexo);
  if (seguimiento.formaPago) seg.formaPago = String(seguimiento.formaPago);

  const extras = Array.isArray(seguimiento.comprasAdicionales)
    ? seguimiento.comprasAdicionales
    : [];
  // Enviar PIJ y terreno adicionales a caja (bloqueo integral sigue solo en PIJ).
  for (const c of extras) {
    const idProd = String(c?.idProducto ?? '');
    if (
      (idProd !== 'prod-pij' && idProd !== 'prod-terreno') ||
      !c?.estadoPago
    ) {
      continue;
    }
    seg.comprasAdicionales.push(buildCompraAdicional(c, seguimiento, basePath));
  }

  const operadorNombre =
    operadorNombreFull ||
    String(usuario?.nombre ?? seguimiento?.operadorNombre ?? 'Operador').trim();

  const operador = {
    usuarioId: operadorId ?? undefined,
    /** Nombre completo (operadorRPT), no abreviatura de planilla */
    nombre: operadorNombre.slice(0, 200),
    /** "132 - CAJAL JESUS LEONEL" para validar en caja */
    label: operadorLabel || undefined,
    rol:
      usuario?.rol === 'supervisor' || usuario?.rol === 'promotor'
        ? usuario.rol
        : 'promotor',
  };

  // Datos listos para que caja ejecute loteVentaBloqueoVendedorPIJ (1 por cada PIJ)
  const idVendedorBloqueo = operadorId ?? promotorId ?? 0;
  const idVendedorNombre =
    (idVendedorBloqueo === operadorId
      ? operadorNombreFull
      : idVendedorBloqueo === promotorId
        ? promotorNombreFull
        : null) ||
    (await getOperadorNombreCompleto(idVendedorBloqueo)) ||
    operadorNombre;
  const idVendedorLabel =
    (idVendedorBloqueo === operadorId
      ? operadorLabel
      : idVendedorBloqueo === promotorId
        ? promotorLabel
        : null) ||
    (await formatOperadorIdNombre(idVendedorBloqueo, idVendedorNombre)) ||
    undefined;

  const cerradoPor = {
    id: operadorId ?? undefined,
    nombre: operador.nombre,
    label: operador.label,
    rol: operador.rol,
  };
  /** Objeto anidado para cada ítem de bloqueosPij (no confundir con `equipo` string de cabecera). */
  const equipoBloqueo = {
    promotor: promotorId
      ? {
          id: promotorId,
          nombre: promotorNombre || undefined,
          label: promotorLabel || undefined,
          rol: 'promotor',
        }
      : undefined,
    supervisor: supervisorId
      ? {
          id: supervisorId,
          nombre: supervisorNombre || undefined,
          label: supervisorLabel || undefined,
          rol: 'supervisor',
        }
      : undefined,
  };

  /** @type {object[]} */
  const bloqueosPij = [];

  const principal = buildBloqueoPijItem({
    ventaKey: 'principal',
    esPrincipal: true,
    venta: seguimiento,
    leadData,
    fechaAnexoFallback: seg.fechaCierre,
    idVendedorBloqueo,
    idVendedorNombre,
    idVendedorLabel,
    cerradoPor,
    equipo: equipoBloqueo,
    basePath,
    seguimientoParaAdjuntos: seguimiento,
  });
  if (principal) bloqueosPij.push(principal);

  for (const c of extras) {
    if (String(c?.idProducto) !== 'prod-pij') continue;
    const ventaKey = String(c.id || randomUUID());
    const item = buildBloqueoPijItem({
      ventaKey,
      esPrincipal: false,
      venta: c,
      leadData,
      fechaAnexoFallback: seg.fechaCierre,
      idVendedorBloqueo,
      idVendedorNombre,
      idVendedorLabel,
      cerradoPor,
      equipo: equipoBloqueo,
      basePath,
      seguimientoParaAdjuntos: seguimiento,
    });
    if (item) bloqueosPij.push(item);
  }

  // Compat: bloqueoPij = venta principal (primer PIJ)
  const bloqueoPij = bloqueosPij.find((b) => b.esPrincipal) || bloqueosPij[0] || undefined;

  return {
    leadId,
    sucursalCodigo: String(sucursalCodigo).slice(0, 40),
    // String informativo de equipo (contrato §3.3 cabecera)
    equipo:
      [leadData.promotorNombre, leadData.supervisorNombre].filter(Boolean).join(' / ').slice(0, 120) ||
      undefined,
    lead: leadData,
    seguimiento: seg,
    operador,
    bloqueoPij,
    /** Todos los PIJ a bloquear (principal + adicionales) */
    bloqueosPij,
    cantidadPij: bloqueosPij.length,
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
