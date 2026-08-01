import { useMemo, useState } from 'react';
import type {
  FaltantePijItem,
  FaltantesPijPorVendedor,
  FaltantesPijResponse,
  ExcelSinIntegralItem,
} from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: FaltantesPijResponse | null;
  isLoading: boolean;
  mes: 'junio' | 'julio';
  onCambiarMes: (mes: 'junio' | 'julio') => void;
  onRecargar: () => void;
  onSubirCsv: (csvText: string, fileName: string) => void;
}

function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return '—';
  const iso = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return fecha;
}

function ResumenCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-[22px] font-semibold tabular-nums ${accent ?? 'text-zinc-900'}`}>
        {value}
      </p>
    </div>
  );
}

function ListaPorVendedor({
  grupos,
  emptyText,
}: {
  grupos: FaltantesPijPorVendedor[];
  emptyText: string;
}) {
  if (grupos.length === 0) {
    return <p className="py-8 text-center text-[13px] text-zinc-500">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {grupos.map((v) => (
        <details key={v.vendedor} className="rounded-xl border border-zinc-200 bg-white open:shadow-sm">
          <summary className="cursor-pointer list-none px-4 py-3 marker:content-none">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold text-zinc-900">{v.vendedor}</span>
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-red-700">
                {v.cantidad} faltante{v.cantidad === 1 ? '' : 's'}
              </span>
            </div>
          </summary>
          <ul className="space-y-1 border-t border-zinc-100 px-4 py-3">
            {v.clientes.map((c, i) => (
              <li
                key={`${c.nombre}-${c.recibo}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]"
              >
                <span className="font-medium text-zinc-800">{c.nombre || '—'}</span>
                <span className="font-mono text-[12px] text-zinc-500">
                  {c.fecha} · {c.recibo || '—'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

export function FaltantesPijModal({
  isOpen,
  onClose,
  data,
  isLoading,
  mes,
  onCambiarMes,
  onRecargar,
  onSubirCsv,
}: Props) {
  const [tab, setTab] = useState<'faltan_crm' | 'faltan_integral' | 'ambiguos'>('faltan_crm');
  const [vista, setVista] = useState<'vendedores' | 'lista'>('vendedores');
  const [busqueda, setBusqueda] = useState('');

  const faltantesCrm = data?.faltantes ?? [];
  const ambiguos = data?.ambiguos ?? [];
  const porVendedorCrm = data?.porVendedor ?? [];
  const porVendedorIntegral = data?.porVendedorIntegral ?? [];
  const faltantesIntegral = data?.integral?.excelSinIntegral ?? [];
  const resumen = data?.resumen;
  const integralError = data?.integral?.error;

  const faltantesCrmFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return faltantesCrm;
    return faltantesCrm.filter(
      (f) =>
        f.nombreClienteExcel.toLowerCase().includes(q) ||
        f.vendedorExcel.toLowerCase().includes(q) ||
        f.reciboSugerido.toLowerCase().includes(q) ||
        f.ordenAdh.includes(q),
    );
  }, [faltantesCrm, busqueda]);

  const faltantesIntegralFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return faltantesIntegral;
    return faltantesIntegral.filter(
      (f) =>
        f.nombreClienteExcel.toLowerCase().includes(q) ||
        f.vendedorExcel.toLowerCase().includes(q) ||
        f.adhesionDisplay.toLowerCase().includes(q) ||
        f.ordenAdh.includes(q),
    );
  }, [faltantesIntegral, busqueda]);

  const porVendedorCrmFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return porVendedorCrm;
    return porVendedorCrm
      .map((g) => ({
        ...g,
        clientes: g.clientes.filter(
          (c) =>
            c.nombre.toLowerCase().includes(q) ||
            c.recibo.toLowerCase().includes(q) ||
            g.vendedor.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.clientes.length > 0)
      .map((g) => ({ ...g, cantidad: g.clientes.length }));
  }, [porVendedorCrm, busqueda]);

  const porVendedorIntegralFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return porVendedorIntegral;
    return porVendedorIntegral
      .map((g) => ({
        ...g,
        clientes: g.clientes.filter(
          (c) =>
            c.nombre.toLowerCase().includes(q) ||
            c.recibo.toLowerCase().includes(q) ||
            g.vendedor.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.clientes.length > 0)
      .map((g) => ({ ...g, cantidad: g.clientes.length }));
  }, [porVendedorIntegral, busqueda]);

  if (!isOpen) return null;

  const faltanCrmN = resumen?.faltantesEnCrm ?? resumen?.faltantes ?? faltantesCrm.length;
  const faltanIntN =
    resumen?.faltantesEnIntegral ?? resumen?.excelSinIntegral ?? faltantesIntegral.length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[17px] font-semibold text-zinc-900">PIJ no cargados</h2>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Excel de Caja vs CRM y vs sistema integral (solo Plan Joven).
              {data?.fuente ? (
                <>
                  {' '}
                  Fuente: <span className="font-medium text-zinc-700">{data.fuente}</span>
                </>
              ) : null}
              {data?.integral?.periodo?.codigo ? (
                <>
                  {' '}
                  · Integral:{' '}
                  <span className="font-medium text-zinc-700">{data.integral.periodo.codigo}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b border-zinc-100 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Mes</span>
            {(['julio', 'junio'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={isLoading}
                onClick={() => onCambiarMes(m)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors ${
                  mes === m
                    ? 'bg-brand-600 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                } disabled:opacity-50`}
              >
                {m}
              </button>
            ))}
            <button
              type="button"
              disabled={isLoading}
              onClick={onRecargar}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Recargar
            </button>
            <label className="cursor-pointer rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 py-1.5 text-[12px] font-semibold text-brand-800 hover:bg-brand-50">
              Subir CSV…
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => onSubirCsv(String(reader.result ?? ''), file.name);
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {resumen && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <ResumenCard label="Adhesiones Excel" value={resumen.adhesionesExcel} />
              <ResumenCard label="En CRM" value={resumen.matched} accent="text-emerald-700" />
              <ResumenCard label="Faltan en CRM" value={faltanCrmN} accent="text-red-700" />
              <ResumenCard
                label="En integral (PIJ)"
                value={resumen.adhesionesIntegral ?? 0}
                accent="text-indigo-700"
              />
              <ResumenCard label="Faltan en integral" value={faltanIntN} accent="text-amber-700" />
            </div>
          )}

          {integralError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              Sistema integral no disponible: {integralError}. El cruce Excel↔CRM sigue activo.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['faltan_crm', `Faltan en CRM (${faltanCrmN})`],
                ['faltan_integral', `Faltan en integral (${faltanIntN})`],
                ['ambiguos', `Ambiguos (${ambiguos.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                  tab === id
                    ? 'bg-zinc-900 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {label}
              </button>
            ))}
            {tab !== 'ambiguos' && (
              <div className="ml-auto flex gap-1 rounded-lg border border-zinc-200 p-0.5">
                {(
                  [
                    ['vendedores', 'Por vendedor'],
                    ['lista', 'Lista'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVista(id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                      vista === id ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {isLoading && (
            <p className="py-10 text-center text-[13px] text-zinc-500">
              Cruzando Excel con CRM e integral…
            </p>
          )}

          {!isLoading && tab !== 'ambiguos' && (
            <div className="mb-3">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, vendedor o adhesión…"
                className="h-9 w-full rounded-lg border border-zinc-200 px-3 text-[13px] focus:border-brand-400 focus:outline-none"
              />
            </div>
          )}

          {!isLoading && tab === 'faltan_crm' && vista === 'vendedores' && (
            <ListaPorVendedor
              grupos={porVendedorCrmFiltrado}
              emptyText="No hay adhesiones del Excel faltantes en el CRM."
            />
          )}

          {!isLoading && tab === 'faltan_crm' && vista === 'lista' && (
            <TablaFaltantesCrm filas={faltantesCrmFiltrados} />
          )}

          {!isLoading && tab === 'faltan_integral' && vista === 'vendedores' && (
            <ListaPorVendedor
              grupos={porVendedorIntegralFiltrado}
              emptyText={
                integralError
                  ? 'No se pudo cruzar con el integral.'
                  : 'Todas las adhesiones del Excel están en el sistema integral (Plan Joven).'
              }
            />
          )}

          {!isLoading && tab === 'faltan_integral' && vista === 'lista' && (
            <TablaFaltantesIntegral filas={faltantesIntegralFiltrados} />
          )}

          {!isLoading && tab === 'ambiguos' && (
            <div className="space-y-2">
              {ambiguos.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-zinc-500">Sin casos ambiguos.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-200">
                  <table className="min-w-full text-left text-[13px]">
                    <thead className="bg-amber-50 text-[11px] uppercase tracking-wide text-amber-800">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Cliente Excel</th>
                        <th className="px-3 py-2 font-semibold">Recibo</th>
                        <th className="px-3 py-2 font-semibold">Vendedor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {ambiguos.map((f) => (
                        <tr key={f.idUnico}>
                          <td className="px-3 py-2 font-medium">{f.nombreClienteExcel}</td>
                          <td className="px-3 py-2 font-mono text-[12px]">{f.reciboSugerido}</td>
                          <td className="px-3 py-2">{f.vendedorExcel || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TablaFaltantesCrm({ filas }: { filas: FaltantePijItem[] }) {
  if (filas.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-zinc-500">
        No hay adhesiones del Excel faltantes en el CRM.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full text-left text-[13px]">
        <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Fecha</th>
            <th className="px-3 py-2 font-semibold">Cliente</th>
            <th className="px-3 py-2 font-semibold">Vendedor</th>
            <th className="px-3 py-2 font-semibold">Adhesión</th>
            <th className="px-3 py-2 font-semibold">Anexo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {filas.map((f) => (
            <tr key={f.idUnico} className="hover:bg-zinc-50/80">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-600">
                {f.fechaExcel || formatFecha(f.fechaIso)}
              </td>
              <td className="px-3 py-2 font-medium text-zinc-900">{f.nombreClienteExcel || '—'}</td>
              <td className="px-3 py-2 text-zinc-700">{f.vendedorExcel || '—'}</td>
              <td className="px-3 py-2 font-mono text-[12px] text-brand-800">
                {f.serie}
                {f.ordenAdh}/300
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-zinc-600">{f.ordenAnexo || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaFaltantesIntegral({ filas }: { filas: ExcelSinIntegralItem[] }) {
  if (filas.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-zinc-500">
        Todas las adhesiones del Excel están en el sistema integral.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-amber-200">
      <table className="min-w-full text-left text-[13px]">
        <thead className="bg-amber-50 text-[11px] uppercase tracking-wide text-amber-800">
          <tr>
            <th className="px-3 py-2 font-semibold">Fecha</th>
            <th className="px-3 py-2 font-semibold">Cliente</th>
            <th className="px-3 py-2 font-semibold">Vendedor</th>
            <th className="px-3 py-2 font-semibold">Adhesión</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100">
          {filas.map((f) => (
            <tr key={f.idUnico} className="hover:bg-amber-50/40">
              <td className="px-3 py-2 tabular-nums text-zinc-600">{f.fechaExcel || '—'}</td>
              <td className="px-3 py-2 font-medium">{f.nombreClienteExcel || '—'}</td>
              <td className="px-3 py-2">{f.vendedorExcel || '—'}</td>
              <td className="px-3 py-2 font-mono text-[12px]">{f.adhesionDisplay || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
