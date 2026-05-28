import { usePromotoresMetrics } from '../../hooks/usePromotoresMetrics';
import type { Lead, Promotor } from '../../types';
import { LeadsHistorial } from './LeadsHistorial';
import { OrigenLeadsChart } from './OrigenLeadsChart';
import { PromotoresChart } from './PromotoresChart';
import { PromotoresTable } from './PromotoresTable';

interface PromotoresPanelProps {
  leads: Lead[];
  promotores: Promotor[];
}

export function PromotoresPanel({ leads, promotores }: PromotoresPanelProps) {
  const metricas = usePromotoresMetrics(leads, promotores);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 pb-12 sm:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Mi Primer Casa S.A.
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-zinc-900">
          Métricas de origen
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Leads por promotor y conversión a compra
        </p>
      </div>

      <PromotoresTable metricas={metricas} />
      <PromotoresChart leads={leads} promotores={promotores} />
      <OrigenLeadsChart leads={leads} promotores={promotores} />
      <LeadsHistorial leads={leads} promotores={promotores} />
    </div>
  );
}
