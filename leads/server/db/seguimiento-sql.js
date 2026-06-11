import sql from 'mssql';
import { normalizarEncuestaCargaId } from './codigo-promotor.js';
import {
  etiquetaEstadoSeguimiento,
  filaHistorialDesdeEstado,
  normalizarOperadorHistorial,
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

  let base = {};
  const jsonRaw = row.seguimiento_json ?? row.seguimientoJson;
  if (jsonRaw) {
    try {
      const parsed = typeof jsonRaw === 'string' ? JSON.parse(jsonRaw) : jsonRaw;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...parsed };
      }
    } catch {
      /* columnas planas */
    }
  }

  let referidos = base.referidos;
  const refRaw = row.referidos_json ?? row.referidosJson;
  if (refRaw) {
    try {
      referidos = typeof refRaw === 'string' ? JSON.parse(refRaw) : refRaw;
    } catch {
      referidos = referidos ?? undefined;
    }
  }

  return {
    ...base,
    confirmoEntrevista:
      base.confirmoEntrevista ??
      bitOrNull(row.confirmo_entrevista ?? row.confirmoEntrevista),
    canal: base.canal ?? row.canal ?? null,
    huboEntrevista:
      base.huboEntrevista ?? bitOrNull(row.hubo_entrevista ?? row.huboEntrevista),
    resultadoEntrevista:
      base.resultadoEntrevista ?? row.resultado_entrevista ?? row.resultadoEntrevista ?? null,
    horarioEntrevistaPropuesto:
      base.horarioEntrevistaPropuesto ??
      row.horario_entrevista_propuesto ??
      row.horarioEntrevistaPropuesto ??
      null,
    fechaReagenda: base.fechaReagenda ?? row.fecha_reagenda ?? row.fechaReagenda ?? null,
    fechaCierre: base.fechaCierre ?? row.fecha_cierre ?? row.fechaCierre ?? null,
    seguimientoPijPromotor:
      base.seguimientoPijPromotor ??
      bitOrNull(row.seguimiento_pij_promotor ?? row.seguimientoPijPromotor),
    seguimientoAgendaOperadorRol:
      base.seguimientoAgendaOperadorRol ??
      row.seguimiento_agenda_operador_rol ??
      row.seguimientoAgendaOperadorRol ??
      null,
    idProducto: base.idProducto ?? row.id_producto ?? row.idProducto ?? null,
    estadoPago: base.estadoPago ?? row.estado_pago ?? row.estadoPago ?? null,
    idBarrio: base.idBarrio ?? row.id_barrio ?? row.idBarrio ?? null,
    numeroRecibo: base.numeroRecibo ?? row.numero_recibo ?? row.numeroRecibo ?? null,
    brindoReferidos:
      base.brindoReferidos ?? bitOrNull(row.brindo_referidos ?? row.brindoReferidos),
    referidos: Array.isArray(referidos) ? referidos : undefined,
    observaciones: base.observaciones ?? row.observaciones ?? undefined,
    fuente: base.fuente ?? row.fuente ?? undefined,
    operadorId: row.operador_id != null ? String(row.operador_id) : (base.operadorId ?? null),
    operadorRol: row.operador_rol ?? row.operadorRol ?? base.operadorRol ?? null,
    operadorNombre:
      row.operador_nombre ?? row.operadorNombre ?? base.operadorNombre ?? null,
    creadoEn:
      row.creado_en ??
      row.creadoEn ??
      row.fechaAlta ??
      row.fecha_alta ??
      base.creadoEn ??
      null,
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

export async function getLatestSeguimientoSql(leadId, idOperador = null) {
  try {
    const rows = await queryHistorialRows(leadId, 1, idOperador);
    return rows.length ? mapSqlRowToSeguimiento(rows[0]) : {};
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
  const map = {};

  try {
    if (idOperador == null && idOperadoresExtra.length) {
      const ultimosRows = await fetchUltimosSeguimientoPorOperadores(idOperadoresExtra);
      for (const row of ultimosRows) {
        const key = String(row.lead_id ?? row.leadId);
        if (idSet.has(key)) map[key] = mapSqlRowToSeguimiento(row);
      }
      if (Object.keys(map).length) return map;
    }

    const ultimosRows = await queryUltimosRows(idOperador);
    if (ultimosRows != null) {
      for (const row of ultimosRows) {
        const key = String(row.lead_id ?? row.leadId);
        if (idSet.has(key)) {
          map[key] = mapSqlRowToSeguimiento(row);
        }
      }
      return map;
    }

    if (idOperador == null) {
      const globalRows = await queryUltimosGlobalRows();
      if (globalRows != null) {
        for (const row of globalRows) {
          const key = String(row.lead_id ?? row.leadId);
          if (idSet.has(key)) map[key] = mapSqlRowToSeguimiento(row);
        }
        return map;
      }
    }

    if (seguimientoSoloSp()) return map;

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
        map[String(row.lead_id)] = mapSqlRowToSeguimiento(row);
      }
    }
  } catch (error) {
    if (isSeguimientoDegraded(error)) {
      warnSeguimientoLecturaDegradada(error);
      return {};
    }
    throw error;
  }
  return map;
}

export async function listHistorialSeguimientoSql(leadId, lead = {}, { limit = 50, idOperador = null } = {}) {
  try {
    const rows = await queryHistorialRows(leadId, limit, idOperador);
    return rows.map((row) => mapSqlRowToHistorialEntry(row, lead));
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
  let prev = useSeguimientoSql()
    ? await getLatestSeguimientoSql(leadId, idOperador)
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
