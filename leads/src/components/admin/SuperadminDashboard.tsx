import type { AdminDashboardData, RankingAdminEntry } from '../../types';
import { formatRangoSemana } from '../../domain/admin-metrics';
import { AdminConocimientoEncuesta } from './AdminConocimientoEncuesta';
import { AdminMetricsChart } from './AdminMetricsChart';
import { AdminProductividadPanel } from './AdminProductividadPanel';

interface SuperadminDashboardProps {
  data: AdminDashboardData;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function RankingList({
  title,
  items,
  unidad,
}: {
  title: string;
  items: RankingAdminEntry[];
  unidad: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-[13px] font-semibold text-zinc-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-zinc-400">Sin datos en la semana.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li key={`${item.promotorId}-${i}`} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-800">{item.promotorNombre}</p>
                {item.supervisorNombre && (
                  <p className="truncate text-[11px] text-zinc-400">{item.supervisorNombre}</p>
                )}
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-zinc-700">
                {item.valor} {unidad}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PromotorRow({
  p,
}: {
  p: AdminDashboardData['supervisores'][0]['promotores'][0];
}) {
  return (
    <tr className="border-t border-zinc-100 text-[13px] text-zinc-700">
      <td className="py-2.5 pr-3 font-medium text-zinc-900">{p.promotorNombre}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.leadsTotal}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.entrevistasSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums text-brand-700">{p.entrevistasHoy}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.cierresSemana}</td>
      <td className="py-2.5 px-2 text-center tabular-nums text-emerald-700">{p.cierresHoy}</td>
      <td className="py-2.5 px-2 text-center tabular-nums">{p.ventasTerrenoSemana}</td>
      <td className="py-2.5 pl-2 text-center tabular-nums">{p.ventasPijSemana}</td>
    </tr>
  );
}

export function SuperadminDashboard({ data }: SuperadminDashboardProps) {
  const rango = formatRangoSemana(data.semanaDesde, data.semanaHasta);
  const hoyLabel = new Date(data.hoy).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 pb-12 sm:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Mi Primer Casa S.A. · Superadmin
        </p>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-zinc-900">
          Panel global de equipos
        </h2>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Semana móvil ({rango}) · Resultados de hoy ({hoyLabel})
        </p>
      </div>

      {data.aviso && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {data.aviso}
        </p>
      )}

      <section>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Hoy
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Entrevistas" value={data.resumenHoy.entrevistas} />
          <StatCard label="Cierres" value={data.resumenHoy.cierres} />
          <StatCard label="Terrenos" value={data.resumenHoy.ventasTerreno} />
          <StatCard label="Plan Inv. Joven" value={data.resumenHoy.ventasPij} />
        </div>
      </section>

      {(data.eventos?.length ?? 0) > 0 && (
        <AdminMetricsChart
          eventos={data.eventos ?? []}
          supervisores={data.supervisores.map((s) => ({
            supervisorId: s.supervisorId,
            supervisorNombre: s.supervisorNombre,
          }))}
        />
      )}

      {data.conocimientoLeads && data.conocimientoLeads.total > 0 && (
        <AdminConocimientoEncuesta data={data.conocimientoLeads} />
      )}

      {data.productividad && data.productividad.embudoGlobal.leads > 0 && (
        <AdminProductividadPanel data={data.productividad} />
      )}

      <section>
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Destacados de la semana
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RankingList title="Más entrevistas" items={data.rankings.entrevistasSemana} unidad="" />
          <RankingList title="Más cierres" items={data.rankings.cierresSemana} unidad="" />
          <RankingList title="Más leads nuevos" items={data.rankings.leadsSemana} unidad="" />
          <RankingList
            title="Más terrenos vendidos"
            items={data.rankings.ventasTerrenoSemana}
            unidad=""
          />
          <RankingList
            title="Más Plan Inv. Joven"
            items={data.rankings.ventasPijSemana}
            unidad=""
          />
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Supervisores y equipos
        </h3>

        {data.supervisores.length === 0 ? (
          <p className="text-[13px] text-zinc-500">No hay datos de supervisores para mostrar.</p>
        ) : (
          data.supervisores.map((sup) => (
            <article
              key={sup.supervisorId}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                <div>
                  <h4 className="text-[15px] font-semibold text-zinc-900">{sup.supervisorNombre}</h4>
                  <p className="text-[12px] text-zinc-500">
                    {sup.promotores.length} promotor{sup.promotores.length === 1 ? '' : 'es'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-[12px] text-zinc-600">
                  <span>
                    Semana: <strong>{sup.totales.entrevistasSemana}</strong> ent. ·{' '}
                    <strong>{sup.totales.cierresSemana}</strong> cierres
                  </span>
                  <span className="text-brand-700">
                    Hoy: <strong>{sup.totales.entrevistasHoy}</strong> ent. ·{' '}
                    <strong>{sup.totales.cierresHoy}</strong> cierres
                  </span>
                </div>
              </header>

              <div className="overflow-x-auto">
                <table className="min-w-full px-2">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      <th className="py-2 pr-3 text-left">Promotor</th>
                      <th className="px-2 py-2 text-center">Leads</th>
                      <th className="px-2 py-2 text-center">Ent. sem.</th>
                      <th className="px-2 py-2 text-center">Ent. hoy</th>
                      <th className="px-2 py-2 text-center">Cierres sem.</th>
                      <th className="px-2 py-2 text-center">Cierres hoy</th>
                      <th className="px-2 py-2 text-center">Terrenos</th>
                      <th className="pl-2 py-2 text-center">PIJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sup.promotores.map((p) => (
                      <PromotorRow key={p.promotorId} p={p} />
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
