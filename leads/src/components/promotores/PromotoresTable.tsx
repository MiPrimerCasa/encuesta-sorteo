import type { Promotor } from '../../types';

export type MetricaPromotor = Promotor & {
  totalLeads: number;
  leadsCompro: number;
  leadsHoy: number;
  promedioDiario: number;
};

interface PromotoresTableProps {
  metricas: MetricaPromotor[];
}

function ConversionBar({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="min-w-[36px] text-right text-[12px] tabular-nums text-zinc-400">
        {value}%
      </span>
    </span>
  );
}

export function PromotoresTable({ metricas }: PromotoresTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">

      {/* Desktop */}
      <table className="hidden w-full text-left lg:table">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Promotor
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Leads Hoy
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Promedio/Día
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Total leads
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Compró
            </th>
            <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Conversión
            </th>
          </tr>
        </thead>
        <tbody>
          {metricas.map((p) => {
            const pct = p.totalLeads > 0 ? Math.round((p.leadsCompro / p.totalLeads) * 100) : 0;
            return (
              <tr
                key={p.id}
                className="border-b border-zinc-100 last:border-0 transition-colors hover:bg-zinc-50"
              >
                <td className="px-5 py-4 text-[14px] font-medium text-zinc-900">{p.nombre}</td>
                <td className="px-5 py-4 text-right text-[14px] font-semibold tabular-nums text-brand-600">
                  {p.leadsHoy}
                </td>
                <td className="px-5 py-4 text-right text-[14px] font-semibold tabular-nums text-zinc-600">
                  {p.promedioDiario.toFixed(1)}
                </td>
                <td className="px-5 py-4 text-right text-[14px] font-semibold tabular-nums text-zinc-900">
                  {p.totalLeads}
                </td>
                <td className="px-5 py-4 text-right text-[14px] font-semibold tabular-nums text-zinc-900">
                  {p.leadsCompro}
                </td>
                <td className="px-5 py-4 text-right">
                  {p.totalLeads > 0 ? (
                    <ConversionBar value={pct} />
                  ) : (
                    <span className="text-[13px] text-zinc-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="divide-y divide-zinc-100 lg:hidden">
        {metricas.map((p) => {
          const pct = p.totalLeads > 0 ? Math.round((p.leadsCompro / p.totalLeads) * 100) : 0;
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-4">
              <div className="flex flex-col">
                <p className="text-[14px] font-semibold text-zinc-900">{p.nombre}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  <span className="font-medium text-brand-600">{p.leadsHoy} hoy</span>
                  <span className="mx-1 text-zinc-300">·</span>
                  <span>{p.promedioDiario.toFixed(1)}/día</span>
                </p>
              </div>
              <div className="flex items-center gap-5 text-right">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
                    Leads
                  </p>
                  <p className="text-[17px] font-semibold tabular-nums text-zinc-900">
                    {p.totalLeads}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
                    Compró
                  </p>
                  <p className="text-[17px] font-semibold tabular-nums text-zinc-900">
                    {p.leadsCompro}
                  </p>
                </div>
                {p.totalLeads > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
                      Conv.
                    </p>
                    <p className="text-[17px] font-semibold tabular-nums text-brand-600">{pct}%</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
