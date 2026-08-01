import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { fetchInformeCierres, fetchInformeCierresPeriodos } from '../../api/client';
import { formatearMontoArs } from '../../domain/venta';
import type {
  InformeCierreFila,
  InformeCierrePeriodo,
  InformeCierrePorVendedor,
  InformeCierreSeccion,
  InformeCierreTotales,
  InformeCierresResponse,
} from '../../types';

const DEFAULT_ID_OPERADOR = 1;
const DEFAULT_ID_VENDEDOR = 0;

const TOTALES_VACIOS: InformeCierreTotales = {
  filas: 0,
  precioLote: 0,
  montoPactadoAdhesion: 0,
  senaRecuperada: 0,
  cantidadRecibosPeriodo: 0,
  montoCobradoEfectivo: 0,
  montoCobradoMep: 0,
  totalCobradoPeriodo: 0,
  saldoAdhesion: 0,
  adhesionCelebrada: 0,
  adhesionCancelada: 0,
  senaEnPeriodo: 0,
};

/** Barrio del SP que identifica Plan Joven; el resto = lotes/terreno. */
function esBarrioPlanJoven(barrio: string) {
  return barrio.trim().toUpperCase().replace(/\s+/g, ' ') === 'PLAN JOVEN';
}

/**
 * Período por defecto: mes calendario anterior (el mes en curso suele ir vacío
 * a principio de mes). Si no está en la lista, el que contiene hoy; si no, el primero.
 */
function elegirPeriodoDefault(lista: InformeCierrePeriodo[]): number | null {
  if (!lista.length) return null;
  const now = new Date();
  const ref = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 15));
  const mesAnterior = lista.find((p) => {
    if (!p.fechaDesde) return false;
    const d = new Date(p.fechaDesde);
    return (
      d.getUTCFullYear() === ref.getUTCFullYear() && d.getUTCMonth() === ref.getUTCMonth()
    );
  });
  if (mesAnterior) return mesAnterior.idEjercicioDetalle;

  const t = Date.now();
  const actual = lista.find((p) => {
    if (!p.fechaDesde || !p.fechaHasta) return false;
    const desde = new Date(p.fechaDesde).getTime();
    const hasta = new Date(p.fechaHasta).getTime();
    return t >= desde && t <= hasta;
  });
  return (actual ?? lista[0]).idEjercicioDetalle;
}

function sumarTotalesFilas(filas: InformeCierreFila[]): InformeCierreTotales {
  const t = { ...TOTALES_VACIOS, filas: filas.length };
  for (const f of filas) {
    t.precioLote += f.precioLote;
    t.montoPactadoAdhesion += f.montoPactadoAdhesion;
    t.senaRecuperada += f.senaRecuperada;
    t.cantidadRecibosPeriodo += f.cantidadRecibosPeriodo;
    t.montoCobradoEfectivo += f.montoCobradoEfectivo;
    t.montoCobradoMep += f.montoCobradoMep;
    t.totalCobradoPeriodo += f.totalCobradoPeriodo;
    t.saldoAdhesion += f.saldoAdhesion;
    t.adhesionCelebrada += f.adhesionCelebrada;
    t.adhesionCancelada += f.adhesionCancelada;
    t.senaEnPeriodo += f.senaEnPeriodo;
  }
  return t;
}

function agruparFilasPorVendedor(filas: InformeCierreFila[]): InformeCierrePorVendedor[] {
  const map = new Map<string, InformeCierreFila[]>();
  for (const f of filas) {
    const key = f.vendedor || 'Sin vendedor';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return [...map.entries()]
    .map(([vendedor, cierres]) => ({
      vendedor,
      idOperador: cierres[0]?.idOperador ?? 0,
      totales: sumarTotalesFilas(cierres),
      cierres,
    }))
    .sort((a, b) => a.vendedor.localeCompare(b.vendedor, 'es'));
}

/** Arma sección PIJ/terreno desde filas (fallback si el API viejo no manda pij/terreno). */
function seccionDesdeFilas(filas: InformeCierreFila[]): InformeCierreSeccion {
  return {
    totales: sumarTotalesFilas(filas),
    porVendedor: agruparFilasPorVendedor(filas),
    filas,
  };
}

function resolverSecciones(data: InformeCierresResponse | null): {
  pij: InformeCierreSeccion;
  terreno: InformeCierreSeccion;
} {
  const vacia: InformeCierreSeccion = {
    totales: TOTALES_VACIOS,
    porVendedor: [],
    filas: [],
  };
  if (!data) return { pij: vacia, terreno: vacia };

  const apiPijOk = (data.pij?.filas?.length ?? 0) > 0 || (data.terreno?.filas?.length ?? 0) > 0;
  if (apiPijOk && data.pij && data.terreno) {
    return { pij: data.pij, terreno: data.terreno };
  }

  // Recalcular desde filas por barrio (cubre API sin secciones o sin campo tipo).
  const filas = data.filas ?? [];
  const filasPij = filas.filter(
    (f) => f.tipo === 'pij' || (!f.tipo && esBarrioPlanJoven(f.barrio)),
  );
  const filasTerreno = filas.filter(
    (f) => f.tipo === 'terreno' || (!f.tipo && !esBarrioPlanJoven(f.barrio)),
  );
  // Si no hay tipo y todas quedaron en terreno por error de filtro, rehacer solo por barrio.
  if (filas.length > 0 && filasPij.length === 0 && filasTerreno.length === 0) {
    const pij = filas.filter((f) => esBarrioPlanJoven(f.barrio));
    const terreno = filas.filter((f) => !esBarrioPlanJoven(f.barrio));
    return { pij: seccionDesdeFilas(pij), terreno: seccionDesdeFilas(terreno) };
  }
  return {
    pij: seccionDesdeFilas(filasPij),
    terreno: seccionDesdeFilas(filasTerreno),
  };
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function Monto({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>{formatearMontoArs(value)}</span>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ?? 'text-zinc-900'}`}>
        {formatearMontoArs(value)}
      </p>
    </div>
  );
}

function KpiCantidad({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ?? 'text-zinc-900'}`}>
        {value.toLocaleString('es-AR')}
      </p>
    </div>
  );
}

function labelPeriodo(p: InformeCierrePeriodo) {
  return p.descripcion || p.codigo || `Período ${p.idEjercicioDetalle}`;
}

function filtrarPorBusqueda(
  porVendedor: InformeCierrePorVendedor[],
  q: string,
): InformeCierrePorVendedor[] {
  const term = q.trim().toLowerCase();
  if (!term) return porVendedor;
  return porVendedor
    .map((g) => ({
      ...g,
      cierres: g.cierres.filter((f) => {
        const blob = `${f.vendedor} ${f.nombreCliente || ''} ${f.barrio} ${f.mz} ${f.pc} ${f.idLoteVenta}`.toLowerCase();
        return blob.includes(term);
      }),
    }))
    .filter((g) => g.cierres.length > 0)
    .map((g) => ({
      ...g,
      totales: {
        ...g.totales,
        filas: g.cierres.length,
        totalCobradoPeriodo: g.cierres.reduce((a, c) => a + c.totalCobradoPeriodo, 0),
        montoCobradoEfectivo: g.cierres.reduce((a, c) => a + c.montoCobradoEfectivo, 0),
        montoCobradoMep: g.cierres.reduce((a, c) => a + c.montoCobradoMep, 0),
      },
    }));
}

function SeccionProducto({
  titulo,
  subtitulo,
  seccion,
  q,
  mostrarBarrio,
  expandKey,
  expandido,
  onToggle,
  modo,
  excelCantidad,
  excelTotal,
}: {
  titulo: string;
  subtitulo: string;
  seccion: InformeCierreSeccion;
  q: string;
  mostrarBarrio: boolean;
  expandKey: string;
  expandido: string | null;
  onToggle: (key: string | null) => void;
  /** pij = cantidad adhesiones + total×33k; lotes = cantidad + monto total */
  modo: 'pij' | 'lotes';
  excelCantidad?: number;
  excelTotal?: number;
}) {
  const porVendedor = useMemo(
    () => filtrarPorBusqueda(seccion.porVendedor, q),
    [seccion.porVendedor, q],
  );
  const filasVisibles = porVendedor.reduce((n, g) => n + g.cierres.length, 0);

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h4 className="text-[15px] font-semibold text-zinc-900">{titulo}</h4>
        <p className="mt-0.5 text-[12px] text-zinc-500">{subtitulo}</p>
      </div>

      {modo === 'pij' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCantidad
            label="Cantidad adhesiones"
            value={excelCantidad ?? 0}
            accent="text-indigo-700"
          />
          <Kpi
            label="Total recaudado adhesiones ($33.000 c/u)"
            value={excelTotal ?? 0}
            accent="text-emerald-700"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCantidad
            label="Cantidad lotes"
            value={seccion.totales.filas}
            accent="text-amber-700"
          />
          <Kpi
            label="Monto total lotes"
            value={seccion.totales.totalCobradoPeriodo}
            accent="text-emerald-700"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[12px] text-zinc-500">
        <span>
          Detalle:{' '}
          <strong className="text-zinc-800 tabular-nums">{filasVisibles}</strong>
          {q.trim() ? ` (de ${seccion.totales.filas})` : ''}
        </span>
        <span>
          Vendedores:{' '}
          <strong className="text-zinc-800 tabular-nums">{porVendedor.length}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-[13px]">
          <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-3 py-2.5 text-left">Vendedor</th>
              <th className="px-3 py-2.5 text-center">Cierres</th>
              <th className="px-3 py-2.5 text-right">Efectivo</th>
              <th className="px-3 py-2.5 text-right">MEP</th>
              <th className="px-3 py-2.5 text-right">Total cobrado</th>
              <th className="px-3 py-2.5 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {porVendedor.map((g) => {
              const rowKey = `${expandKey}:${g.vendedor}`;
              const open = expandido === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr className="border-t border-zinc-100 text-zinc-800">
                    <td className="px-3 py-2.5 font-medium">{g.vendedor}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{g.totales.filas}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Monto value={g.totales.montoCobradoEfectivo} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Monto value={g.totales.montoCobradoMep} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                      <Monto value={g.totales.totalCobradoPeriodo} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => onToggle(open ? null : rowKey)}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50"
                      >
                        {open ? 'Ocultar' : 'Ver lotes'}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t border-zinc-100 bg-zinc-50/80">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                          <table className="min-w-full text-[12px]">
                            <thead className="bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                              <tr>
                                <th className="px-2 py-2 text-left">Cliente</th>
                                {mostrarBarrio && (
                                  <th className="px-2 py-2 text-left">Barrio</th>
                                )}
                                <th className="px-2 py-2 text-center">MZ</th>
                                <th className="px-2 py-2 text-center">PC</th>
                                <th className="px-2 py-2 text-right">Precio lote</th>
                                <th className="px-2 py-2 text-right">Pactado</th>
                                <th className="px-2 py-2 text-right">Efectivo</th>
                                <th className="px-2 py-2 text-right">MEP</th>
                                <th className="px-2 py-2 text-right">Total</th>
                                <th className="px-2 py-2 text-center">Cobranza</th>
                                <th className="px-2 py-2 text-right">Seña ant.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.cierres.map((c: InformeCierreFila) => (
                                <tr
                                  key={`${c.idLoteVenta}-${c.mz}-${c.pc}-${c.fechaInicioCobranza}`}
                                  className="border-t border-zinc-100 text-zinc-700"
                                >
                                  <td className="px-2 py-1.5 font-medium text-zinc-800">
                                    {c.nombreCliente || '—'}
                                  </td>
                                  {mostrarBarrio && (
                                    <td className="px-2 py-1.5">{c.barrio || '—'}</td>
                                  )}
                                  <td className="px-2 py-1.5 text-center tabular-nums">
                                    {c.mz || '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-center tabular-nums">
                                    {c.pc || '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <Monto value={c.precioLote} />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <Monto value={c.montoPactadoAdhesion} />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <Monto value={c.montoCobradoEfectivo} />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <Monto value={c.montoCobradoMep} />
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">
                                    <Monto value={c.totalCobradoPeriodo} />
                                  </td>
                                  <td className="px-2 py-1.5 text-center whitespace-nowrap text-zinc-500">
                                    {fmtFecha(c.fechaInicioCobranza)}
                                    {c.fechaFinCobranza &&
                                    c.fechaFinCobranza !== c.fechaInicioCobranza
                                      ? ` → ${fmtFecha(c.fechaFinCobranza)}`
                                      : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <Monto value={c.senaRecuperada} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {porVendedor.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  Sin filas en esta sección.
                </td>
              </tr>
            )}
          </tbody>
          {porVendedor.length > 0 && !q.trim() && (
            <tfoot>
              <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold text-zinc-900">
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-center tabular-nums">
                  {seccion.totales.filas}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Monto value={seccion.totales.montoCobradoEfectivo} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Monto value={seccion.totales.montoCobradoMep} />
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-700">
                  <Monto value={seccion.totales.totalCobradoPeriodo} />
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function InformeCierresPanel() {
  const [periodos, setPeriodos] = useState<InformeCierrePeriodo[]>([]);
  const [idEjercicio, setIdEjercicio] = useState<number | null>(null);
  const [idOperador, setIdOperador] = useState(String(DEFAULT_ID_OPERADOR));
  const [idVendedor, setIdVendedor] = useState(String(DEFAULT_ID_VENDEDOR));
  const [data, setData] = useState<InformeCierresResponse | null>(null);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [vendedorExpandido, setVendedorExpandido] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCargandoPeriodos(true);
      try {
        const res = await fetchInformeCierresPeriodos();
        if (cancelled) return;
        const lista = res.periodos ?? [];
        setPeriodos(lista);
        const preferido = elegirPeriodoDefault(lista);
        setIdEjercicio((prev) => prev ?? preferido);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar los períodos.',
          );
        }
      } finally {
        if (!cancelled) setCargandoPeriodos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const periodoSeleccionado = useMemo(
    () => periodos.find((p) => p.idEjercicioDetalle === idEjercicio) ?? null,
    [periodos, idEjercicio],
  );

  const cargar = useCallback(async () => {
    if (idEjercicio == null) return;
    setCargando(true);
    setError('');
    try {
      const informe = await fetchInformeCierres({
        idOperador: Number(idOperador) || DEFAULT_ID_OPERADOR,
        idEjercicioDetalle: idEjercicio,
        idVendedor: Number(idVendedor) || 0,
      });
      setData(informe);
      setVendedorExpandido(null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'No se pudo cargar el informe de cierres.');
    } finally {
      setCargando(false);
    }
  }, [idOperador, idEjercicio, idVendedor]);

  useEffect(() => {
    if (idEjercicio == null) return;
    void cargar();
  }, [cargar, idEjercicio]);

  const { pij: seccionPij, terreno: seccionTerreno } = useMemo(
    () => resolverSecciones(data),
    [data],
  );

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Panel global
          </p>
          <h3 className="mt-0.5 text-[17px] font-semibold tracking-[-0.01em] text-zinc-900">
            Informe de cierres
          </h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Adhesiones PIJ: cantidad y total ($33.000 c/u). Lotes: cantidad y monto total del período.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
          <label className="space-y-1 text-[12px]">
            <span className="font-semibold uppercase tracking-wide text-zinc-500">Período</span>
            <select
              value={idEjercicio ?? ''}
              onChange={(e) => setIdEjercicio(Number(e.target.value) || null)}
              disabled={cargandoPeriodos || periodos.length === 0}
              className="block h-10 min-w-[12rem] rounded-lg border border-zinc-200 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            >
              {cargandoPeriodos && <option value="">Cargando períodos…</option>}
              {!cargandoPeriodos && periodos.length === 0 && (
                <option value="">Sin períodos</option>
              )}
              {periodos.map((p) => (
                <option key={p.idEjercicioDetalle} value={p.idEjercicioDetalle}>
                  {labelPeriodo(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="font-semibold uppercase tracking-wide text-zinc-500">idOperador</span>
            <input
              type="number"
              value={idOperador}
              onChange={(e) => setIdOperador(e.target.value)}
              className="block h-10 w-28 rounded-lg border border-zinc-200 bg-white px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="font-semibold uppercase tracking-wide text-zinc-500">
              idVendedor (0=todos)
            </span>
            <input
              type="number"
              value={idVendedor}
              onChange={(e) => setIdVendedor(e.target.value)}
              className="block h-10 w-32 rounded-lg border border-zinc-200 bg-white px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          </label>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando || idEjercicio == null}
            className="h-10 rounded-lg bg-brand-700 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
          >
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
          <div className="ml-auto min-w-[12rem] flex-1 sm:max-w-xs">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar vendedor, barrio, MZ/PC…"
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-600/15"
            />
          </div>
        </div>

        {periodoSeleccionado && (
          <p className="border-b border-zinc-100 px-5 py-2 text-[12px] text-zinc-500">
            {labelPeriodo(periodoSeleccionado)}
            {periodoSeleccionado.fechaDesde || periodoSeleccionado.fechaHasta
              ? ` · ${fmtFecha(periodoSeleccionado.fechaDesde)} → ${fmtFecha(periodoSeleccionado.fechaHasta)}`
              : ''}
            <span className="text-zinc-400">
              {' '}
              · idEjercicioDetalle={periodoSeleccionado.idEjercicioDetalle}
            </span>
          </p>
        )}

        {error && (
          <p className="mx-5 my-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
            {error}
          </p>
        )}

        {data && (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCantidad
                label="Cantidad adhesiones"
                value={data.resumenPanel?.adhesionesExcelCantidad ?? data.excel?.cantidad ?? 0}
                accent="text-indigo-700"
              />
              <Kpi
                label="Total recaudado adhesiones ($33.000 c/u)"
                value={
                  data.resumenPanel?.adhesionesExcelTotal ?? data.excel?.totalRecaudado ?? 0
                }
                accent="text-emerald-700"
              />
              <KpiCantidad
                label="Cantidad lotes"
                value={data.resumenPanel?.lotesCantidad ?? seccionTerreno.totales.filas}
                accent="text-amber-700"
              />
              <Kpi
                label="Monto total lotes"
                value={
                  data.resumenPanel?.lotesMontoTotal ?? seccionTerreno.totales.totalCobradoPeriodo
                }
                accent="text-emerald-700"
              />
            </div>
            {(data.excel?.error) && (
              <p className="text-[12px] text-amber-800">
                {data.excel.error}
              </p>
            )}

            <SeccionProducto
              titulo="Plan Inversión Joven — adhesiones"
              subtitulo="Cantidad y total a $33.000 c/u. Detalle por vendedor abajo."
              seccion={seccionPij}
              q={q}
              mostrarBarrio={false}
              expandKey="pij"
              expandido={vendedorExpandido}
              onToggle={setVendedorExpandido}
              modo="pij"
              excelCantidad={
                data.resumenPanel?.adhesionesExcelCantidad ?? data.excel?.cantidad ?? 0
              }
              excelTotal={
                data.resumenPanel?.adhesionesExcelTotal ?? data.excel?.totalRecaudado ?? 0
              }
            />

            <SeccionProducto
              titulo="Lotes — adhesión de terrenos"
              subtitulo={
                seccionTerreno.totales.filas === 0
                  ? 'Sin lotes en este período. Probá Julio 2026 (u otro mes con cierres).'
                  : 'Cantidad y monto total (barrios distintos de PLAN JOVEN).'
              }
              seccion={seccionTerreno}
              q={q}
              mostrarBarrio={true}
              expandKey="terreno"
              expandido={vendedorExpandido}
              onToggle={setVendedorExpandido}
              modo="lotes"
            />
          </div>
        )}

        {(cargando || cargandoPeriodos) && !data && (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-500">
            Cargando informe de cierres…
          </p>
        )}
      </div>
    </section>
  );
}
