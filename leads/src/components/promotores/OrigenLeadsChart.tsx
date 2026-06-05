import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FuenteLead, Lead, Promotor } from '../../types';
import { SegmentedControl } from '../ui/SegmentedControl';

type Agrupacion = 'semana' | 'mes' | 'anio';

const ALL = '__all__';

const FUENTES: { key: FuenteLead; label: string; color: string; hex: string }[] = [
  { key: 'qr',        label: 'QR',        color: 'bg-zinc-900',    hex: '#18181B' },
  { key: 'app',       label: 'Manual',    color: 'bg-red-500',     hex: '#EF4444' },
  { key: 'facebook',  label: 'Facebook',  color: 'bg-blue-500',    hex: '#3B82F6' },
  { key: 'instagram', label: 'Instagram', color: 'bg-fuchsia-500', hex: '#D946EF' },
  { key: 'whatsapp',  label: 'WhatsApp',  color: 'bg-emerald-500', hex: '#10B981' },
  { key: 'tiktok',    label: 'TikTok',    color: 'bg-rose-500',    hex: '#F43F5E' },
];

const AGRUPACIONES: { value: Agrupacion; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes',    label: 'Mes'    },
  { value: 'anio',   label: 'Año'    },
];

function getPeriodoKey(fecha: string, agrupacion: Agrupacion): string {
  const d = new Date(fecha + 'T12:00:00');
  if (agrupacion === 'anio') return String(d.getFullYear());
  if (agrupacion === 'mes')
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function getPeriodoLabel(key: string, agrupacion: Agrupacion): string {
  if (agrupacion === 'anio') return key;
  if (agrupacion === 'mes') {
    const [y, m] = key.split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  }
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function buildChartData(leads: Lead[], agrupacion: Agrupacion) {
  const now = new Date();
  let cutoff: Date;
  if (agrupacion === 'semana') {
    cutoff = new Date(now);
    cutoff.setDate(now.getDate() - 10 * 7);
  } else if (agrupacion === 'mes') {
    cutoff = new Date(now);
    cutoff.setMonth(now.getMonth() - 12);
  } else {
    cutoff = new Date('2000-01-01');
  }

  const filtered = leads.filter(
    (l) => new Date(l.fechaObtencion + 'T12:00:00') >= cutoff,
  );

  const map = new Map<string, Record<string, number | string>>();

  for (const lead of filtered) {
    const key = getPeriodoKey(lead.fechaObtencion, agrupacion);
    if (!map.has(key)) {
      map.set(key, {
        label: getPeriodoLabel(key, agrupacion),
        qr: 0,
        app: 0,
        facebook: 0,
        instagram: 0,
        whatsapp: 0,
        tiktok: 0,
      });
    }
    const fuente = lead.seguimiento?.fuente;
    if (fuente) {
      const entry = map.get(key)!;
      entry[fuente] = (entry[fuente] as number) + 1;
    }
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

interface Props {
  leads: Lead[];
  promotores: Promotor[];
}

export function OrigenLeadsChart({ leads, promotores }: Props) {
  const [filtroPromotor, setFiltroPromotor] = useState(ALL);
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mes');
  const [fuenteAbierta, setFuenteAbierta] = useState<FuenteLead | null>(null);

  const promotoresConLeads = useMemo(() => {
    const ids = new Set(leads.map((l) => l.promotorId));
    return promotores.filter((p) => ids.has(p.id));
  }, [leads, promotores]);

  const leadsFiltrados = useMemo(
    () => (filtroPromotor === ALL ? leads : leads.filter((l) => l.promotorId === filtroPromotor)),
    [leads, filtroPromotor],
  );

  const stats = useMemo(() => {
    const total = leadsFiltrados.length;
    return FUENTES.map(({ key, label, color, hex }) => {
      const count = leadsFiltrados.filter((l) => l.seguimiento?.fuente === key).length;
      const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
      return { key, label, color, hex, count, pct };
    });
  }, [leadsFiltrados]);

  const sinFuente = leadsFiltrados.filter((l) => !l.seguimiento?.fuente).length;

  const chartData = useMemo(
    () => buildChartData(leadsFiltrados, agrupacion),
    [leadsFiltrados, agrupacion],
  );

  const handleCardClick = (key: FuenteLead) => {
    setFuenteAbierta((prev) => (prev === key ? null : key));
  };

  return (
    <section className="space-y-4">
      {/* Encabezado */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Origen de leads
        </h3>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Distribución por canal de captación
        </p>
      </div>

      {/* Filtro por promotor */}
      {promotoresConLeads.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: 'none' }}
        >
          <button
            type="button"
            onClick={() => setFiltroPromotor(ALL)}
            style={{ touchAction: 'manipulation' }}
            className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition-all duration-[120ms] active:scale-[0.97] ${
              filtroPromotor === ALL
                ? 'border-brand-700 bg-brand-600 text-white'
                : 'border-zinc-200 bg-white text-zinc-600 active:bg-brand-50 active:border-brand-400 active:text-brand-700'
            }`}
          >
            Todos los promotores
          </button>
          {promotoresConLeads.map((p) => {
            const sel = filtroPromotor === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFiltroPromotor(p.id)}
                style={{ touchAction: 'manipulation' }}
                className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition-all duration-[120ms] active:scale-[0.97] ${
                  sel
                    ? 'border-brand-700 bg-brand-600 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 active:bg-brand-50 active:border-brand-400 active:text-brand-700'
                }`}
              >
                {p.nombre}
              </button>
            );
          })}
        </div>
      )}

      {/* Cards de canal */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(({ key, label, color, hex, count, pct }) => {
          const activa = fuenteAbierta === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCardClick(key)}
              style={{ touchAction: 'manipulation' }}
              className={`space-y-3 rounded-xl border p-4 text-left transition-all duration-[140ms] ease-out active:scale-[0.98] ${
                activa
                  ? 'border-zinc-300 bg-zinc-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden="true" />
                <span className="text-[13px] font-semibold text-zinc-700">{label}</span>
              </div>
              <div>
                <p className="text-[26px] font-bold tabular-nums leading-none text-zinc-900">
                  {count}
                </p>
                <p className="mt-1 text-[12px] text-zinc-400">{pct}% del total</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: hex }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {sinFuente > 0 && (
        <p className="text-[12px] text-zinc-400">
          {sinFuente} {sinFuente === 1 ? 'lead sin' : 'leads sin'} canal registrado
        </p>
      )}

      {/* Gráfico de líneas — aparece al cliquear una card */}
      {fuenteAbierta && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                Tendencia
              </p>
              <h4 className="mt-0.5 text-[15px] font-semibold text-zinc-900">
                {FUENTES.find((f) => f.key === fuenteAbierta)?.label} · comparativa de canales
              </h4>
            </div>
            <SegmentedControl
              options={AGRUPACIONES}
              value={agrupacion}
              onChange={setAgrupacion}
              size="sm"
            />
          </div>

          <div className="p-5">
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-zinc-400">
                Sin datos para el período seleccionado
              </p>
            ) : (
              <div className="h-64 w-full sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#F4F4F5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#71717A' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#71717A' }}
                      width={24}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #E4E4E7',
                        fontSize: 13,
                        boxShadow: '0 4px 12px rgba(15,15,15,0.06)',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 12, color: '#71717A' }}
                      iconSize={8}
                      iconType="circle"
                    />
                    {FUENTES.map(({ key, label, hex }) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={label}
                        stroke={hex}
                        strokeWidth={key === fuenteAbierta ? 2.5 : 1.5}
                        strokeOpacity={key === fuenteAbierta ? 1 : 0.35}
                        dot={key === fuenteAbierta ? { r: 3, fill: hex } : false}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
