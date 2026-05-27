import type { Lead, Promotor } from '../../types';
import {
  getHorarioEntrevistaLead,
  getPromotorNombre,
  leadCompro,
  leadEnEntrevistaPendiente,
  leadReagendaEntrevista,
} from '../../domain/leads';

export type CalendarEventType = 'entrevista' | 'seguimiento';

export interface CalendarEvent {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  promotor: string;
  type: CalendarEventType;
  date: string;
  lead: Lead;
}

function eventoDesdeLead(l: Lead, promotores: Promotor[]): CalendarEvent | null {
  if (leadCompro(l)) return null;

  const promotor = l.promotorNombre ?? getPromotorNombre(l.promotorId, promotores);

  if (leadReagendaEntrevista(l) && l.seguimiento.fechaReagenda) {
    return {
      id: `${l.id}-reagenda`,
      leadId: l.id,
      leadName: l.nombre,
      leadPhone: l.telefono,
      promotor,
      type: 'seguimiento',
      date: l.seguimiento.fechaReagenda,
      lead: l,
    };
  }

  const horario = getHorarioEntrevistaLead(l);
  if (leadEnEntrevistaPendiente(l) && horario) {
    return {
      id: `${l.id}-entrevista`,
      leadId: l.id,
      leadName: l.nombre,
      leadPhone: l.telefono,
      promotor,
      type: 'entrevista',
      date: horario,
      lead: l,
    };
  }

  return null;
}

/** Eventos del calendario desde leads reales (encuesta + seguimiento local). */
export function buildCalendarEvents(leads: Lead[], promotores: Promotor[]): CalendarEvent[] {
  return leads
    .map((l) => eventoDesdeLead(l, promotores))
    .filter((ev): ev is CalendarEvent => ev !== null);
}
