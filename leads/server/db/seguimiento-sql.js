import sql from 'mssql';
import { readFileSync } from 'node:fs';
import { normalizarEncuestaCargaId } from './codigo-promotor.js';
import {
  etiquetaEstadoSeguimiento,
  filaHistorialDesdeEstado,
  normalizarOperadorHistorial,
  pestanaDesdeSeguimiento,
} from './seguimiento-historial.js';
import { getSqlPoolEncuestas, isSqlServerConfigured } from './mssql.js';
import { getDb, getSeguimientoExterno, listSeguimientoHistorial, upsertSeguimientoExterno } from './sqlite.js';
import { parsePijRecibo } from '../domain/pij-recibo.js';
import { normalizarDniCliente } from '../domain/dni-cliente.js';
import { resolveCierrePijPath } from '../domain/cierres-pij-storage.js';

const ID_PIJ = 'prod-pij';

export class SeguimientoRegistroError extends Error {
  constructor(message, code = 'SEGUIMIENTO_SQL') {
    super(message);
    this.name = 'SeguimientoRegistroError';
    this.code = code;
  }
}

export function useSeguimientoSql() {
  return isSqlServerConfigured() && Boolean(String(process.env.SP_SEGUIMIENTO ?? '').trim());
}

/** True si el último listado/leads usó seguimiento vacío por permiso SELECT denegado. */
let seguimientoLecturaDegradada = false;

export function consumeSeguimientoLecturaDegradada() {
  const v = seguimientoLecturaDegradada;
  seguimientoLecturaDegradada = false;
  return v;
}

function seguimientoErrorText(error) {
  return error instanceof Error
    ? `${error.message} ${error.originalError?.message ?? ''}`
    : String(error ?? '');
}

function isSpMissing(error) {
  const raw = seguimientoErrorText(error);
  return /could not find stored procedure/i.test(raw) || /invalid object name/i.test(raw);
}

function isSeguimientoReadDenied(error) {
  const raw = seguimientoErrorText(error);
  return (
    /permission was denied/i.test(raw) &&
    /registrarSeguimientoLead|SEGUIMIENTO_TABLE|SP_HistorialSeguimientoLead|SP_HistorialSeguimientoAdmin|SP_UltimoSeguimientoOperador|SP_UltimoSeguimientoGlobal/i.test(
      raw,
    )
  );
}

/** SP inexistente o sin permiso — panel superadmin degrada sin romper el listado. */
function isSeguimientoDegraded(error) {
  return isSeguimientoReadDenied(error) || isSpMissing(error);
}

function warnSeguimientoLecturaDegradada(error) {
  if (seguimientoLecturaDegradada) return;
  seguimientoLecturaDegradada = true;
  console.warn(
    '[seguimiento] Lectura de seguimiento denegada — leads se listan sin estado guardado. ' +
      'Pedí GRANT EXECUTE en los SP de lectura (Historial/Ultimos/Admin/Global) — sin SELECT directo en la tabla.',
    error instanceof Error ? error.message : error,
  );
}

function normalizeProcedureName(raw) {
  return String(raw ?? '')
    .replace(/^\[?dbo\]?\./i, '')
    .replace(/[\[\]]/g, '');
}

function getSeguimientoProcedureName() {
  return normalizeProcedureName(process.env.SP_SEGUIMIENTO || 'dbo.SP_RegistrarSeguimientoLead');
}

/** null = usar SELECT directo en tabla (fallback). */
function getHistorialProcedureName() {
  const raw = process.env.SP_SEGUIMIENTO_HISTORIAL;
  if (raw === '0' || raw === 'false') return null;
  if (String(raw ?? '').trim()) return normalizeProcedureName(raw);
  if (useSeguimientoSql()) return 'SP_HistorialSeguimientoLead';
  return null;
}

/** null = usar SELECT directo en tabla (fallback). */
function getUltimosProcedureName() {
  const raw = process.env.SP_SEGUIMIENTO_ULTIMOS;
  if (raw === '0' || raw === 'false') return null;
  if (String(raw ?? '').trim()) return normalizeProcedureName(raw);
  if (useSeguimientoSql()) return 'SP_UltimoSeguimientoOperador';
  return null;
}

/** Historial bulk panel superadmin (~400 días). Solo vía SP. */
function getAdminHistorialProcedureName() {
  const raw = process.env.SP_SEGUIMIENTO_ADMIN_HISTORIAL;
  if (raw === '0' || raw === 'false') return null;
  if (String(raw ?? '').trim()) return normalizeProcedureName(raw);
  if (useSeguimientoSql()) return 'SP_HistorialSeguimientoAdmin';
  return null;
}

/** Último seguimiento de todos los leads (superadmin, sin filtro operador). */
function getUltimosGlobalProcedureName() {
  const raw = process.env.SP_SEGUIMIENTO_ULTIMOS_GLOBAL;
  if (raw === '0' || raw === 'false') return null;
  if (String(raw ?? '').trim()) return normalizeProcedureName(raw);
  if (useSeguimientoSql()) return 'SP_UltimoSeguimientoGlobal';
  return null;
}

/** true = no usar SELECT directo en registrarSeguimientoLead (política DBA). */
function seguimientoSoloSp() {
  const raw = String(process.env.SEGUIMIENTO_SOLO_SP ?? 'true').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}

function getSeguimientoTableName() {
  const raw = process.env.SEGUIMIENTO_TABLE || 'registrarSeguimientoLead';
  return raw.replace(/[\[\]]/g, '');
}

function parseOperadorId(usuario) {
  const raw = usuario?.id ?? usuario?.idOperador ?? usuario?.loginId;
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function parseDecimalOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bitOrNull(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function parseFechaCierreForSql(iso) {
  if (iso == null || String(iso).trim() === '') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCreadoEn(row) {
  const raw =
    row.creado_en ??
    row.fecha_registro ??
    row.fecha_alta ??
    row.registrado_en ??
    row.creadoEn ??
    row.fechaAlta;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    const year = raw.getUTCFullYear();
    const month = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const day = String(raw.getUTCDate()).padStart(2, '0');
    const hours = String(raw.getUTCHours()).padStart(2, '0');
    const minutes = String(raw.getUTCMinutes()).padStart(2, '0');
    const seconds = String(raw.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
  if (raw != null && String(raw).trim() !== '') {
    const str = String(raw).trim();
    return str.replace(' ', 'T').replace(/Z$/, '').slice(0, 19);
  }
  return null;
}

function partesReciboPij(idProducto, numeroRecibo) {
  if (idProducto !== ID_PIJ || !String(numeroRecibo ?? '').trim()) {
    return { serie: null, nroAdhesion: null, nroAnexo: null };
  }
  const parsed = parsePijRecibo(numeroRecibo);
  return {
    serie: parsed.serie || null,
    nroAdhesion: parsed.adhesion || null,
    nroAnexo: parsed.anexo || null,
  };
}

/** JSON plano para el DBA: compras adicionales con adhesión/anexo desglosados. */
function buildComprasAdicionalesJson(compras) {
  if (!Array.isArray(compras) || compras.length === 0) return null;
  const rows = compras.map((c) => {
    const partes = partesReciboPij(c.idProducto, c.numeroRecibo);
    return {
      id: c.id,
      idProducto: c.idProducto,
      estadoPago: c.estadoPago,
      idBarrio: c.idBarrio ?? null,
      numeroRecibo: String(c.numeroRecibo ?? '').trim(),
      fechaCierre: c.fechaCierre,
      formaPago: c.formaPago ?? null,
      montoCierre: c.montoCierre ?? null,
      montoEfectivo: c.montoEfectivo ?? null,
      montoTransferencia: c.montoTransferencia ?? null,
      titularTransferencia: c.titularTransferencia ?? null,
      bancoTransferencia: c.bancoTransferencia ?? null,
      referenciaTransferencia: c.referenciaTransferencia ?? null,
      idVentaIntegral:
        c.idVentaIntegral != null && Number.isFinite(Number(c.idVentaIntegral))
          ? Math.trunc(Number(c.idVentaIntegral))
          : null,
      serie: partes.serie,
      nroAdhesion: partes.nroAdhesion,
      nroAnexo: partes.nroAnexo,
    };
  });
  return JSON.stringify(rows);
}

function buildImagenesCierreJson(imagenes) {
  if (!Array.isArray(imagenes) || imagenes.length === 0) return null;
  const legacyMap = { recibo: 'img6', comprobante_transferencia: 'img7' };
  const rows = imagenes.map((img) => ({
    id: img.id,
    leadId: img.leadId,
    ventaKey: img.ventaKey,
    tipo: legacyMap[img.tipo] ?? img.tipo,
    storagePath: img.storagePath,
    mimeType: img.mimeType,
    tamanoBytes: img.tamanoBytes,
    nombreOriginal: img.nombreOriginal ?? null,
    subidoEn: img.subidoEn,
    operadorId: img.operadorId ?? null,
  }));
  return JSON.stringify(rows);
}

function isChildTablesMissingError(error) {
  const raw = seguimientoErrorText(error);
  return (
    /invalid object name/i.test(raw) &&
    (/registrarSeguimientoLead_compra/i.test(raw) || /registrarSeguimientoLead_imagen/i.test(raw))
  );
}

function mapCompraSqlRowToApp(row) {
  const fecha = row.fecha_cierre ?? row.fechaCierre;
  return {
    id: row.id_compra ?? row.idCompra,
    idProducto: row.id_producto ?? row.idProducto,
    estadoPago: row.estado_pago ?? row.estadoPago,
    idBarrio: row.id_barrio ?? row.idBarrio ?? null,
    numeroRecibo: String(row.numero_recibo ?? row.numeroRecibo ?? '').trim(),
    fechaCierre: fecha instanceof Date ? fecha.toISOString() : (fecha ?? ''),
    formaPago: row.forma_pago ?? row.formaPago ?? null,
    montoCierre: parseDecimalOrNull(row.monto_cierre ?? row.montoCierre),
    montoEfectivo: parseDecimalOrNull(row.monto_efectivo ?? row.montoEfectivo),
    montoTransferencia: parseDecimalOrNull(row.monto_transferencia ?? row.montoTransferencia),
    serie: row.serie_pij ?? row.seriePij ?? null,
    nroAdhesion: row.nro_adhesion ?? row.nroAdhesion ?? null,
    nroAnexo: row.nro_anexo ?? row.nroAnexo ?? null,
  };
}

function mapImagenSqlRowToApp(row) {
  const subido = row.subido_en ?? row.subidoEn;
  const legacyMap = { recibo: 'img6', comprobante_transferencia: 'img7' };
  const tipoRaw = row.tipo_imagen ?? row.tipoImagen ?? '';
  return {
    id: row.id_imagen ?? row.idImagen,
    leadId: String(row.lead_id ?? row.leadId ?? ''),
    ventaKey: row.venta_key ?? row.ventaKey,
    tipo: legacyMap[tipoRaw] ?? tipoRaw,
    storagePath: row.storage_path ?? row.storagePath ?? '',
    mimeType: row.mime_type ?? row.mimeType ?? 'image/jpeg',
    tamanoBytes: Number(row.tamano_bytes ?? row.tamanoBytes ?? 0),
    nombreOriginal: row.nombre_original ?? row.nombreOriginal ?? null,
    subidoEn: subido instanceof Date ? subido.toISOString() : (subido ?? new Date().toISOString()),
    operadorId: row.operador_id != null ? String(row.operador_id) : null,
    archivoDisponible:
      row.tiene_contenido === 1 ||
      row.contenido != null ||
      Boolean(row.storage_path ?? row.storagePath),
  };
}

async function fetchChildDataBySeguimientoIds(seguimientoIds) {
  const ids = [
    ...new Set(
      seguimientoIds.map((id) => Number.parseInt(String(id), 10)).filter(Number.isFinite),
    ),
  ];
  const compras = new Map();
  const imagenes = new Map();
  if (!ids.length || !useSeguimientoSql()) return { compras, imagenes };

  const pool = await getSqlPoolEncuestas();
  const idList = ids.join(',');

  try {
    const comprasRes = await pool.request().query(
      `SELECT *
       FROM dbo.registrarSeguimientoLead_compra
       WHERE id_seguimiento IN (${idList})
       ORDER BY id_seguimiento, orden, id`,
    );
    for (const row of comprasRes.recordset ?? []) {
      const sid = Number(row.id_seguimiento ?? row.idSeguimiento);
      if (!compras.has(sid)) compras.set(sid, []);
      compras.get(sid).push(mapCompraSqlRowToApp(row));
    }

    const imgRes = await pool.request().query(
      `SELECT
          id_seguimiento, lead_id, id_imagen, venta_key, tipo_imagen,
          mime_type, nombre_original, tamano_bytes, storage_path,
          operador_id, subido_en,
          tiene_contenido = CASE WHEN contenido IS NOT NULL THEN 1 ELSE 0 END
       FROM dbo.registrarSeguimientoLead_imagen
       WHERE id_seguimiento IN (${idList})
       ORDER BY id_seguimiento, venta_key, tipo_imagen`,
    );
    for (const row of imgRes.recordset ?? []) {
      const sid = Number(row.id_seguimiento ?? row.idSeguimiento);
      if (!imagenes.has(sid)) imagenes.set(sid, []);
      imagenes.get(sid).push(mapImagenSqlRowToApp(row));
    }
  } catch (error) {
    if (isChildTablesMissingError(error)) return { compras, imagenes };
    throw error;
  }

  return { compras, imagenes };
}

function childDataForRow(row, childMaps) {
  const sid = Number(row?.id ?? row?.idRegistrarSeguimientoLead);
  if (!Number.isFinite(sid)) return {};
  return {
    comprasAdicionales: childMaps.compras.get(sid) ?? null,
    imagenesCierre: childMaps.imagenes.get(sid) ?? null,
  };
}

async function enrichRawRowMap(rawByLeadId) {
  const entries = Object.entries(rawByLeadId);
  if (!entries.length) return {};
  const childMaps = await fetchChildDataBySeguimientoIds(
    entries.map(([, row]) => row.id ?? row.idRegistrarSeguimientoLead),
  );
  const out = {};
  for (const [key, row] of entries) {
    out[key] = mapSqlRowToSeguimiento(row, childDataForRow(row, childMaps));
  }
  return out;
}

/** Normaliza fila SQL → objeto seguimiento (camelCase). Planas primero; JSON solo fallback. */
export function mapSqlRowToSeguimiento(row, child = {}) {
  if (!row) return {};

  // Fallback legacy: solo si el SP aún trae seguimiento_json (lectura vieja).
  let jsonFallback = {};
  const jsonRaw = row.seguimiento_json ?? row.seguimientoJson;
  if (jsonRaw) {
    try {
      const parsed = typeof jsonRaw === 'string' ? JSON.parse(jsonRaw) : jsonRaw;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        jsonFallback = parsed;
      }
    } catch {
      /* ignorar JSON inválido; usar planas */
    }
  }

  let referidos = jsonFallback.referidos;
  const refRaw = row.referidos_json ?? row.referidosJson;
  if (refRaw) {
    try {
      referidos = typeof refRaw === 'string' ? JSON.parse(refRaw) : refRaw;
    } catch {
      referidos = referidos ?? undefined;
    }
  }

  let comprasAdicionales = jsonFallback.comprasAdicionales;
  const comprasFlat = row.compras_adicionales_json ?? row.comprasAdicionalesJson;
  if (comprasFlat) {
    try {
      const parsed = typeof comprasFlat === 'string' ? JSON.parse(comprasFlat) : comprasFlat;
      if (Array.isArray(parsed) && parsed.length > 0) comprasAdicionales = parsed;
    } catch {
      comprasAdicionales = comprasAdicionales ?? undefined;
    }
  }

  let imagenesCierre = jsonFallback.imagenesCierre;
  const imagenesFlat = row.imagenes_cierre_json ?? row.imagenesCierreJson;
  if (imagenesFlat) {
    try {
      const parsed = typeof imagenesFlat === 'string' ? JSON.parse(imagenesFlat) : imagenesFlat;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const legacyMap = { recibo: 'img6', comprobante_transferencia: 'img7' };
        imagenesCierre = parsed.map((img) => ({
          ...img,
          tipo: legacyMap[img.tipo] ?? img.tipo,
        }));
      }
    } catch {
      imagenesCierre = imagenesCierre ?? undefined;
    }
  }

  if (Array.isArray(child.comprasAdicionales) && child.comprasAdicionales.length > 0) {
    comprasAdicionales = child.comprasAdicionales;
  }
  if (Array.isArray(child.imagenesCierre) && child.imagenesCierre.length > 0) {
    imagenesCierre = child.imagenesCierre;
  }

  const idProducto = row.id_producto ?? row.idProducto ?? jsonFallback.idProducto ?? null;
  const numeroRecibo =
    row.numero_recibo ?? row.numeroRecibo ?? jsonFallback.numeroRecibo ?? null;
  const partesPij =
    row.serie_pij != null || row.nro_adhesion != null || row.nro_anexo != null
      ? {
          serie: row.serie_pij ?? row.seriePij ?? null,
          nroAdhesion: row.nro_adhesion ?? row.nroAdhesion ?? null,
          nroAnexo: row.nro_anexo ?? row.nroAnexo ?? null,
        }
      : partesReciboPij(idProducto, numeroRecibo);

  const hasCol = (a, b) =>
    Object.prototype.hasOwnProperty.call(row, a) || Object.prototype.hasOwnProperty.call(row, b);

  const pickBit = (colA, colB, jsonKey) => {
    if (hasCol(colA, colB)) {
      return bitOrNull(row[colA] ?? row[colB]);
    }
    return bitOrNull(jsonFallback[jsonKey]);
  };

  const pick = (colA, colB, jsonKey) => {
    if (hasCol(colA, colB)) {
      const v = row[colA] ?? row[colB];
      return v === undefined ? (jsonFallback[jsonKey] ?? null) : v;
    }
    return jsonFallback[jsonKey] ?? null;
  };

  return {
    ...jsonFallback,
    confirmoEntrevista: pickBit('confirmo_entrevista', 'confirmoEntrevista', 'confirmoEntrevista'),
    canal: pick('canal', 'canal', 'canal'),
    huboEntrevista: pickBit('hubo_entrevista', 'huboEntrevista', 'huboEntrevista'),
    resultadoEntrevista: pick(
      'resultado_entrevista',
      'resultadoEntrevista',
      'resultadoEntrevista',
    ),
    horarioEntrevistaPropuesto: pick(
      'horario_entrevista_propuesto',
      'horarioEntrevistaPropuesto',
      'horarioEntrevistaPropuesto',
    ),
    fechaReagenda: pick('fecha_reagenda', 'fechaReagenda', 'fechaReagenda'),
    fechaCierre: pick('fecha_cierre', 'fechaCierre', 'fechaCierre'),
    seguimientoPijPromotor: pickBit(
      'seguimiento_pij_promotor',
      'seguimientoPijPromotor',
      'seguimientoPijPromotor',
    ),
    seguimientoAgendaOperadorRol: pick(
      'seguimiento_agenda_operador_rol',
      'seguimientoAgendaOperadorRol',
      'seguimientoAgendaOperadorRol',
    ),
    idProducto,
    estadoPago: pick('estado_pago', 'estadoPago', 'estadoPago'),
    idBarrio: pick('id_barrio', 'idBarrio', 'idBarrio'),
    numeroRecibo,
    seriePij: partesPij.serie ?? jsonFallback.seriePij ?? null,
    nroAdhesion: partesPij.nroAdhesion ?? jsonFallback.nroAdhesion ?? null,
    nroAnexo: partesPij.nroAnexo ?? jsonFallback.nroAnexo ?? null,
    formaPago: pick('forma_pago', 'formaPago', 'formaPago'),
    montoCierre: hasCol('monto_cierre', 'montoCierre')
      ? parseDecimalOrNull(row.monto_cierre ?? row.montoCierre)
      : parseDecimalOrNull(jsonFallback.montoCierre),
    montoEfectivo: hasCol('monto_efectivo', 'montoEfectivo')
      ? parseDecimalOrNull(row.monto_efectivo ?? row.montoEfectivo)
      : parseDecimalOrNull(jsonFallback.montoEfectivo),
    montoTransferencia: hasCol('monto_transferencia', 'montoTransferencia')
      ? parseDecimalOrNull(row.monto_transferencia ?? row.montoTransferencia)
      : parseDecimalOrNull(jsonFallback.montoTransferencia),
    titularTransferencia: pick(
      'titular_transferencia',
      'titularTransferencia',
      'titularTransferencia',
    ),
    titularCoincideCliente: pickBit(
      'titular_coincide_cliente',
      'titularCoincideCliente',
      'titularCoincideCliente',
    ),
    bancoTransferencia: pick('banco_transferencia', 'bancoTransferencia', 'bancoTransferencia'),
    referenciaTransferencia: pick(
      'referencia_transferencia',
      'referenciaTransferencia',
      'referenciaTransferencia',
    ),
    dniCliente:
      normalizarDniCliente(
        hasCol('dni_cliente', 'dniCliente')
          ? (row.dni_cliente ?? row.dniCliente)
          : jsonFallback.dniCliente,
      ) || null,
    brindoReferidos: pickBit('brindo_referidos', 'brindoReferidos', 'brindoReferidos'),
    derivacionTerrenoActiva: pickBit(
      'derivacion_terreno_activa',
      'derivacionTerrenoActiva',
      'derivacionTerrenoActiva',
    ),
    referidos: Array.isArray(referidos) ? referidos : undefined,
    observaciones: hasCol('observaciones', 'observaciones')
      ? (row.observaciones ?? undefined)
      : (jsonFallback.observaciones ?? undefined),
    fuente: pick('fuente', 'fuente', 'fuente') || undefined,
    operadorId:
      row.operador_id != null
        ? String(row.operador_id)
        : (jsonFallback.operadorId ?? null),
    operadorRol: row.operador_rol ?? row.operadorRol ?? jsonFallback.operadorRol ?? null,
    operadorNombre:
      row.operador_nombre ?? row.operadorNombre ?? jsonFallback.operadorNombre ?? null,
    creadoEn: formatCreadoEn(row) ?? jsonFallback.creadoEn ?? null,
    comprasAdicionales: comprasAdicionales ?? null,
    imagenesCierre: Array.isArray(imagenesCierre)
      ? imagenesCierre.map((img) => {
          const legacyMap = { recibo: 'img6', comprobante_transferencia: 'img7' };
          return { ...img, tipo: legacyMap[img.tipo] ?? img.tipo };
        })
      : null,
    idVentaIntegral: (() => {
      const fromCol = row.id_venta_integral ?? row.idVentaIntegral;
      if (fromCol != null && Number.isFinite(Number(fromCol)) && Number(fromCol) > 0) {
        return Number(fromCol);
      }
      if (
        !hasCol('id_venta_integral', 'idVentaIntegral') &&
        jsonFallback.idVentaIntegral != null &&
        Number.isFinite(Number(jsonFallback.idVentaIntegral))
      ) {
        return Number(jsonFallback.idVentaIntegral);
      }
      return null;
    })(),
    pijIntegralEstado: pick('pij_integral_estado', 'pijIntegralEstado', 'pijIntegralEstado'),
    pijIntegralError: pick('pij_integral_error', 'pijIntegralError', 'pijIntegralError'),
    pijIntegralEnviadoEn: pick(
      'pij_integral_enviado_en',
      'pijIntegralEnviadoEn',
      'pijIntegralEnviadoEn',
    ),
    cajaEstado: pick('caja_estado', 'cajaEstado', 'cajaEstado'),
    cajaVerificadoEn: pick('caja_verificado_en', 'cajaVerificadoEn', 'cajaVerificadoEn'),
    cajaComprobanteId: pick('caja_comprobante_id', 'cajaComprobanteId', 'cajaComprobanteId'),
    cajaMotivoRechazo: pick('caja_motivo_rechazo', 'cajaMotivoRechazo', 'cajaMotivoRechazo'),
    cajaSucursal: pick('caja_sucursal', 'cajaSucursal', 'cajaSucursal'),
    cajaConfirmadoPor: pick('caja_confirmado_por', 'cajaConfirmadoPor', 'cajaConfirmadoPor'),
  };
}

function mapSqlRowToHistorialEntry(row, lead = {}, child = {}) {
  const snapshot = mapSqlRowToSeguimiento(row, child);
  const id = row.id ?? row.idRegistrarSeguimientoLead;

  return {
    id: Number(id),
    leadId: String(row.lead_id ?? row.leadId),
    operadorId: row.operador_id != null ? String(row.operador_id) : undefined,
    operadorRol: row.operador_rol ?? undefined,
    operadorNombre: row.operador_nombre ?? 'Operador',
    estadoEtiqueta: etiquetaEstadoSeguimiento(snapshot, lead),
    resultadoEntrevista: snapshot.resultadoEntrevista ?? undefined,
    pestana: pestanaDesdeSeguimiento(snapshot, lead),
    seguimientoSnapshot: snapshot,
    creadoEn: formatCreadoEn(row) ?? new Date().toISOString(),
  };
}

function encuestaFromLead(lead) {
  if (lead?.codigoCampania) return normalizarEncuestaCargaId(lead.codigoCampania);
  return normalizarEncuestaCargaId(process.env.ENCUESTA_CARGA_ID || 'sorteo01');
}

function buildEntradaHistorial(leadId, merged, usuario, leadContext, registroId) {
  const operador = normalizarOperadorHistorial(usuario);
  const fila = filaHistorialDesdeEstado({
    leadId,
    seguimiento: merged,
    lead: leadContext ?? {},
    operador,
  });
  const idNum = Number(registroId);
  return {
    id: Number.isFinite(idNum) && idNum > 0 ? idNum : Date.now(),
    creadoEn: new Date().toISOString(),
    ...fila,
  };
}

/**
 * EXEC dbo.SP_RegistrarSeguimientoLead — append en registrarSeguimientoLead.
 * IMPORTANTE: @resultado_entrevista debe ser NVARCHAR(16), no BIT.
 */
export async function execRegistrarSeguimientoLead(lead, merged, usuario) {
  const pool = await getSqlPoolEncuestas();
  const proc = getSeguimientoProcedureName();
  const request = pool.request();

  const operadorId = parseOperadorId(usuario);
  const encuesta = encuestaFromLead(lead);
  const leadIdNum = parseInt(String(lead.id), 10);
  if (!Number.isFinite(leadIdNum)) {
    throw new SeguimientoRegistroError('lead_id inválido para SQL.');
  }

  request.input('lead_id', sql.Int, leadIdNum);
  request.input('telefono', sql.NVarChar(32), String(lead.telefono ?? '').slice(0, 32));
  request.input('encuesta', sql.NVarChar(64), encuesta.slice(0, 64));
  request.input('confirmo_entrevista', sql.Bit, bitOrNull(merged.confirmoEntrevista));
  request.input('canal', sql.NVarChar(16), merged.canal ?? null);
  request.input('hubo_entrevista', sql.Bit, bitOrNull(merged.huboEntrevista));
  request.input(
    'resultado_entrevista',
    sql.NVarChar(16),
    merged.resultadoEntrevista ?? null,
  );
  request.input(
    'horario_entrevista_propuesto',
    sql.NVarChar(32),
    merged.horarioEntrevistaPropuesto?.trim()?.slice(0, 32) ?? null,
  );
  request.input(
    'fecha_reagenda',
    sql.NVarChar(32),
    merged.fechaReagenda?.trim()?.slice(0, 32) ?? null,
  );
  request.input(
    'seguimiento_pij_promotor',
    sql.Bit,
    bitOrNull(merged.seguimientoPijPromotor),
  );
  request.input('id_producto', sql.NVarChar(32), merged.idProducto ?? null);
  request.input('estado_pago', sql.NVarChar(16), merged.estadoPago ?? null);
  request.input('id_barrio', sql.NVarChar(32), merged.idBarrio ?? null);
  request.input(
    'numero_recibo',
    sql.NVarChar(80),
    merged.numeroRecibo?.trim()?.slice(0, 80) ?? null,
  );
  request.input('brindo_referidos', sql.Bit, bitOrNull(merged.brindoReferidos));
  request.input(
    'referidos_json',
    sql.NVarChar(sql.MAX),
    merged.referidos?.length ? JSON.stringify(merged.referidos) : null,
  );
  request.input(
    'observaciones',
    sql.NVarChar(500),
    merged.observaciones?.trim()?.slice(0, 500) ?? null,
  );
  request.input('operador_id', sql.Int, operadorId);
  request.input('operador_rol', sql.NVarChar(16), usuario?.rol ?? null);
  request.input(
    'operador_nombre',
    sql.NVarChar(200),
    String(usuario?.nombre ?? 'Operador').slice(0, 200),
  );

  const payloadToStore = {
    ...merged,
    operadorId: operadorId != null ? String(operadorId) : undefined,
    operadorRol: usuario?.rol ?? undefined,
    operadorNombre: usuario?.nombre ?? undefined,
  };
  request.input('seguimiento_json', sql.NVarChar(sql.MAX), JSON.stringify(payloadToStore));

  request.input('forma_pago', sql.NVarChar(16), merged.formaPago ?? null);
  request.input('monto_cierre', sql.Decimal(12, 2), merged.montoCierre ?? null);
  request.input('monto_efectivo', sql.Decimal(12, 2), merged.montoEfectivo ?? null);
  request.input('monto_transferencia', sql.Decimal(12, 2), merged.montoTransferencia ?? null);
  request.input('fecha_cierre', sql.DateTime2, parseFechaCierreForSql(merged.fechaCierre));
  request.input('fuente', sql.NVarChar(16), merged.fuente?.slice(0, 16) ?? null);

  const partesPij = partesReciboPij(merged.idProducto, merged.numeroRecibo);
  request.input('serie_pij', sql.NVarChar(1), partesPij.serie?.slice(0, 1) ?? null);
  request.input('nro_adhesion', sql.NVarChar(10), partesPij.nroAdhesion?.slice(0, 10) ?? null);
  request.input('nro_anexo', sql.NVarChar(10), partesPij.nroAnexo?.slice(0, 10) ?? null);
  request.input(
    'compras_adicionales_json',
    sql.NVarChar(sql.MAX),
    buildComprasAdicionalesJson(merged.comprasAdicionales),
  );
  request.input(
    'imagenes_cierre_json',
    sql.NVarChar(sql.MAX),
    buildImagenesCierreJson(merged.imagenesCierre),
  );
  const dniPlano = normalizarDniCliente(merged.dniCliente);
  request.input('dni_cliente', sql.NVarChar(16), dniPlano || null);

  // Verificación del cierre en el sistema de caja de sucursal (push caja → CRM).
  request.input('caja_estado', sql.NVarChar(16), merged.cajaEstado ?? null);
  request.input(
    'caja_verificado_en',
    sql.DateTime2,
    parseFechaCierreForSql(merged.cajaVerificadoEn),
  );
  request.input(
    'caja_comprobante_id',
    sql.NVarChar(64),
    merged.cajaComprobanteId?.trim()?.slice(0, 64) ?? null,
  );
  request.input(
    'caja_motivo_rechazo',
    sql.NVarChar(300),
    merged.cajaMotivoRechazo?.trim()?.slice(0, 300) ?? null,
  );
  request.input(
    'caja_sucursal',
    sql.NVarChar(32),
    merged.cajaSucursal?.trim()?.slice(0, 32) ?? null,
  );
  request.input(
    'caja_confirmado_por',
    sql.NVarChar(200),
    merged.cajaConfirmadoPor?.trim()?.slice(0, 200) ?? null,
  );

  // Bloqueo PIJ → idLoteVenta del sistema integral
  const idVentaIntegral =
    merged.idVentaIntegral != null && Number.isFinite(Number(merged.idVentaIntegral))
      ? Math.trunc(Number(merged.idVentaIntegral))
      : null;
  request.input(
    'id_venta_integral',
    sql.Int,
    idVentaIntegral != null && idVentaIntegral > 0 ? idVentaIntegral : null,
  );
  request.input(
    'pij_integral_estado',
    sql.NVarChar(16),
    merged.pijIntegralEstado?.trim()?.slice(0, 16) ?? null,
  );
  request.input(
    'pij_integral_error',
    sql.NVarChar(500),
    merged.pijIntegralError?.trim()?.slice(0, 500) ?? null,
  );
  request.input(
    'pij_integral_enviado_en',
    sql.DateTime2,
    parseFechaCierreForSql(merged.pijIntegralEnviadoEn),
  );
  request.input(
    'derivacion_terreno_activa',
    sql.Bit,
    bitOrNull(merged.derivacionTerrenoActiva),
  );
  request.input(
    'seguimiento_agenda_operador_rol',
    sql.NVarChar(16),
    merged.seguimientoAgendaOperadorRol?.trim()?.slice(0, 16) ?? null,
  );
  request.input(
    'titular_transferencia',
    sql.NVarChar(200),
    merged.titularTransferencia?.trim()?.slice(0, 200) || null,
  );
  request.input(
    'titular_coincide_cliente',
    sql.Bit,
    bitOrNull(merged.titularCoincideCliente),
  );
  request.input(
    'banco_transferencia',
    sql.NVarChar(120),
    merged.bancoTransferencia?.trim()?.slice(0, 120) || null,
  );
  request.input(
    'referencia_transferencia',
    sql.NVarChar(120),
    merged.referenciaTransferencia?.trim()?.slice(0, 120) || null,
  );

  const result = await request.execute(proc);
  const fila = result.recordset?.[0];

  if (!fila || fila.codigo !== 1) {
    throw new SeguimientoRegistroError(
      fila?.mensaje ?? 'El SP no registró el seguimiento (codigo distinto de 1).',
    );
  }

  return {
    id: fila.idRegistrarSeguimientoLead ?? fila.id ?? null,
    mensaje: fila.mensaje,
  };
}

/**
 * Envía bytes de imágenes PIJ a STRSYSTEM (SP_RegistrarImagenCierrePij).
 * Best-effort: no revierte el seguimiento si falla una imagen.
 */
async function sincronizarImagenesBytesSql(leadId, idSeguimiento, imagenes, operadorId) {
  const segId = Number.parseInt(String(idSeguimiento), 10);
  const leadIdNum = Number.parseInt(String(leadId), 10);
  if (!Number.isFinite(segId) || !Number.isFinite(leadIdNum)) return;
  if (!Array.isArray(imagenes) || imagenes.length === 0) return;

  const pool = await getSqlPoolEncuestas();
  const proc = 'dbo.SP_RegistrarImagenCierrePij';

  for (const img of imagenes) {
    const absPath = resolveCierrePijPath(img.storagePath);
    if (!absPath) continue;

    let buffer;
    try {
      buffer = readFileSync(absPath);
    } catch {
      continue;
    }
    if (!buffer?.length) continue;

    const legacyMap = { recibo: 'img6', comprobante_transferencia: 'img7' };
    const tipo = legacyMap[img.tipo] ?? img.tipo;
    if (!tipo || !img.ventaKey || !img.id) continue;

    try {
      const request = pool.request();
      request.input('id_seguimiento', sql.Int, segId);
      request.input('lead_id', sql.Int, leadIdNum);
      request.input('id_imagen', sql.NVarChar(36), String(img.id).slice(0, 36));
      request.input('venta_key', sql.NVarChar(36), String(img.ventaKey).slice(0, 36));
      request.input('tipo_imagen', sql.NVarChar(16), String(tipo).slice(0, 16));
      request.input('mime_type', sql.NVarChar(32), (img.mimeType ?? 'image/jpeg').slice(0, 32));
      request.input(
        'nombre_original',
        sql.NVarChar(260),
        img.nombreOriginal?.slice(0, 260) ?? null,
      );
      request.input('tamano_bytes', sql.Int, buffer.length);
      request.input('storage_path', sql.NVarChar(500), img.storagePath?.slice(0, 500) ?? null);
      request.input('contenido', sql.VarBinary(sql.MAX), buffer);
      request.input('operador_id', sql.Int, operadorId ?? null);
      request.input('subido_en', sql.DateTime2, img.subidoEn ? new Date(img.subidoEn) : new Date());

      const result = await request.execute(proc);
      const fila = result.recordset?.[0];
      if (fila?.codigo !== 1) {
        console.warn('[seguimiento] imagen bytes SQL:', fila?.mensaje ?? tipo);
      }
    } catch (error) {
      if (isSpMissing(error)) return;
      console.warn('[seguimiento] imagen bytes SQL error:', seguimientoErrorText(error));
    }
  }
}

async function queryHistorialRows(leadId, limit = 50, idOperador = null) {
  const lim = Math.min(Math.max(limit, 1), 200);
  const leadIdNum = parseInt(String(leadId), 10);
  if (!Number.isFinite(leadIdNum)) return [];

  const proc = getHistorialProcedureName();
  const pool = await getSqlPoolEncuestas();

  if (proc && idOperador != null) {
    const result = await pool
      .request()
      .input('lead_id', sql.Int, leadIdNum)
      .input('id_operador', sql.Int, idOperador)
      .input('lim', sql.Int, lim)
      .execute(proc);
    return result.recordset ?? [];
  }

  if (seguimientoSoloSp()) return [];

  const table = getSeguimientoTableName();
  const result = await pool
    .request()
    .input('leadId', sql.Int, leadIdNum)
    .input('lim', sql.Int, lim)
    .query(
      `SELECT TOP (@lim) *
       FROM dbo.[${table}]
       WHERE lead_id = @leadId
       ORDER BY id DESC`,
    );
  return result.recordset ?? [];
}

async function queryUltimosRows(idOperador) {
  const proc = getUltimosProcedureName();
  if (!proc || idOperador == null) return null;

  const pool = await getSqlPoolEncuestas();
  const result = await pool
    .request()
    .input('id_operador', sql.Int, idOperador)
    .execute(proc);
  return result.recordset ?? [];
}

async function queryUltimosGlobalRows() {
  const proc = getUltimosGlobalProcedureName();
  if (!proc) return null;
  const pool = await getSqlPoolEncuestas();
  const result = await pool.request().execute(proc);
  return result.recordset ?? [];
}

/** Historial desde fecha para panel superadmin (SP_HistorialSeguimientoAdmin). */
export async function fetchHistorialAdminDesde(desde) {
  const proc = getAdminHistorialProcedureName();
  if (!proc || !useSeguimientoSql()) return [];

  try {
    const pool = await getSqlPoolEncuestas();
    const result = await pool.request().input('desde', sql.DateTime2, desde).execute(proc);
    return result.recordset ?? [];
  } catch (error) {
    if (isSeguimientoDegraded(error)) {
      warnSeguimientoLecturaDegradada(error);
      return [];
    }
    throw error;
  }
}

/** Último seguimiento global (SP_UltimoSeguimientoGlobal). */
export async function fetchUltimosSeguimientoGlobal() {
  try {
    return (await queryUltimosGlobalRows()) ?? [];
  } catch (error) {
    if (isSeguimientoDegraded(error)) {
      warnSeguimientoLecturaDegradada(error);
      return [];
    }
    throw error;
  }
}

/**
 * Último seguimiento por lead vía SP_UltimoSeguimientoOperador (uno o más supervisores).
 * Evita SELECT directo en registrarSeguimientoLead cuando MPCSP solo tiene EXECUTE en SPs.
 */
export async function fetchUltimosSeguimientoPorOperadores(idOperadores = []) {
  const ids = [
    ...new Set(
      idOperadores
        .map((id) => Number.parseInt(String(id), 10))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (!ids.length || !useSeguimientoSql()) return [];

  const byLead = new Map();
  for (const idOp of ids) {
    try {
      const rows = await queryUltimosRows(idOp);
      if (!rows?.length) continue;
      for (const row of rows) {
        const key = String(row.lead_id ?? row.leadId ?? '');
        if (!key) continue;
        const prev = byLead.get(key);
        const prevId = Number(prev?.id ?? prev?.idRegistrarSeguimientoLead ?? 0);
        const nextId = Number(row.id ?? row.idRegistrarSeguimientoLead ?? 0);
        if (!prev || nextId >= prevId) byLead.set(key, row);
      }
    } catch (error) {
      if (isSeguimientoDegraded(error)) {
        warnSeguimientoLecturaDegradada(error);
        continue;
      }
      throw error;
    }
  }
  return [...byLead.values()];
}

async function findGlobalUltimoRowForLead(leadId) {
  const leadIdStr = String(leadId);
  const globalRows = await queryUltimosGlobalRows();
  if (globalRows == null) return null;
  return (
    globalRows.find((row) => String(row.lead_id ?? row.leadId) === leadIdStr) ?? null
  );
}

async function mapRowToSeguimientoConHijos(row) {
  if (!row) return {};
  const childMaps = await fetchChildDataBySeguimientoIds([
    row.id ?? row.idRegistrarSeguimientoLead,
  ]);
  return mapSqlRowToSeguimiento(row, childDataForRow(row, childMaps));
}

/**
 * Último seguimiento con cierre (compro) en historial admin reciente.
 * Útil para reparar leads cuyo último registro perdió el estado de cierre.
 */
function esOperadorCajaEnFilaHistorial(row) {
  const opId = row.operador_id ?? row.operadorId;
  if (opId === 0 || opId === '0') return true;
  const nombre = String(row.operador_nombre ?? row.operadorNombre ?? '').trim();
  return /^caja\s*\d/i.test(nombre);
}

export async function buscarUltimoSeguimientoComproEnHistorial(leadId, { dias = 60 } = {}) {
  if (!useSeguimientoSql()) return null;
  const desde = new Date(Date.now() - Math.max(dias, 1) * 86400000);
  const rows = await fetchHistorialAdminDesde(desde);
  const leadIdStr = String(leadId);
  let bestRow = null;
  let bestId = 0;
  for (const row of rows) {
    if (String(row.lead_id ?? row.leadId) !== leadIdStr) continue;
    const resultado = row.resultado_entrevista ?? row.resultadoEntrevista;
    if (resultado !== 'compro') continue;
    if (esOperadorCajaEnFilaHistorial(row)) continue;
    const rid = Number(row.id ?? row.idRegistrarSeguimientoLead ?? 0);
    if (rid >= bestId) {
      bestId = rid;
      bestRow = row;
    }
  }
  if (!bestRow) return null;
  return mapRowToSeguimientoConHijos(bestRow);
}

export async function getLatestSeguimientoSql(leadId, idOperador = null) {
  try {
    // operador 0 = usuario sistema caja; usar último global, no historial filtrado por op. 0
    const usarGlobal = idOperador == null || idOperador === 0;
    if (usarGlobal) {
      const globalRow = await findGlobalUltimoRowForLead(leadId);
      if (globalRow) return mapRowToSeguimientoConHijos(globalRow);
      if (idOperador == null) return {};
    }

    const rows = await queryHistorialRows(leadId, 1, idOperador);
    if (!rows.length) return {};
    return mapRowToSeguimientoConHijos(rows[0]);
  } catch (error) {
    if (isSeguimientoDegraded(error)) {
      warnSeguimientoLecturaDegradada(error);
      return {};
    }
    throw error;
  }
}

export async function batchLatestSeguimientoSql(
  leadIds,
  idOperador = null,
  idOperadoresExtra = [],
) {
  const ids = [...new Set(leadIds.map((id) => parseInt(String(id), 10)).filter(Number.isFinite))];
  if (!ids.length) return {};

  const idSet = new Set(ids.map(String));
  const rawMap = {};

  try {
    if (idOperador == null) {
      const globalRows = await queryUltimosGlobalRows();
      if (globalRows != null) {
        for (const row of globalRows) {
          const key = String(row.lead_id ?? row.leadId);
          if (idSet.has(key)) rawMap[key] = row;
        }
        return enrichRawRowMap(rawMap);
      }
    }

    if (idOperador == null && idOperadoresExtra.length) {
      const ultimosRows = await fetchUltimosSeguimientoPorOperadores(idOperadoresExtra);
      for (const row of ultimosRows) {
        const key = String(row.lead_id ?? row.leadId);
        if (idSet.has(key)) rawMap[key] = row;
      }
      if (Object.keys(rawMap).length) return enrichRawRowMap(rawMap);
    }

    const ultimosRows = await queryUltimosRows(idOperador);
    if (ultimosRows != null) {
      for (const row of ultimosRows) {
        const key = String(row.lead_id ?? row.leadId);
        if (idSet.has(key)) rawMap[key] = row;
      }
      return enrichRawRowMap(rawMap);
    }

    if (seguimientoSoloSp()) return {};

    const pool = await getSqlPoolEncuestas();
    const table = getSeguimientoTableName();
    const chunkSize = 80;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const placeholders = chunk.map((_, idx) => `@id${idx}`).join(', ');
      const request = pool.request();
      chunk.forEach((id, idx) => {
        request.input(`id${idx}`, sql.Int, id);
      });
      const result = await request.query(
        `WITH ranked AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY id DESC) AS rn
           FROM dbo.[${table}]
           WHERE lead_id IN (${placeholders})
         )
         SELECT * FROM ranked WHERE rn = 1`,
      );
      for (const row of result.recordset ?? []) {
        rawMap[String(row.lead_id)] = row;
      }
    }
    return enrichRawRowMap(rawMap);
  } catch (error) {
    if (isSeguimientoDegraded(error)) {
      warnSeguimientoLecturaDegradada(error);
      return {};
    }
    throw error;
  }
}

export async function listHistorialSeguimientoSql(leadId, lead = {}, { limit = 50, idOperador = null } = {}) {
  try {
    const rows = await queryHistorialRows(leadId, limit, idOperador);
    const childMaps = await fetchChildDataBySeguimientoIds(
      rows.map((row) => row.id ?? row.idRegistrarSeguimientoLead),
    );
    return rows.map((row) =>
      mapSqlRowToHistorialEntry(row, lead, childDataForRow(row, childMaps)),
    );
  } catch (error) {
    if (isSeguimientoDegraded(error)) {
      warnSeguimientoLecturaDegradada(error);
      return [];
    }
    throw error;
  }
}

export async function listHistorialForLead(leadId, lead = {}, opts = {}) {
  if (useSeguimientoSql()) {
    return listHistorialSeguimientoSql(leadId, lead, opts);
  }
  return listSeguimientoHistorial(leadId, opts);
}

export async function persistirSeguimientoLead(leadId, patch, usuario, leadContext) {
  const idOperador = parseOperadorId(usuario);
  // Caja usa operador_id=0; el merge debe basarse en el último global, no en filas de op. 0
  const idOperadorPrev = idOperador === 0 ? null : idOperador;
  let prev = useSeguimientoSql()
    ? await getLatestSeguimientoSql(leadId, idOperadorPrev)
    : getSeguimientoExterno(leadId);
  if (
    useSeguimientoSql() &&
    Object.keys(prev).length === 0 &&
    leadContext?.seguimiento &&
    Object.keys(leadContext.seguimiento).length > 0
  ) {
    prev = { ...leadContext.seguimiento };
  }
  const merged = { ...prev, ...patch };

  if (JSON.stringify(prev) === JSON.stringify(merged)) {
    return { merged, saved: false, entradaHistorial: null };
  }

  if (useSeguimientoSql()) {
    const reg = await execRegistrarSeguimientoLead(leadContext, merged, usuario);
    // Bytes a SQL en background solo si el patch trae fotos (evita re-sync en patches de cajaEstado).
    const patchTieneImagenes = Object.prototype.hasOwnProperty.call(patch, 'imagenesCierre');
    const imgs = merged.imagenesCierre;
    if (
      patchTieneImagenes &&
      Array.isArray(imgs) &&
      imgs.length > 0 &&
      reg.id != null
    ) {
      const opId = parseOperadorId(usuario);
      const leadIdCopy = leadId;
      const regId = reg.id;
      const imgsCopy = [...imgs];
      const { enqueueBgJob } = await import('../services/bg-job-queue.js');
      enqueueBgJob(
        'sql-imagenes-cierre',
        () => sincronizarImagenesBytesSql(leadIdCopy, regId, imgsCopy, opId),
        { concurrency: Number(process.env.CIERRES_PIJ_SQL_IMG_CONCURRENCY ?? 2) || 2 },
      );
    }
    return {
      merged,
      saved: true,
      registroId: reg.id,
      entradaHistorial: buildEntradaHistorial(leadId, merged, usuario, leadContext, reg.id),
    };
  }

  const mergedLocal = upsertSeguimientoExterno(leadId, patch, usuario, leadContext);
  return {
    merged: mergedLocal,
    saved: true,
    entradaHistorial: buildEntradaHistorial(leadId, mergedLocal, usuario, leadContext, Date.now()),
  };
}

export async function resetearSeguimientoLead(leadId, leadContext) {
  const emptySeg = {
    canal: null,
    huboEntrevista: null,
    resultadoEntrevista: null,
    horarioEntrevistaPropuesto: null,
    fechaReagenda: null,
    fechaCierre: null,
    seguimientoPijPromotor: null,
    seguimientoAgendaOperadorRol: null,
    idProducto: null,
    estadoPago: null,
    idBarrio: null,
    numeroRecibo: null,
    formaPago: null,
    montoCierre: null,
    montoEfectivo: null,
    montoTransferencia: null,
    titularTransferencia: null,
    titularCoincideCliente: null,
    bancoTransferencia: null,
    referenciaTransferencia: null,
    derivacionTerrenoActiva: null,
    brindoReferidos: null,
    referidos: null,
    observaciones: null,
    fuente: null,
    comprasAdicionales: null,
  };

  const sysUser = {
    id: null,
    rol: null,
    nombre: 'Sistema',
  };

  const leadIdStr = String(leadId);

  if (useSeguimientoSql()) {
    try {
      await execRegistrarSeguimientoLead(leadContext || { id: leadId }, emptySeg, sysUser);
    } catch (err) {
      console.error('[resetearSeguimientoLead] Error al registrar seguimiento vacío en SQL Server:', err);
    }
  }

  // Sincronizar en SQLite local
  const dbi = getDb();
  dbi.prepare(
    `INSERT INTO lead_seguimiento_externo (lead_id, seguimiento_json, actualizado_en)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(lead_id) DO UPDATE SET
       seguimiento_json = excluded.seguimiento_json,
       actualizado_en = datetime('now')`,
  ).run(leadIdStr, JSON.stringify({ ...emptySeg, operadorNombre: 'Sistema' }));

  dbi.prepare(
    `INSERT INTO lead_seguimiento_historial (
      lead_id, operador_id, operador_rol, operador_nombre,
      estado_etiqueta, resultado_entrevista, pestana, seguimiento_json
    ) VALUES (?, NULL, NULL, 'Sistema', 'Reasignado (Sin Tratamiento)', NULL, 'entrevista', ?)`
  ).run(leadIdStr, JSON.stringify({ ...emptySeg, operadorNombre: 'Sistema' }));
}
