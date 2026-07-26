import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ADMIN_RESULTADO_ENTREVISTA_LABEL } from '../../domain/admin-productividad';
import { esPeriodoDia, esPeriodoMesCalendario, etiquetaMesCalendario } from '../../domain/admin-periodo';
import type { AdminProductividad } from '../../types';

interface AdminProductividadPanelProps {
  data: AdminProductividad;
  periodo?: string;
}

function fmtPct(val: number | null) {
  if (val == null) return '—';
  return `${val.toFixed(1)}%`;
}

function etiquetaPeriodoEmbudo(periodo?: string | null): string {
  if (!periodo || periodo === 'mes') return 'el mes actual';
  if (periodo === 'hoy') return 'hoy';
  if (periodo === 'semana') return 'la semana del informe';
  if (periodo === 'anio') return 'el año en curso';
  if (esPeriodoDia(periodo)) return `el día ${periodo}`;
  if (/^\d{4}$/.test(periodo)) return `el año ${periodo}`;
  if (esPeriodoMesCalendario(periodo)) return etiquetaMesCalendario(periodo).toLowerCase();
  return periodo;
}

function MiniStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${accent ?? 'text-zinc-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

function FunnelBar({
  label,
  count,
  total,
  pctLabel,
  color,
}: {
  label: string;
  count: number;
  total: number;
  pctLabel: string | null;
  color: string;
}) {
  const widthPct = total > 0 ? Math.max(8, (count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium text-zinc-800">{label}</span>
        <span className="shrink-0 tabular-nums text-zinc-600">
          {count}{' '}
          {pctLabel != null && (
            <span className="text-[11px] text-zinc-400">({pctLabel})</span>
          )}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const RESULTADO_COLORS: Record<string, string> = {
  compro: '#059669',
  no_compro: '#71717A',
  reagenda: '#6366F1',
  sin_interes: '#D97706',
  derivar_terreno: '#B45309',
  pendiente: '#D4D4D8',
  sin_tratar: '#CBD5E1',
};

const CANAL_COLORS: Record<string, string> = {
  qr: '#18181B',
  facebook: '#3B82F6',
  instagram: '#D946EF',
  whatsapp: '#10B981',
  tiktok: '#F43F5E',
  app: '#EF4444',
  otros: '#A1A1AA',
};

export function AdminProductividadPanel({ data, periodo }: AdminProductividadPanelProps) {
  const { embudoGlobal: e } = data;
  const periodoLabel = etiquetaPeriodoEmbudo(periodo ?? data.periodoEmbudo);

  const resultadosChart = (
    Object.entries(data.resultadosEntrevista) as Array<[keyof typeof data.resultadosEntrevista, number]>
  )
    .filter(([, v]) => v > 0)
    .map(([key, cantidad]) => ({
      key,
      label: ADMIN_RESULTADO_ENTREVISTA_LABEL[key],
      cantidad,
    }));

  const canalesChart = data.canales.map((c) => ({
    ...c,
    fill: CANAL_COLORS[c.fuente] ?? '#71717A',
  }));

  const topPromotores = data.embudoPromotores.slice(0, 8);

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Productividad
          </p>
          <h3 className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
            Embudo y eficiencia
          </h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Entrevistas y cierres de {periodoLabel} (misma lógica que el informe). Tasas sobre leads cargados en el período.
          </p>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <FunnelBar
              label="Leads"
              count={e.leads}
              total={e.leads}
              pctLabel="100%"
              color="#71717A"
            />
            <FunnelBar
              label="Sin tratamiento"
              count={data.resultadosEntrevista.sin_tratar}
              total={e.leads}
              pctLabel={fmtPct(e.leads > 0 ? (data.resultadosEntrevista.sin_tratar / e.leads) * 100 : 0)}
              color="#CBD5E1"
            />
            <FunnelBar
              label="Con entrevista"
              count={e.conEntrevista}
              total={e.leads}
              pctLabel={fmtPct(e.tasaEntrevistaPct)}
              color="#9A1620"
            />
            <FunnelBar
              label="Con cierre"
              count={e.conCierre}
              total={e.leads}
              pctLabel={fmtPct(e.tasaCierreLeadPct)}
              color="#059669"
            />
            <p className="text-[12px] text-zinc-500">
              Cierre sobre entrevistas:{' '}
              <strong className="text-zinc-800">{fmtPct(e.tasaCierreEntrevistaPct)}</strong>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Tiempo resp. prom."
              value={
                data.tiempoPrimeraEntrevista.promedioDias != null
                  ? `${data.tiempoPrimeraEntrevista.promedioDias} d`
                  : '—'
              }
              sub={
                data.tiempoPrimeraEntrevista.muestras > 0
                  ? `Mediana ${data.tiempoPrimeraEntrevista.medianaDias ?? '—'} d · ${data.tiempoPrimeraEntrevista.muestras} leads`
                  : 'Sin entrevistas registradas'
              }
            />
            <MiniStat
              label="Recuperación PIJ"
              value={fmtPct(data.pijRecuperacion.tasaRecuperacionPct)}
              sub={`${data.pijRecuperacion.conCierre} cierres de ${data.pijRecuperacion.totalSeguimiento} seguimientos`}
              accent="text-indigo-700"
            />
            <MiniStat
              label="Cierres c/ referidos"
              value={data.referidos.cierresConReferidos}
              sub={`${data.referidos.totalReferidos} referidos brindados · cierres del período`}
            />
            <MiniStat
              label="Backlog +30 días"
              value={data.backlog.sinGestion30}
              sub={`7d: ${data.backlog.sinGestion7} · 14d: ${data.backlog.sinGestion14}`}
              accent="text-amber-700"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Resultados entrevista */}
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h4 className="text-[14px] font-semibold text-zinc-900">Resultado de entrevistas</h4>
            <p className="text-[12px] text-zinc-500">Leads ingresados en {periodoLabel}</p>
          </div>
          <div className="p-5">
            {resultadosChart.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-400">Sin datos</p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resultadosChart} layout="vertical" margin={{ left: 4, right: 60 }}>
                    <CartesianGrid stroke="#F4F4F5" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#71717A' }} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={100}
                      tick={{ fontSize: 11, fill: '#71717A' }}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #E4E4E7', fontSize: 13 }}
                      formatter={(value) => {
                        const cant = Number(value);
                        const pctVal = e.leads > 0 ? (cant / e.leads) * 100 : 0;
                        return [`${cant} (${pctVal.toFixed(1)}%)`, 'Cantidad'];
                      }}
                    />
                    <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {resultadosChart.map((entry) => (
                        <Cell key={entry.key} fill={RESULTADO_COLORS[entry.key] ?? '#71717A'} />
                      ))}
                      <LabelList
                        dataKey="cantidad"
                        position="right"
                        formatter={(val: number) => {
                          const pctVal = e.leads > 0 ? (val / e.leads) * 100 : 0;
                          return `${val} (${pctVal.toFixed(1)}%)`;
                        }}
                        style={{ fontSize: 10, fill: '#52525b', fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </article>

        {/* Canales */}
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h4 className="text-[14px] font-semibold text-zinc-900">Efectividad por canal</h4>
            <p className="text-[12px] text-zinc-500">Leads y tasa de cierre</p>
          </div>
          <div className="p-5">
            {canalesChart.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-400">Sin datos de canal</p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={canalesChart} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#F4F4F5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#71717A' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#71717A' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#F4F4F5' }}
                      contentStyle={{ borderRadius: 8, border: '1px solid #E4E4E7', fontSize: 13 }}
                      formatter={(value, name) => {
                        if (name === 'tasaCierrePct') return [fmtPct(value as number), 'Tasa cierre'];
                        const displayName = String(name).toLowerCase() === 'leads' ? 'Leads' : 'Cierres';
                        return [value, displayName];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />
                    <Bar dataKey="leads" fill="#D4D4D8" name="Leads" radius={[3, 3, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="cierres" name="Cierres" radius={[3, 3, 0, 0]} maxBarSize={36}>
                      {canalesChart.map((entry) => (
                        <Cell key={entry.fuente} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {canalesChart.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.canales.map((c) => (
                  <span
                    key={c.fuente}
                    className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600"
                  >
                    {c.label}: {fmtPct(c.tasaCierrePct)} cierre
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Conocimiento vs cierre */}
      {data.conocimientoVsCierre.length > 0 && (
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h4 className="text-[14px] font-semibold text-zinc-900">Encuesta vs cierre</h4>
            <p className="text-[12px] text-zinc-500">
              Tasa de cierre según respuesta de conocimiento de marca
            </p>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="pb-2 pr-4">Segmento</th>
                  <th className="px-3 pb-2 text-center">Leads</th>
                  <th className="px-3 pb-2 text-center">Cierres</th>
                  <th className="pb-2 pl-3 text-center">Tasa</th>
                </tr>
              </thead>
              <tbody>
                {data.conocimientoVsCierre.map((row) => (
                  <tr key={row.segmento} className="border-t border-zinc-100 text-zinc-700">
                    <td className="py-2 pr-4 font-medium text-zinc-800">{row.segmento}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{row.leads}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{row.cierres}</td>
                    <td className="py-2 pl-3 text-center font-semibold tabular-nums text-brand-700">
                      {fmtPct(row.tasaCierrePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* Top promotores por eficiencia */}
      {topPromotores.length > 0 && (
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3">
            <h4 className="text-[14px] font-semibold text-zinc-900">
              Promotores por tasa de cierre
            </h4>
            <p className="text-[12px] text-zinc-500">
              Ordenados por % cierre sobre leads (mín. datos reales del equipo)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full px-2 text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pl-4 text-left">Promotor</th>
                  <th className="px-2 py-2 text-center">Leads</th>
                  <th className="px-2 py-2 text-center">Entrev.</th>
                  <th className="px-2 py-2 text-center">Cierres</th>
                  <th className="px-2 py-2 text-center">Lead→Ent.</th>
                  <th className="px-2 py-2 text-center">Ent.→Cierre</th>
                  <th className="py-2 pr-4 pl-2 text-center">Lead→Cierre</th>
                </tr>
              </thead>
              <tbody>
                {topPromotores.map((p) => (
                  <tr key={p.promotorId} className="border-t border-zinc-100 text-zinc-700">
                    <td className="py-2.5 pl-4">
                      <p className="font-medium text-zinc-900">{p.promotorNombre}</p>
                      <p className="text-[11px] text-zinc-400">{p.supervisorNombre}</p>
                    </td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{p.leads}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{p.entrevistas}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-emerald-700">{p.cierres}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtPct(p.tasaEntrevistaPct)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtPct(p.tasaCierreEntrevistaPct)}</td>
                    <td className="py-2.5 pr-4 pl-2 text-center font-semibold tabular-nums text-brand-700">
                      {fmtPct(p.tasaCierrePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}
