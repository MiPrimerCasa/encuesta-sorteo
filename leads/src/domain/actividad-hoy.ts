import type { Lead } from '../types';

/** Zona horaria de negocio (Argentina) para “hoy”. */
export const TZ_NEGOCIO = 'America/Argentina/Buenos_Aires';

/** Día civil YYYY-MM-DD en la TZ de negocio. */
export function fechaDiaNegocio(raw?: string | Date | null, ahora = new Date()): string | null {
  let d: Date;
  if (raw == null || raw === '') {
    d = ahora;
  } else if (raw instanceof Date) {
    d = raw;
  } else {
    const s = String(raw).trim();
    // Fecha sola → día local de negocio sin parsear como UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    d = new Date(s.includes('T') || s.includes(' ') ? s : `${s}T12:00:00`);
  }
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function esMismoDiaNegocio(raw: string | Date | null | undefined, ahora = new Date()) {
  const dia = fechaDiaNegocio(raw, ahora);
  const hoy = fechaDiaNegocio(ahora, ahora);
  return Boolean(dia && hoy && dia === hoy);
}

function idOperadorSesion(usuarioId: string | number | null | undefined) {
  if (usuarioId == null || usuarioId === '') return '';
  return String(usuarioId).trim();
}

function fueContactado(lead: Lead) {
  return Boolean(lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null);
}

/** Hubo alguna gestión de contacto / resultado (no lead virgen). */
export function leadTieneGestionContacto(lead: Lead) {
  const s = lead.seguimiento;
  if (!s) return false;
  return Boolean(
    fueContactado(lead) ||
      s.resultadoEntrevista ||
      s.confirmoEntrevista === true ||
      s.fechaReagenda ||
      s.derivacionTerrenoActiva ||
      s.fechaCierre,
  );
}

function idsOperadorCandidatos(usuarioId: string | number | null | undefined | Array<string | number | null | undefined>) {
  const raw = Array.isArray(usuarioId) ? usuarioId : [usuarioId];
  const out = new Set<string>();
  for (const v of raw) {
    const s = idOperadorSesion(v);
    if (s) out.add(s);
  }
  return out;
}

/**
 * Última gestión del lead fue hecha hoy por este operador
 * (usa creadoEn del último seguimiento, o fechaCierre como respaldo).
 */
export function leadGestionadoHoyPorOperador(
  lead: Lead,
  operadorId:
    | string
    | number
    | null
    | undefined
    | Array<string | number | null | undefined>,
  ahora = new Date(),
) {
  const candidatos = idsOperadorCandidatos(operadorId);
  if (candidatos.size === 0) return false;
  const s = lead.seguimiento;
  if (!s) return false;
  const opLead = String(s.operadorId ?? '').trim();
  if (!opLead || !candidatos.has(opLead)) return false;
  if (!leadTieneGestionContacto(lead)) return false;

  const fechaRef = s.creadoEn || s.fechaCierre || null;
  if (!fechaRef) return false;
  return esMismoDiaNegocio(fechaRef, ahora);
}

function timestampOrden(lead: Lead) {
  const raw = lead.seguimiento?.creadoEn || lead.seguimiento?.fechaCierre || '';
  const t = Date.parse(String(raw).replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

/** Leads que el operador gestionó hoy, más recientes primero. */
export function filtrarLeadsActividadHoy(
  leads: Lead[],
  operadorId:
    | string
    | number
    | null
    | undefined
    | Array<string | number | null | undefined>,
  ahora = new Date(),
) {
  return leads
    .filter((l) => leadGestionadoHoyPorOperador(l, operadorId, ahora))
    .sort((a, b) => timestampOrden(b) - timestampOrden(a));
}
