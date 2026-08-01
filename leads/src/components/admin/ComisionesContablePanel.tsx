import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchInformeComisionesContable } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatearMontoArs } from '../../domain/venta';
import {
  esPeriodoMesCalendario,
  etiquetaMesCalendario,
  mesCalendarioIso,
} from '../../domain/admin-periodo';
import { AdminPeriodoSelector } from './AdminPeriodoSelector';
import { abrirPdfComisionesContable, guardarDocumentoComisionesContable } from '../../utils/export-comisiones-contable-pdf';
import type { InformeComisionesContable, ProgresoComisionObjetivo } from '../../types';

function labelPeriodo(periodo: string) {
  if (periodo === 'mes') return etiquetaMesCalendario(mesCalendarioIso());
  if (esPeriodoMesCalendario(periodo)) return etiquetaMesCalendario(periodo);
  return periodo;
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ?? 'text-zinc-900'}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function BarraProgresoObjetivo({
  titulo,
  progreso,
  recompensa,
  color,
}: {
  titulo: string;
  progreso: ProgresoComisionObjetivo;
  recompensa: string;
  color: 'indigo' | 'amber';
}) {
  const bar =
    color === 'indigo'
      ? progreso.cumplido
        ? 'bg-emerald-500'
        : 'bg-indigo-500'
      : progreso.cumplido
        ? 'bg-emerald-500'
        : 'bg-amber-500';
  const border = progreso.cumplido
    ? 'border-emerald-200 bg-emerald-50/50'
    : color === 'indigo'
      ? 'border-indigo-100 bg-indigo-50/40'
      : 'border-amber-100 bg-amber-50/40';

  return (
    <div className={`rounded-xl border px-4 py-4 ${border}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-zinc-900">{titulo}</h3>
        <p className="text-[13px] font-semibold tabular-nums text-zinc-800">
          {progreso.actual} / {progreso.objetivo}
          {!progreso.cumplido && progreso.faltan > 0 ? (
            <span className="ml-2 font-normal text-zinc-500">· faltan {progreso.faltan}</span>
          ) : null}
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-200/80">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${Math.min(100, Math.max(0, progreso.porcentaje))}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-zinc-700">{progreso.mensaje}</p>
        <p className="text-[11px] text-zinc-500">{recompensa}</p>
      </div>
      {progreso.cumplido ? (
        <p className="mt-2 text-[12px] font-semibold text-emerald-700">Objetivo alcanzado</p>
      ) : (
        <p className="mt-2 text-[12px] text-zinc-500">
          Sin comisión hasta llegar a {progreso.objetivo}.
        </p>
      )}
    </div>
  );
}

export function ComisionesContablePanel() {
  const { usuario } = useAuth();
  const [periodo, setPeriodo] = useState(() => mesCalendarioIso());
  const [data, setData] = useState<InformeComisionesContable | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await fetchInformeComisionesContable(periodo);
      setData(res);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'No se pudo cargar el informe.');
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const periodoLabel = useMemo(() => labelPeriodo(periodo), [periodo]);

  const generarPdf = useCallback(() => {
    if (!data) return;
    abrirPdfComisionesContable({
      data,
      periodoLabel,
      firmanteNombre: usuario?.nombre?.trim() || 'Usuario autorizado',
      firmanteLogin: usuario?.loginId,
    });
  }, [data, periodoLabel, usuario]);

  const guardarPdf = useCallback(() => {
    if (!data) return;
    guardarDocumentoComisionesContable({
      data,
      periodoLabel,
      firmanteNombre: usuario?.nombre?.trim() || 'Usuario autorizado',
      firmanteLogin: usuario?.loginId,
    });
  }, [data, periodoLabel, usuario]);

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Departamento Contable · Mi Primer Casa
          </p>
          <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.01em] text-zinc-900">
            Informe de comisiones y salarios
          </h2>
          <p className="mt-1 text-[13px] text-zinc-500">
            Salario fijo $800.000 · PIJ $2.000 c/u (mín. 100) · Terrenos 1% (mín. 30 adhesiones).
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
          <AdminPeriodoSelector periodo={periodo} onCambiarPeriodo={setPeriodo} />
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="h-10 rounded-lg bg-brand-700 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
          >
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          <button
            type="button"
            onClick={generarPdf}
            disabled={!data || cargando}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Imprimir / Guardar como PDF
          </button>
          <button
            type="button"
            onClick={guardarPdf}
            disabled={!data || cargando}
            className="h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            Guardar PDF
          </button>
        </div>

        {error && (
          <p className="mx-5 my-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
            {error}
          </p>
        )}

        {data && (
          <div className="space-y-5 p-5">
            <p className="text-[12px] text-zinc-500">
              Período: <strong className="text-zinc-800">{periodoLabel}</strong>
              {data.periodoCodigo ? ` · ${data.periodoCodigo}` : ''}
              {data.yyyyMm ? ` · ${data.yyyyMm}` : ''}
            </p>

            {(data.pij.progreso || data.terrenos.progreso) && (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.pij.progreso ? (
                  <BarraProgresoObjetivo
                    titulo="Objetivo PIJ"
                    progreso={data.pij.progreso}
                    recompensa={`${formatearMontoArs(data.pij.unitario)} c/u al llegar a ${data.pij.progreso.objetivo}`}
                    color="indigo"
                  />
                ) : null}
                {data.terrenos.progreso ? (
                  <BarraProgresoObjetivo
                    titulo="Objetivo terrenos"
                    progreso={data.terrenos.progreso}
                    recompensa={`1% del recaudado al llegar a ${data.terrenos.progreso.objetivo}`}
                    color="amber"
                  />
                ) : null}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi
                label="Salario fijo"
                value={formatearMontoArs(data.salarioFijo ?? 800000)}
                sub="Mensual"
                accent="text-zinc-800"
              />
              <Kpi
                label="PIJ vendidos"
                value={String(data.pij.cantidad)}
                sub={
                  data.pij.objetivoCumplido
                    ? `${formatearMontoArs(data.pij.unitario)} c/u · objetivo OK`
                    : `Meta ${data.reglas.objetivoPij ?? 100} · sin comisión aún`
                }
                accent="text-indigo-700"
              />
              <Kpi
                label="Comisión PIJ"
                value={formatearMontoArs(data.pij.comision)}
                sub={
                  data.pij.objetivoCumplido
                    ? `${data.pij.cantidad} × ${formatearMontoArs(data.pij.unitario)}`
                    : `Potencial: ${formatearMontoArs(data.pij.comisionBruta ?? 0)}`
                }
                accent={data.pij.objetivoCumplido ? 'text-indigo-700' : 'text-zinc-400'}
              />
              <Kpi
                label="Adhesiones terrenos"
                value={String(data.terrenos.cantidad)}
                sub={
                  data.terrenos.objetivoCumplido
                    ? `Recaudado: ${formatearMontoArs(data.terrenos.montoRecaudado)}`
                    : `Meta ${data.reglas.objetivoTerrenos ?? 30} · sin 1% aún`
                }
                accent="text-amber-700"
              />
              <Kpi
                label="Comisión terrenos (1%)"
                value={formatearMontoArs(data.terrenos.comision)}
                sub={
                  data.terrenos.objetivoCumplido
                    ? '1% del total recaudado'
                    : `Potencial: ${formatearMontoArs(data.terrenos.comisionBruta ?? 0)}`
                }
                accent={data.terrenos.objetivoCumplido ? 'text-amber-700' : 'text-zinc-400'}
              />
            </div>

            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Total a liquidar
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-800">
                {formatearMontoArs(
                  data.totalALiquidar ??
                    data.totalComision + Number(data.salarioFijo ?? 800000),
                )}
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] text-emerald-900/90">
                <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-100 pb-1.5">
                  <span>Salario fijo</span>
                  <span className="font-semibold tabular-nums">
                    {formatearMontoArs(data.salarioFijo ?? 800000)}
                  </span>
                </li>
                <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-100 pb-1.5">
                  <span>
                    Comisión PIJ
                    {data.pij.objetivoCumplido ? (
                      <span className="ml-2 text-[11px] font-medium text-emerald-700">
                        (objetivo OK)
                      </span>
                    ) : (
                      <span className="ml-2 text-[11px] font-medium text-amber-700">
                        (no incluido · meta {data.reglas.objetivoPij ?? 100})
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${data.pij.objetivoCumplido ? '' : 'text-zinc-400 line-through'}`}
                  >
                    {formatearMontoArs(
                      data.pij.objetivoCumplido
                        ? data.pij.comision
                        : (data.pij.comisionBruta ?? 0),
                    )}
                  </span>
                </li>
                <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-emerald-100 pb-1.5">
                  <span>
                    Comisión terrenos (1%)
                    {data.terrenos.objetivoCumplido ? (
                      <span className="ml-2 text-[11px] font-medium text-emerald-700">
                        (objetivo OK)
                      </span>
                    ) : (
                      <span className="ml-2 text-[11px] font-medium text-amber-700">
                        (no incluido · meta {data.reglas.objetivoTerrenos ?? 30})
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${data.terrenos.objetivoCumplido ? '' : 'text-zinc-400 line-through'}`}
                  >
                    {formatearMontoArs(
                      data.terrenos.objetivoCumplido
                        ? data.terrenos.comision
                        : (data.terrenos.comisionBruta ?? 0),
                    )}
                  </span>
                </li>
                <li className="flex flex-wrap items-baseline justify-between gap-2 pt-0.5">
                  <span className="font-semibold">Suma en el informe</span>
                  <span className="font-bold tabular-nums">
                    {formatearMontoArs(data.salarioFijo ?? 800000)}
                    {data.pij.objetivoCumplido
                      ? ` + ${formatearMontoArs(data.pij.comision)}`
                      : ''}
                    {data.terrenos.objetivoCumplido
                      ? ` + ${formatearMontoArs(data.terrenos.comision)}`
                      : ''}
                    {!data.pij.objetivoCumplido && !data.terrenos.objetivoCumplido
                      ? ' (solo salario)'
                      : ''}
                  </span>
                </li>
              </ul>
              {(!data.pij.objetivoCumplido || !data.terrenos.objetivoCumplido) && (
                <p className="mt-3 text-[12px] text-emerald-900/70">
                  Cada comisión se suma por separado solo si se cumple su objetivo.
                  {!data.pij.objetivoCumplido
                    ? ` PIJ: faltan ${data.pij.progreso?.faltan ?? Math.max(0, (data.reglas.objetivoPij ?? 100) - data.pij.cantidad)}.`
                    : ''}
                  {!data.terrenos.objetivoCumplido
                    ? ` Terrenos: faltan ${data.terrenos.progreso?.faltan ?? Math.max(0, (data.reglas.objetivoTerrenos ?? 30) - data.terrenos.cantidad)}.`
                    : ''}
                </p>
              )}
            </div>

            {(data.excelError || data.error) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                {data.excelError || data.error}
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <h3 className="text-[14px] font-semibold text-zinc-900">PIJ por vendedor</h3>
                <p className="mt-0.5 text-[12px] text-zinc-500">Adhesiones del mes</p>
                <div className="mt-3 max-h-72 overflow-auto">
                  <table className="min-w-full text-[13px]">
                    <thead className="sticky top-0 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      <tr>
                        <th className="px-2 py-2 text-left">Vendedor</th>
                        <th className="px-2 py-2 text-right">Cant.</th>
                        <th className="px-2 py-2 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pij.porVendedor.map((g) => (
                        <tr key={g.vendedor} className="border-t border-zinc-100">
                          <td className="px-2 py-1.5">{g.vendedor}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{g.cantidad}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                            {formatearMontoArs(
                              data.pij.objetivoCumplido ? g.cantidad * data.pij.unitario : 0,
                            )}
                          </td>
                        </tr>
                      ))}
                      {data.pij.porVendedor.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-2 py-6 text-center text-zinc-500">
                            Sin adhesiones PIJ en el período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <h3 className="text-[14px] font-semibold text-zinc-900">Terrenos por vendedor</h3>
                <p className="mt-0.5 text-[12px] text-zinc-500">Cantidad de adhesiones (SP cierres)</p>
                <div className="mt-3 max-h-72 overflow-auto">
                  <table className="min-w-full text-[13px]">
                    <thead className="sticky top-0 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      <tr>
                        <th className="px-2 py-2 text-left">Vendedor</th>
                        <th className="px-2 py-2 text-right">Cant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.terrenos.porVendedor.map((g) => (
                        <tr key={g.vendedor} className="border-t border-zinc-100">
                          <td className="px-2 py-1.5">{g.vendedor}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{g.cantidad}</td>
                        </tr>
                      ))}
                      {data.terrenos.porVendedor.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-2 py-6 text-center text-zinc-500">
                            Sin adhesiones de terrenos en el período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400">
              Generado {new Date(data.generadoEn).toLocaleString('es-AR')} · Destino:{' '}
              {data.destinatario}
            </p>
          </div>
        )}

        {cargando && !data && (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-500">
            Generando informe de comisiones y salarios…
          </p>
        )}
      </div>
    </section>
  );
}
