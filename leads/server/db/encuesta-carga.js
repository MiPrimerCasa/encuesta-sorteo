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
import {
  codigoEnFilasDelPromotor,
  enriquecerUsuarioConCodigoCarga,
  idVendedorOperador,
  resolveCodigoCargaOperador,
  resolveCodigoCargaPromotorStrict,
} from './operadores-catalog.js';
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

export class LeadNoEncontradoError extends Error {
  constructor() {
    super('No se encontró el lead en tu listado.');
    this.name = 'LeadNoEncontradoError';
    this.code = 'LEAD_NO_ENCONTRADO';
    this.status = 404;
  }
}

export class LeadNoManualError extends Error {
  constructor() {
    super('Solo podés modificar el teléfono de leads cargados manualmente desde la app.');
    this.name = 'LeadNoManualError';
    this.code = 'LEAD_NO_MANUAL';
    this.status = 403;
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

function getModificarProcedureName() {
  const raw = process.env.SP_MODIFICAR_ENCUESTA || 'encuestaSorteo01Update';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function siNoDesdeTriState(val) {
  if (val === true) return 'SI';
  if (val === false) return 'NO';
  return null;
}

function interpretarRetornoModificarEncuesta(result) {
  const row = result?.recordset?.[0];
  const codigo = pickField(row, 'codigo', 'Codigo', 'CODIGO');
  const mensaje = String(
    pickField(row, 'mensaje', 'Mensaje', 'gestionDescripcion', 'GestionDescripcion') ?? '',
  );

  if (codigo === 0 || codigo === '0') {
    if (/no existe/i.test(mensaje)) throw new LeadNoEncontradoError();
    if (/registrado|duplicado|ya se ha/i.test(mensaje)) {
      throw new ContactoYaRegistradoError();
    }
    throw new CargaEncuestaSinPersistirError(mensaje || 'No se pudo modificar el lead.', mensaje);
  }

  if (codigo != null && Number(codigo) <= 0) {
    throw new CargaEncuestaSinPersistirError(mensaje || 'No se pudo modificar el lead.', mensaje);
  }

  return result;
}

function includeOrigenParam() {
  return String(process.env.SP_CARGA_INCLUDE_ORIGEN ?? process.env.SP_INCLUDE_ORIGEN ?? 'true')
    .trim()
    .toLowerCase() !== 'false';
}

export function getEncuestaCampaniaId() {
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

export { digitsTelefono };

/**
 * Clave única encuesta: @telefono + @encuesta.
 * Con @origen = '2' (app manual) el SP actualiza y devuelve gestionCodigo = 1.
 * Sin origen 2, duplicado → gestionCodigo = 0.
 */
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
  const idV = idVendedorOperador(usuarioSesion);
  const explicito = payload.promotorCodigo?.trim();

  if (usuarioSesion.rol === 'promotor') {
    const desdeFilas = codigoDesdeFilasEncuesta(
      context.rows,
      usuarioSesion.nombre,
      idV,
    );
    if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;

    if (
      esCodigoUsuarioCargaValido(explicito) &&
      codigoEnFilasDelPromotor(explicito, context.rows, idV)
    ) {
      return explicito;
    }

    const strict = resolveCodigoCargaPromotorStrict(usuarioSesion, context.rows);
    if (esCodigoUsuarioCargaValido(strict)) return strict;

    if (esCodigoUsuarioCargaValido(explicito) && !context.rows?.length) {
      return explicito;
    }

    throw new CodigoPromotorCargaError();
  }

  if (esCodigoUsuarioCargaValido(explicito)) return explicito;

  const sesionCodigo = usuarioSesion.codigoCarga?.trim();
  if (esCodigoUsuarioCargaValido(sesionCodigo)) return sesionCodigo;

  const desdeCatalogo = resolveCodigoCargaOperador(usuarioSesion, context.rows);
  if (esCodigoUsuarioCargaValido(desdeCatalogo)) return desdeCatalogo;

  if (usuarioSesion.rol === 'supervisor') {
    const desdeFilas = codigoDesdeFilasEncuesta(
      context.rows,
      usuarioSesion.nombre,
      idV,
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
 * exec dbo.encuestaCargaSorteo01 — carga manual (@origen = 2).
 */
export async function execEncuestaCargaSorteo01(params) {
  const pool = await getSqlPoolEncuestas();
  const proc = getCargaProcedureName();
  const request = pool.request();

  const telefonoSp =
    digitsTelefono(params.telefono) || String(params.telefono ?? '').trim();
  request.input('telefono', sql.NVarChar(50), telefonoSp);
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
    const origen = String(params.origen ?? 2).trim().charAt(0) || '2';
    request.input('origen', sql.Char(1), origen);
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

/**
 * exec dbo.encuestaSorteo01Update — modificar lead manual existente (teléfono y campos).
 * SP anterior: encuestaModificarSorteo01 (@idEncuesta). Nuevo: @id + @origen.
 */
export async function execEncuestaSorteo01Update(params) {
  const pool = await getSqlPoolEncuestas();
  const proc = getModificarProcedureName();
  const request = pool.request();

  const idEncuesta = Number.parseInt(String(params.idEncuesta ?? params.id), 10);
  if (!Number.isFinite(idEncuesta) || idEncuesta <= 0) {
    throw new LeadNoEncontradoError();
  }

  request.input('id', sql.Int, idEncuesta);

  const telefonoSp =
    digitsTelefono(params.telefono) || String(params.telefono ?? '').trim();
  request.input('telefono', sql.NVarChar(50), telefonoSp);
  request.input('encuesta', sql.NVarChar(50), params.encuesta);
  request.input('usuario', sql.NVarChar(100), params.usuario);

  const origen = String(params.origen ?? 2).trim().charAt(0) || '2';
  request.input('origen', sql.Char(1), origen);

  bindCampo(request, 1, params.campo1Valor);
  bindCampo(request, 2, params.campo2Valor);
  bindCampo(request, 3, params.campo3Valor);
  bindCampo(request, 4, params.campo4Valor);
  bindCampo(request, 5, params.campo5Valor ?? 'NO');
  bindCampo(request, 6, params.campo6Valor, { vacioComoCadenaVacia: true });
  bindCampo(request, 7, params.campo7Valor, { vacioComoCadenaVacia: true });
  bindCampo(request, 8, params.campo8Valor, { vacioComoCadenaVacia: true });

  const result = await request.execute(proc);
  if (process.env.DEBUG_CARGA_ENCUESTA === '1') {
    console.info('[encuestaUpdate] SP=%s rows=%s', proc, JSON.stringify(result.recordset));
  }
  return interpretarRetornoModificarEncuesta(result);
}

/** @deprecated Alias — usar execEncuestaSorteo01Update */
export const execEncuestaModificarSorteo01 = execEncuestaSorteo01Update;

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

/** Parámetros SP desde un lead existente — mapeo a @campo1Valor…@campo8Valor del SP. */
export function buildCargaParamsFromLead(lead, telefonoNuevo, usuarioSp) {
  const agendar = Boolean(lead.horarioEntrevista || lead.quiereEntrevista);
  const campo6 = lead.horarioEntrevista
    ? formatHorarioEntrevistaSp(lead.horarioEntrevista)
    : null;
  const campo7 = lead.lugarEntrevista ? mapLugarEntrevistaSp(lead.lugarEntrevista) : null;
  let campo8 = lead.domicilioEntrevista?.trim() || null;
  if (!campo8 && lead.lugarEntrevista === 'domicilio') {
    campo8 = lead.domicilio?.trim() || null;
  }

  const telefonoNorm =
    digitsTelefono(telefonoNuevo) || String(telefonoNuevo ?? '').trim();
  const telefonoAnterior =
    digitsTelefono(lead.telefono) || String(lead.telefono ?? '').trim();

  const usuario =
    usuarioSp ||
    lead.codigoPromotorCarga?.trim() ||
    lead.encuestaUsuario?.trim() ||
    null;

  return {
    telefono: telefonoNorm,
    telefonoAnterior,
    encuesta: lead.codigoCampania || getEncuestaCampaniaId(),
    usuario,
    // @campo1 = apellido y nombres (SP encuestaCargaSorteo01)
    campo1Valor: lead.nombre?.trim() || null,
    // @campo2 = dirección
    campo2Valor: lead.domicilio?.trim() || null,
    campo3Valor: siNoDesdeTriState(lead.conoceMpc),
    campo4Valor: siNoDesdeTriState(lead.sabiaPlanInversionJoven),
    campo5Valor: lead.quiereEntrevista ? 'SI' : 'NO',
    // @campo6 / @campo7 / @campo8 — entrevista (si aplica)
    campo6Valor: campo6,
    campo7Valor: campo7,
    campo8Valor: campo8,
    origen: 2,
  };
}

function buscarLeadTrasCarga(leads, payload, encCarga) {
  const telObjetivo = digitsTelefono(payload.telefono);
  return (
    leads.find(
      (l) =>
        digitsTelefono(l.telefono) === telObjetivo &&
        normalizarEncuestaCargaId(l.codigoCampania || encCarga) === encCarga,
    ) ??
    leads.find((l) => normalizeNombre(l.nombre) === normalizeNombre(payload.nombre))
  );
}

export async function crearEncuestaManual(payload, usuarioSesion, opciones = {}) {
  const context = await resolveCargaEncuestaContext(usuarioSesion);
  const usuario = enriquecerUsuarioConCodigoCarga(usuarioSesion, context.rows);
  const cargaParams = buildCargaParamsFromPayload(payload, usuario, context);
  const idListado = idVendedorOperador(usuario);

  const leadsPrevios = await listLeadsFromEncuestas(usuario);
  const yaExistia = telefonoYaEnCampania(
    leadsPrevios,
    payload.telefono,
    cargaParams.encuesta,
  );

  await execEncuestaCargaSorteo01(cargaParams);

  const leads = await listLeadsFromEncuestas(usuario);
  const lead = buscarLeadTrasCarga(leads, payload, cargaParams.encuesta);
  if (lead) {
    return { lead, actualizado: yaExistia };
  }

  const detalle = `SP ok @usuario=${cargaParams.usuario}, encuesta=${cargaParams.encuesta}, tel=${cargaParams.telefono}, listado @idVendedor=${idListado}, actualizado=${yaExistia}.`;

  if (usuario.rol === 'promotor') {
    throw new CargaEncuestaSinPersistirError(
      yaExistia
        ? 'El contacto se actualizó en el sorteo pero no aparece en tu bandeja. Probable código promotor incorrecto — tu supervisor puede verlo.'
        : 'La encuesta se guardó pero no aparece en tu bandeja. Verificá con soporte que tu código promotor (QR) sea el correcto.',
      detalle,
    );
  }

  throw new CargaEncuestaSinPersistirError(
    'SP ejecutado pero el contacto no aparece en encuestasMuestraOperador (teléfono o permisos).',
    detalle,
  );
}

/** Duplicado = mismo teléfono en la misma campaña (`encuesta`). */
export function telefonoYaEnCampania(leads, telefono, encuesta) {
  const d = digitsTelefono(telefono);
  const enc = normalizarEncuestaCargaId(encuesta);
  if (!d || !enc) return false;
  return leads.some((l) => {
    if (digitsTelefono(l.telefono) !== d) return false;
    const encLead = l.codigoCampania
      ? normalizarEncuestaCargaId(l.codigoCampania)
      : normalizarEncuestaCargaId('sorteo01');
    return encLead === enc;
  });
}

/** @deprecated Usar telefonoYaEnCampania con getEncuestaCampaniaId(). */
export function telefonoYaEnListado(leads, telefono) {
  return telefonoYaEnCampania(leads, telefono, getEncuestaCampaniaId());
}

function leadEsCargaManualServidor(lead) {
  if (lead?.seguimiento?.fuente === 'app') return true;
  const raw = String(lead?.origenEncuesta ?? '').trim().toLowerCase();
  return raw === '2' || raw.includes('manual') || raw.includes('app');
}

/**
 * Modifica teléfono de un lead manual vía dbo.encuestaSorteo01Update.
 */
export async function modificarTelefonoLeadManual(leadId, telefonoNuevo, usuarioSesion) {
  const idEncuesta = Number.parseInt(String(leadId), 10);
  if (!Number.isFinite(idEncuesta) || idEncuesta <= 0) {
    throw new LeadNoEncontradoError();
  }

  const context = await resolveCargaEncuestaContext(usuarioSesion);
  const usuario = enriquecerUsuarioConCodigoCarga(usuarioSesion, context.rows);
  const leads = await listLeadsFromEncuestas(usuario);
  const lead = leads.find((l) => String(l.id) === String(leadId));
  if (!lead) throw new LeadNoEncontradoError();
  if (!leadEsCargaManualServidor(lead)) throw new LeadNoManualError();

  const telefonoNorm =
    digitsTelefono(telefonoNuevo) || String(telefonoNuevo ?? '').trim();
  const encuesta = lead.codigoCampania || getEncuestaCampaniaId();

  if (digitsTelefono(lead.telefono) === telefonoNorm) {
    return lead;
  }

  const otros = leads.filter((l) => String(l.id) !== String(leadId));
  if (telefonoYaEnCampania(otros, telefonoNorm, encuesta)) {
    throw new ContactoYaRegistradoError();
  }

  const usuarioSp =
    lead.codigoPromotorCarga?.trim() ||
    lead.encuestaUsuario?.trim() ||
    resolveCodigoCargaOperador(usuario, context.rows) ||
    null;
  if (!usuarioSp) throw new CodigoPromotorCargaError();

  const cargaParams = buildCargaParamsFromLead(lead, telefonoNorm, usuarioSp);
  const telefonoAnterior = cargaParams.telefonoAnterior;
  const cambiaTelefono =
    Boolean(telefonoAnterior) && telefonoAnterior !== telefonoNorm;

  await execEncuestaSorteo01Update({
    ...cargaParams,
    telefono: telefonoNorm,
    idEncuesta,
  });

  const leadsPost = await listLeadsFromEncuestas(usuario);
  const porId = leadsPost.find((l) => String(l.id) === String(leadId));
  if (porId && digitsTelefono(porId.telefono) === telefonoNorm) return porId;

  const porTel = leadsPost.find(
    (l) =>
      digitsTelefono(l.telefono) === telefonoNorm &&
      normalizarEncuestaCargaId(l.codigoCampania || encuesta) ===
        normalizarEncuestaCargaId(encuesta),
  );

  if (cambiaTelefono && porTel && String(porTel.id) !== String(leadId)) {
    throw new CargaEncuestaSinPersistirError(
      'Se creó un registro duplicado en lugar de actualizar el teléfono. Verificá encuestaSorteo01Update en STRSYSTEM.',
      `idOriginal=${leadId}, idNuevo=${porTel.id}, telAnterior=${telefonoAnterior}, telNuevo=${telefonoNorm}`,
    );
  }

  if (cambiaTelefono && porId && digitsTelefono(porId.telefono) === telefonoAnterior) {
    throw new CargaEncuestaSinPersistirError(
      'El SP no actualizó el teléfono. Verificá SP_MODIFICAR_ENCUESTA=encuestaSorteo01Update.',
      `id=${leadId}, telAnterior=${telefonoAnterior}, telNuevo=${telefonoNorm}`,
    );
  }

  if (porTel) return porTel;

  throw new CargaEncuestaSinPersistirError(
    'El SP ejecutó pero el teléfono no aparece actualizado. Verificá SP_MODIFICAR_ENCUESTA=encuestaSorteo01Update.',
    `SP ok leadId=${leadId}, telAnterior=${cargaParams.telefonoAnterior}, telNuevo=${telefonoNorm}`,
  );
}

export { MSG_CONTACTO_YA_REGISTRADO };
