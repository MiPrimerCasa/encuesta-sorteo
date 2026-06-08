import type { Lead } from '../types';
import {
  esCerradoNegativoLead,
  leadCompro,
  leadDerivaSupervisorTerreno,
  leadEnEntrevistaPendiente,
  leadReagendaEntrevista,
} from './leads';

/**
 * Prioridad en la primera pestaña de Leads (independiente del sorteo/campaña).
 * 0 = derivado a supervisor por interés terreno (promotor en calle)
 * 1 = entrevista agendada pendiente de gestión
 * 2 = encuesta cargada, sin contacto ni agenda ni derivación
 */
export type PrioridadTabInicial = 0 | 1 | 2;

export const ETIQUETA_PRIORIDAD_TAB_INICIAL: Record<PrioridadTabInicial, string> = {
  0: 'Interés terreno — derivado por promotor',
  1: 'Entrevista pendiente',
  2: 'Encuesta sin contactar',
};

export function fueContactadoLead(lead: Lead) {
  return Boolean(lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null);
}

export function leadActivoNoCerrado(lead: Lead) {
  return (
    !leadCompro(lead) &&
    !leadReagendaEntrevista(lead) &&
    !leadDerivaSupervisorTerreno(lead) &&
    !esCerradoNegativoLead(lead)
  );
}

/** null = no va en la pestaña inicial (va a Contactado, Seguimiento o Cierres). */
export function prioridadTabInicial(lead: Lead): PrioridadTabInicial | null {
  if (!leadActivoNoCerrado(lead)) return null;
  if (leadEnEntrevistaPendiente(lead)) return 1;
  if (!fueContactadoLead(lead)) return 2;
  return null;
}

export function perteneceTabInicial(lead: Lead) {
  return prioridadTabInicial(lead) !== null;
}

/** Dentro de cada grupo: más antiguo primero (FIFO por fecha de alta / encuesta). */
export function ordenarPorPrioridadTabInicial(leads: Lead[]) {
  return [...leads].sort((a, b) => {
    const pa = prioridadTabInicial(a) ?? 99;
    const pb = prioridadTabInicial(b) ?? 99;
    if (pa !== pb) return pa - pb;
    const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
    const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
    return fa.localeCompare(fb);
  });
}

export function agruparPorPrioridadTabInicial(leads: Lead[]) {
  const grupos: Record<PrioridadTabInicial, Lead[]> = { 0: [], 1: [], 2: [] };
  for (const lead of leads) {
    const p = prioridadTabInicial(lead);
    if (p != null) grupos[p].push(lead);
  }
  (Object.keys(grupos) as unknown as PrioridadTabInicial[]).forEach((k) => {
    grupos[k].sort((a, b) => {
      const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
      const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
      return fa.localeCompare(fb);
    });
  });
  return grupos;
}
