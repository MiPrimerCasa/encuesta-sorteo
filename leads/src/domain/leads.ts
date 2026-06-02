import type { Lead, LugarEntrevista, Producto, Promotor, RolUsuario, SeguimientoLead } from '../types';

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

export function leadCompro(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

export function leadReagendaEntrevista(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'reagenda';
}

export const ETIQUETA_SEGUIMIENTO_PIJ = 'Seguimiento por plan inversión joven';

/** Reagenda activa del promotor tras no comprar PIJ (el supervisor no gestiona). */
export function leadSeguimientoPijPromotor(lead: Lead) {
  return (
    leadReagendaEntrevista(lead) && lead.seguimiento?.seguimientoPijPromotor === true
  );
}

export function leadSoloLecturaSupervisor(lead: Lead) {
  return leadSeguimientoPijPromotor(lead);
}

export function leadDerivaSupervisorTerreno(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'derivar_terreno';
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
      lista: 'entrevista',
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

/** Pestaña de Leads donde corresponde listar el lead. */
export function tabIdListaLead(lead: Lead): 'entrevista' | 'contacto' | 'seguimiento' | 'compro' {
  if (leadCompro(lead) || esCerradoNegativoLead(lead)) return 'compro';
  if (leadReagendaEntrevista(lead)) return 'seguimiento';
  // Derivados y entrevistas pendientes van a la pestaña inicial (prioridad), no a Contactado.
  if (leadDerivaSupervisorTerreno(lead)) return 'entrevista';
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

export function getLugarEntrevistaLead(lead: Lead): LugarEntrevista | null {
  if (leadReagendaEntrevista(lead)) return null;
  return lead.lugarEntrevista ?? null;
}

export function leadEnEntrevistaPendiente(lead: Lead) {
  return lead.lista === 'entrevista' && !leadReagendaEntrevista(lead) && !leadCompro(lead);
}

export function getPromotorNombre(
  promotorId: string,
  lista: Promotor[] = [],
  fallback?: string,
) {
  return lista.find((p) => p.id === promotorId)?.nombre ?? fallback ?? 'Sin promotor';
}

export function getProductoNombre(idProducto: string | null | undefined, productos: Producto[]) {
  return productos.find((p) => p.id === idProducto)?.nombre ?? null;
}

export function getProductosPorRol(productos: Producto[], rol: RolUsuario) {
  return productos.filter((p) => p.rolesPermitidos.includes(rol));
}

export function puedeVenderProducto(productos: Producto[], rol: RolUsuario, idProducto: string) {
  const prod = productos.find((p) => p.id === idProducto);
  return Boolean(prod?.rolesPermitidos.includes(rol));
}
