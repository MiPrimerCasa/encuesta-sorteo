import { useMemo } from 'react';
import type { Lead } from '../../types';

const UMBRAL_DIAS = 2;

function diasDesde(lead: Lead): number {
  const fecha = lead.fechaAlta ?? `${lead.fechaObtencion}T00:00:00`;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

interface Props {
  leads: Lead[];
  onClickLead: (lead: Lead) => void;
}

export function AlertasSinContactar({ leads, onClickLead }: Props) {
  const alertas = useMemo(
    () => leads.filter((l) => diasDesde(l) >= UMBRAL_DIAS),
    [leads],
  );

  if (alertas.length === 0) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-red-200 bg-red-50">
      <div className="flex items-center gap-2 border-b border-red-100 px-4 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-red-700">
          Sin contactar +{UMBRAL_DIAS} días &middot;{' '}
          {alertas.length} lead{alertas.length > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="md:grid md:grid-cols-2">
        {alertas.map((lead, i) => (
          <li
            key={lead.id}
            className={`border-red-100 ${
              i > 0 ? 'border-t md:border-t-0' : ''
            } md:[&:nth-child(n+3)]:border-t md:[&:nth-child(2)]:border-l`}
          >
            <button
              type="button"
              onClick={() => onClickLead(lead)}
              style={{ touchAction: 'manipulation' }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors active:bg-red-100 hover:bg-red-100/60"
            >
              <span className="text-[13px] font-semibold text-zinc-800">{lead.nombre}</span>
              <span className="text-[11px] font-medium text-red-500 tabular-nums">
                {diasDesde(lead)}d sin contacto
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
