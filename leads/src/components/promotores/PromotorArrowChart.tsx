import {
  CartesianGrid,
  Customized,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ChartPoint {
  x: number;
  y: number;
}

interface TrendRow {
  periodo: string;
  cantidad: number;
  variacion?: 'up' | 'down' | 'flat' | null;
}

interface ArrowConnectorsProps {
  formattedGraphicalItems?: Array<{ props?: { points?: ChartPoint[] } }>;
}

function ArrowConnectors({ formattedGraphicalItems }: ArrowConnectorsProps) {
  const lineItems = formattedGraphicalItems?.filter(
    (item) => (item?.props?.points?.length ?? 0) > 1,
  );
  const points = lineItems?.[0]?.props?.points;
  if (!points?.length) return null;

  return (
    <g className="arrow-connectors">
      {points.slice(0, -1).map((p, i) => {
        const next = points[i + 1];
        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const len = Math.hypot(dx, dy);
        if (len < 8) return null;

        const ux = dx / len;
        const uy = dy / len;
        const tipX = next.x - ux * 14;
        const tipY = next.y - uy * 14;
        const wing = 7;
        const px = -uy;
        const py = ux;

        const up = next.y < p.y;
        const stroke = up ? '#059669' : next.y > p.y ? '#C41E24' : '#737373';

        return (
          <g key={i}>
            <line
              x1={p.x}
              y1={p.y}
              x2={tipX}
              y2={tipY}
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <polygon
              points={[
                `${next.x},${next.y}`,
                `${tipX + px * wing - ux * 4},${tipY + py * wing - uy * 4}`,
                `${tipX - px * wing - ux * 4},${tipY - py * wing - uy * 4}`,
              ].join(' ')}
              fill={stroke}
            />
          </g>
        );
      })}
    </g>
  );
}

function TrendDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: TrendRow;
}) {
  if (cx == null || cy == null) return null;
  const variacion = payload?.variacion;
  const badge =
    variacion === 'up' ? '↑' : variacion === 'down' ? '↓' : variacion === 'flat' ? '→' : null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="#C41E24" stroke="#fff" strokeWidth={2} />
      {badge && (
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          fontSize={14}
          fontWeight="bold"
          fill={variacion === 'up' ? '#059669' : variacion === 'down' ? '#C41E24' : '#737373'}
        >
          {badge}
        </text>
      )}
    </g>
  );
}

interface PromotorArrowChartProps {
  chartData: TrendRow[];
  promotorNombre: string;
}

export function PromotorArrowChart({ chartData, promotorNombre }: PromotorArrowChartProps) {
  return (
    <div>
      <p className="mb-3 text-sm text-neutral-600">
        Tendencia de <span className="font-bold text-brand">{promotorNombre}</span> — las flechas
        indican la evolución entre períodos (↑ sube, ↓ baja).
      </p>
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="periodo"
              tick={{ fontSize: 11, fill: '#525252' }}
              interval={0}
              angle={chartData.length > 4 ? -25 : 0}
              textAnchor={chartData.length > 4 ? 'end' : 'middle'}
              height={chartData.length > 4 ? 56 : 32}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#525252' }} />
            <Tooltip
              formatter={(value) => [`${value} leads`, 'Cantidad']}
              contentStyle={{
                borderRadius: 12,
                border: '2px solid #c41e24',
                fontSize: 14,
              }}
            />
            <Line
              type="monotone"
              dataKey="cantidad"
              stroke="#C41E24"
              strokeWidth={2}
              dot={<TrendDot />}
              activeDot={{ r: 9, fill: '#1a1a1a' }}
              isAnimationActive={false}
            />
            <Customized component={ArrowConnectors} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
