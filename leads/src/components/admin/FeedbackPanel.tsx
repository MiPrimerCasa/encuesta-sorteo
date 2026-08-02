import { useCallback, useEffect, useState } from 'react';
import {
  fetchFeedbackCapturaBlob,
  fetchFeedbackList,
  patchFeedbackEstado,
} from '../../api/client';
import { etiquetaEstadoFeedback } from '../feedback/FeedbackFab';
import type { FeedbackItem, FeedbackEstado } from '../../types';

function formatoFecha(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`));
  } catch {
    return iso;
  }
}

function CapturaThumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const blob = await fetchFeedbackCapturaBlob(id);
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        /* sin captura */
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (!url) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-[11px] text-zinc-400">
        Cargando captura…
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-zinc-200">
      <img src={url} alt="Captura del reporte" className="max-h-48 w-full object-contain bg-zinc-50" />
    </a>
  );
}

function claseEstado(estado: FeedbackEstado): string {
  switch (estado) {
    case 'nuevo':
      return 'bg-amber-100 text-amber-900';
    case 'visto':
      return 'bg-blue-100 text-blue-800';
    case 'aprobado':
      return 'bg-emerald-100 text-emerald-800';
    case 'tratado':
      return 'bg-zinc-200 text-zinc-700';
    default:
      return 'bg-zinc-100 text-zinc-600';
  }
}

export function FeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [nuevos, setNuevos] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'bug' | 'mejora'>('todos');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | FeedbackEstado>('todos');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await fetchFeedbackList({
        tipo: filtroTipo === 'todos' ? undefined : filtroTipo,
        estado: filtroEstado === 'todos' ? undefined : filtroEstado,
      });
      setItems(data.items);
      setNuevos(data.nuevos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los reportes.');
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [filtroTipo, filtroEstado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiarEstado = async (id: string, estado: FeedbackEstado) => {
    try {
      await patchFeedbackEstado(id, estado);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-zinc-900">Bugs y propuestas</h3>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Marcá cada reporte como visto, aprobado o tratado
            {nuevos > 0 ? ` · ${nuevos} nuevo${nuevos === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['todos', 'bug', 'mejora'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFiltroTipo(t)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
              filtroTipo === t
                ? 'bg-brand-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {t === 'todos' ? 'Todos' : t === 'bug' ? 'Bugs' : 'Mejoras'}
          </button>
        ))}
        <span className="mx-1 self-center text-zinc-300">|</span>
        {(['todos', 'nuevo', 'visto', 'aprobado', 'tratado'] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setFiltroEstado(e)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
              filtroEstado === e
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {e === 'todos' ? 'Cualquier estado' : etiquetaEstadoFeedback(e)}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p>
      )}

      {cargando ? (
        <p className="text-[13px] text-zinc-500">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center text-[13px] text-zinc-400">
          Todavía no hay reportes con estos filtros.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                      item.tipo === 'bug'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {item.tipo === 'bug' ? 'Bug' : 'Mejora'}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${claseEstado(item.estado)}`}
                  >
                    {etiquetaEstadoFeedback(item.estado)}
                  </span>
                  <span className="text-[12px] text-zinc-400">{formatoFecha(item.creadoEn)}</span>
                </div>
                <p className="text-[12px] text-zinc-500">
                  {item.anonimo
                    ? 'Anónimo'
                    : `${item.usuarioNombre ?? '—'}${item.usuarioRol ? ` · ${item.usuarioRol}` : ''}`}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-zinc-800">{item.mensaje}</p>
              {item.urlVista && (
                <p className="mt-1 truncate text-[11px] text-zinc-400" title={item.urlVista}>
                  {item.urlVista}
                </p>
              )}
              {item.tieneCaptura && (
                <div className="mt-3">
                  <CapturaThumb id={item.id} />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.estado !== 'visto' && (
                  <button
                    type="button"
                    onClick={() => void cambiarEstado(item.id, 'visto')}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    En revisión
                  </button>
                )}
                {item.estado !== 'aprobado' && (
                  <button
                    type="button"
                    onClick={() => void cambiarEstado(item.id, 'aprobado')}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Aprobado
                  </button>
                )}
                {item.estado !== 'tratado' && (
                  <button
                    type="button"
                    onClick={() => void cambiarEstado(item.id, 'tratado')}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Tratado
                  </button>
                )}
                {item.estado !== 'nuevo' && (
                  <button
                    type="button"
                    onClick={() => void cambiarEstado(item.id, 'nuevo')}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50"
                  >
                    Volver a pendiente
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
