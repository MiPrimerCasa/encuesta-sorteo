import { usePromotoresMetrics } from '../../hooks/usePromotoresMetrics';
import type { Lead, Promotor } from '../../types';
import { PromotoresChart } from './PromotoresChart';
import { PromotoresTable } from './PromotoresTable';

interface PromotoresPanelProps {
  leads: Lead[];
  promotores: Promotor[];
}

export function PromotoresPanel({ leads, promotores }: PromotoresPanelProps) {
  const metricas = usePromotoresMetrics(leads, promotores);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-4 pb-8">
      <div className="border-l-4 border-brand pl-3">
        <h2 className="text-lg font-bold uppercase text-neutral-900">Métricas de origen</h2>
        <p className="text-sm text-neutral-600">
          Mi Primer Casa S.A. · Leads por promotor y conversión a compra
        </p>
      </div>

      <PromotoresTable metricas={metricas} />
      <PromotoresChart leads={leads} promotores={promotores} />
    </div>
  );
}
