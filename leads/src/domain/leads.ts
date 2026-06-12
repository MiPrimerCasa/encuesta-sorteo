import type {
  Lead,
  LugarEntrevista,
  Producto,
  Promotor,
  RolUsuario,
  SeguimientoHistorialEntry,
  SeguimientoLead,
} from '../types';
import { ID_PRODUCTO_TERRENO } from './venta';

/** Lista única de promotores a partir de los leads ya cargados (evita 2.º SP en supervisor). */
export function buildPromotoresFromLeads(leads: Lead[]): Promotor[] {
  const map = new Map<string, Promotor>();
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

/** Lead dado de alta desde la app (origen manual / @origen = 2 en encuesta). */
export function leadEsCargaManual(lead: Lead): boolean {
  if (lead.seguimiento?.fuente === 'app') return true;
  const raw = String(lead.origenEncuesta ?? '').trim().toLowerCase();
  return raw === '2' || raw.includes('manual') || raw.includes('app');
}

export function leadCompro(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

/** Fecha ISO del cierre (venta); prioriza la última entrada «compró» del historial. */
export function fechaVentaLead(
  lead: Lead,
  historial: SeguimientoHistorialEntry[] = [],
): string {
  let ultima: string | null = null;
  for (const entry of historial) {
    if (entry.resultadoEntrevista !== 'compro') continue;
    if (!ultima || entry.creadoEn.localeCompare(ultima) > 0) ultima = entry.creadoEn;
  }
  if (ultima) return ultima;
  return lead.fechaAlta ?? `${lead.fechaObtencion}T00:00:00`;
}

/** Cierres: los vendidos más recientes primero. */
export function sortLeadsPorVentaReciente(
  leads: Lead[],
  historialPorLead: Record<string, SeguimientoHistorialEntry[]> = {},
): Lead[] {
  return [...leads].sort((a, b) => {
    const fa = fechaVentaLead(a, historialPorLead[a.id] ?? []);
    const fb = fechaVentaLead(b, historialPorLead[b.id] ?? []);
    return fb.localeCompare(fa);
  });
}

export function leadReagendaEntrevista(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'reagenda';
}

export const ETIQUETA_SEGUIMIENTO_PIJ = 'Seguimiento por plan inversión joven';
export const ETIQUETA_SEGUIMIENTO_AGENDA_SUPERVISOR =
  'Entrevista agendada por supervisor';
export const ETIQUETA_SEGUIMIENTO_AGENDA_PROMOTOR =
  'Entrevista agendada por promotor';

/** Reagenda activa del promotor tras no comprar PIJ (el supervisor no gestiona). */
export function leadSeguimientoPijPromotor(lead: Lead) {
  return (
    leadReagendaEntrevista(lead) && lead.seguimiento?.seguimientoPijPromotor === true
  );
}

function normalizarRolAgenda(rol?: RolUsuario | string | null): RolUsuario | null {
  const r = String(rol ?? '').trim().toLowerCase();
  if (r === 'supervisor' || r === 'promotor') return r;
  return null;
}

/** Reagenda de agenda inicial (sin cita previa) hecha por el otro rol. */
export function leadSeguimientoAgendaOtroRol(lead: Lead, rolViewer: RolUsuario): boolean {
  if (!leadReagendaEntrevista(lead) || leadSeguimientoPijPromotor(lead)) return false;
  const agendaRol = normalizarRolAgenda(lead.seguimiento?.seguimientoAgendaOperadorRol);
  if (!agendaRol) return false;
  const viewer = rolViewer === 'promotor' ? 'promotor' : 'supervisor';
  return agendaRol !== viewer;
}

export function etiquetaSeguimientoAgendaOtroRol(
  lead: Lead,
  rolViewer: RolUsuario,
): string | null {
  if (!leadSeguimientoAgendaOtroRol(lead, rolViewer)) return null;
  const agendaRol = normalizarRolAgenda(lead.seguimiento?.seguimientoAgendaOperadorRol);
  return agendaRol === 'supervisor'
    ? ETIQUETA_SEGUIMIENTO_AGENDA_SUPERVISOR
    : ETIQUETA_SEGUIMIENTO_AGENDA_PROMOTOR;
}

export function leadSoloLecturaSupervisor(lead: Lead) {
  if (leadSeguimientoPijPromotor(lead)) return true;
  return leadSeguimientoAgendaOtroRol(lead, 'supervisor');
}

export const ETIQUETA_CIERRE_SUPERVISOR = 'Cierre registrado por supervisor';
export const ETIQUETA_REFERIDO = 'Referido';

function normalizarRolOperador(rol?: string | null): RolUsuario | null {
  const r = String(rol ?? '').trim().toLowerCase();
  if (r === 'supervisor' || r === 'promotor') return r;
  return null;
}

/** Señales de cierre hecho por supervisor cuando operador_rol no viene de SQL. */
function seguimientoIndicaCierreSupervisor(seguimiento: SeguimientoLead) {
  if (normalizarRolOperador(seguimiento.operadorRol) === 'supervisor') return true;
  if (seguimiento.idProducto === ID_PRODUCTO_TERRENO) return true;
  // Flujo supervisor: «¿Confirmó entrevista?» — el promotor en calle no usa este campo.
  if (seguimiento.confirmoEntrevista != null) return true;
  return false;
}

function historialIndicaCierreSupervisor(historial: SeguimientoHistorialEntry[]) {
  for (const entry of historial) {
    if (entry.resultadoEntrevista !== 'compro') continue;
    const snap = entry.seguimientoSnapshot ?? {};
    if (normalizarRolOperador(entry.operadorRol) === 'supervisor') return true;
    if (normalizarRolOperador(entry.operadorRol) === 'promotor') return false;
    if (seguimientoIndicaCierreSupervisor(snap)) return true;
  }
  return false;
}

/** Cierre «Compró» cargado por el supervisor (promotor solo consulta). */
export function leadCierreRegistradoSupervisor(
  lead: Lead,
  historial: SeguimientoHistorialEntry[] = [],
) {
  if (!leadCompro(lead)) return false;
  const seg = lead.seguimiento ?? {};
  if (seguimientoIndicaCierreSupervisor(seg)) return true;
  return historialIndicaCierreSupervisor(historial);
}

export function leadSoloLecturaPromotor(
  lead: Lead,
  historial: SeguimientoHistorialEntry[] = [],
) {
  if (leadCierreRegistradoSupervisor(lead, historial)) return true;
  return leadSeguimientoAgendaOtroRol(lead, 'promotor');
}

export function leadDerivaSupervisorTerreno(lead: Lead) {
  const r = String(lead.seguimiento?.resultadoEntrevista ?? '')
    .trim()
    .toLowerCase();
  return r === 'derivar_terreno';
}

/** Lead activo derivado por interés terreno (prioridad máxima en tarjeta). */
export function leadEsInteresTerreno(lead: Lead) {
  if (!leadDerivaSupervisorTerreno(lead)) return false;
  return !leadCompro(lead) && !leadReagendaEntrevista(lead) && !esCerradoNegativoLead(lead);
}

/** En seguimiento: reagenda, derivación a terreno o entrevista confirmada. */
export function leadEnSeguimientoActivo(lead: Lead) {
  return (
    leadReagendaEntrevista(lead) ||
    leadDerivaSupervisorTerreno(lead) ||
    (leadTieneCitaPrevia(lead) && lead.seguimiento?.confirmoEntrevista === true)
  );
}

/** Fecha de referencia para ordenar la bandeja En seguimiento. */
export function fechaSeguimientoLead(lead: Lead): string {
  if (leadReagendaEntrevista(lead) && lead.seguimiento?.fechaReagenda) {
    return lead.seguimiento.fechaReagenda;
  }
  if (leadDerivaSupervisorTerreno(lead)) {
    const h =
      lead.seguimiento?.horarioEntrevistaPropuesto?.trim() ||
      lead.horarioEntrevista?.trim();
    if (h) return h;
  }
  if (lead.seguimiento?.confirmoEntrevista === true) {
    const h =
      lead.horarioEntrevista?.trim() ||
      lead.seguimiento?.horarioEntrevistaPropuesto?.trim();
    if (h) return h;
  }
  return lead.fechaAlta ?? `${lead.fechaObtencion}T00:00:00`;
}

export function sortLeadsSeguimiento(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) =>
    fechaSeguimientoLead(a).localeCompare(fechaSeguimientoLead(b)),
  );
}

/** Aplica patch de seguimiento y campos de lead (p. ej. derivación a supervisor). */
export function applySeguimientoAlLead(lead: Lead, patch: SeguimientoLead): Lead {
  const seguimiento = { ...lead.seguimiento, ...patch };
  let next: Lead = { ...lead, seguimiento };

  if (seguimiento.resultadoEntrevista !== 'derivar_terreno') {
    return next;
  }

  const horario = seguimiento.horarioEntrevistaPropuesto?.trim();
  if (horario) {
    return {
      ...next,
      horarioEntrevista: horario,
      quiereEntrevista: true,
      lista: 'contacto',
    };
  }

  const { horarioEntrevista: _omit, ...sinHorario } = next;
  return {
    ...sinHorario,
    quiereEntrevista: false,
    lista: 'contacto',
  };
}

export function esCerradoNegativoLead(lead: Lead) {
  const r = lead.seguimiento?.resultadoEntrevista;
  return r === 'no_compro' || r === 'sin_interes';
}

/** Entrevista hecha y resultado negativo (va a Contactado con prioridad visual). */
export function leadPostEntrevistaSinCompra(lead: Lead) {
  return esCerradoNegativoLead(lead) && lead.seguimiento?.huboEntrevista === true;
}

/** Contactado (supervisor): primero post-entrevista sin compra; el resto FIFO. */
export function sortLeadsContactados(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const aPrior = leadPostEntrevistaSinCompra(a) ? 0 : 1;
    const bPrior = leadPostEntrevistaSinCompra(b) ? 0 : 1;
    if (aPrior !== bPrior) return aPrior - bPrior;
    const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
    const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
    if (aPrior === 0) return fb.localeCompare(fa);
    return fa.localeCompare(fb);
  });
}

function fueContactadoLead(lead: Lead) {
  return Boolean(lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null);
}

/** Último movimiento de seguimiento (historial) o fecha de alta si ya fue contactado. */
export function fechaUltimoContactoLead(
  lead: Lead,
  historial: SeguimientoHistorialEntry[] = [],
): string {
  let ultima: string | null = null;
  for (const entry of historial) {
    if (!ultima || entry.creadoEn.localeCompare(ultima) > 0) ultima = entry.creadoEn;
  }
  if (ultima) return ultima;
  if (fueContactadoLead(lead) || esCerradoNegativoLead(lead)) {
    return lead.fechaAlta ?? `${lead.fechaObtencion}T00:00:00`;
  }
  return lead.fechaAlta ?? `${lead.fechaObtencion}T00:00:00`;
}

/** Contactado (promotor): el último contactado primero. */
export function sortLeadsContactadosPromotor(
  leads: Lead[],
  historialPorLead: Record<string, SeguimientoHistorialEntry[]> = {},
): Lead[] {
  return [...leads].sort((a, b) => {
    const fa = fechaUltimoContactoLead(a, historialPorLead[a.id] ?? []);
    const fb = fechaUltimoContactoLead(b, historialPorLead[b.id] ?? []);
    return fb.localeCompare(fa);
  });
}

/** Pestaña de Leads donde corresponde listar el lead. */
export function tabIdListaLead(lead: Lead): 'entrevista' | 'contacto' | 'seguimiento' | 'compro' {
  if (leadCompro(lead)) return 'compro';
  if (leadEnSeguimientoActivo(lead)) return 'seguimiento';
  // Resultados negativos (no compró / sin interés) → Contactado.
  if (esCerradoNegativoLead(lead)) return 'contacto';
  // Entrevistas pendientes van a Prioridad, no a Contactado.
  if (leadEnEntrevistaPendiente(lead)) return 'entrevista';
  if (lead.seguimiento?.canal != null || lead.seguimiento?.huboEntrevista != null) return 'contacto';
  return 'entrevista';
}

export interface EntrevistaCalendarioFmt {
  diaSemana: string;
  diaNumero: number;
  hora: string;
}

export function formatEntrevistaCalendario(
  isoLocal?: string | null,
): EntrevistaCalendarioFmt | null {
  if (!isoLocal) return null;
  let d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) {
    const m = String(isoLocal).match(/(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return null;
    d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
    );
  }
  if (Number.isNaN(d.getTime())) return null;
  const diaRaw = d.toLocaleDateString('es-AR', { weekday: 'long' });
  const diaSemana = diaRaw.charAt(0).toUpperCase() + diaRaw.slice(1);
  return {
    diaSemana,
    diaNumero: d.getDate(),
    hora: d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

export function formatFechaReagenda(isoLocal?: string | null) {
  const fmt = formatEntrevistaCalendario(isoLocal);
  if (!fmt) return isoLocal ?? '';
  return `${fmt.diaSemana} ${fmt.diaNumero} · ${fmt.hora}`;
}

export function labelLugarEntrevista(lugar?: LugarEntrevista | null) {
  if (lugar === 'sucursal') return 'En oficinas / sucursal';
  if (lugar === 'domicilio') return 'A domicilio del cliente';
  return null;
}

function esHorarioPlaceholderSinCita(fechaAlta?: string) {
  if (!fechaAlta) return true;
  return /T09:00:00$/.test(fechaAlta);
}

export function getHorarioEntrevistaLead(lead: Lead): string | null {
  if (leadReagendaEntrevista(lead) && lead.seguimiento?.fechaReagenda) {
    return lead.seguimiento.fechaReagenda;
  }
  if (lead.horarioEntrevista) return lead.horarioEntrevista;
  if (lead.lista !== 'entrevista' || !lead.fechaAlta) return null;
  if (esHorarioPlaceholderSinCita(lead.fechaAlta)) return null;
  return lead.fechaAlta;
}

/** Lead con día y hora de entrevista ya definidos (encuesta, carga manual o reagenda). */
export function leadTieneCitaPrevia(lead: Lead): boolean {
  return Boolean(getHorarioEntrevistaLead(lead));
}

export function getLugarEntrevistaLead(lead: Lead): LugarEntrevista | null {
  if (leadReagendaEntrevista(lead)) return null;
  return lead.lugarEntrevista ?? null;
}

export function leadEnEntrevistaPendiente(lead: Lead) {
  return (
    lead.lista === 'entrevista' &&
    !leadReagendaEntrevista(lead) &&
    !leadCompro(lead) &&
    lead.seguimiento?.confirmoEntrevista !== true
  );
}

export function getPromotorNombre(
  promotorId: string,
  lista: Promotor[] = [],
  fallback?: string,
) {
  return lista.find((p) => p.id === promotorId)?.nombre ?? fallback ?? 'Sin promotor';
}

export function getProductoNombre(idProducto: string | null | undefined, productos: Producto[]) {
  const fromCatalog = productos.find((p) => p.id === idProducto)?.nombre;
  if (fromCatalog) return fromCatalog;
  if (idProducto === 'prod-pij') return 'Plan Inversión Joven';
  if (idProducto === 'prod-terreno') return 'Terreno';
  return null;
}

export function getProductosPorRol(productos: Producto[], rol: RolUsuario) {
  const rolFiltro = rol === 'superadmin' ? 'supervisor' : rol;
  return productos.filter((p) => p.rolesPermitidos.includes(rolFiltro));
}

export function puedeVenderProducto(productos: Producto[], rol: RolUsuario, idProducto: string) {
  const rolFiltro = rol === 'superadmin' ? 'supervisor' : rol;
  const prod = productos.find((p) => p.id === idProducto);
  return Boolean(prod?.rolesPermitidos.includes(rolFiltro));
}

/** Solo el último operador que modificó el lead puede volver a cambiar su estado. */
export function leadSoloLecturaUltimoModificador(
  lead: Lead | null | undefined,
  currentUserId: string | number | undefined | null,
  userRole?: string | null,
): boolean {
  if (!lead?.seguimiento?.operadorId) {
    // Si no tiene operadorId de seguimiento previo, cualquiera puede gestionarlo.
    return false;
  }
  // Si está derivado a terreno por el promotor, el supervisor lo puede tratar sin importar quién lo modificó último
  if (
    lead.seguimiento?.resultadoEntrevista === 'derivar_terreno' &&
    (userRole === 'supervisor' || userRole === 'superadmin')
  ) {
    return false;
  }
  if (!currentUserId) return false;
  return String(lead.seguimiento.operadorId) !== String(currentUserId);
}

