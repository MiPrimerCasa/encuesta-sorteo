import { useAuth } from '../../context/AuthContext';
import type { Lead } from '../../types';
import { LinksRedesSection } from '../leads/LinksRedesSection';
import { PromotorResumen } from '../leads/PromotorResumen';
import { LeadsHistorial } from './LeadsHistorial';
import { OrigenLeadsChart } from './OrigenLeadsChart';

interface Props {
  leads: Lead[];
}

export function PromotorMetricasPanel({ leads }: Props) {
  const { usuario } = useAuth();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-12 sm:px-6">

      {/* Header personal */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Mis métricas
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-zinc-900 sm:text-[24px]">
          {usuario?.nombre ?? 'Mi panel'}
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Rendimiento y conversión de tus leads
        </p>
      </div>

      {/* Stats — 4 cols en sm+ */}
      <PromotorResumen leads={leads} />

      {/* Origen / canal de captación + historial — 2 cols en lg */}
      <div className="mt-8 space-y-8 lg:grid lg:grid-cols-[1fr_380px] lg:gap-8 lg:space-y-0">

        <div className="min-w-0">
          <OrigenLeadsChart leads={leads} promotores={[]} />
        </div>

        <div className="min-w-0">
          <LeadsHistorial leads={leads} promotores={[]} modoPromotor />
        </div>

      </div>

      <LinksRedesSection className="mt-8" />
    </div>
  );
}
