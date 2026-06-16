import { useMemo } from 'react';
import { leadCompro, leadReagendaEntrevista } from '../../domain/leads';
import type { Lead } from '../../types';

interface Props {
  leads: Lead[];
}

function fueContactado(l: Lead) {
  return Boolean(l.seguimiento?.canal || l.seguimiento?.huboEntrevista != null);
}

export function PromotorResumen({ leads }: Props) {
  const stats = useMemo(() => {
    const total = leads.length;
    const vendidos = leads.filter(leadCompro).length;
    const enSeguimiento = leads.filter(
      (l) => !leadCompro(l) && leadReagendaEntrevista(l),
    ).length;
    const contactados = leads.filter(
      (l) => !leadCompro(l) && !leadReagendaEntrevista(l) && fueContactado(l),
    ).length;
    const conversion = total > 0 ? Math.round((vendidos / total) * 100) : 0;

    const hoyStr = new Date().toISOString().slice(0, 10);
    const leadsHoy = leads.filter(
      (l) => (l.fechaAlta || l.fechaObtencion || '').slice(0, 10) === hoyStr,
    ).length;

    const distinctDates = new Set(
      leads.map((l) => (l.fechaAlta || l.fechaObtencion || '').slice(0, 10)).filter(Boolean),
    );
    const promedioDiario = total / (distinctDates.size || 1);

    return { total, vendidos, enSeguimiento, contactados, conversion, leadsHoy, promedioDiario };
  }, [leads]);

  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
          Total leads
        </p>
        <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-zinc-900 sm:text-[32px]">
          {stats.total}
        </p>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          <span className="font-semibold text-brand-600">{stats.leadsHoy} hoy</span>
          <span className="mx-1 text-zinc-300">·</span>
          <span>{stats.promedioDiario.toFixed(1)}/día</span>
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-500">
          Contactados
        </p>
        <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-amber-700 sm:text-[32px]">
          {stats.contactados}
        </p>
      </div>

      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-500">
          En seguimiento
        </p>
        <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-brand-700 sm:text-[32px]">
          {stats.enSeguimiento}
        </p>
      </div>

      <div className="rounded-xl border border-[#bbf7d0] bg-ok-subtle px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ok/70">
          Conversión
        </p>
        <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-ok sm:text-[32px]">
          {stats.conversion}%
        </p>
        <p className="mt-0.5 text-[11px] text-ok/60">
          {stats.vendidos} cierre{stats.vendidos !== 1 ? 's' : ''}
        </p>
      </div>

    </div>
  );
}
