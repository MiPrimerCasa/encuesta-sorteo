import sql from 'mssql';
import {
  fetchEncuestasMuestraRaw,
  listLeadsFromEncuestas,
  normalizeNombre,
  resolveCodigoCargaPorPromotor,
  resolveDireccionOficinasSupervisor,
} from './encuestas.js';
import {
  esCodigoUsuarioCargaValido,
  extraerCodigoPromotorDesdeFilaEncuesta,
  normalizarEncuestaCargaId,
} from './codigo-promotor.js';
import { resolveCodigoCargaOperador } from './operadores-catalog.js';
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

export class CodigoPromotorCargaError extends Error {
  constructor() {
    super(
      'No se encontró el código de promotor (ej. SORTEO01S21P01) para registrar la encuesta. Volvé a iniciar sesión o elegí otro promotor.',
    );
    this.name = 'CodigoPromotorCargaError';
    this.code = 'CODIGO_PROMOTOR_CARGA';
    this.status = 400;
  }
}

export class CargaEncuestaSinPersistirError extends Error {
  constructor(detail) {
    super(
      'La carga no quedó registrada en la base. Verificá el teléfono y volvé a cargar; si persiste, contactá soporte.',
    );
    this.name = 'CargaEncuestaSinPersistirError';
    this.code = 'CARGA_SIN_PERSISTIR';
    this.status = 502;
    this.detail = detail;
  }
}

function pickField(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const name of candidates) {
    const key = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (key == null) continue;
    const val = row[key];
    if (val === 0 || val === '0') return val;
    if (val != null && val !== '') return val;
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
  const raw = process.env.ENCUESTA_CARGA_ID || process.env.ENCUESTA_ID || 'sorteo01';
  return normalizarEncuestaCargaId(raw);
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

/** Clave única encuesta: @telefono + @encuesta. El SP devuelve codigo=0 o gestionCodigo=0 si ya existe. */
function valorIndicaDuplicado(val) {
  return val === 0 || val === '0';
}

function filaTieneCampoEnCero(row, ...nombres) {
  const keys = Object.keys(row);
  for (const name of nombres) {
    const key = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (key == null) continue;
    const val = row[key];
    if (val === 0 || val === '0') return true;
  }
  return false;
}

function cargaRetornoIndicaDuplicado(result) {
  const rows = result?.recordset ?? [];
  for (const row of rows) {
    if (filaTieneCampoEnCero(row, 'codigo', 'Codigo', 'CODIGO')) return true;
    if (filaTieneCampoEnCero(row, 'gestionCodigo', 'GestionCodigo', 'GESTIONCODIGO')) return true;
  }
  return false;
}

function cargaRetornoIndicaExito(result) {
  const rows = result?.recordset ?? [];
  if (!rows.length) return true;
  for (const row of rows) {
    const codigo = pickField(row, 'codigo', 'Codigo', 'CODIGO');
    const gestionCodigo = pickField(row, 'gestionCodigo', 'GestionCodigo', 'GESTIONCODIGO');
    if (codigo != null && Number(codigo) > 0) return true;
    if (gestionCodigo != null && Number(gestionCodigo) > 0) return true;
  }
  return false;
}

function codigoDesdeFilasEncuesta(rows, nombrePromotor, idVendedor) {
  return resolveCodigoCargaPorPromotor(rows, nombrePromotor, idVendedor);
}

/**
 * @usuario del SP = código promotor (SORTEO01_V1), no el email de login.
 */
export function resolveUsuarioSpCarga(usuarioSesion, context, payload) {
  const explicito = payload.promotorCodigo?.trim();
  if (esCodigoUsuarioCargaValido(explicito)) return explicito;

  const sesionCodigo = usuarioSesion.codigoCarga?.trim();
  if (esCodigoUsuarioCargaValido(sesionCodigo)) return sesionCodigo;

  const desdeCatalogo = resolveCodigoCargaOperador(usuarioSesion, context.rows);
  if (esCodigoUsuarioCargaValido(desdeCatalogo)) return desdeCatalogo;

  if (usuarioSesion.rol === 'promotor') {
    const desdeFilas = codigoDesdeFilasEncuesta(
      context.rows,
      usuarioSesion.nombre,
      usuarioSesion.idOperador ?? usuarioSesion.id,
    );
    if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;
    throw new CodigoPromotorCargaError();
  }

  if (usuarioSesion.rol === 'supervisor') {
    const desdeFilas = codigoDesdeFilasEncuesta(
      context.rows,
      usuarioSesion.nombre,
      usuarioSesion.idOperador ?? usuarioSesion.id,
    );
    if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;
    throw new CodigoPromotorCargaError();
  }

  return null;
}

export async function resolveCargaEncuestaContext(usuarioSesion) {
  const rows = await fetchEncuestasMuestraRaw(usuarioSesion);
  const supervisorNombre =
    usuarioSesion.rol === 'promotor'
      ? pickField(rows[0], 'supervisor', 'Supervisor')
      : null;

  return {
    rows,
    supervisorNombre,
    direccionOficinas: resolveDireccionOficinasSupervisor(rows),
  };
}

function bindCampo(request, codigo, valor, { vacioComoCadenaVacia = false } = {}) {
  request.input(`campo${codigo}Codigo`, sql.Int, codigo);
  let v;
  if (valor == null || valor === '') {
    v = vacioComoCadenaVacia ? '' : null;
  } else {
    v = String(valor);
  }
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
  bindCampo(request, 6, params.campo6Valor, { vacioComoCadenaVacia: true });
  bindCampo(request, 7, params.campo7Valor, { vacioComoCadenaVacia: true });
  bindCampo(request, 8, params.campo8Valor, { vacioComoCadenaVacia: true });

  if (includeOrigenParam()) {
    request.input('origen', sql.Int, params.origen ?? 2);
  }

  const result = await request.execute(proc);
  if (process.env.DEBUG_CARGA_ENCUESTA === '1') {
    console.info('[encuestaCarga] returnValue=%s rows=%s', result.returnValue, JSON.stringify(result.recordset));
  }
  if (cargaRetornoIndicaDuplicado(result)) {
    throw new ContactoYaRegistradoError();
  }
  return result;
}

export function buildCargaParamsFromPayload(payload, usuarioSesion, context) {
  const agendar = Boolean(payload.agendarEntrevista);
  const usuarioSp = resolveUsuarioSpCarga(usuarioSesion, context, payload);

  const campo6 = agendar ? formatHorarioEntrevistaSp(payload.horarioEntrevista) : null;
  const campo7 = agendar ? mapLugarEntrevistaSp(payload.lugarEntrevista) : null;

  const promotorNombreFiltro =
    payload.promotorNombre?.trim() ||
    (usuarioSesion.rol === 'promotor' || usuarioSesion.rol === 'supervisor'
      ? usuarioSesion.nombre
      : null);

  let campo8 = null;
  if (agendar && payload.lugarEntrevista === 'domicilio') {
    campo8 = payload.domicilioEntrevista?.trim() || payload.domicilio?.trim() || null;
  } else if (agendar && payload.lugarEntrevista === 'sucursal') {
    campo8 =
      payload.domicilioEntrevista?.trim() ||
      resolveDireccionOficinasSupervisor(context.rows, {
        promotorNombre: promotorNombreFiltro,
      }) ||
      context.direccionOficinas ||
      null;
  }

  const telefonoNorm = digitsTelefono(payload.telefono) || payload.telefono.trim();

  return {
    telefono: telefonoNorm,
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

  throw new CargaEncuestaSinPersistirError(
    'SP ejecutado pero el contacto no aparece en encuestasMuestraOperador (teléfono o permisos).',
  );
}

/** Pre-chequeo opcional por teléfono en el listado actual. */
export function telefonoYaEnListado(leads, telefono) {
  const d = digitsTelefono(telefono);
  if (!d) return false;
  return leads.some((l) => digitsTelefono(l.telefono) === d);
}

export { MSG_CONTACTO_YA_REGISTRADO };
