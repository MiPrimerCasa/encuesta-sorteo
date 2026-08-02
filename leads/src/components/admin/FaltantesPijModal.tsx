import { useMemo, useState } from 'react';
import type {
  FaltantePijItem,
  FaltantesPijPorVendedor,
  FaltantesPijResponse,
  ExcelSinIntegralItem,
  InformeCierrePeriodo,
} from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: FaltantesPijResponse | null;
  isLoading: boolean;
  periodos: InformeCierrePeriodo[];
  idEjercicioDetalle: number | null;
  onCambiarPeriodo: (idEjercicioDetalle: number) => void;
  onRecargar: () => void;
  onSubirCsv: (csvText: string, fileName: string) => void;
  /** Excel oficial de bloqueos PIJ en sistema integral (.xlsx). */
  onSubirBloqueosIntegral?: (base64: string, fileName: string) => void;
}

function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return '—';
  const iso = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return fecha;
}

function labelPeriodo(p: InformeCierrePeriodo) {
  return p.descripcion || p.codigo || `Período ${p.idEjercicioDetalle}`;
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
  periodos,
  idEjercicioDetalle,
  onCambiarPeriodo,
  onRecargar,
  onSubirCsv,
  onSubirBloqueosIntegral,
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

  const periodoSeleccionado =
    periodos.find((p) => p.idEjercicioDetalle === idEjercicioDetalle) ?? null;

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
              Cruce vs CRM y vs sistema integral (Plan Joven).
              {data?.fuente ? (
                <>
                  {' '}
                  Fuente: <span className="font-medium text-zinc-700">{data.fuente}</span>
                </>
              ) : null}
              {periodoSeleccionado || data?.integral?.periodo?.codigo ? (
                <>
                  {' '}
                  · Período:{' '}
                  <span className="font-medium text-zinc-700">
                    {periodoSeleccionado
                      ? labelPeriodo(periodoSeleccionado)
                      : data?.integral?.periodo?.codigo}
                  </span>
                  {idEjercicioDetalle != null ? (
                    <span className="text-zinc-400"> (id {idEjercicioDetalle})</span>
                  ) : null}
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
            <label className="flex items-center gap-2 text-[12px]">
              <span className="font-semibold uppercase tracking-wide text-zinc-400">Mes</span>
              <select
                value={idEjercicioDetalle ?? ''}
                disabled={isLoading || periodos.length === 0}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (Number.isFinite(id) && id > 0) onCambiarPeriodo(id);
                }}
                className="h-9 min-w-[14rem] rounded-lg border border-zinc-200 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:opacity-50"
              >
                {periodos.length === 0 && <option value="">Cargando períodos…</option>}
                {periodos.map((p) => (
                  <option key={p.idEjercicioDetalle} value={p.idEjercicioDetalle}>
                    {labelPeriodo(p)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isLoading}
              onClick={onRecargar}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Recargar
            </button>
            <label className="cursor-pointer rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 py-1.5 text-[12px] font-semibold text-brand-800 hover:bg-brand-50">
              Subir CSV Caja…
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
            {onSubirBloqueosIntegral ? (
              <label className="cursor-pointer rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-1.5 text-[12px] font-semibold text-indigo-900 hover:bg-indigo-50">
                Subir bloqueos integral…
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = String(reader.result ?? '');
                      const b64 = result.includes(',') ? result.split(',')[1] : result;
                      onSubirBloqueosIntegral(b64 || '', file.name);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
              </label>
            ) : null}
          </div>
          {data?.integral?.fuenteXlsx || data?.integral?.source === 'xlsx-bloqueos-integral' ? (
            <p className="text-[12px] text-indigo-800">
              Cruce usando Excel oficial de bloqueos PIJ (
              {data.resumen?.adhesionesIntegral ?? data.integral?.items?.length ?? 0} filas).
            </p>
          ) : null}

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
                { id: 'faltan_crm' as const, label: 'Faltan en CRM', n: faltanCrmN },
                { id: 'faltan_integral' as const, label: 'Faltan en integral', n: faltanIntN },
                { id: 'ambiguos' as const, label: 'Ambiguos', n: ambiguos.length },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  tab === t.id
                    ? 'bg-zinc-900 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {t.label} ({t.n})
              </button>
            ))}
            <div className="ml-auto flex gap-1 rounded-lg border border-zinc-200 p-0.5">
              <button
                type="button"
                onClick={() => setVista('vendedores')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  vista === 'vendedores' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'
                }`}
              >
                Por vendedor
              </button>
              <button
                type="button"
                onClick={() => setVista('lista')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  vista === 'lista' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500'
                }`}
              >
                Lista
              </button>
            </div>
          </div>

          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, vendedor, recibo…"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60 px-4 py-4 sm:px-5">
          {isLoading && !data ? (
            <p className="py-12 text-center text-[13px] text-zinc-500">Cargando cruce…</p>
          ) : tab === 'faltan_crm' ? (
            vista === 'vendedores' ? (
              <ListaPorVendedor
                grupos={porVendedorCrmFiltrado}
                emptyText="No hay adhesiones faltantes en el CRM para este período."
              />
            ) : faltantesCrmFiltrados.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-500">Sin faltantes.</p>
            ) : (
              <ul className="space-y-2">
                {faltantesCrmFiltrados.map((f: FaltantePijItem) => (
                  <li
                    key={f.idUnico}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[13px]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-zinc-900">
                        {f.nombreClienteExcel || '—'}
                      </span>
                      <span className="font-mono text-[12px] text-zinc-500">
                        {f.reciboSugerido}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-zinc-500">
                      {f.vendedorExcel || 'Sin vendedor'} · {formatFecha(f.fechaIso || f.fechaExcel)}
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : tab === 'faltan_integral' ? (
            vista === 'vendedores' ? (
              <ListaPorVendedor
                grupos={porVendedorIntegralFiltrado}
                emptyText="No hay adhesiones del Excel ausentes en el integral."
              />
            ) : faltantesIntegralFiltrados.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-zinc-500">Sin faltantes en integral.</p>
            ) : (
              <ul className="space-y-2">
                {faltantesIntegralFiltrados.map((f: ExcelSinIntegralItem) => (
                  <li
                    key={f.idUnico}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[13px]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-zinc-900">
                        {f.nombreClienteExcel || '—'}
                      </span>
                      <span className="font-mono text-[12px] text-zinc-500">
                        {f.adhesionDisplay}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-zinc-500">
                      {f.vendedorExcel || 'Sin vendedor'} · {f.fechaExcel || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : ambiguos.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-zinc-500">Sin ambiguos.</p>
          ) : (
            <ul className="space-y-2">
              {ambiguos.map((f) => (
                <li
                  key={f.idUnico}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[13px]"
                >
                  <div className="font-semibold text-zinc-900">{f.nombreClienteExcel}</div>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {f.vendedorExcel} · {f.reciboSugerido}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
