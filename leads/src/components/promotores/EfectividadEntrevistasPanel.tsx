import type { EfectividadEntrevistasEquipo, EfectividadEntrevistasPromotor } from '../../types';

interface EfectividadEntrevistasPanelProps {
  data: EfectividadEntrevistasEquipo;
}

function fmtPct(val: number | null) {
  if (val == null) return '—';
  return `${val.toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? 'text-zinc-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function EfectividadBar({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[13px] text-zinc-300">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="min-w-[42px] text-right text-[12px] font-semibold tabular-nums text-emerald-700">
        {fmtPct(value)}
      </span>
    </span>
  );
}

function FilaDesktop({ p }: { p: EfectividadEntrevistasPromotor }) {
  return (
    <tr className="border-b border-zinc-100 last:border-0 transition-colors hover:bg-zinc-50">
      <td className="px-5 py-3.5 text-[14px] font-medium text-zinc-900">{p.nombre}</td>
      <td className="px-3 py-3.5 text-center text-[14px] font-semibold tabular-nums text-zinc-900">
        {p.entrevistas}
      </td>
      <td className="px-3 py-3.5 text-center text-[14px] font-semibold tabular-nums text-emerald-700">
        {p.compro}
      </td>
      <td className="px-3 py-3.5 text-center text-[14px] tabular-nums text-zinc-600">
        {p.noCompro}
      </td>
      <td className="px-3 py-3.5 text-center text-[14px] tabular-nums text-zinc-600">
        {p.sinInteres}
      </td>
      <td className="px-3 py-3.5 text-center text-[14px] tabular-nums text-indigo-600">
        {p.reagenda > 0 ? p.reagenda : '—'}
      </td>
      <td className="px-5 py-3.5 text-right">
        <EfectividadBar value={p.tasaCierreEntrevistaPct} />
      </td>
    </tr>
  );
}

function FilaMobile({ p }: { p: EfectividadEntrevistasPromotor }) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-medium text-zinc-900">{p.nombre}</p>
        <EfectividadBar value={p.tasaCierreEntrevistaPct} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Entrev.</p>
          <p className="text-[16px] font-semibold tabular-nums text-zinc-900">{p.entrevistas}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Compró</p>
          <p className="text-[16px] font-semibold tabular-nums text-emerald-700">{p.compro}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">No compró</p>
          <p className="text-[16px] font-semibold tabular-nums text-zinc-600">{p.noCompro}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Sin interés</p>
          <p className="text-[16px] font-semibold tabular-nums text-zinc-600">{p.sinInteres}</p>
        </div>
        {p.reagenda > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Reagenda</p>
            <p className="text-[16px] font-semibold tabular-nums text-indigo-600">{p.reagenda}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function EfectividadEntrevistasPanel({ data }: EfectividadEntrevistasPanelProps) {
  const { resumen, porPromotor } = data;
  const conDatos = porPromotor.filter((p) => p.entrevistas > 0);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          RF-26 · Efectividad
        </p>
        <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
          Entrevistas y cierres por promotor
        </h3>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          De las entrevistas realizadas por tu equipo, cuántas terminaron en compra
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Entrevistas" value={resumen.entrevistas} />
        <StatCard
          label="Cierres"
          value={resumen.compro}
          sub="Compró terreno o PIJ"
          accent="text-emerald-700"
        />
        <StatCard
          label="Efectividad"
          value={fmtPct(resumen.tasaCierreEntrevistaPct)}
          sub="Compras ÷ entrevistas"
          accent="text-brand-700"
        />
        <StatCard
          label="Sin cierre"
          value={resumen.noCompro + resumen.sinInteres}
          sub={
            resumen.reagenda > 0
              ? `${resumen.noCompro} no compró · ${resumen.sinInteres} sin interés · ${resumen.reagenda} reagenda`
              : `${resumen.noCompro} no compró · ${resumen.sinInteres} sin interés`
          }
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {conDatos.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">
            Todavía no hay entrevistas registradas en tu equipo. Cuando los promotores marquen
            «Hubo entrevista» o un resultado, aparecerán acá.
          </p>
        ) : (
          <>
            <table className="hidden w-full text-left lg:table">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Promotor
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Entrevistas
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Compró
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    No compró
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Sin interés
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Reagenda
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    Efectividad
                  </th>
                </tr>
              </thead>
              <tbody>
                {conDatos.map((p) => (
                  <FilaDesktop key={p.id} p={p} />
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-zinc-100 lg:hidden">
              {conDatos.map((p) => (
                <FilaMobile key={p.id} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
