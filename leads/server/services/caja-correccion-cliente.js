/**
 * Correcciones de datos de persona del lead desde caja (sucursal).
 * Contrato: POST /api/caja/correcciones-cliente (+ clienteCorreccion en confirmaciones).
 *
 * Ubica por pendienteUuid. Solo pisa columnas de persona (no pagos / TRF / comprobante).
 */
import { isCajaMysqlEnabled } from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import {
  execEncuestaSorteo01Update,
  buildCargaParamsFromLead,
  digitsTelefono,
} from '../db/encuesta-carga.js';
import { listAllLeadsFromEncuestas } from '../db/encuestas.js';
import { persistirSeguimientoLead, getLatestSeguimientoSql, buscarUltimoSeguimientoComproEnHistorial } from '../db/seguimiento-sql.js';
import { normalizarDniCliente } from '../domain/dni-cliente.js';

function strOrNull(val, max) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

function digitsOrNull(val, max = 20) {
  const d = String(val ?? '').replace(/\D/g, '');
  return d ? d.slice(0, max) : null;
}

/** Arma "Apellido Nombres" (convención CRM). */
export function nombreCompletoDesdeCorreccion(corr) {
  if (!corr || typeof corr !== 'object') return null;
  const completo = strOrNull(corr.nombreCompleto ?? corr.nombreYApellido, 200);
  if (completo) return completo;
  const apellido = strOrNull(corr.apellido, 120) || '';
  const nombre = strOrNull(corr.nombre ?? corr.nombrePila, 120) || '';
  const joined = `${apellido} ${nombre}`.trim();
  return joined || null;
}

function domicilioDesdeCorreccion(corr) {
  if (!corr || typeof corr !== 'object') return null;
  const base = strOrNull(corr.domicilio, 200);
  const barrio = strOrNull(corr.domicilioBarrio ?? corr.barrio, 120);
  if (base && barrio && !base.toUpperCase().includes(barrio.toUpperCase())) {
    return `${base} (${barrio})`.slice(0, 200);
  }
  return base;
}

/**
 * Normaliza cotitular desde clienteCorreccion.
 * @returns {object|null|undefined} null = quitar; undefined = no tocar; object = alta/reemplazo
 */
export function resolverCotitularDesdeCorreccion(corr) {
  if (!corr || typeof corr !== 'object') return undefined;
  if (corr.quitarCotitular === true || corr.quitarCotitular === 'true' || corr.quitarCotitular === 1) {
    return null;
  }
  const c = corr.cotitular;
  if (c === null) return null;
  if (!c || typeof c !== 'object') return undefined;
  const apellido = strOrNull(c.apellido, 120);
  const nombre = strOrNull(c.nombre ?? c.nombrePila, 120);
  const documentoNumero = digitsOrNull(c.documentoNumero ?? c.dni, 20);
  const telefono = strOrNull(c.telefono, 32);
  const cuilCuit = digitsOrNull(c.cuilCuit ?? c.cuil, 20);
  if (!apellido && !nombre && !documentoNumero && !telefono) return undefined;
  return {
    apellido: apellido || undefined,
    nombre: nombre || undefined,
    nombreCompleto: nombreCompletoDesdeCorreccion(c) || undefined,
    documentoNumero: documentoNumero || undefined,
    telefono: telefono || undefined,
    cuilCuit: cuilCuit || undefined,
  };
}

/**
 * Patch de seguimiento: solo persona. Nunca incluye montos / TRF / caja estado / comprobante.
 */
export function buildPatchPersonaDesdeCorreccion(corr, { corregidoPor } = {}) {
  if (!corr || typeof corr !== 'object') return {};
  const patch = {};

  const dni =
    normalizarDniCliente(corr.documentoNumero ?? corr.dniCliente ?? corr.dni) || null;
  if (dni) patch.dniCliente = dni;

  const email = strOrNull(corr.email, 120);
  if (email) patch.emailCliente = email;

  const localidad = strOrNull(corr.localidad, 120);
  if (localidad) patch.localidadCliente = localidad;

  const barrio = strOrNull(corr.domicilioBarrio ?? corr.barrio, 120);
  if (barrio) patch.domicilioBarrio = barrio;

  const cuil = digitsOrNull(corr.cuilCuit ?? corr.cuil, 20);
  if (cuil) patch.cuilCuitCliente = cuil;

  const cotitular = resolverCotitularDesdeCorreccion(corr);
  if (cotitular !== undefined) {
    patch.cotitular = cotitular;
  }

  if (corregidoPor) {
    patch.cajaClienteCorregidoPor = String(corregidoPor).trim().slice(0, 200);
    patch.cajaClienteCorregidoEn = new Date().toISOString();
  }

  return patch;
}

/** Mapea seguimiento del payload de caja (ingest) al shape del CRM. */
export function seguimientoCierreDesdePayloadCaja(payload) {
  const seg = payload?.seguimiento;
  if (!seg || typeof seg !== 'object') return {};

  const out = {};
  const copyStr = (srcKey, dstKey = srcKey) => {
    const v = seg[srcKey];
    if (v != null && String(v).trim() !== '') out[dstKey] = String(v).trim();
  };

  copyStr('resultadoEntrevista');
  copyStr('idProducto');
  copyStr('estadoPago');
  copyStr('numeroRecibo');
  copyStr('formaPago');
  copyStr('idBarrio');
  copyStr('seriePij');
  copyStr('nroAdhesion');
  copyStr('nroAnexo');
  copyStr('observaciones');
  copyStr('fechaCierre');
  copyStr('fechaAdhesionPapel');

  const pagos = seg.pagos;
  if (pagos && typeof pagos === 'object') {
    for (const key of [
      'montoCierre',
      'montoEfectivo',
      'montoTransferencia',
      'titularTransferencia',
      'bancoTransferencia',
      'referenciaTransferencia',
    ]) {
      if (pagos[key] != null && pagos[key] !== '') out[key] = pagos[key];
    }
  }

  if (Array.isArray(seg.comprasAdicionales) && seg.comprasAdicionales.length) {
    out.comprasAdicionales = seg.comprasAdicionales;
  }
  if (Array.isArray(seg.adjuntos) && seg.adjuntos.length) {
    out.imagenesCierre = seg.adjuntos;
  }

  return out;
}

/** Campos de cierre que una corrección de persona no debe borrar. */
const CAMPOS_CIERRE_PRESERVAR = [
  'resultadoEntrevista',
  'idProducto',
  'estadoPago',
  'numeroRecibo',
  'formaPago',
  'montoCierre',
  'montoEfectivo',
  'montoTransferencia',
  'fechaCierre',
  'fechaAdhesionPapel',
  'idBarrio',
  'seriePij',
  'nroAdhesion',
  'nroAnexo',
  'comprasAdicionales',
  'imagenesCierre',
  'titularTransferencia',
  'titularCoincideCliente',
  'bancoTransferencia',
  'referenciaTransferencia',
  'cajaEstado',
  'cajaVerificadoEn',
  'cajaComprobanteId',
  'cajaMotivoRechazo',
  'cajaSucursal',
  'cajaConfirmadoPor',
  'idVentaIntegral',
  'pijIntegralEstado',
  'pijIntegralError',
  'pijIntegralEnviadoEn',
  'huboEntrevista',
  'canal',
  'confirmoEntrevista',
  'operadorId',
  'operadorRol',
  'operadorNombre',
];

/** Superpone persona sobre cierre sin perder estado compro del base. */
export function preservarCamposCierreEnMerge(base, overlay) {
  const out = { ...base, ...overlay };
  if (base?.resultadoEntrevista !== 'compro') return out;
  if (overlay?.resultadoEntrevista === 'compro') return out;

  out.resultadoEntrevista = 'compro';
  for (const key of CAMPOS_CIERRE_PRESERVAR) {
    if (key === 'resultadoEntrevista') continue;
    if (overlay?.[key] == null && base[key] != null) out[key] = base[key];
  }
  return out;
}

/**
 * Base de seguimiento para corrección de persona: último global + fallback cierre
 * (payload caja o historial compro) si el último registro perdió el cierre.
 */
export async function resolverSeguimientoBaseParaCorreccionCaja(leadId, payload) {
  const actual = (await getLatestSeguimientoSql(leadId, null)) || {};
  if (actual.resultadoEntrevista === 'compro') return actual;

  const fromPayload = seguimientoCierreDesdePayloadCaja(payload);
  if (fromPayload.resultadoEntrevista === 'compro') {
    return preservarCamposCierreEnMerge(fromPayload, actual);
  }

  const fromHistorial = await buscarUltimoSeguimientoComproEnHistorial(leadId);
  if (fromHistorial) {
    return preservarCamposCierreEnMerge(fromHistorial, actual);
  }

  return actual;
}

/** Fusiona patch de persona sin pisar campos de cierre ya presentes en la base. */
export function fusionarPatchPersonaPreservandoCierre(baseSeg, patchPersona) {
  return preservarCamposCierreEnMerge(baseSeg, patchPersona);
}

/**
 * Operador para SP_RegistrarSeguimientoLead: el del cierre original (vendedor),
 * no "Caja 01". La auditoría de caja va en cajaClienteCorregidoPor/En del patch.
 */
export function resolverUsuarioPersistenciaCorreccionCaja(baseSeg, payload, leadEncuesta) {
  const segPayload = payload?.seguimiento && typeof payload.seguimiento === 'object'
    ? payload.seguimiento
    : {};
  const leadPayload = payload?.lead && typeof payload.lead === 'object' ? payload.lead : {};

  const idRaw =
    baseSeg?.operadorId ??
    segPayload.operadorId ??
    leadPayload.promotorId ??
    leadPayload.supervisorId ??
    payload?.operador?.usuarioId ??
    null;
  const id =
    idRaw != null && String(idRaw).trim() !== '' && String(idRaw) !== '0'
      ? String(idRaw).trim()
      : undefined;

  const rol =
    baseSeg?.operadorRol ??
    segPayload.operadorRol ??
    (leadPayload.supervisorId ? 'supervisor' : null) ??
    (leadPayload.promotorId ? 'promotor' : null) ??
    payload?.operador?.rol ??
    'supervisor';

  const nombre =
    baseSeg?.operadorNombre ??
    leadPayload.supervisorNombre ??
    leadPayload.promotorNombre ??
    payload?.operador?.nombre ??
    leadEncuesta?.promotorNombre ??
    leadEncuesta?.nombrePromotor ??
    'Operador';

  return {
    id,
    rol,
    nombre: String(nombre).trim().slice(0, 200),
  };
}

async function resolverPendientePorUuid(pendienteUuid, sucursal) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }
  const uuid = String(pendienteUuid ?? '').trim();
  if (!uuid) {
    const err = new Error('pendienteUuid es obligatorio.');
    err.code = 'VALIDATION';
    throw err;
  }

  const pool = getCajaMysqlPool();
  const [rows] = await pool.query(
    `SELECT * FROM crm_venta_pendiente WHERE uuid = ? LIMIT 1`,
    [uuid],
  );
  const pendiente = rows?.[0] ?? null;
  if (!pendiente) {
    const err = new Error('Pendiente de caja no encontrado (pendienteUuid).');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (
    sucursal &&
    pendiente.sucursal_codigo &&
    String(pendiente.sucursal_codigo) !== String(sucursal)
  ) {
    const err = new Error(
      `El pendiente pertenece a sucursal "${pendiente.sucursal_codigo}", no a "${sucursal}".`,
    );
    err.code = 'FORBIDDEN';
    throw err;
  }
  return pendiente;
}

function parsePayload(pendiente) {
  try {
    return typeof pendiente.payload_json === 'object'
      ? pendiente.payload_json
      : JSON.parse(String(pendiente.payload_json || '{}'));
  } catch {
    return {};
  }
}

/**
 * Actualiza encuesta (nombre / domicilio / teléfono) + seguimiento (DNI, email, cotitular…).
 * Idempotente: reaplicar el mismo body no duplica el lead.
 *
 * @param {{
 *   pendienteUuid: string,
 *   clienteCorreccion: object,
 *   corregidoPor?: string,
 *   clienteDocumento?: string|null,
 *   documentoAnterior?: string|null,
 * }} body
 * @param {string} [sucursal]
 */
export async function aplicarCorreccionClienteCaja(body, sucursal) {
  const corr = body?.clienteCorreccion;
  if (!corr || typeof corr !== 'object') {
    const err = new Error('clienteCorreccion es obligatorio.');
    err.code = 'VALIDATION';
    throw err;
  }

  const pendiente = await resolverPendientePorUuid(body.pendienteUuid, sucursal);
  const payload = parsePayload(pendiente);
  const leadId = String(pendiente.crm_lead_external_id);
  const corregidoPor = strOrNull(body?.corregidoPor, 200) || 'Caja';

  // Log informativo si cambió el DNI (no rechazar)
  const docNuevo = digitsOrNull(
    corr.documentoNumero ?? body?.clienteDocumento,
  );
  const docAnterior = digitsOrNull(
    body?.documentoAnterior ?? payload?.lead?.documentoNumero,
  );
  if (docAnterior && docNuevo && docAnterior !== docNuevo) {
    console.info(
      '[caja-correccion] DNI corregido lead=%s pendiente=%s %s → %s',
      leadId,
      pendiente.uuid,
      docAnterior,
      docNuevo,
    );
  }

  const nombreNuevo = nombreCompletoDesdeCorreccion(corr);
  const domicilioNuevo = domicilioDesdeCorreccion(corr);
  const telefonoNuevo =
    digitsTelefono(corr.telefono) || strOrNull(corr.telefono, 32) || null;

  let encuestaUpdated = false;
  let leadEncuesta = null;

  try {
    const leads = await listAllLeadsFromEncuestas();
    leadEncuesta = leads.find((l) => String(l.id) === leadId) || null;
  } catch (err) {
    console.warn('[caja-correccion] No se pudo listar encuestas:', err?.message || err);
  }

  if (leadEncuesta && (nombreNuevo || domicilioNuevo || telefonoNuevo)) {
    const usuarioSp =
      leadEncuesta.codigoPromotorCarga?.trim() ||
      leadEncuesta.encuestaUsuario?.trim() ||
      payload?.lead?.promotorCodigo ||
      payload?.operador?.codigo ||
      'CAJA';
    const telBase =
      telefonoNuevo ||
      digitsTelefono(leadEncuesta.telefono) ||
      String(leadEncuesta.telefono || '').trim();
    const cargaParams = buildCargaParamsFromLead(leadEncuesta, telBase, usuarioSp);
    if (nombreNuevo) cargaParams.campo1Valor = nombreNuevo;
    if (domicilioNuevo) cargaParams.campo2Valor = domicilioNuevo;
    if (telefonoNuevo) cargaParams.telefono = telefonoNuevo;

    try {
      await execEncuestaSorteo01Update({
        ...cargaParams,
        idEncuesta: Number(leadId),
      });
      encuestaUpdated = true;
    } catch (err) {
      console.error(
        '[caja-correccion] Falló encuestaSorteo01Update lead=%s:',
        leadId,
        err,
      );
      const wrap = new Error(
        err instanceof Error
          ? `No se pudo actualizar la persona del lead en el CRM: ${err.message}`
          : 'No se pudo actualizar la persona del lead en el CRM.',
      );
      wrap.code = 'CRM_PATCH_FAILED';
      wrap.pendienteUuid = pendiente.uuid;
      wrap.leadId = leadId;
      wrap.cierreId = Number(pendiente.id);
      throw wrap;
    }
  } else if (!leadEncuesta && (nombreNuevo || domicilioNuevo || telefonoNuevo)) {
    console.warn(
      '[caja-correccion] Lead %s no encontrado en encuestas; se actualiza solo seguimiento.',
      leadId,
    );
  }

  const patchSeg = buildPatchPersonaDesdeCorreccion(corr, { corregidoPor });
  // Si vino documento en el body raíz y no en correccion
  if (!patchSeg.dniCliente && body?.clienteDocumento) {
    const dniBody = normalizarDniCliente(body.clienteDocumento);
    if (dniBody) patchSeg.dniCliente = dniBody;
  }

  let seguimientoSaved = false;
  if (Object.keys(patchSeg).length > 0) {
    const baseSeg = await resolverSeguimientoBaseParaCorreccionCaja(leadId, payload);
    const patchConCierre = fusionarPatchPersonaPreservandoCierre(baseSeg, patchSeg);
    const usuarioPersistencia = resolverUsuarioPersistenciaCorreccionCaja(
      baseSeg,
      payload,
      leadEncuesta,
    );
    const leadContext = {
      id: leadId,
      telefono:
        telefonoNuevo ||
        leadEncuesta?.telefono ||
        payload?.lead?.telefono ||
        '',
      nombre: nombreNuevo || leadEncuesta?.nombre || payload?.lead?.nombre || '',
      seguimiento: baseSeg,
    };
    try {
      const res = await persistirSeguimientoLead(
        leadId,
        patchConCierre,
        usuarioPersistencia,
        leadContext,
      );
      seguimientoSaved = Boolean(res?.saved);
    } catch (err) {
      console.error(
        '[caja-correccion] Falló persistir seguimiento lead=%s:',
        leadId,
        err,
      );
      const wrap = new Error(
        err instanceof Error
          ? `Encuesta OK pero falló el patch de seguimiento: ${err.message}`
          : 'Encuesta OK pero falló el patch de seguimiento.',
      );
      wrap.code = 'CRM_PATCH_FAILED';
      wrap.pendienteUuid = pendiente.uuid;
      wrap.leadId = leadId;
      wrap.cierreId = Number(pendiente.id);
      throw wrap;
    }
  }

  // Refrescar payload_json.lead en MySQL (idempotente; no cambia estado del pendiente)
  try {
    const leadPayload = {
      ...(payload.lead && typeof payload.lead === 'object' ? payload.lead : {}),
    };
    if (nombreNuevo) {
      leadPayload.nombre = nombreNuevo;
      const parts = nombreNuevo.split(/\s+/);
      leadPayload.apellido = parts[0] || leadPayload.apellido;
      leadPayload.nombrePila = parts.slice(1).join(' ') || leadPayload.nombrePila;
    }
    if (domicilioNuevo) leadPayload.domicilio = domicilioNuevo;
    if (telefonoNuevo) leadPayload.telefono = telefonoNuevo;
    if (patchSeg.dniCliente) leadPayload.documentoNumero = patchSeg.dniCliente;
    if (patchSeg.emailCliente) leadPayload.email = patchSeg.emailCliente;
    if (patchSeg.localidadCliente) leadPayload.localidad = patchSeg.localidadCliente;
    if (patchSeg.domicilioBarrio) leadPayload.domicilioBarrio = patchSeg.domicilioBarrio;
    if (patchSeg.cuilCuitCliente) leadPayload.cuilCuit = patchSeg.cuilCuitCliente;
    if (Object.prototype.hasOwnProperty.call(patchSeg, 'cotitular')) {
      leadPayload.cotitular = patchSeg.cotitular;
    }

    const nextPayload = { ...payload, lead: leadPayload };
    const pool = getCajaMysqlPool();
    await pool.query(
      `UPDATE crm_venta_pendiente
       SET payload_json = CAST(? AS JSON),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [JSON.stringify(nextPayload), pendiente.id],
    );
  } catch (err) {
    console.warn(
      '[caja-correccion] No se pudo refrescar payload_json pendiente=%s:',
      pendiente.uuid,
      err?.message || err,
    );
  }

  try {
    const pool = getCajaMysqlPool();
    await pool.query(
      `INSERT INTO sync_event_log (direccion, entidad, entidad_uuid, sucursal_codigo, detalle)
       VALUES ('CAJA_A_CRM', 'correccion_cliente', ?, ?, ?)`,
      [
        pendiente.uuid,
        String(sucursal || pendiente.sucursal_codigo || '').slice(0, 40),
        `Corrección persona por ${corregidoPor}`.slice(0, 500),
      ],
    );
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    pendienteUuid: pendiente.uuid,
    cierreId: Number(pendiente.id),
    leadId,
    sucursal: String(sucursal || pendiente.sucursal_codigo || ''),
    estadoPendiente: String(pendiente.estado || ''),
    encuestaUpdated,
    seguimientoSaved,
    dniCliente: patchSeg.dniCliente ?? null,
    cotitular:
      Object.prototype.hasOwnProperty.call(patchSeg, 'cotitular')
        ? patchSeg.cotitular
        : undefined,
  };
}
