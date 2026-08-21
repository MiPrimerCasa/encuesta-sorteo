import { useCallback, useEffect, useRef, useState } from 'react';
import { buscarCierresPij } from '../../api/client';
import { cleanTelefonoSuffix } from '../../domain/whatsapp';
import type { BusquedaCierrePijItem } from '../../types';

interface BuscadorCierresPijPanelProps {
  onAbrirSeguimiento?: (leadId: string) => void;
  onAbrirModificar?: (leadId: string) => void;
}

function formatearFecha(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function etiquetaAdhesion(item: BusquedaCierrePijItem) {
  const serie = (item.seriePij || '').trim().toUpperCase();
  const adh = (item.nroAdhesion || '').trim();
  if (serie && adh) return `${serie}${adh}`;
  if (adh) return adh;
  if (item.numeroRecibo) return item.numeroRecibo;
  return '—';
}

export function BuscadorCierresPijPanel({
  onAbrirSeguimiento,
  onAbrirModificar,
}: BuscadorCierresPijPanelProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<BusquedaCierrePijItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busquedaHecha, setBusquedaHecha] = useState(false);
  const [ultimaQ, setUltimaQ] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const tieneAcciones = Boolean(onAbrirSeguimiento || onAbrirModificar);

  const ejecutarBusqueda = useCallback(async (qRaw: string) => {
    const q = qRaw.trim();
    if (q.length < 2) {
      setItems([]);
      setError(null);
      setBusquedaHecha(false);
      setUltimaQ('');
      return;
    }

    const reqId = ++reqIdRef.current;
    setCargando(true);
    setError(null);
    try {
      const data = await buscarCierresPij(q, 80);
      if (reqId !== reqIdRef.current) return;
      setItems(data.items ?? []);
      setUltimaQ(data.q || q);
      setBusquedaHecha(true);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setItems([]);
      setBusquedaHecha(true);
      setUltimaQ(q);
      setError(err instanceof Error ? err.message : 'Error al buscar cierres.');
    } finally {
      if (reqId === reqIdRef.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setBusquedaHecha(false);
      setError(null);
      setCargando(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void ejecutarBusqueda(q);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, ejecutarBusqueda]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h4 className="text-[14px] font-semibold text-zinc-900">Buscador de cierres PIJ</h4>
          <p className="text-[11px] text-zinc-500">
            Buscá por adhesión (ej. A230), anexo, nombre de cliente o vendedor.
          </p>
        </div>
        <div className="relative w-full sm:w-80 shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          >
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="busqueda-cierres-pij"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Adhesión, anexo, cliente o vendedor..."
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-8 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-100"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ touchAction: 'manipulation' }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 active:text-zinc-700"
              aria-label="Limpiar búsqueda"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-brand-600" />
          <p className="text-[13px] text-zinc-500 font-medium animate-pulse">Buscando cierres...</p>
        </div>
      ) : error ? (
        <p className="py-8 text-center text-[13px] text-red-600">{error}</p>
      ) : !busquedaHecha ? (
        <p className="py-8 text-center text-[13px] text-zinc-400">
          Escribí al menos 2 caracteres para buscar.
        </p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-zinc-400">
          No se encontraron cierres para &quot;{ultimaQ}&quot;.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-100 text-[13px]">
              <thead>
                <tr className="bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="py-2.5 px-4 text-left">Cliente</th>
                  <th className="py-2.5 px-4 text-left">Vendedor</th>
                  <th className="py-2.5 px-4 text-center">Adhesión</th>
                  <th className="py-2.5 px-4 text-center">Anexo</th>
                  <th className="py-2.5 px-4 text-center">Fecha</th>
                  <th className="py-2.5 px-4 text-center">Tipo</th>
                  {tieneAcciones && (
                    <th className="py-2.5 px-4 text-center">Acción</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {items.map((item, idx) => (
                  <tr
                    key={`${item.leadId}-${item.compraId || 'principal'}-${idx}`}
                    className="hover:bg-zinc-50/80 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900">{item.nombreCliente || '—'}</div>
                      <div className="text-[11px] font-mono text-zinc-400">
                        {item.telefono ? cleanTelefonoSuffix(item.telefono) : 'Sin teléfono'}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-800">
                      {item.vendedor || 'Sin vendedor'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono tabular-nums text-zinc-800">
                      {etiquetaAdhesion(item)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono tabular-nums text-zinc-800">
                      {item.nroAnexo || '—'}
                    </td>
                    <td className="py-3 px-4 text-center text-zinc-500 tabular-nums">
                      {formatearFecha(item.fechaCierre)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.esAdicional ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          Adicional
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Principal
                        </span>
                      )}
                    </td>
                    {tieneAcciones && (
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center items-center gap-2 flex-wrap">
                          {onAbrirSeguimiento && (
                            <button
                              type="button"
                              onClick={() => onAbrirSeguimiento(item.leadId)}
                              className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer"
                            >
                              Seguimiento
                            </button>
                          )}
                          {onAbrirSeguimiento && onAbrirModificar && (
                            <span className="text-zinc-300">|</span>
                          )}
                          {onAbrirModificar && (
                            <button
                              type="button"
                              onClick={() => onAbrirModificar(item.leadId)}
                              className="text-[12px] font-semibold text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
                            >
                              Modificar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-3">
            <p className="text-[12px] text-zinc-500">
              {items.length} resultado{items.length === 1 ? '' : 's'}
              {ultimaQ ? (
                <>
                  {' '}
                  para <span className="font-semibold">&quot;{ultimaQ}&quot;</span>
                </>
              ) : null}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
