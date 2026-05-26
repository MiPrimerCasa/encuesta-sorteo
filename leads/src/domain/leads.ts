import type { Lead, LugarEntrevista, Producto, Promotor, RolUsuario } from '../types';

export function leadCompro(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

export function leadReagendaEntrevista(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'reagenda';
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

/** Placeholder del mapper cuando la encuesta no trae horario (09:00 del día de alta). */
function esHorarioPlaceholderSinCita(fechaAlta?: string) {
  if (!fechaAlta) return true;
  return /T09:00:00$/.test(fechaAlta);
}

/** Horario a mostrar: reagenda local o cita de la encuesta. */
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

/** Tarjeta en pestaña Entrevista pendiente (siempre mostrar bloque de cita). */
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
