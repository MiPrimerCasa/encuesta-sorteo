import type { Promotor } from '../../types';

export type MetricaPromotor = Promotor & { totalLeads: number; leadsCompro: number };

interface PromotoresTableProps {
  metricas: MetricaPromotor[];
}

export function PromotoresTable({ metricas }: PromotoresTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-brand/15 bg-white shadow-sm">
      <table className="hidden w-full text-left lg:table">
        <thead>
          <tr className="border-b-2 border-brand/10 bg-brand text-xs font-bold uppercase tracking-wide text-white">
            <th className="px-4 py-3">Promotor</th>
            <th className="px-4 py-3 text-center">Total leads</th>
            <th className="px-4 py-3 text-center">Compró</th>
          </tr>
        </thead>
        <tbody>
          {metricas.map((p) => (
            <tr key={p.id} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-4">
                <span className="font-bold text-neutral-900">{p.nombre}</span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full bg-brand-light px-3 py-1 text-lg font-bold text-brand">
                  {p.totalLeads}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className="inline-flex min-w-[2.5rem] flex-col items-center gap-0.5">
                  <span className="rounded-full bg-black px-3 py-1 text-lg font-bold text-white">
                    {p.leadsCompro}
                  </span>
                  {p.totalLeads > 0 && (
                    <span className="text-xs font-medium text-neutral-500">
                      {Math.round((p.leadsCompro / p.totalLeads) * 100)}%
                    </span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-3 p-4 lg:hidden" aria-label="Lista de promotores">
        {metricas.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-2xl border-2 border-brand/15 bg-brand-light/50 p-4"
          >
            <p className="font-bold text-neutral-900">{p.nombre}</p>
            <div className="flex gap-3 text-center">
              <div>
                <p className="text-xs font-bold uppercase text-brand">Leads</p>
                <p className="text-xl font-bold text-brand">{p.totalLeads}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-neutral-600">Compró</p>
                <p className="text-xl font-bold text-black">{p.leadsCompro}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
