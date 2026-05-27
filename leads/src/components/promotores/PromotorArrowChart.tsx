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
    <g>
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
        const stroke = up ? '#15803D' : next.y > p.y ? '#9A1620' : '#A1A1AA';

        return (
          <g key={i}>
            <line
              x1={p.x} y1={p.y} x2={tipX} y2={tipY}
              stroke={stroke} strokeWidth={2.5} strokeLinecap="round"
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
      <circle cx={cx} cy={cy} r={6} fill="#9A1620" stroke="#fff" strokeWidth={2} />
      {badge && (
        <text
          x={cx} y={cy - 13}
          textAnchor="middle" fontSize={13} fontWeight="600"
          fill={variacion === 'up' ? '#15803D' : variacion === 'down' ? '#9A1620' : '#A1A1AA'}
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
      <p className="mb-3 text-[13px] text-zinc-400">
        Tendencia de{' '}
        <span className="font-medium text-zinc-700">{promotorNombre}</span>
        {' '}— flechas indican la evolución (↑ sube, ↓ baja).
      </p>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
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
              formatter={(value) => [`${value} leads`, 'Cantidad']}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #E4E4E7',
                fontSize: 13,
                boxShadow: '0 4px 12px rgba(15,15,15,0.06)',
              }}
            />
            <Line
              type="monotone"
              dataKey="cantidad"
              stroke="#9A1620"
              strokeWidth={2}
              dot={<TrendDot />}
              activeDot={{ r: 8, fill: '#18181B' }}
              isAnimationActive={false}
            />
            <Customized component={ArrowConnectors} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
