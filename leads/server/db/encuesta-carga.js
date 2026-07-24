import sql from 'mssql';
import {
  fetchEncuestaRowsParaUsuario,
  fetchEncuestasMuestraRaw,
  listLeadsFromEncuestas,
  normalizeNombre,
  promotorTieneFilasEnMuestra,
  resolveCodigoCargaPorPromotor,
  resolveDireccionOficinasSupervisor,
  listAllLeadsFromEncuestas,
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
  loadOperadoresCatalogAsync,
  nombresCoinciden,
  resolveCodigoCargaOperador,
  resolveCodigoCargaPromotorStrict,
} from './operadores-catalog.js';
import { getSqlPoolEncuestas } from './mssql.js';
import { resetearSeguimientoLead } from './seguimiento-sql.js';

const MSG_CONTACTO_YA_REGISTRADO = 'Este número ya se encuentra registrado en el sistema.';

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
  constructor(detail, technicalDetail) {
    super(
      'La carga no quedó registrada en la base. Verificá el teléfono y volvé a cargar; si persiste, contactá soporte.',
    );
    this.name = 'CargaEncuestaSinPersistirError';
    this.code = 'CARGA_SIN_PERSISTIR';
    this.status = 502;
    this.detail = detail;
    this.technicalDetail = technicalDetail;
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

export function digitsTelefono(raw) {
  const str = String(raw ?? '').trim();
  const match = str.match(/^(.+?)(_dup[a-z]+)$/i);
  if (match) {
    return match[1].replace(/\D/g, '') + match[2].toLowerCase();
  }
  return str.replace(/\D/g, '');
}

export function telefonosCoinciden(tel1, tel2) {
  const d1 = digitsTelefono(tel1);
  const d2 = digitsTelefono(tel2);
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  if (d1.length >= 10 && d2.length >= 10) {
    return d1.slice(-10) === d2.slice(-10);
  }
  if (d1.length >= 8 && d2.length >= 8) {
    return d1.slice(-8) === d2.slice(-8);
  }
  return false;
}

export function normalizarTelefonoCarga(telefono) {
  let d = digitsTelefono(telefono);
  if (!d) return '';

  // 1. Remove Argentine mobile prefix '15' if it's there
  if (d.length === 12 && d.includes('15')) {
    const idx = d.indexOf('15');
    if (idx >= 2 && idx <= 4) {
      d = d.slice(0, idx) + d.slice(idx + 2);
    }
  } else if (d.length === 11 && d.startsWith('15')) {
    d = d.slice(2);
  }

  // 2. If it starts with 549, keep it
  if (d.startsWith('549') && d.length === 13) {
    return d;
  }

  // 3. If it starts with 54 but is missing the '9'
  if (d.startsWith('54') && d.length === 12) {
    return '549' + d.slice(2);
  }

  // 4. If it has 10 digits
  if (d.length === 10) {
    return '549' + d;
  }

  // 5. If it starts with 0 and has 11 digits
  if (d.startsWith('0') && d.length === 11) {
    return '549' + d.slice(1);
  }

  return d;
}

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
  const rowsEfectivas =
    usuarioSesion.rol === 'promotor' && !promotorTieneFilasEnMuestra(context.rows, idV)
      ? []
      : context.rows;

  if (usuarioSesion.rol === 'promotor') {
    const desdeFilas = codigoDesdeFilasEncuesta(
      rowsEfectivas,
      usuarioSesion.nombre,
      idV,
    );
    if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;

    if (
      esCodigoUsuarioCargaValido(explicito) &&
      codigoEnFilasDelPromotor(explicito, rowsEfectivas, idV)
    ) {
      return explicito;
    }

    const strict = resolveCodigoCargaPromotorStrict(usuarioSesion, rowsEfectivas);
    if (esCodigoUsuarioCargaValido(strict)) return strict;

    if (esCodigoUsuarioCargaValido(explicito)) return explicito;

    throw new CodigoPromotorCargaError();
  }

  if (esCodigoUsuarioCargaValido(explicito)) return explicito;

  const sesionCodigo = usuarioSesion.codigoCarga?.trim();
  if (esCodigoUsuarioCargaValido(sesionCodigo)) return sesionCodigo;

  const desdeCatalogo = resolveCodigoCargaOperador(usuarioSesion, rowsEfectivas);
  if (esCodigoUsuarioCargaValido(desdeCatalogo)) return desdeCatalogo;

  if (usuarioSesion.rol === 'supervisor') {
    const desdeFilas = codigoDesdeFilasEncuesta(
      rowsEfectivas,
      usuarioSesion.nombre,
      idV,
    );
    if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;
    throw new CodigoPromotorCargaError();
  }

  return null;
}

export async function resolveCargaEncuestaContext(usuarioSesion) {
  await loadOperadoresCatalogAsync();
  const rows = await fetchEncuestaRowsParaUsuario(usuarioSesion);
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
    campo3Valor: siNoDesdeTriState(payload.conoceMpc),
    campo4Valor: siNoDesdeTriState(payload.sabiaPlanInversionJoven),
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
  return (
    leads.find(
      (l) =>
        telefonosCoinciden(l.telefono, payload.telefono) &&
        normalizarEncuestaCargaId(l.codigoCampania || encCarga) === encCarga,
    ) ??
    leads.find((l) => nombresCoinciden(l.nombre, payload.nombre))
  );
}

export async function crearEncuestaManual(payload, usuarioSesion, opciones = {}) {
  const telefonoNormalizado = normalizarTelefonoCarga(payload.telefono);
  const payloadNormalizado = { ...payload, telefono: telefonoNormalizado };

  const context = await resolveCargaEncuestaContext(usuarioSesion);
  const usuario = enriquecerUsuarioConCodigoCarga(usuarioSesion, context.rows);
  const cargaParams = buildCargaParamsFromPayload(payloadNormalizado, usuario, context);
  const idListado = idVendedorOperador(usuario);

  const leadsPrevios = await listLeadsFromEncuestas(usuario);
  const yaExistia = telefonoYaEnCampania(
    leadsPrevios,
    payloadNormalizado.telefono,
    cargaParams.encuesta,
  );

  if (yaExistia) {
    throw new ContactoYaRegistradoError();
  }

  await execEncuestaCargaSorteo01(cargaParams);

  const leads = await listLeadsFromEncuestas(usuario);
  const lead = buscarLeadTrasCarga(leads, payloadNormalizado, cargaParams.encuesta);
  if (lead) {
    return {
      lead: {
        ...lead,
        conoceMpc: payloadNormalizado.conoceMpc ?? lead.conoceMpc ?? null,
        sabiaPlanInversionJoven:
          payloadNormalizado.sabiaPlanInversionJoven ?? lead.sabiaPlanInversionJoven ?? null,
      },
      actualizado: yaExistia,
    };
  }

  const detalle = `SP ok @usuario=${cargaParams.usuario}, encuesta=${cargaParams.encuesta}, tel=${cargaParams.telefono}, listado @idVendedor=${idListado}, actualizado=${yaExistia}.`;

  if (usuario.rol === 'promotor') {
    throw new CargaEncuestaSinPersistirError(
      yaExistia
        ? 'El contacto se actualizó en el sorteo pero no aparece en tu bandeja. Probable código promotor incorrecto — tu supervisor puede verlo.'
        : 'El contacto ya se encuentra registrado por otro operador/equipo, o no tenés permisos para visualizarlo (verificá que tu código de promotor sea el correcto).',
      detalle,
    );
  }

  throw new CargaEncuestaSinPersistirError(
    'El contacto ya se encuentra registrado por otro operador o equipo (no tenés permisos para visualizarlo en tu bandeja).',
    detalle,
  );
}

/** Duplicado = mismo teléfono en la misma campaña (`encuesta`). */
export function telefonoYaEnCampania(leads, telefono, encuesta) {
  const enc = normalizarEncuestaCargaId(encuesta);
  if (!enc) return false;
  return leads.some((l) => {
    if (!telefonosCoinciden(l.telefono, telefono)) return false;
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

/**
 * Reasigna la propiedad (usuario) de un lead vía dbo.encuestaSorteo01Update.
 */
export async function reasignarLeadManual(leadId, nuevoUsuarioCarga, usuarioSesion) {
  const idEncuesta = Number.parseInt(String(leadId), 10);
  if (!Number.isFinite(idEncuesta) || idEncuesta <= 0) {
    throw new LeadNoEncontradoError();
  }

  const leads = await listAllLeadsFromEncuestas();
  const lead = leads.find((l) => String(l.id) === String(leadId));
  if (!lead) throw new LeadNoEncontradoError();

  const nuevoUsuarioCargaNorm = String(nuevoUsuarioCarga ?? '').trim().toUpperCase();
  if (!nuevoUsuarioCargaNorm) {
    throw new Error('El código de reasignación es requerido.');
  }

  const cargaParams = buildCargaParamsFromLead(lead, lead.telefono, nuevoUsuarioCargaNorm);

  await execEncuestaSorteo01Update({
    ...cargaParams,
    idEncuesta,
  });

  await resetearSeguimientoLead(leadId, lead);

  const leadsPost = await listAllLeadsFromEncuestas();
  const porId = leadsPost.find((l) => String(l.id) === String(leadId));
  if (porId && porId.encuestaUsuario === nuevoUsuarioCargaNorm) {
    return porId;
  }

  throw new CargaEncuestaSinPersistirError(
    'El SP se ejecutó pero el lead no aparece reasignado. Verificá que el SP encuestaSorteo01Update en la base de datos de producción tenga la línea "usuario = @usuario" en la sección de UPDATE.',
    `id=${leadId}, usuarioNuevo=${nuevoUsuarioCargaNorm}`
  );
}

export async function execEncuestaCargaSorteo01AddVendedor(params) {
  const pool = await getSqlPoolEncuestas();
  const proc = process.env.SP_DUPLICAR_ENCUESTA || 'encuestaCargaSorteo01AddVendedor';
  const request = pool.request();

  const telefonoSp = digitsTelefono(params.telefono) || String(params.telefono ?? '').trim();
  request.input('telefono', sql.NVarChar(50), telefonoSp);
  request.input('encuesta', sql.NVarChar(50), params.encuesta);
  request.input('usuario', sql.NVarChar(100), params.usuario);

  bindCampo(request, 1, params.campo1Valor);
  bindCampo(request, 2, params.campo2Valor);
  bindCampo(request, 3, params.campo3Valor);
  bindCampo(request, 4, params.campo4Valor);
  bindCampo(request, 5, params.campo5Valor ?? 'NO');
  bindCampo(request, 6, params.campo6Valor, { vacioComoCadenaVacia: true });
  bindCampo(request, 7, params.campo7Valor, { vacioComoCadenaVacia: true });
  bindCampo(request, 8, params.campo8Valor, { vacioComoCadenaVacia: true });

  const origen = String(params.origen ?? 2).trim().charAt(0) || '2';
  request.input('origen', sql.Char(1), origen);

  const result = await request.execute(proc);
  if (process.env.DEBUG_CARGA_ENCUESTA === '1') {
    console.info('[encuestaCargaAddVendedor] SP=%s returnValue=%s rows=%s', proc, result.returnValue, JSON.stringify(result.recordset));
  }
  return result;
}

export async function duplicarLeadEnDb(leadId, codigoVendedorDestino, usuarioSesion) {
  const idEncuesta = Number.parseInt(String(leadId), 10);
  if (!Number.isFinite(idEncuesta) || idEncuesta <= 0) {
    throw new LeadNoEncontradoError();
  }

  const leads = await listAllLeadsFromEncuestas();
  const leadOriginal = leads.find((l) => String(l.id) === String(leadId));
  if (!leadOriginal) {
    throw new LeadNoEncontradoError();
  }

  const cleanPhone = String(leadOriginal.telefono).replace(/_dup[a-z]+$/i, '').replace(/\D/g, '');
  if (!cleanPhone) {
    throw new Error('El teléfono del lead original no es válido.');
  }

  const nuevoUsuarioCargaNorm = String(codigoVendedorDestino ?? '').trim().toUpperCase();
  if (!nuevoUsuarioCargaNorm) {
    throw new Error('El código de vendedor de destino es requerido.');
  }

  // Resolve target supervisor's sucursal address
  let newSupervisorDireccion = null;
  try {
    const pool = await getSqlPoolEncuestas();
    const resVendedor = await pool.request()
      .input('codigo', nuevoUsuarioCargaNorm)
      .execute('encuestaSorteo01CargaVendedor');
    const vendedorRow = resVendedor.recordset?.[0];
    if (vendedorRow) {
      newSupervisorDireccion = vendedorRow.supervisorSucursalDireccion ?? vendedorRow.SupervisorSucursalDireccion ?? null;
    }
  } catch (err) {
    console.warn('[duplicarLead] Error fetching supervisor sucursal address:', err.message);
  }

  const agendar = Boolean(leadOriginal.horarioEntrevista || leadOriginal.quiereEntrevista);
  const campo6 = leadOriginal.horarioEntrevista
    ? formatHorarioEntrevistaSp(leadOriginal.horarioEntrevista)
    : null;
  const campo7 = leadOriginal.lugarEntrevista ? mapLugarEntrevistaSp(leadOriginal.lugarEntrevista) : null;
  let campo8 = leadOriginal.domicilioEntrevista?.trim() || null;
  if (leadOriginal.lugarEntrevista === 'sucursal' && newSupervisorDireccion) {
    campo8 = newSupervisorDireccion;
  } else if (!campo8 && leadOriginal.lugarEntrevista === 'domicilio') {
    campo8 = leadOriginal.domicilio?.trim() || null;
  }

  let origenMapped = 2;
  if (leadOriginal.origenEncuesta) {
    const rawOrigen = String(leadOriginal.origenEncuesta).toLowerCase().trim();
    if (rawOrigen === '1' || rawOrigen.includes('qr')) {
      origenMapped = 1;
    } else if (rawOrigen === '3' || rawOrigen.includes('insta') || rawOrigen.includes('ig') || rawOrigen === 'instagram') {
      origenMapped = 3;
    } else if (rawOrigen === '4' || rawOrigen.includes('face') || rawOrigen.includes('fb') || rawOrigen === 'facebook') {
      origenMapped = 4;
    } else if (rawOrigen === '5' || rawOrigen.includes('whats') || rawOrigen.includes('wapp') || rawOrigen === 'whatsapp') {
      origenMapped = 5;
    } else if (rawOrigen === '2' || rawOrigen.includes('manual') || rawOrigen.includes('app')) {
      origenMapped = 2;
    }
  }

  const cargaParams = {
    telefono: cleanPhone,
    encuesta: leadOriginal.codigoCampania || getEncuestaCampaniaId(),
    usuario: nuevoUsuarioCargaNorm,
    campo1Valor: leadOriginal.nombre?.trim() || null,
    campo2Valor: leadOriginal.domicilio?.trim() || null,
    campo3Valor: siNoDesdeTriState(leadOriginal.conoceMpc),
    campo4Valor: siNoDesdeTriState(leadOriginal.sabiaPlanInversionJoven),
    campo5Valor: leadOriginal.quiereEntrevista ? 'SI' : 'NO',
    campo6Valor: campo6,
    campo7Valor: campo7,
    campo8Valor: campo8,
    origen: origenMapped,
  };

  await execEncuestaCargaSorteo01AddVendedor(cargaParams);

  const leadsPost = await listAllLeadsFromEncuestas();
  const leadDuplicado = leadsPost.find(
    (l) =>
      String(l.telefono).replace(/_dup[a-z]+$/i, '').replace(/\D/g, '') === cleanPhone &&
      l.encuestaUsuario === nuevoUsuarioCargaNorm
  );

  if (leadDuplicado) {
    return leadDuplicado;
  }

  throw new CargaEncuestaSinPersistirError(
    'El lead se duplicó pero no aparece en el listado del sistema. Verificá si el vendedor de destino tiene permisos.',
    `telefono=${cleanPhone}, vendedor=${nuevoUsuarioCargaNorm}`
  );
}

function describirOrigenCarga(lead) {
  const raw = String(lead?.origenEncuesta ?? '').trim().toLowerCase();
  if (raw === '2' || raw.includes('manual') || raw.includes('app')) return 'Carga manual';
  if (raw === '1' || raw.includes('qr')) return 'QR / sorteo';
  if (lead?.seguimiento?.fuente === 'app') return 'Carga manual';
  if (raw) return raw;
  return 'Encuesta';
}

/**
 * Verifica si un teléfono ya está registrado en la campaña activa (antes de carga manual).
 */
export async function verificarTelefonoCargaManual(telefonoRaw) {
  const digits = digitsTelefono(telefonoRaw);
  if (!digits || digits.length < 8) {
    return {
      disponible: false,
      invalido: true,
      mensaje: 'Ingresá un teléfono válido (mínimo 8 dígitos).',
    };
  }

  const telefono = normalizarTelefonoCarga(telefonoRaw) || digits;
  const encuesta = getEncuestaCampaniaId();
  const leads = await listAllLeadsFromEncuestas({ incluirReferidos: false });

  const existente = leads.find((l) => {
    if (!telefonosCoinciden(l.telefono, telefono)) return false;
    const encLead = l.codigoCampania
      ? normalizarEncuestaCargaId(l.codigoCampania)
      : normalizarEncuestaCargaId('sorteo01');
    return encLead === encuesta;
  });

  if (!existente) {
    return {
      disponible: true,
      telefono,
      mensaje: 'Número disponible — podés guardar el lead.',
    };
  }

  const cargadoPor = String(existente.promotorNombre || 'Operador desconocido').trim();
  const supervisor = existente.supervisorNombre?.trim() || undefined;

  return {
    disponible: false,
    telefono,
    mensaje: `Este número ya está registrado. Cargado por ${cargadoPor}.`,
    existente: {
      leadId: String(existente.id),
      nombreCliente: existente.nombre,
      cargadoPor,
      supervisorNombre: supervisor,
      fechaAlta: existente.fechaAlta || existente.fechaObtencion || null,
      origen: describirOrigenCarga(existente),
    },
  };
}

export { MSG_CONTACTO_YA_REGISTRADO };

