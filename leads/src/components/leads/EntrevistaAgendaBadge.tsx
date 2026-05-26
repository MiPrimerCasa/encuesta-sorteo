import {
  formatEntrevistaCalendario,
  getHorarioEntrevistaLead,
  getLugarEntrevistaLead,
  labelLugarEntrevista,
  leadReagendaEntrevista,
} from '../../domain/leads';
import type { Lead } from '../../types';

interface EntrevistaAgendaBadgeProps {
  lead: Lead;
  /** Título corto encima del bloque (ej. Entrevista pendiente / Próxima entrevista). */
  titulo?: string;
}

export function EntrevistaAgendaBadge({
  lead,
  titulo = 'Entrevista',
}: EntrevistaAgendaBadgeProps) {
  const reagenda = leadReagendaEntrevista(lead);
  const horario = getHorarioEntrevistaLead(lead);
  const calendario = formatEntrevistaCalendario(horario);
  const lugar = getLugarEntrevistaLead(lead);
  const lugarLabel = labelLugarEntrevista(lugar);
  const domicilioCita =
    lugar === 'domicilio' && lead.domicilioEntrevista
      ? lead.domicilioEntrevista
      : null;

  return (
    <div className="mt-3 rounded-xl border-2 border-brand/25 bg-brand-light/80 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-dark">
        {reagenda ? 'Próxima entrevista' : titulo}
      </p>

      {calendario ? (
        <div className="mt-2 flex items-end gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight text-neutral-900">
              {calendario.diaSemana}
            </p>
            <p className="text-3xl font-black leading-none tabular-nums text-brand">
              {calendario.diaNumero}
            </p>
          </div>
          <p className="pb-0.5 text-2xl font-bold tabular-nums text-neutral-800">
            {calendario.hora}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">Sin día ni hora cargados en la encuesta</p>
      )}

      {lugarLabel && (
        <p
          className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
            lugar === 'domicilio'
              ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-300/60'
              : 'bg-white text-brand-dark ring-1 ring-brand/20'
          }`}
        >
          {lugarLabel}
        </p>
      )}

      {domicilioCita && (
        <p className="mt-1.5 text-xs font-medium text-neutral-700">
          <span className="text-neutral-500">Dirección: </span>
          {domicilioCita}
        </p>
      )}
    </div>
  );
}
