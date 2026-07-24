import { useMemo } from 'react';
import {
  fechaDiaNegocio,
  filtrarLeadsActividadHoy,
} from '../../domain/actividad-hoy';
import { leadCompro, leadReagendaEntrevista } from '../../domain/leads';
import type { Lead } from '../../types';

interface Props {
  leads: Lead[];
  /** Id(s) del operador logueado (para “gestionados hoy”). */
  operadorId?: string | number | null | Array<string | number | null | undefined>;
}

function fueContactado(l: Lead) {
  return Boolean(l.seguimiento?.canal || l.seguimiento?.huboEntrevista != null);
}

export function PromotorResumen({ leads, operadorId }: Props) {
  const stats = useMemo(() => {
    const total = leads.length;
    const leadsVendidos = leads.filter(leadCompro).length;
    const vendidos = leads.reduce((acc, l) => {
      if (!leadCompro(l)) return acc;
      const adicionales = l.seguimiento?.comprasAdicionales?.length ?? 0;
      return acc + 1 + adicionales;
    }, 0);
    const enSeguimiento = leads.filter(
      (l) => !leadCompro(l) && leadReagendaEntrevista(l),
    ).length;
    const contactados = leads.filter(
      (l) => !leadCompro(l) && !leadReagendaEntrevista(l) && fueContactado(l),
    ).length;
    const conversion = total > 0 ? Math.round((leadsVendidos / total) * 100) : 0;

    const hoyStr = fechaDiaNegocio(new Date()) ?? '';
    const ingresaronHoy = leads.filter(
      (l) => fechaDiaNegocio(l.fechaAlta || l.fechaObtencion) === hoyStr,
    ).length;

    const tratoHoy = filtrarLeadsActividadHoy(leads, operadorId).length;

    const distinctDates = new Set(
      leads.map((l) => fechaDiaNegocio(l.fechaAlta || l.fechaObtencion)).filter(Boolean),
    );
    const promedioDiario = total / (distinctDates.size || 1);

    return {
      total,
      vendidos,
      enSeguimiento,
      contactados,
      tratoHoy,
      conversion,
      ingresaronHoy,
      promedioDiario,
    };
  }, [leads, operadorId]);

  return (
    <div className="mb-5 space-y-2.5">
      {/* KPIs del día — visibles de un vistazo */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sky-600">
            Ingresaron hoy
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-sky-900 sm:text-[32px]">
            {stats.ingresaronHoy}
          </p>
          <p className="mt-1.5 text-[11px] text-sky-700/70">
            Leads nuevos del día
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-600">
            Traté hoy
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-amber-800 sm:text-[32px]">
            {stats.tratoHoy}
          </p>
          <p className="mt-1.5 text-[11px] text-amber-700/70">
            Clientes que gestionaste
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
            Total leads
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-zinc-900 sm:text-[32px]">
            {stats.total}
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            {stats.promedioDiario.toFixed(1)}/día promedio
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
            Contactados
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-zinc-800 sm:text-[32px]">
            {stats.contactados}
          </p>
          <p className="mt-1.5 text-[11px] text-zinc-500">Acumulados</p>
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
    </div>
  );
}
