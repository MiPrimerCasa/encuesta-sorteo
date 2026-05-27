import { useState } from 'react';
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
import { usePromotoresChartData } from '../../hooks/usePromotoresChartData';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { Lead, Promotor } from '../../types';
import { PromotorArrowChart } from './PromotorArrowChart';

type Agrupacion = 'semana' | 'mes' | 'anio';

const AGRUPACIONES: { value: Agrupacion; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

interface PromotoresChartProps {
  leads: Lead[];
  promotores: Promotor[];
}

export function PromotoresChart({ leads, promotores }: PromotoresChartProps) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mes');
  const [promotorId, setPromotorId] = useState('');

  const resultado = usePromotoresChartData(leads, promotores, agrupacion, promotorId || null);

  const esIndividual = resultado.mode === 'trend';

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">

      {/* Header */}
      <div className="border-b border-zinc-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          {esIndividual ? `Tendencia · ${resultado.promotorNombre}` : 'Comparativa'}
        </p>
        <h3 className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
          Leads por promotor
        </h3>
      </div>

      <div className="space-y-5 p-5">

        {/* Controles */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor="filtro-promotor"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400"
            >
              Promotor
            </label>
            <select
              id="filtro-promotor"
              value={promotorId}
              onChange={(e) => setPromotorId(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-[14px] text-zinc-800 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            >
              <option value="">Todos los promotores</option>
              {promotores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Período
            </p>
            <SegmentedControl
              options={AGRUPACIONES}
              value={agrupacion}
              onChange={setAgrupacion}
            />
          </div>
        </div>

        {/* Gráfico */}
        {resultado.chartData.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-zinc-400">
            Sin datos para este promotor en el período seleccionado
          </p>
        ) : esIndividual && resultado.mode === 'trend' ? (
          <PromotorArrowChart
            chartData={resultado.chartData}
            promotorNombre={resultado.promotorNombre}
          />
        ) : (
          <>
            <p className="text-[13px] text-zinc-400">
              Cada color representa un promotor (barras agrupadas).
            </p>
            <div className="h-72 w-full sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resultado.chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                  barCategoryGap="20%"
                  barGap={3}
                >
                  <CartesianGrid stroke="#F4F4F5" vertical={false} />
                  <XAxis
                    dataKey="periodo"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#71717A' }}
                    interval={0}
                    angle={resultado.chartData.length > 4 ? -20 : 0}
                    textAnchor={resultado.chartData.length > 4 ? 'end' : 'middle'}
                    height={resultado.chartData.length > 4 ? 52 : 30}
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
                  {resultado.promotorKeys.map((nombre, i) => (
                    <Bar
                      key={nombre}
                      dataKey={nombre}
                      fill={resultado.colores[i]}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={40}
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
