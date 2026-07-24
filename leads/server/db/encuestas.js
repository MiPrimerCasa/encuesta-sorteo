import sql from 'mssql';
import {
  esCodigoUsuarioCargaValido,
  extraerCodigoPromotorDesdeFilaEncuesta,
  normalizarEncuestaCargaId,
} from './codigo-promotor.js';
import { compactarCodigoSorteo } from './whatsapp-link-text.js';
import {
  getSqlPoolEncuestas,
  isSqlServerConfigured,
  mapCategoriaToRol,
  mapOperadorVendedorToRol,
  parseIdEntero,
} from './mssql.js';
import { cierreRegistradoPorSupervisor } from '../domain/cierre-supervisor.js';
import { leadDerivacionTerrenoSupervisorActiva } from '../domain/derivacion-terreno.js';
import { CodigoPromotorCargaError } from './encuesta-carga.js';
import { getSeguimientoExterno } from './sqlite.js';
import { nombresCoinciden } from './operadores-catalog.js';
import {
  batchLatestSeguimientoSql,
  getLatestSeguimientoSql,
  persistirSeguimientoLead,
  useSeguimientoSql,
} from './seguimiento-sql.js';
import { adminSupervisorOperadorIds } from './superadmin-auth.js';

function pickField(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const name of candidates) {
    const key = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

/** Columnas del SP a veces vienen truncadas o con espacios distintos. */
function pickFieldStartsWith(row, ...prefixes) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const prefix of prefixes) {
    const p = prefix.toLowerCase();
    const key = keys.find((k) => k.toLowerCase().startsWith(p));
    if (key != null && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

export function normalizeNombre(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugId(texto) {
  return (
    'p-' +
    normalizeNombre(texto)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

/** Columna `origen` del SP encuestasMuestraOperador (QR, Facebook, Manual, Instagram, App…). */
function extractOrigenRawFromRow(row) {
  return pickField(
    row,
    'origen',
    'Origen',
    'fuente',
    'Fuente',
    'canal_origen',
    'Canal origen',
    'origen_lead',
    'Origen lead',
    'medio',
    'Medio',
    'Canal',
    'canal',
  );
}

/** Normaliza texto/código del SP → FuenteLead del frontend (métricas + badge en tarjeta). */
export function parseFuente(raw) {
  if (raw == null || raw === '') return null;
  const v = String(raw).toLowerCase().trim();
  if (v === '1' || v.includes('qr')) return 'qr';
  if (v === '4' || v.includes('face') || v.includes('fb') || v === 'facebook') return 'facebook';
  if (v === '3' || v.includes('insta') || v.includes('ig') || v === 'instagram') return 'instagram';
  if (v === '5' || v.includes('whats') || v.includes('wapp') || v === 'whatsapp') return 'whatsapp';
  if (v.includes('tik') || v === 'tiktok') return 'tiktok';
  if (
    v.includes('manual') ||
    v === '2' ||
    v === 'app' ||
    v === 'apps' ||
    v.includes('aplicacion') ||
    v.includes('aplicación')
  ) {
    return 'app';
  }
  return null;
}

function parseSiNo(valor) {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .startsWith('S');
}

/** S/N de encuesta → true/false; vacío o ambiguo → null. */
function parseSiNoTriState(valor) {
  const v = String(valor ?? '').trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (upper.startsWith('S') || upper === '1' || upper === 'SI' || upper === 'SÍ') return true;
  if (upper.startsWith('N') || upper === '0' || upper === 'NO') return false;
  return null;
}

function pickConoceMpcRow(row) {
  return pickField(row, 'Conoce MPC', 'Conoce MPC ') ?? pickFieldStartsWith(row, 'Conoce MPC', 'conoce mpc');
}

function pickSabiaPlanInversionJovenRow(row) {
  return (
    pickField(
      row,
      'Sabias que c...',
      'Sabias que con MPC podes acceder a la vivienda propia',
    ) ??
    pickFieldStartsWith(row, 'Sabias que', 'sabias que')
  );
}

function parseHorarioEntrevista(raw) {
  if (!raw) return null;
  const texto = String(raw).trim();
  const slash = texto.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (slash) {
    return `${slash[1]}-${slash[2]}-${slash[3]}T${slash[4]}:${slash[5]}:00`;
  }
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:00`;
  }
  return null;
}

function normalizeTelefonoValor(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.round(raw));
  }
  if (typeof raw === 'bigint') return raw.toString();
  return String(raw).trim();
}

function looksLikeTelefonoEncuesta(valor) {
  const digits = String(valor ?? '').replace(/\D/g, '');
  // Acepta celular local (370xxxxxxx), con 54/549 o fijo corto — carga manual suele omitir prefijo.
  return digits.length >= 8 && digits.length <= 15;
}

/** Heurística en columnas no telefónicas: exige más dígitos para evitar falsos positivos. */
function looksLikeTelefonoCelular(valor) {
  const digits = String(valor ?? '').replace(/\D/g, '');
  if (digits.length < 10) return false;
  return true;
}

/**
 * Teléfono WhatsApp desde encuestasMuestraOperador (columna `telefono` de la encuesta).
 * No usar "Contacto en" (2/3 = lugar de entrevista).
 */
export function extractTelefonoEncuesta(row) {
  if (!row) return '';

  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === 'telefono') {
      const t = normalizeTelefonoValor(row[key]);
      if (looksLikeTelefonoEncuesta(t)) return t;
    }
  }

  const picked =
    pickField(row, 'telefono', 'Telefono', 'Teléfono', 'Celular', 'WhatsApp', 'whatsapp') ??
    pickFieldStartsWith(row, 'telefono', 'celular', 'whatsapp');
  if (picked && looksLikeTelefonoEncuesta(picked)) {
    return normalizeTelefonoValor(picked);
  }

  for (const [key, val] of Object.entries(row)) {
    if (
      /contacto en|id$|idoperador|idvendedor|idsupervisor|encuesta|fecha|horario|domicilio|promotor|supervisor|conoce|sabias|queres|asesoramiento|usuario|apellido/i.test(
        key,
      )
    ) {
      continue;
    }
    if (val != null && val !== '' && looksLikeTelefonoCelular(val)) {
      return normalizeTelefonoValor(val);
    }
  }

  return '';
}

/** SP: Contacto en — 2 = sucursal/oficinas, 3 = domicilio del encuestado. */
function parseLugarEntrevista(raw) {
  if (raw == null || raw === '') return null;
  const texto = String(raw).trim();
  if (texto === '2' || /sucursal|oficina/i.test(texto)) return 'sucursal';
  if (texto === '3' || /domicilio/i.test(texto)) return 'domicilio';
  return null;
}

function getEncuestasProcedureName() {
  const raw = process.env.SP_ENCUESTAS || 'encuestasMuestraOperador';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

/** SP global sin filtro operador — panel superadmin (exec dbo.encuestasMuestra). */
function getEncuestasAdminProcedureName() {
  const raw = process.env.SP_ENCUESTAS_ADMIN || 'encuestasMuestra';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function getEncuestasParamIdVendedor() {
  return process.env.SP_ENCUESTAS_PARAM_ID || 'idVendedor';
}

/** Algunos drivers devuelven columnas duplicadas como array [valor, valor]. */
export function normalizeSqlScalar(val) {
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

/** idVendedor / idSupervisor del SP como string estable (evita "137,137" por arrays). */
export function idSqlScalarToString(val) {
  const scalar = normalizeSqlScalar(val);
  if (scalar == null || String(scalar).trim() === '') return null;
  return String(scalar).trim();
}

/** idOperador del login → @idVendedor del SP. */
export function parseIdVendedor(usuario) {
  const id = Number.parseInt(String(usuario?.id ?? ''), 10);
  if (!Number.isFinite(id) || id < 1) {
    throw new Error(`idVendedor inválido: "${usuario?.id}"`);
  }
  return id;
}

/** Serializa una fila SQL para logs / scripts de inspección. */
export function serializeEncuestaRow(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
  );
}

/** exec [dbo].[encuestasMuestraOperador] @idVendedor = idOperador */
export async function fetchEncuestasMuestraRaw(usuario) {
  const pool = await getSqlPoolEncuestas();
  const proc = getEncuestasProcedureName();
  const paramName = getEncuestasParamIdVendedor();
  const idVendedor = parseIdVendedor(usuario);

  const request = pool.request();
  request.input(paramName, sql.Int, idVendedor);
  const result = await request.execute(proc);
  return result.recordset ?? result.recordsets?.[0] ?? [];
}

/** idOperador del supervisor para @idVendedor cuando el promotor comparte equipo (ej. S01 → Norma id 138). */
export function supervisorFetchIdDesdeCodigoPromotor(codigoRaw) {
  const norm = compactarCodigoSorteo(codigoRaw);
  if (!esCodigoUsuarioCargaValido(norm)) return null;
  const m = norm.match(/^SORTEO\d{2}(S\d{2})/i);
  if (!m) return null;
  const equipo = m[1].toUpperCase();

  const raw = process.env.PROMOTOR_EQUIPO_SUPERVISOR_IDS?.trim();
  if (raw) {
    try {
      const map = JSON.parse(raw);
      const hit = map[equipo] ?? map[equipo.toLowerCase()];
      if (hit != null && String(hit).trim()) return String(hit).trim();
    } catch {
      /* JSON inválido */
    }
  }

  const defaults = {
    S01: '23',
    S02: '45',
    S03: '72',
    S04: '121',
    S05: '123',
    S06: '130',
    S07: '101',
    S08: '122',
    S09: '126',
    S10: '110',
    S11: '37',
    S12: '113',
    S14: '78',
    S15: '87',
    S16: '15',
    S18: '39',
    S19: '42',
    S20: '47',
    S21: '132',
    S22: '2',
  };
  return defaults[equipo] ?? null;
}

function esCodigoPromotorIndividual(codigoRaw) {
  const c = compactarCodigoSorteo(codigoRaw);
  return esCodigoUsuarioCargaValido(c) && /P\d{2}$/i.test(c);
}

/** Varios promotores en el mismo listado del SP (equipo S01, etc.). */
export function encuestaRowsTienenVariosPromotores(rows) {
  const codigos = new Set();
  for (const row of rows ?? []) {
    const c = compactarCodigoSorteo(extraerCodigoPromotorDesdeFilaEncuesta(row));
    if (esCodigoPromotorIndividual(c)) codigos.add(c);
  }
  return codigos.size > 1;
}

/** True si la bandeja debe filtrarse a un solo promotor (aunque el rol venga mal como supervisor). */
export function usuarioDebeVerSoloSusLeadsPromotor(usuario) {
  if (!usuario) return false;
  if (usuario.rol === 'promotor') return true;
  if (esCodigoPromotorIndividual(usuario.codigoCarga)) return true;
  if (mapCategoriaToRol(usuario.categoria) === 'promotor') return true;
  const op = parseIdEntero(usuario.idOperador ?? usuario.id);
  const sup = parseIdEntero(usuario.idSupervisor);
  return op != null && sup != null && op !== sup;
}

async function fetchFilasSupervisorEquipo(usuario, supervisorId) {
  if (!supervisorId) return [];
  const idOp = String(usuario?.id ?? usuario?.idOperador ?? '').trim();
  if (supervisorId === idOp) return [];
  try {
    return await fetchEncuestasMuestraRaw({
      id: supervisorId,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });
  } catch {
    return [];
  }
}

/**
 * Filas de encuesta para el usuario logueado.
 * Promotor: filtra por código QR / nombre; si el SP no devuelve filas propias, reintenta con idSupervisor.
 */
export async function fetchEncuestaRowsParaUsuario(usuario) {
  const { filterEncuestaRowsParaPromotor, enriquecerUsuarioConCodigoCarga } = await import(
    './operadores-catalog.js',
  );
  let rows = await fetchEncuestasMuestraRaw(usuario);
  const usuarioEf = enriquecerUsuarioConCodigoCarga(usuario, rows);

  const { usuarioNombreEsPromotorEnFilasEquipo } = await import('./operadores-catalog.js');
  const debeFiltrar =
    usuarioDebeVerSoloSusLeadsPromotor(usuarioEf) ||
    usuarioDebeVerSoloSusLeadsPromotor(usuario) ||
    (encuestaRowsTienenVariosPromotores(rows) &&
      usuarioNombreEsPromotorEnFilasEquipo(rows, usuarioEf));

  if (!debeFiltrar) {
    return rows;
  }

  const usuarioFiltro = { ...usuarioEf, rol: 'promotor' };
  let filtradas = filterEncuestaRowsParaPromotor(rows, usuarioFiltro);

  const idOp = String(usuarioEf.idOperador ?? usuarioEf.id ?? '').trim();
  const idSupSesion = String(usuarioEf.idSupervisor ?? '').trim();
  const idSupCodigo = supervisorFetchIdDesdeCodigoPromotor(usuarioEf.codigoCarga);
  const candidatosSup = [...new Set([idSupSesion, idSupCodigo].filter(Boolean))].filter(
    (id) => id && id !== idOp,
  );

  if (filtradas.length === 0) {
    for (const idSup of candidatosSup) {
      const supRows = await fetchFilasSupervisorEquipo(usuarioEf, idSup);
      if (!supRows.length) continue;
      filtradas = filterEncuestaRowsParaPromotor(supRows, usuarioFiltro);
      if (filtradas.length > 0) break;
    }
  }

  return filtradas;
}

/** exec [dbo].[encuestasMuestra] — todas las encuestas (superadmin). */
export async function fetchEncuestasMuestraGlobalRaw() {
  const pool = await getSqlPoolEncuestas();
  const proc = getEncuestasAdminProcedureName();
  const result = await pool.request().execute(proc);
  return result.recordset ?? result.recordsets?.[0] ?? [];
}

/**
 * Rol según encuestasMuestraOperador: idOperador === idVendedor → supervisor.
 * La DB ya filtra qué filas devuelve con @idVendedor = idOperador.
 */
export function resolveRolFromEncuestasRows(rows, idOperador, categoria) {
  if (!rows?.length) return null;
  const idVendedor = normalizeSqlScalar(pickField(rows[0], 'idVendedor', 'IdVendedor'));
  const idSupervisor = normalizeSqlScalar(pickField(rows[0], 'idSupervisor', 'IdSupervisor'));
  const rolPorIds = mapOperadorVendedorToRol(idOperador, idVendedor);
  const rolPorCategoria = mapCategoriaToRol(categoria);

  let rol = rolPorIds;
  let rolOrigen = 'encuestas';

  // Promotor con una sola fila propia: idVendedor suele repetir idOperador → no es supervisor.
  if (rolPorIds === 'supervisor' && rolPorCategoria === 'promotor') {
    rol = 'promotor';
    rolOrigen = 'categoria_encuestas';
  }

  if (!rol) return null;
  return {
    rol,
    rolOrigen,
    idVendedor: idVendedor != null ? String(idVendedor) : undefined,
    idSupervisor: idSupervisor != null ? String(idSupervisor) : undefined,
  };
}

/** Si encuestas dice supervisor pero el login es claramente promotor, priorizar promotor. */
function aplicarRolEncuestasConRespaldoLogin(operador, resolved) {
  const catRol = mapCategoriaToRol(operador.categoria);
  const op = parseIdEntero(operador.idOperador ?? operador.id);
  const sup = parseIdEntero(operador.idSupervisor);
  const promotorPorLogin =
    catRol === 'promotor' || (op != null && sup != null && op !== sup);

  if (resolved.rol === 'supervisor' && promotorPorLogin) {
    return {
      ...operador,
      rol: 'promotor',
      rolOrigen: 'categoria_override',
      idVendedor: resolved.idVendedor ?? operador.idVendedor,
      idSupervisor: resolved.idSupervisor ?? operador.idSupervisor,
    };
  }

  return {
    ...operador,
    rol: resolved.rol,
    rolOrigen: resolved.rolOrigen,
    idVendedor: resolved.idVendedor ?? operador.idVendedor,
    idSupervisor: resolved.idSupervisor ?? operador.idSupervisor,
  };
}

/** Tras login: si Categoria del SP es clara, no recalcular rol por encuestas (acuerdo DBA). */
export async function enrichOperadorRolDesdeEncuestas(operador) {
  const idOperador = operador.idOperador ?? operador.id;
  if (!parseIdEntero(idOperador)) return operador;

  const rolPorCategoria = mapCategoriaToRol(operador.categoria);
  if (rolPorCategoria) {
    return {
      ...operador,
      rol: rolPorCategoria,
      rolOrigen: 'categoria',
    };
  }

  try {
    const rows = await fetchEncuestasMuestraRaw({
      id: String(idOperador),
      nombre: operador.nombre,
      rol: 'supervisor',
    });
    const resolved = resolveRolFromEncuestasRows(rows, idOperador, operador.categoria);
    if (!resolved) return operador;

    return aplicarRolEncuestasConRespaldoLogin(operador, resolved);
  } catch (error) {
    console.warn(
      'Rol desde encuestas no disponible, se usa categoría:',
      error instanceof Error ? error.message : error,
    );
    return operador;
  }
}

/** Columnas que podrían servir para comparar supervisor vs vendedor (ids o códigos). */
export function analyzeEncuestasIdColumns(rows) {
  if (!rows?.length) return [];
  const keys = Object.keys(rows[0]);
  const interesting = keys.filter((k) =>
    /id|supervisor|vendedor|promotor|operador|usuario|codigo/i.test(k),
  );
  return interesting.map((col) => {
    const valores = [
      ...new Set(
        rows
          .map((r) => r[col])
          .filter((v) => v != null && String(v).trim() !== '')
          .map((v) => (v instanceof Date ? v.toISOString() : v)),
      ),
    ].slice(0, 8);
    return { columna: col, ejemplos: valores, distintos: valores.length };
  });
}

function buildObservacionesEncuesta(row) {
  return 'realiza las observaciones necesarias';
}

export function mapEncuestaRowToLead(row, seguimientoLocal = {}) {
  const usuario = pickField(row, 'usuario', 'Usuario');
  const promotorNombre = pickField(row, 'Promotor', 'promotor') ?? 'Sin promotor';
  const supervisorNombre = pickField(row, 'supervisor', 'Supervisor');
  const nombreLead = pickField(row, 'Apellido y nombres', 'Apellido y nombres ') ?? 'Sin nombre';
  const domicilio = pickField(row, 'Domicilio', 'domicilio');
  const quiereAsesoramiento = parseSiNo(
    pickField(row, 'Queres asesoramiento ?', 'Queres asesoramiento', 'Querés asesoramiento ?'),
  );
  const horarioRaw =
    pickField(row, 'Horario de entrevista', 'Horario de entrevista ') ??
    pickFieldStartsWith(row, 'Horario de entrevista', 'horario de entrevista');
  const horarioIso = parseHorarioEntrevista(horarioRaw);
  const contactoRaw =
    pickField(
      row,
      'Contacto en  (2 = En sucursal , 3 = Domicilio encuestado)',
      'Contacto en (',
      'Contacto en',
    ) ?? pickFieldStartsWith(row, 'Contacto en');
  const lugarEntrevista = parseLugarEntrevista(contactoRaw);
  const domicilioEntrevista =
    pickField(
      row,
      'Domicilio de encuesta ',
      'Domicilio de encuesta',
      'Domicilio de encuest...',
    ) ?? pickFieldStartsWith(row, 'Domicilio de encuesta', 'Domicilio de encuest');
  const telefonoEncuesta = extractTelefonoEncuesta(row);
  const origenRaw = extractOrigenRawFromRow(row);
  const fuenteDB = parseFuente(origenRaw);

  const dbFechaAltaVal = pickField(row, 'fechaAlta', 'fecha_alta');
  let dbFechaAltaIso = null;
  if (dbFechaAltaVal) {
    if (dbFechaAltaVal instanceof Date && !isNaN(dbFechaAltaVal.getTime())) {
      dbFechaAltaIso = dbFechaAltaVal.toISOString().slice(0, 19);
    } else if (typeof dbFechaAltaVal === 'string' || typeof dbFechaAltaVal === 'number') {
      const str = String(dbFechaAltaVal).trim();
      if (str) {
        dbFechaAltaIso = str.replace(' ', 'T').slice(0, 19);
      }
    }
  }

  const fechaBase = dbFechaAltaIso
    ? dbFechaAltaIso.slice(0, 10)
    : (horarioIso ? horarioIso.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const lista = horarioIso || quiereAsesoramiento ? 'entrevista' : 'contacto';

  const pkEncuesta = pickField(row, 'id', 'Id', 'ID');
  const leadKey =
    pkEncuesta != null && String(pkEncuesta).trim() !== ''
      ? String(pkEncuesta)
      : String(usuario ?? `enc-${slugId(nombreLead)}`);
  const usuarioKey = usuario ? String(usuario) : '';
  /** Clave por id numérico del lead (206), no por usuario encuesta (SORTEO01S21P02). */
  const seguimientoRemoto =
    seguimientoLocal[leadKey] ??
    (usuarioKey ? seguimientoLocal[usuarioKey] : undefined) ??
    {};
  const observacionesEncuesta = buildObservacionesEncuesta(row);
  const conoceMpc = parseSiNoTriState(pickConoceMpcRow(row));
  const sabiaPlanInversionJoven = parseSiNoTriState(pickSabiaPlanInversionJovenRow(row));
  const cargadoPorRolRaw = pickField(row, 'cargado_por_rol', 'cargadoPorRol');
  const cargadoPorRol = cargadoPorRolRaw ? String(cargadoPorRolRaw).trim().toLowerCase() : undefined;
  
  const observacionesFinal = seguimientoRemoto.observaciones && seguimientoRemoto.observaciones.trim()
    ? seguimientoRemoto.observaciones
    : (observacionesEncuesta || undefined);

  const seguimiento = {
    ...seguimientoRemoto,
    // Origen desde encuesta; el caché local solo pisa si el usuario guardó fuente explícita.
    fuente: seguimientoRemoto.fuente ?? fuenteDB ?? null,
    observaciones: observacionesFinal,
  };

  const encuestaRaw = pickField(row, 'encuesta', 'Encuesta', 'ENCUESTA');
  const codigoCampania = encuestaRaw
    ? normalizarEncuestaCargaId(encuestaRaw)
    : undefined;

  const esReferidoRaw = pickField(
    row,
    'es_referido',
    'esReferido',
    'EsReferido',
    'es referido',
  );
  const esReferido =
    esReferidoRaw === true ||
    esReferidoRaw === 1 ||
    String(esReferidoRaw ?? '').trim().toLowerCase() === 's' ||
    String(esReferidoRaw ?? '').trim() === '1';
  const leadReferidoDeIdRaw = pickField(
    row,
    'id_encuesta_origen',
    'idEncuestaOrigen',
    'lead_referido_de',
  );
  const nivelReferidoRaw = pickField(row, 'nivel_referido', 'nivelReferido', 'nivel');

  return {
    id: leadKey,
    encuestaUsuario: usuario ? String(usuario) : undefined,
    nombre: String(nombreLead).trim(),
    telefono: telefonoEncuesta,
    codigoPromotorCarga: extraerCodigoPromotorDesdeFilaEncuesta(row) ?? undefined,
    idVendedor: normalizeSqlScalar(pickField(row, 'idVendedor', 'IdVendedor')) ?? undefined,
    idSupervisor:
      normalizeSqlScalar(pickField(row, 'idSupervisor', 'IdSupervisor')) ?? undefined,
    promotorId: slugId(promotorNombre),
    promotorNombre: String(promotorNombre),
    supervisorNombre: supervisorNombre ? String(supervisorNombre) : undefined,
    domicilio: domicilio ? String(domicilio) : undefined,
    quiereEntrevista: quiereAsesoramiento,
    horarioEntrevista: horarioIso ?? undefined,
    lugarEntrevista: lugarEntrevista ?? undefined,
    domicilioEntrevista: domicilioEntrevista ? String(domicilioEntrevista).trim() : undefined,
    lista,
    fechaObtencion: fechaBase,
    fechaAlta: dbFechaAltaIso ?? horarioIso ?? `${fechaBase}T09:00:00`,
    codigoCampania,
    origenEncuesta: origenRaw != null ? String(origenRaw).trim() : undefined,
    cargadoPorRol,
    conoceMpc,
    sabiaPlanInversionJoven,
    esReferido: esReferido || undefined,
    leadReferidoDeId:
      leadReferidoDeIdRaw != null && String(leadReferidoDeIdRaw).trim() !== ''
        ? String(leadReferidoDeIdRaw)
        : undefined,
    nivelReferido:
      nivelReferidoRaw != null && String(nivelReferidoRaw).trim() !== ''
        ? Number(nivelReferidoRaw) || undefined
        : undefined,
    seguimiento,
  };
}

/** Índice promotor → código @usuario (desde filas del SP, agrupado por idVendedor + nombre). */
export function buildCodigoPromotorIndex(encuestaRows = []) {
  const buckets = new Map();
  for (const row of encuestaRows) {
    const nombre = pickField(row, 'Promotor', 'promotor');
    const codigo = extraerCodigoPromotorDesdeFilaEncuesta(row);
    const idVendedor = idSqlScalarToString(pickField(row, 'idVendedor', 'IdVendedor'));
    if (!nombre || !codigo) continue;
    const key = `${idVendedor ?? ''}|${normalizeNombre(nombre)}`;
    const bucket = buckets.get(key) ?? { codigos: new Map(), nombre: String(nombre).trim() };
    bucket.codigos.set(codigo, (bucket.codigos.get(codigo) ?? 0) + 1);
    buckets.set(key, bucket);
  }
  const index = new Map();
  for (const [key, { codigos, nombre }] of buckets) {
    const codigoCarga = [...codigos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (codigoCarga) index.set(key, { codigoCarga, nombre });
  }
  return index;
}

/** True si el operador tiene al menos una fila propia en encuestasMuestraOperador. */
export function promotorTieneFilasEnMuestra(encuestaRows, idVendedor) {
  if (!encuestaRows?.length || idVendedor == null || String(idVendedor).trim() === '') {
    return false;
  }
  const prefix = `${idVendedor}|`;
  const index = buildCodigoPromotorIndex(encuestaRows);
  for (const key of index.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export function resolveCodigoCargaPorPromotor(encuestaRows, promotorNombre, idVendedor) {
  const index = buildCodigoPromotorIndex(encuestaRows);
  const key = `${idVendedor ?? ''}|${normalizeNombre(promotorNombre ?? '')}`;
  const byKey = index.get(key)?.codigoCarga;
  if (byKey) return byKey;
  const byNombre = index.get(`|${normalizeNombre(promotorNombre ?? '')}`)?.codigoCarga;
  if (byNombre) return byNombre;

  // Fuzzy search by name using nombresCoinciden!
  if (promotorNombre) {
    for (const [k, v] of index.entries()) {
      const rowName = k.split('|')[1];
      if (rowName && nombresCoinciden(promotorNombre, rowName)) {
        return v.codigoCarga;
      }
    }
  }

  if (idVendedor != null && String(idVendedor).trim() !== '') {
    const prefix = `${idVendedor}|`;
    for (const [k, v] of index) {
      if (k.startsWith(prefix)) return v.codigoCarga;
    }
  }
  return undefined;
}

function pickDomicilioEncuestaRow(row) {
  return (
    pickField(
      row,
      'Domicilio de encuesta ',
      'Domicilio de encuesta',
      'supervisorSucursalDireccion',
      'SupervisorSucursalDireccion',
    ) ?? pickFieldStartsWith(row, 'Domicilio de encuesta', 'supervisorSucursal')
  );
}

function pickContactoEntrevistaRow(row) {
  return (
    pickField(
      row,
      'Contacto en  (2 = En sucursal , 3 = Domicilio encuestado)',
      'Contacto en (',
      'Contacto en',
    ) ?? pickFieldStartsWith(row, 'Contacto en')
  );
}

/** Dirección oficinas del supervisor (columna «Domicilio de encuesta» cuando lugar = sucursal / 2). */
export function resolveDireccionOficinasSupervisor(encuestaRows, { promotorNombre } = {}) {
  if (!encuestaRows?.length) {
    return process.env.SUPERVISOR_SUCURSAL_DIRECCION?.trim() || null;
  }

  const filas = promotorNombre
    ? encuestaRows.filter((row) => {
        const prom = pickField(row, 'Promotor', 'promotor');
        return prom && normalizeNombre(prom) === normalizeNombre(promotorNombre);
      })
    : encuestaRows;

  const buscarEn = filas.length ? filas : encuestaRows;

  for (const row of buscarEn) {
    const contacto = pickContactoEntrevistaRow(row);
    const esSucursal =
      contacto == null ||
      String(contacto).trim() === '2' ||
      /sucursal|oficina/i.test(String(contacto));
    const dir = pickDomicilioEncuestaRow(row);
    if (dir && esSucursal) return String(dir).trim();
  }

  for (const row of buscarEn) {
    const dir = pickDomicilioEncuestaRow(row);
    if (dir) return String(dir).trim();
  }

  return process.env.SUPERVISOR_SUCURSAL_DIRECCION?.trim() || null;
}

export function buildPromotoresFromLeads(leads, encuestaRows = []) {
  const codigoIndex = buildCodigoPromotorIndex(encuestaRows);
  const codigoPorNombre = new Map();
  for (const [, { codigoCarga, nombre }] of codigoIndex) {
    codigoPorNombre.set(normalizeNombre(nombre), codigoCarga);
  }

  const map = new Map();
  for (const lead of leads) {
    if (!map.has(lead.promotorId)) {
      const codigoCarga =
        lead.codigoPromotorCarga ??
        codigoPorNombre.get(normalizeNombre(lead.promotorNombre ?? '')) ??
        undefined;
      map.set(lead.promotorId, {
        id: lead.promotorId,
        nombre: lead.promotorNombre ?? lead.promotorId,
        codigoCarga,
        idVendedor: lead.idVendedor,
        direccionSucursal: resolveDireccionOficinasSupervisor(encuestaRows, {
          promotorNombre: lead.promotorNombre,
        }),
      });
    }
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Supervisor puede cargar como promotor propio: primera opción = él/ella, no un vendedor del equipo.
 */
export function prependSupervisorComoPromotor(promotores, usuarioSesion, encuestaRows = []) {
  if (!usuarioSesion || usuarioSesion.rol !== 'supervisor') return promotores;
  const id = String(usuarioSesion.idOperador ?? usuarioSesion.id ?? '').trim();
  if (!id) return promotores;

  const nombre = String(usuarioSesion.nombre ?? 'Supervisor').trim();
  const codigoCarga =
    usuarioSesion.codigoCarga?.trim() ||
    resolveCodigoCargaPorPromotor(encuestaRows, nombre, id) ||
    undefined;

  const self = {
    id,
    nombre,
    codigoCarga: codigoCarga || undefined,
    idVendedor: id,
    direccionSucursal: resolveDireccionOficinasSupervisor(encuestaRows),
    esPropioSupervisor: true,
  };

  const normSelf = normalizeNombre(nombre);
  const rest = promotores.filter(
    (p) => p.id !== id && normalizeNombre(p.nombre) !== normSelf,
  );
  return [self, ...rest];
}

export function buildPromotoresParaCarga(usuarioSesion, leads, encuestaRows = []) {
  const base = buildPromotoresFromLeads(leads, encuestaRows);
  return prependSupervisorComoPromotor(base, usuarioSesion, encuestaRows);
}

function applyDerivacionTerrenoAlLead(lead, seguimiento) {
  if (seguimiento?.resultadoEntrevista !== 'derivar_terreno' && !seguimiento?.derivacionTerrenoActiva) {
    return lead;
  }
  const segConFlag = {
    ...seguimiento,
    derivacionTerrenoActiva:
      seguimiento?.resultadoEntrevista === 'derivar_terreno' || seguimiento?.derivacionTerrenoActiva === true,
  };
  if (seguimiento?.resultadoEntrevista !== 'derivar_terreno') {
    return { ...lead, seguimiento: segConFlag };
  }
  const horario = seguimiento.horarioEntrevistaPropuesto?.trim();
  if (horario) {
    return {
      ...lead,
      horarioEntrevista: horario,
      quiereEntrevista: true,
      lista: 'entrevista',
      seguimiento: { ...segConFlag, fechaReagenda: null },
    };
  }
  const { horarioEntrevista: _h, ...rest } = lead;
  return {
    ...rest,
    quiereEntrevista: false,
    lista: 'contacto',
    seguimiento: { ...segConFlag, horarioEntrevistaPropuesto: null },
  };
}

function enrichLeadParaCliente(lead) {
  let next = lead;
  let horarioEntrevista = next.horarioEntrevista;
  if (
    !horarioEntrevista &&
    next.lista === 'entrevista' &&
    next.fechaAlta &&
    !String(next.fechaAlta).endsWith('T09:00:00')
  ) {
    horarioEntrevista = next.fechaAlta;
    next = { ...next, horarioEntrevista };
  }
  return applyDerivacionTerrenoAlLead(next, next.seguimiento ?? {});
}

function supervisorIdsDesdeFilasEncuesta(rows) {
  const ids = new Set(adminSupervisorOperadorIds());
  for (const row of rows) {
    const sup = pickField(row, 'idSupervisor', 'IdSupervisor');
    const n = Number.parseInt(String(sup ?? ''), 10);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  return [...ids];
}

export function hasPassed48Hours(fechaAltaStr) {
  if (!fechaAltaStr) return true;
  let normalizedStr = String(fechaAltaStr).trim();
  if (/T\d{2}:\d{2}:\d{2}$/.test(normalizedStr)) {
    normalizedStr += '-03:00';
  }
  const fechaAlta = new Date(normalizedStr);
  if (isNaN(fechaAlta.getTime())) return true;
  const ahora = new Date();
  const diffMs = ahora.getTime() - fechaAlta.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= 48;
}

export function esCargaPropia(lead, usuarioSesion) {
  if (!usuarioSesion) return false;
  
  const normUsuario = usuarioSesion.nombre ? normalizeNombre(usuarioSesion.nombre) : null;
  const normPromotor = lead.promotorNombre ? normalizeNombre(lead.promotorNombre) : null;
  if (normUsuario && normPromotor && normUsuario === normPromotor) {
    return true;
  }
  
  if (usuarioSesion.codigoCarga && lead.codigoPromotorCarga && lead.codigoPromotorCarga === usuarioSesion.codigoCarga) {
    return true;
  }
  
  const idOp = String(usuarioSesion.idOperador ?? usuarioSesion.id ?? '').trim();
  if (idOp) {
    const leadIdV = idSqlScalarToString(lead.idVendedor);
    if (leadIdV && leadIdV === idOp) return true;
  }
  
  return false;
}

async function mapEncuestaRowsToLeads(rows, idOperador = null, operadorIdsBatch = null, usuarioSesion = null) {
  const ids = rows
    .map((r) => {
      const pk = pickField(r, 'id', 'Id', 'ID');
      return pk != null && String(pk).trim() !== '' ? String(pk) : pickField(r, 'usuario', 'Usuario');
    })
    .filter(Boolean)
    .map(String);
  const batchOperadores =
    operadorIdsBatch ??
    (idOperador == null && rows.length ? supervisorIdsDesdeFilasEncuesta(rows) : []);
  const seguimientoById = useSeguimientoSql()
    ? await batchLatestSeguimientoSql(
        ids,
        idOperador != null && Number.isFinite(idOperador) ? idOperador : null,
        batchOperadores,
      )
    : Object.fromEntries(ids.map((id) => [id, getSeguimientoExterno(id)]));
  const leads = rows.map((row) => {
    const pk = pickField(row, 'id', 'Id', 'ID');
    const id =
      pk != null && String(pk).trim() !== ''
        ? String(pk)
        : String(pickField(row, 'usuario', 'Usuario'));
    let lead = enrichLeadParaCliente(mapEncuestaRowToLead(row, { [id]: seguimientoById[id] }));

    if (usuarioSesion?.rol === 'supervisor') {
      const isLocked =
        lead.cargadoPorRol === 'promotor' &&
        !hasPassed48Hours(lead.fechaAlta) &&
        !leadDerivacionTerrenoSupervisorActiva(lead) &&
        !esCargaPropia(lead, usuarioSesion);

      const hasPendingInterview =
        leadTieneCitaPrevia(lead) &&
        lead.cargadoPorRol === 'promotor' &&
        !leadDerivacionTerrenoSupervisorActiva(lead) &&
        !esCargaPropia(lead, usuarioSesion);

      if (isLocked) {
        lead = {
          ...lead,
          telefono: 'Oculto (48 hs)',
          bloqueadoSupervisor48h: true,
        };
      } else if (hasPendingInterview) {
        lead = {
          ...lead,
          telefono: 'Oculto (Cita Previa)',
        };
      }
    }

    return lead;
  });
  leads.sort((a, b) => (a.fechaAlta ?? '').localeCompare(b.fechaAlta ?? ''));
  return leads;
}

export async function listLeadsFromEncuestas(usuario) {
  const rows = await fetchEncuestaRowsParaUsuario(usuario);
  const idOperador = parseInt(String(usuario?.id ?? usuario?.idOperador ?? ''), 10);
  const leads = await mapEncuestaRowsToLeads(
    rows,
    Number.isFinite(idOperador) ? idOperador : null,
    null,
    usuario,
  );

  try {
    const { fetchReferidosMetaPorIds, aplicarMetaReferidosEnLeads } = await import(
      './referidos-carga.js'
    );
    const metaMap = await fetchReferidosMetaPorIds(leads.map((l) => l.id));
    return aplicarMetaReferidosEnLeads(leads, metaMap, usuario);
  } catch {
    return leads;
  }
}

/** Listado global vía encuestasMuestra — panel superadmin. */
export async function listAllLeadsFromEncuestas({ incluirReferidos = true } = {}) {
  const rows = await fetchEncuestasMuestraGlobalRaw();
  const leads = await mapEncuestaRowsToLeads(rows, null, null, { rol: 'superadmin' });

  if (!incluirReferidos) return leads;

  const usuario = { rol: 'superadmin' };

  try {
    const { fetchReferidosMetaPorIds, aplicarMetaReferidosEnLeads } = await import(
      './referidos-carga.js'
    );
    const metaMap = await fetchReferidosMetaPorIds(leads.map((l) => l.id));
    return aplicarMetaReferidosEnLeads(leads, metaMap, usuario);
  } catch {
    return leads;
  }
}

export function leadTieneCitaPrevia(lead) {
  if (lead.seguimiento?.resultadoEntrevista === 'reagenda' && lead.seguimiento?.fechaReagenda) {
    return true;
  }
  if (lead.horarioEntrevista) return true;
  if (lead.lista !== 'entrevista' || !lead.fechaAlta) return false;
  if (String(lead.fechaAlta).endsWith('T09:00:00')) return false;
  return true;
}

/** Leads desde SQL Server (encuestasMuestraOperador filtrado en la DB). */
export function useEncuestasFromSql() {
  return isSqlServerConfigured();
}

export async function updateLeadSeguimientoEncuesta(leadId, seguimiento, usuario, usuarioId) {
  const rows = await fetchEncuestaRowsParaUsuario(usuario);
  const row = rows.find((r) => {
    const pk = pickField(r, 'id', 'Id', 'ID');
    const usuario = pickField(r, 'usuario', 'Usuario');
    return String(pk ?? '') === leadId || String(usuario ?? '') === leadId;
  });
  if (!row) return null;
  const idOperador = parseInt(String(usuario?.id ?? usuario?.idOperador ?? ''), 10);
  const prevSeg = useSeguimientoSql()
    ? await getLatestSeguimientoSql(leadId, Number.isFinite(idOperador) ? idOperador : null)
    : getSeguimientoExterno(leadId);
  if (usuario?.rol === 'promotor' && cierreRegistradoPorSupervisor(prevSeg)) {
    const err = new Error(
      'Este cierre fue registrado por el supervisor y no puede modificarse desde tu cuenta.',
    );
    err.code = 'CIERRE_SUPERVISOR_SOLO_LECTURA';
    throw err;
  }
  const base = mapEncuestaRowToLead(row, { [leadId]: prevSeg });
  
  if (
    usuario?.rol === 'supervisor' &&
    base.cargadoPorRol === 'promotor' &&
    !hasPassed48Hours(base.fechaAlta) &&
    !leadDerivacionTerrenoSupervisorActiva(base) &&
    !esCargaPropia(base, usuario)
  ) {
    const err = new Error(
      'No podés interactuar con este lead hasta que pasen 48 horas de su creación para dar prioridad al promotor.',
    );
    err.code = 'PRIORIDAD_PROMOTOR_BLOQUEO_48H';
    throw err;
  }

  if (
    usuario?.rol === 'supervisor' &&
    leadTieneCitaPrevia(base) &&
    base.cargadoPorRol === 'promotor' &&
    !leadDerivacionTerrenoSupervisorActiva({ ...base, seguimiento: { ...prevSeg, ...seguimiento } })
  ) {
    const err = new Error(
      'No podés tratar este lead hasta que el promotor lo derive por interesado en terreno.',
    );
    err.code = 'ENTREVISTA_PROMOTOR_PENDIENTE_DERIVACION';
    throw err;
  }
  let seguimientoParaGuardar = { ...seguimiento };
  const resultadoGuardado =
    seguimientoParaGuardar.resultadoEntrevista ?? prevSeg?.resultadoEntrevista ?? null;
  if (resultadoGuardado === 'derivar_terreno') {
    seguimientoParaGuardar.derivacionTerrenoActiva = true;
  } else if (
    prevSeg?.derivacionTerrenoActiva === true ||
    prevSeg?.resultadoEntrevista === 'derivar_terreno'
  ) {
    if (resultadoGuardado === 'compro' || resultadoGuardado === 'no_compro' || resultadoGuardado === 'sin_interes') {
      seguimientoParaGuardar.derivacionTerrenoActiva = false;
    } else if (seguimientoParaGuardar.derivacionTerrenoActiva !== false) {
      seguimientoParaGuardar.derivacionTerrenoActiva = true;
    }
  }
  let referidosCreados = [];
  let nuevosLeads = [];

  if (seguimiento.brindoReferidos === true && (seguimiento.referidos?.length ?? 0) > 0) {
    try {
      const { crearLeadsDesdeReferidos } = await import('./referidos-carga.js');
      const proc = await crearLeadsDesdeReferidos(base, seguimiento, usuario);
      referidosCreados = proc.resultados ?? [];
      nuevosLeads = proc.nuevosLeads ?? [];
      if (proc.referidosGenerados?.length) {
        seguimientoParaGuardar = {
          ...seguimientoParaGuardar,
          referidosGenerados: proc.referidosGenerados,
        };
      }
    } catch (error) {
      if (error instanceof CodigoPromotorCargaError) throw error;
      console.warn(
        '[referidos] Carga automática parcial:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const { merged, saved, entradaHistorial, registroId } = await persistirSeguimientoLead(
    leadId,
    seguimientoParaGuardar,
    usuario,
    base,
  );
  const ahoraIso = new Date().toISOString().slice(0, 19);
  const operadorIdStamp =
    usuario?.id != null && String(usuario.id).trim() !== ''
      ? String(usuario.id).trim()
      : usuario?.idOperador != null && String(usuario.idOperador).trim() !== ''
        ? String(usuario.idOperador).trim()
        : merged.operadorId != null
          ? String(merged.operadorId)
          : null;

  const seguimientoConOperador = saved
    ? {
        ...merged,
        operadorId: operadorIdStamp ?? merged.operadorId ?? null,
        operadorRol: usuario?.rol ?? merged.operadorRol ?? null,
        operadorNombre: usuario?.nombre ?? merged.operadorNombre ?? null,
        /** Marca “gestionado ahora” para bandeja Hoy sin esperar F5. */
        creadoEn: ahoraIso,
      }
    : merged;
  const lead = applyDerivacionTerrenoAlLead(
    { ...base, seguimiento: seguimientoConOperador },
    seguimientoConOperador,
  );
  return { lead, saved, entradaHistorial, registroId: registroId ?? null, referidosCreados, nuevosLeads };
}
