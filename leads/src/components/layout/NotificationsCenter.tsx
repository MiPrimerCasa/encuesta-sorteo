import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNotificacionesLinksRedes,
  marcarNotificacionLinkAtendida,
} from '../../api/client';
import type { NotificacionLinkRed } from '../../types';

interface NotificationsCenterProps {
  rol: 'supervisor' | 'promotor';
}

export function NotificationsCenter({ rol }: NotificationsCenterProps) {
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<NotificacionLinkRed[]>([]);
  const [cargando, setCargando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    if (rol !== 'supervisor') return;
    setCargando(true);
    try {
      const data = await fetchNotificacionesLinksRedes();
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, [rol]);

  useEffect(() => {
    if (rol !== 'supervisor') return;
    void cargar();
    const t = setInterval(() => void cargar(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [cargar, rol]);

  useEffect(() => {
    if (!abierto) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [abierto]);

  if (rol !== 'supervisor') return null;

  const total = items.length;

  const atender = async (item: NotificacionLinkRed) => {
    await marcarNotificacionLinkAtendida(item.codigo, item.red);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setAbierto((v) => !v);
          if (!abierto) void cargar();
        }}
        aria-label={total ? `${total} notificaciones de links` : 'Sin notificaciones'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 0 1-6 0v-1m6 0H9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-zinc-200 bg-white shadow-lg"
          role="dialog"
          aria-label="Notificaciones de links"
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-[14px] font-semibold text-zinc-900">Links de redes</p>
            <p className="text-[12px] text-zinc-500">
              Instagram — acortadores caídos; actualizá la bio o la planilla
            </p>
          </div>

          <div className="max-h-[min(60vh,320px)] overflow-y-auto">
            {cargando && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-zinc-400">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-zinc-500">
                No hay links pendientes de actualizar.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-brand-800">
                      {item.redLabel} · {item.vendedor}
                    </p>
                    <p className="mt-1 text-[12px] text-zinc-600">{item.mensaje}</p>
                    {item.urlCorto && (
                      <p className="mt-1 break-all text-[11px] tabular-nums text-zinc-500">
                        {item.urlCorto}
                      </p>
                    )}
                    {item.ultimoError && (
                      <p className="mt-1 text-[11px] text-amber-700">{item.ultimoError}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => void atender(item)}
                      className="mt-2 text-[12px] font-semibold text-brand-600 hover:text-brand-800"
                    >
                      Marcar como actualizado
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
