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
  titulo?: string;
}

export function EntrevistaAgendaBadge({
  lead,
  titulo = 'Entrevista pendiente',
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
    <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-700">
        {reagenda ? 'Próxima entrevista' : titulo}
      </p>

      {calendario ? (
        <div className="mt-2 flex items-end gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight text-zinc-800">
              {calendario.diaSemana}
            </p>
            <p className="text-2xl font-bold leading-none tabular-nums text-brand-600">
              {calendario.diaNumero}
            </p>
          </div>
          <p className="pb-0.5 text-xl font-semibold tabular-nums text-zinc-800">
            {calendario.hora}
          </p>
        </div>
      ) : (
        <p className="mt-1.5 text-[13px] text-zinc-500">Sin día ni hora en la encuesta</p>
      )}

      {lugarLabel && (
        <p
          className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-[12px] font-medium ${
            lugar === 'domicilio'
              ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
              : 'bg-white text-brand-700 ring-1 ring-brand-100'
          }`}
        >
          {lugarLabel}
        </p>
      )}

      {domicilioCita && (
        <p className="mt-1.5 text-[12px] text-zinc-600">
          <span className="text-zinc-400">Dir. cita: </span>
          {domicilioCita}
        </p>
      )}
    </div>
  );
}
