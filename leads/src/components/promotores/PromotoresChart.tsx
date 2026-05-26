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
import type { Lead, Promotor } from '../../types';
import { PromotorArrowChart } from './PromotorArrowChart';

type Agrupacion = 'semana' | 'mes' | 'anio';

const AGRUPACIONES: { id: Agrupacion; label: string }[] = [
  { id: 'semana', label: 'Por semana' },
  { id: 'mes', label: 'Por mes' },
  { id: 'anio', label: 'Por año' },
];

interface PromotoresChartProps {
  leads: Lead[];
  promotores: Promotor[];
}

export function PromotoresChart({ leads, promotores }: PromotoresChartProps) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('mes');
  const [promotorId, setPromotorId] = useState('');

  const resultado = usePromotoresChartData(
    leads,
    promotores,
    agrupacion,
    promotorId || null,
  );

  const esIndividual = resultado.mode === 'trend';

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-brand/15 bg-white shadow-sm">
      <div className="bg-brand px-4 py-3">
        <h2 className="text-lg font-bold uppercase text-white">Leads por promotor</h2>
        <p className="text-sm text-white/85">
          {esIndividual
            ? `Tendencia · ${resultado.promotorNombre}`
            : 'Comparativa de todos los promotores'}
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label
            htmlFor="filtro-promotor"
            className="mb-2 block text-xs font-bold uppercase text-brand"
          >
            Promotor
          </label>
          <select
            id="filtro-promotor"
            value={promotorId}
            onChange={(e) => setPromotorId(e.target.value)}
            className="w-full min-h-12 rounded-full border-2 border-neutral-200 bg-white px-4 text-base font-semibold text-neutral-800 focus:border-brand focus:outline-none"
          >
            <option value="">Todos los promotores (barras)</option>
            {promotores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} (tendencia con flechas)
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {AGRUPACIONES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAgrupacion(a.id)}
              className={`min-h-10 rounded-full px-4 py-2 text-sm font-bold uppercase touch-manipulation ${
                agrupacion === a.id
                  ? 'bg-brand text-white shadow'
                  : 'border-2 border-neutral-200 bg-white text-neutral-700 hover:border-brand/40'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {resultado.chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-400">
            Sin datos para este promotor en el período seleccionado
          </p>
        ) : esIndividual && resultado.mode === 'trend' ? (
          <PromotorArrowChart
            chartData={resultado.chartData}
            promotorNombre={resultado.promotorNombre}
          />
        ) : (
          <>
            <p className="text-sm text-neutral-600">
              Cada color es un promotor distinto (barras agrupadas, no apiladas).
            </p>
            <div className="h-80 w-full sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={resultado.chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                  barCategoryGap="18%"
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="periodo"
                    tick={{ fontSize: 11, fill: '#525252' }}
                    interval={0}
                    angle={resultado.chartData.length > 4 ? -25 : 0}
                    textAnchor={resultado.chartData.length > 4 ? 'end' : 'middle'}
                    height={resultado.chartData.length > 4 ? 56 : 32}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#525252' }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '2px solid #c41e24',
                      fontSize: 14,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                  {(resultado.promotorKeys ?? []).map((nombre, i) => (
                    <Bar
                      key={nombre}
                      dataKey={nombre}
                      fill={resultado.colores?.[i] ?? '#C41E24'}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
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
