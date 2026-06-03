import sql from 'mssql';
import { normalizarEncuestaCargaId } from './codigo-promotor.js';
import {
  etiquetaEstadoSeguimiento,
  pestanaDesdeSeguimiento,
} from './seguimiento-historial.js';
import { getSqlPoolEncuestas, isSqlServerConfigured } from './mssql.js';
import { getSeguimientoExterno, listSeguimientoHistorial, upsertSeguimientoExterno } from './sqlite.js';

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

function isSeguimientoTableReadDenied(error) {
  const raw =
    error instanceof Error
      ? `${error.message} ${error.originalError?.message ?? ''}`
      : String(error ?? '');
  return (
    /permission was denied/i.test(raw) &&
    /registrarSeguimientoLead|SEGUIMIENTO_TABLE/i.test(raw)
  );
}

function warnSeguimientoLecturaDegradada(error) {
  if (seguimientoLecturaDegradada) return;
  seguimientoLecturaDegradada = true;
  console.warn(
    '[seguimiento] Sin permiso SELECT en registrarSeguimientoLead — leads se listan sin estado de seguimiento. ' +
      'Pedí GRANT SELECT, INSERT + EXECUTE al DBA (sql/grants-mpcsp-leads.sql).',
    error instanceof Error ? error.message : error,
  );
}

function getSeguimientoProcedureName() {
  const raw = process.env.SP_SEGUIMIENTO || 'dbo.SP_RegistrarSeguimientoLead';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
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

function bitOrNull(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function formatCreadoEn(row) {
  const raw =
    row.creado_en ??
    row.fecha_registro ??
    row.fecha_alta ??
    row.registrado_en;
  if (raw instanceof Date) return raw.toISOString();
  if (raw != null && String(raw).trim() !== '') return String(raw);
  return new Date().toISOString();
}

/** Normaliza fila SQL o JSON del SP → objeto seguimiento (camelCase) de la app. */
export function mapSqlRowToSeguimiento(row) {
  if (!row) return {};

  const jsonRaw = row.seguimiento_json ?? row.seguimientoJson;
  if (jsonRaw) {
    try {
      const parsed = typeof jsonRaw === 'string' ? JSON.parse(jsonRaw) : jsonRaw;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...parsed };
      }
    } catch {
      /* columnas planas */
    }
  }

  let referidos;
  const refRaw = row.referidos_json ?? row.referidosJson;
  if (refRaw) {
    try {
      referidos = typeof refRaw === 'string' ? JSON.parse(refRaw) : refRaw;
    } catch {
      referidos = undefined;
    }
  }

  return {
    confirmoEntrevista: bitOrNull(row.confirmo_entrevista ?? row.confirmoEntrevista),
    canal: row.canal ?? null,
    huboEntrevista: bitOrNull(row.hubo_entrevista ?? row.huboEntrevista),
    resultadoEntrevista: row.resultado_entrevista ?? row.resultadoEntrevista ?? null,
    horarioEntrevistaPropuesto:
      row.horario_entrevista_propuesto ?? row.horarioEntrevistaPropuesto ?? null,
    fechaReagenda: row.fecha_reagenda ?? row.fechaReagenda ?? null,
    seguimientoPijPromotor: bitOrNull(
      row.seguimiento_pij_promotor ?? row.seguimientoPijPromotor,
    ),
    idProducto: row.id_producto ?? row.idProducto ?? null,
    estadoPago: row.estado_pago ?? row.estadoPago ?? null,
    idBarrio: row.id_barrio ?? row.idBarrio ?? null,
    numeroRecibo: row.numero_recibo ?? row.numeroRecibo ?? null,
    brindoReferidos: bitOrNull(row.brindo_referidos ?? row.brindoReferidos),
    referidos: Array.isArray(referidos) ? referidos : undefined,
    observaciones: row.observaciones ?? undefined,
    fuente: row.fuente ?? undefined,
  };
}

function mapSqlRowToHistorialEntry(row, lead = {}) {
  const snapshot = mapSqlRowToSeguimiento(row);
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
    creadoEn: formatCreadoEn(row),
  };
}

function encuestaFromLead(lead) {
  if (lead?.codigoCampania) return normalizarEncuestaCargaId(lead.codigoCampania);
  return normalizarEncuestaCargaId(process.env.ENCUESTA_CARGA_ID || 'sorteo01');
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
  request.input('seguimiento_json', sql.NVarChar(sql.MAX), JSON.stringify(merged));

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

async function queryHistorialRows(leadId, limit = 50) {
  const pool = await getSqlPoolEncuestas();
  const table = getSeguimientoTableName();
  const lim = Math.min(Math.max(limit, 1), 200);
  const leadIdNum = parseInt(String(leadId), 10);
  if (!Number.isFinite(leadIdNum)) return [];

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

export async function getLatestSeguimientoSql(leadId) {
  try {
    const rows = await queryHistorialRows(leadId, 1);
    return rows.length ? mapSqlRowToSeguimiento(rows[0]) : {};
  } catch (error) {
    if (isSeguimientoTableReadDenied(error)) {
      warnSeguimientoLecturaDegradada(error);
      return {};
    }
    throw error;
  }
}

export async function batchLatestSeguimientoSql(leadIds) {
  const ids = [...new Set(leadIds.map((id) => parseInt(String(id), 10)).filter(Number.isFinite))];
  if (!ids.length) return {};

  const pool = await getSqlPoolEncuestas();
  const table = getSeguimientoTableName();
  const map = {};
  const chunkSize = 80;

  try {
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
        map[String(row.lead_id)] = mapSqlRowToSeguimiento(row);
      }
    }
  } catch (error) {
    if (isSeguimientoTableReadDenied(error)) {
      warnSeguimientoLecturaDegradada(error);
      return {};
    }
    throw error;
  }
  return map;
}

export async function listHistorialSeguimientoSql(leadId, lead = {}, { limit = 50 } = {}) {
  try {
    const rows = await queryHistorialRows(leadId, limit);
    return rows.map((row) => mapSqlRowToHistorialEntry(row, lead));
  } catch (error) {
    if (isSeguimientoTableReadDenied(error)) {
      warnSeguimientoLecturaDegradada(error);
      return [];
    }
    throw error;
  }
}

export async function listHistorialForLead(leadId, lead = {}, opts) {
  if (useSeguimientoSql()) {
    return listHistorialSeguimientoSql(leadId, lead, opts);
  }
  return listSeguimientoHistorial(leadId, opts);
}

export async function persistirSeguimientoLead(leadId, patch, usuario, leadContext) {
  const prev = useSeguimientoSql()
    ? await getLatestSeguimientoSql(leadId)
    : getSeguimientoExterno(leadId);
  const merged = { ...prev, ...patch };

  if (JSON.stringify(prev) === JSON.stringify(merged)) {
    return merged;
  }

  if (useSeguimientoSql()) {
    await execRegistrarSeguimientoLead(leadContext, merged, usuario);
    return merged;
  }

  return upsertSeguimientoExterno(leadId, patch, usuario, leadContext);
}
