import sql from 'mssql';
import {
  getSqlPoolEncuestas,
  isSqlServerConfigured,
  mapOperadorVendedorToRol,
  parseIdEntero,
} from './mssql.js';
import { getSeguimientoExterno, upsertSeguimientoExterno } from './sqlite.js';

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
  if (v.includes('manual') || v.includes('app') || v === 'apps' || v === 'aplicacion' || v === 'aplicación') {
    return 'app';
  }
  if (v.includes('face') || v.includes('fb') || v === 'facebook') return 'facebook';
  if (v.includes('insta') || v.includes('ig') || v === 'instagram') return 'instagram';
  return null;
}

function parseSiNo(valor) {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .startsWith('S');
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
      if (looksLikeTelefonoCelular(t)) return t;
    }
  }

  const picked =
    pickField(row, 'telefono', 'Telefono', 'Teléfono', 'Celular', 'WhatsApp', 'whatsapp') ??
    pickFieldStartsWith(row, 'telefono', 'celular', 'whatsapp');
  if (picked && looksLikeTelefonoCelular(picked)) {
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

function getEncuestasParamIdVendedor() {
  return process.env.SP_ENCUESTAS_PARAM_ID || 'idVendedor';
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

/**
 * Rol según encuestasMuestraOperador: idOperador === idVendedor → supervisor.
 * La DB ya filtra qué filas devuelve con @idVendedor = idOperador.
 */
export function resolveRolFromEncuestasRows(rows, idOperador) {
  if (!rows?.length) return null;
  const idVendedor = pickField(rows[0], 'idVendedor', 'IdVendedor');
  const idSupervisor = pickField(rows[0], 'idSupervisor', 'IdSupervisor');
  const rol = mapOperadorVendedorToRol(idOperador, idVendedor);
  if (!rol) return null;
  return {
    rol,
    rolOrigen: 'encuestas',
    idVendedor: idVendedor != null ? String(idVendedor) : undefined,
    idSupervisor: idSupervisor != null ? String(idSupervisor) : undefined,
  };
}

/** Tras login: consulta encuestas y define rol + ids de la primera fila. */
export async function enrichOperadorRolDesdeEncuestas(operador) {
  const idOperador = operador.idOperador ?? operador.id;
  if (!parseIdEntero(idOperador)) return operador;

  try {
    const rows = await fetchEncuestasMuestraRaw({
      id: String(idOperador),
      nombre: operador.nombre,
      rol: 'supervisor',
    });
    const resolved = resolveRolFromEncuestasRows(rows, idOperador);
    if (!resolved) return operador;

    return {
      ...operador,
      rol: resolved.rol,
      rolOrigen: resolved.rolOrigen,
      idVendedor: resolved.idVendedor ?? operador.idVendedor,
      idSupervisor: resolved.idSupervisor ?? operador.idSupervisor,
    };
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
  const partes = [];
  const domicilio = pickField(row, 'Domicilio', 'domicilio');
  const conoce = pickField(row, 'Conoce MPC', 'Conoce MPC ');
  const sabias = pickField(
    row,
    'Sabias que c...',
    'Sabias que con MPC podes acceder a la vivienda propia',
  );
  const lugar = pickField(row, 'Domicilio de encuest...', 'Domicilio de encuesta');
  if (domicilio) partes.push(`Domicilio encuesta: ${domicilio}`);
  if (conoce) partes.push(`Conoce MPC: ${conoce}`);
  if (sabias) partes.push(`Sabía vivienda propia: ${sabias}`);
  if (lugar) partes.push(`Lugar encuesta: ${lugar}`);
  return partes.join(' · ');
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

  const fechaBase = horarioIso ? horarioIso.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const lista = horarioIso || quiereAsesoramiento ? 'entrevista' : 'contacto';

  const seguimientoRemoto = seguimientoLocal[usuario] ?? {};
  const observacionesEncuesta = buildObservacionesEncuesta(row);
  const seguimiento = {
    ...seguimientoRemoto,
    // Origen desde encuesta; el caché local solo pisa si el usuario guardó fuente explícita.
    fuente: seguimientoRemoto.fuente ?? fuenteDB ?? null,
    observaciones:
      [seguimientoRemoto.observaciones, observacionesEncuesta].filter(Boolean).join('\n') ||
      undefined,
  };

  return {
    id: String(usuario ?? `enc-${slugId(nombreLead)}`),
    nombre: String(nombreLead).trim(),
    telefono: telefonoEncuesta,
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
    fechaAlta: horarioIso ?? `${fechaBase}T09:00:00`,
    seguimiento,
  };
}

export function buildPromotoresFromLeads(leads) {
  const map = new Map();
  for (const lead of leads) {
    if (!map.has(lead.promotorId)) {
      map.set(lead.promotorId, {
        id: lead.promotorId,
        nombre: lead.promotorNombre ?? lead.promotorId,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function enrichLeadParaCliente(lead) {
  let horarioEntrevista = lead.horarioEntrevista;
  if (
    !horarioEntrevista &&
    lead.lista === 'entrevista' &&
    lead.fechaAlta &&
    !String(lead.fechaAlta).endsWith('T09:00:00')
  ) {
    horarioEntrevista = lead.fechaAlta;
  }
  if (horarioEntrevista === lead.horarioEntrevista) return lead;
  return { ...lead, horarioEntrevista };
}

export async function listLeadsFromEncuestas(usuario) {
  const rows = await fetchEncuestasMuestraRaw(usuario);
  const ids = rows
    .map((r) => pickField(r, 'usuario', 'Usuario'))
    .filter(Boolean)
    .map(String);
  const seguimientoById = Object.fromEntries(
    ids.map((id) => [id, getSeguimientoExterno(id)]),
  );
  const leads = rows.map((row) => {
    const id = String(pickField(row, 'usuario', 'Usuario'));
    return enrichLeadParaCliente(
      mapEncuestaRowToLead(row, { [id]: seguimientoById[id] }),
    );
  });
  leads.sort((a, b) => (a.fechaAlta ?? '').localeCompare(b.fechaAlta ?? ''));
  return leads;
}

/** Leads desde SQL Server (encuestasMuestraOperador filtrado en la DB). */
export function useEncuestasFromSql() {
  return isSqlServerConfigured();
}

export async function updateLeadSeguimientoEncuesta(leadId, seguimiento, usuario, usuarioId) {
  const rows = await fetchEncuestasMuestraRaw(usuario);
  const row = rows.find((r) => String(pickField(r, 'usuario', 'Usuario')) === leadId);
  if (!row) return null;
  const merged = upsertSeguimientoExterno(leadId, seguimiento, usuarioId);
  return mapEncuestaRowToLead(row, { [leadId]: merged });
}
