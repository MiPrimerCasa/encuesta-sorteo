import sql from 'mssql';
import {
  fetchEncuestasMuestraRaw,
  listLeadsFromEncuestas,
  normalizeNombre,
} from './encuestas.js';
import { getSqlPoolEncuestas } from './mssql.js';

const MSG_CONTACTO_YA_REGISTRADO = 'Este contacto ya está registrado.';

export class ContactoYaRegistradoError extends Error {
  constructor() {
    super(MSG_CONTACTO_YA_REGISTRADO);
    this.name = 'ContactoYaRegistradoError';
    this.code = 'CONTACTO_YA_REGISTRADO';
    this.status = 409;
  }
}

function pickField(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const name of candidates) {
    const key = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

function getCargaProcedureName() {
  const raw = process.env.SP_CARGA_ENCUESTA || 'encuestaCargaSorteo01';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function includeOrigenParam() {
  return String(process.env.SP_CARGA_INCLUDE_ORIGEN ?? process.env.SP_INCLUDE_ORIGEN ?? 'true')
    .trim()
    .toLowerCase() !== 'false';
}

function getEncuestaCampaniaId() {
  return String(process.env.ENCUESTA_CARGA_ID || process.env.ENCUESTA_ID || 'sorteo01').trim();
}

/** Formato SP: AAAA/MM/DD hh:mm */
export function formatHorarioEntrevistaSp(horarioLocal) {
  if (!horarioLocal) return null;
  const texto = String(horarioLocal).trim();
  const slash = texto.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (slash) return `${slash[1]}/${slash[2]}/${slash[3]} ${slash[4]}:${slash[5]}`;
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}/${iso[2]}/${iso[3]} ${iso[4]}:${iso[5]}`;
  return null;
}

function mapLugarEntrevistaSp(lugar) {
  if (lugar === 'sucursal') return '2';
  if (lugar === 'domicilio') return '3';
  return null;
}

function digitsTelefono(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

function cargaRetornoIndicaDuplicado(result) {
  if (result?.returnValue === 0) return true;
  const rows = result?.recordset ?? [];
  if (!rows.length) return false;
  const row = rows[0];
  for (const val of Object.values(row)) {
    if (val === 0 || val === '0') return true;
  }
  const keys = Object.keys(row);
  for (const k of keys) {
    if (/resultado|return|codigo|code|ok|exito|éxito/i.test(k)) {
      const v = row[k];
      if (v === 0 || v === '0' || String(v).toLowerCase() === 'false') return true;
    }
  }
  return false;
}

/**
 * Contexto para encuestaCargaSorteo01 desde sesión + filas del SP de muestra.
 * - Supervisor: @usuario = null
 * - Promotor: @usuario = loginId (codigo operador, ej. SORTEO01_V1)
 */
export async function resolveCargaEncuestaContext(usuarioSesion) {
  const rows = await fetchEncuestasMuestraRaw(usuarioSesion);
  let usuarioCodigo = null;
  let supervisorNombre = null;

  if (usuarioSesion.rol === 'promotor') {
    usuarioCodigo =
      usuarioSesion.loginId?.trim() ||
      pickField(rows[0], 'usuario', 'Usuario') ||
      null;
    supervisorNombre = pickField(rows[0], 'supervisor', 'Supervisor');
  }

  return { rows, usuarioCodigo, supervisorNombre };
}

function bindCampo(request, codigo, valor) {
  request.input(`campo${codigo}Codigo`, sql.Int, codigo);
  const v = valor == null || valor === '' ? null : String(valor);
  request.input(`campo${codigo}Valor`, sql.NVarChar(200), v);
}

/**
 * exec dbo.encuestaCargaSorteo01 — primer POST (campo5 = NO; 6–8 vacíos salvo entrevista agendada).
 */
export async function execEncuestaCargaSorteo01(params) {
  const pool = await getSqlPoolEncuestas();
  const proc = getCargaProcedureName();
  const request = pool.request();

  request.input('telefono', sql.NVarChar(50), params.telefono);
  request.input('encuesta', sql.NVarChar(50), params.encuesta);
  request.input('usuario', sql.NVarChar(100), params.usuario);

  bindCampo(request, 1, params.campo1Valor);
  bindCampo(request, 2, params.campo2Valor);
  bindCampo(request, 3, params.campo3Valor);
  bindCampo(request, 4, params.campo4Valor);
  bindCampo(request, 5, 'NO');
  bindCampo(request, 6, params.campo6Valor);
  bindCampo(request, 7, params.campo7Valor);
  bindCampo(request, 8, params.campo8Valor);

  if (includeOrigenParam()) {
    request.input('origen', sql.Int, params.origen ?? 2);
  }

  const result = await request.execute(proc);
  if (cargaRetornoIndicaDuplicado(result)) {
    throw new ContactoYaRegistradoError();
  }
  return result;
}

export function buildCargaParamsFromPayload(payload, usuarioSesion, context) {
  const agendar = Boolean(payload.agendarEntrevista);
  let usuarioSp = null;

  if (usuarioSesion.rol === 'promotor') {
    usuarioSp = context.usuarioCodigo;
  } else if (usuarioSesion.rol === 'supervisor') {
    usuarioSp = null;
  }

  const campo6 = agendar ? formatHorarioEntrevistaSp(payload.horarioEntrevista) : null;
  const campo7 = agendar ? mapLugarEntrevistaSp(payload.lugarEntrevista) : null;
  const campo8 =
    agendar && payload.lugarEntrevista === 'domicilio'
      ? payload.domicilioEntrevista?.trim() || payload.domicilio?.trim() || null
      : agendar && payload.lugarEntrevista === 'sucursal'
        ? null
        : null;

  return {
    telefono: payload.telefono.trim(),
    encuesta: getEncuestaCampaniaId(),
    usuario: usuarioSp,
    campo1Valor: payload.nombre.trim(),
    campo2Valor: payload.domicilio?.trim() || null,
    campo3Valor: null,
    campo4Valor: null,
    campo6Valor: campo6,
    campo7Valor: campo7,
    campo8Valor: campo8,
    origen: 2,
  };
}

export async function crearEncuestaManual(payload, usuarioSesion, opciones = {}) {
  const context = await resolveCargaEncuestaContext(usuarioSesion);
  const cargaParams = buildCargaParamsFromPayload(payload, usuarioSesion, context);

  await execEncuestaCargaSorteo01(cargaParams);

  const leads = await listLeadsFromEncuestas(usuarioSesion);
  const telObjetivo = digitsTelefono(payload.telefono);
  const lead =
    leads.find((l) => digitsTelefono(l.telefono) === telObjetivo) ??
    leads.find((l) => normalizeNombre(l.nombre) === normalizeNombre(payload.nombre));

  if (lead) return lead;

  return {
    id: `manual-${Date.now()}`,
    nombre: payload.nombre.trim(),
    telefono: payload.telefono.trim(),
    promotorId: payload.promotorId,
    promotorNombre: opciones.promotorNombre ?? usuarioSesion.nombre,
    supervisorNombre:
      usuarioSesion.rol === 'promotor' ? context.supervisorNombre ?? undefined : undefined,
    domicilio: payload.domicilio,
    quiereEntrevista: Boolean(payload.agendarEntrevista),
    horarioEntrevista: payload.horarioEntrevista,
    lugarEntrevista: payload.lugarEntrevista,
    domicilioEntrevista: payload.domicilioEntrevista,
    lista: payload.agendarEntrevista ? 'entrevista' : 'contacto',
    fechaObtencion: new Date().toISOString().slice(0, 10),
    fechaAlta: new Date().toISOString(),
    seguimiento: { fuente: 'app' },
  };
}

/** Pre-chequeo opcional por teléfono en el listado actual. */
export function telefonoYaEnListado(leads, telefono) {
  const d = digitsTelefono(telefono);
  if (!d) return false;
  return leads.some((l) => digitsTelefono(l.telefono) === d);
}

export { MSG_CONTACTO_YA_REGISTRADO };
