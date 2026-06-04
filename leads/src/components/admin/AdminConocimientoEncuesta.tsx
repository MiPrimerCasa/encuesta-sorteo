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
import type { AdminConocimientoConteo, AdminConocimientoLeads } from '../../types';

interface AdminConocimientoEncuestaProps {
  data: AdminConocimientoLeads;
}

function ConocimientoCard({
  titulo,
  conteo,
  colores,
}: {
  titulo: string;
  conteo: AdminConocimientoConteo;
  colores: { si: string; no: string; sin: string };
}) {
  const respondieron = conteo.si + conteo.no;
  const chartRow = [
    {
      pregunta: 'Respuestas',
      Sí: conteo.si,
      No: conteo.no,
      'Sin dato': conteo.sinResponder,
    },
  ];

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h4 className="text-[14px] font-semibold text-zinc-900">{titulo}</h4>
      <p className="mt-1 text-[12px] text-zinc-500">
        {respondieron} lead{respondieron === 1 ? '' : 's'} respondieron
        {conteo.sinResponder > 0 ? ` · ${conteo.sinResponder} sin dato` : ''}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-emerald-50 px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Sí</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-emerald-900">{conteo.si}</p>
        </div>
        <div className="rounded-lg bg-zinc-100 px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">No</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-zinc-900">{conteo.no}</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-2 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Sin dato</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-900">{conteo.sinResponder}</p>
        </div>
      </div>

      {respondieron > 0 && (
        <div className="mt-4 h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRow}
              layout="vertical"
              margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              barSize={18}
            >
              <CartesianGrid stroke="#F4F4F5" horizontal={false} />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis type="category" dataKey="pregunta" hide width={0} />
              <Tooltip
                cursor={{ fill: '#F4F4F5' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #E4E4E7',
                  fontSize: 13,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                iconSize={8}
                iconType="square"
              />
              <Bar dataKey="Sí" stackId="a" fill={colores.si} radius={[0, 0, 0, 0]} />
              <Bar dataKey="No" stackId="a" fill={colores.no} />
              <Bar dataKey="Sin dato" stackId="a" fill={colores.sin} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

export function AdminConocimientoEncuesta({ data }: AdminConocimientoEncuestaProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Encuesta de captación
        </p>
        <h3 className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
          Conocimiento de marca
        </h3>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          {data.total} lead{data.total === 1 ? '' : 's'} en total
        </p>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <ConocimientoCard
          titulo="¿Conocían Mi Primer Casa?"
          conteo={data.conoceMpc}
          colores={{ si: '#059669', no: '#71717A', sin: '#FCD34D' }}
        />
        <ConocimientoCard
          titulo="¿Sabían del Plan Inversión Joven?"
          conteo={data.sabiaPlanInversionJoven}
          colores={{ si: '#6366F1', no: '#71717A', sin: '#FCD34D' }}
        />
      </div>
    </section>
  );
}
