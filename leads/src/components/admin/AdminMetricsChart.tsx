import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { etiquetaTipoPeriodo } from '../../domain/admin-periodo';
import {
  agrupacionSugeridaChart,
  useAdminChartData,
  type AgrupacionChart,
} from '../../hooks/useAdminChartData';
import type { AdminChartEvent } from '../../types';
import { AdminPeriodoSelector } from './AdminPeriodoSelector';
import { SegmentedControl } from '../ui/SegmentedControl';

const AGRUPACIONES: { value: AgrupacionChart; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

interface AdminMetricsChartProps {
  eventos: AdminChartEvent[];
  supervisores: Array<{ supervisorId: string; supervisorNombre: string }>;
  periodo: string;
  onCambiarPeriodo: (periodo: string) => void;
}

export function AdminMetricsChart({
  eventos,
  supervisores,
  periodo,
  onCambiarPeriodo,
}: AdminMetricsChartProps) {
  const [agrupacion, setAgrupacion] = useState<AgrupacionChart>(() =>
    agrupacionSugeridaChart(periodo),
  );
  const [supervisorId, setSupervisorId] = useState('');

  useEffect(() => {
    setAgrupacion(agrupacionSugeridaChart(periodo));
  }, [periodo]);

  const supervisorNombre = supervisorId
    ? supervisores.find((s) => s.supervisorId === supervisorId)?.supervisorNombre ?? null
    : null;

  const { chartData, series } = useAdminChartData(
    eventos,
    agrupacion,
    supervisorNombre,
    periodo,
  );

  const agrupacionLabel =
    agrupacion === 'dia'
      ? 'día'
      : agrupacion === 'semana'
        ? 'semana ISO'
        : agrupacion;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Evolución temporal
        </p>
        <h3 className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
          Actividad por período
        </h3>
        <p className="mt-1 text-[12px] text-zinc-500">
          Período del informe: {etiquetaTipoPeriodo(periodo)}
        </p>
      </div>

      <div className="space-y-5 p-5">
        <AdminPeriodoSelector periodo={periodo} onCambiarPeriodo={onCambiarPeriodo} />

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="filtro-supervisor-chart"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400"
            >
              Equipo
            </label>
            <select
              id="filtro-supervisor-chart"
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-[14px] text-zinc-800 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            >
              <option value="">Total empresa</option>
              {supervisores.map((s) => (
                <option key={s.supervisorId} value={s.supervisorId}>
                  {s.supervisorNombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Agrupar barras por
            </p>
            <SegmentedControl
              options={AGRUPACIONES}
              value={agrupacion}
              onChange={setAgrupacion}
            />
          </div>
        </div>

        {chartData.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-zinc-400">
            Sin datos para el período seleccionado
            {supervisorNombre ? ` (${supervisorNombre})` : ''}
          </p>
        ) : (
          <>
            <p className="text-[13px] text-zinc-400">
              {supervisorNombre
                ? `Equipo: ${supervisorNombre} · `
                : 'Total empresa · '}
              Barras agrupadas por {agrupacionLabel}.
            </p>
            <div className="h-72 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                  barCategoryGap="20%"
                  barGap={2}
                >
                  <CartesianGrid stroke="#F4F4F5" vertical={false} />
                  <XAxis
                    dataKey="periodo"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717A' }}
                    interval={0}
                    angle={chartData.length > 4 ? -20 : 0}
                    textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                    height={chartData.length > 4 ? 52 : 30}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717A' }}
                  />
                  <Tooltip
                    cursor={{ fill: '#F4F4F5' }}
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
                    iconType="square"
                  />
                  {series.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      fill={s.color}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
