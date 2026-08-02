import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import html2canvas from 'html2canvas-pro';
import { enviarFeedback, fetchMisFeedback } from '../../api/client';
import type { FeedbackEstado, FeedbackItem, FeedbackTipo } from '../../types';

type Paso = 'menu' | 'form' | 'mios' | null;
type Placement = 'fab' | 'header';

type FeedbackContextValue = {
  openMenu: (opts?: { placement?: Placement }) => void;
  close: () => void;
  isOpen: boolean;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback debe usarse dentro de FeedbackProvider');
  return ctx;
}

/** Dispara el menú sin fallar si no hay provider (p. ej. tests). */
export function useFeedbackOptional() {
  return useContext(FeedbackContext);
}

function IconoBug({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 9V7a4 4 0 0 1 8 0v2M6 13H4m16 0h-2M7 17H5m14 0h-2M9 21h6a3 3 0 0 0 3-3v-5a6 6 0 1 0-12 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 9h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconoMejora({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconoLista({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function etiquetaEstadoFeedback(estado: FeedbackEstado | string): string {
  switch (estado) {
    case 'nuevo':
      return 'Pendiente';
    case 'visto':
      return 'En revisión';
    case 'aprobado':
      return 'Aprobado';
    case 'tratado':
    case 'resuelto':
      return 'Tratado';
    default:
      return String(estado);
  }
}

function claseEstadoFeedback(estado: FeedbackEstado | string): string {
  switch (estado) {
    case 'nuevo':
      return 'bg-amber-100 text-amber-900';
    case 'visto':
      return 'bg-blue-100 text-blue-800';
    case 'aprobado':
      return 'bg-emerald-100 text-emerald-800';
    case 'tratado':
    case 'resuelto':
      return 'bg-zinc-200 text-zinc-700';
    default:
      return 'bg-zinc-100 text-zinc-600';
  }
}

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

async function capturarPantallaApp(): Promise<File> {
  document.documentElement.setAttribute('data-feedback-capturing', '1');
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      ignoreElements: (el) =>
        el instanceof HTMLElement && el.hasAttribute('data-feedback-ui'),
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('No se pudo generar la captura.');
    return new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' });
  } finally {
    document.documentElement.removeAttribute('data-feedback-capturing');
  }
}

function FeedbackHost({
  paso,
  setPaso,
  placement,
  tituloId,
  onCerrar,
}: {
  paso: Paso;
  setPaso: (p: Paso) => void;
  placement: Placement;
  tituloId: string;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<FeedbackTipo>('bug');
  const [mensaje, setMensaje] = useState('');
  const [anonimo, setAnonimo] = useState(false);
  const [captura, setCaptura] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [mios, setMios] = useState<FeedbackItem[]>([]);
  const [cargandoMios, setCargandoMios] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!captura) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(captura);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captura]);

  useEffect(() => {
    if (!paso) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paso, onCerrar]);

  useEffect(() => {
    if (paso !== 'menu') return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCerrar();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [paso, onCerrar]);

  useEffect(() => {
    if (paso !== 'mios') return;
    let cancel = false;
    setCargandoMios(true);
    setError(null);
    void fetchMisFeedback()
      .then((items) => {
        if (!cancel) setMios(items);
      })
      .catch((e) => {
        if (!cancel) {
          setMios([]);
          setError(e instanceof Error ? e.message : 'No se pudieron cargar tus reportes.');
        }
      })
      .finally(() => {
        if (!cancel) setCargandoMios(false);
      });
    return () => {
      cancel = true;
    };
  }, [paso]);

  const abrirForm = (t: FeedbackTipo) => {
    setTipo(t);
    setMensaje('');
    setAnonimo(false);
    setCaptura(null);
    setError(null);
    setExito(false);
    setPaso('form');
  };

  const tomarCaptura = async () => {
    setError(null);
    setCapturando(true);
    try {
      const file = await capturarPantallaApp();
      setCaptura(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo tomar la captura.');
    } finally {
      setCapturando(false);
    }
  };

  const onArchivo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Elegí una imagen (JPG, PNG o WEBP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('La imagen supera 8 MB.');
      return;
    }
    setError(null);
    setCaptura(file);
  };

  const enviar = async () => {
    const texto = mensaje.trim();
    if (texto.length < 5) {
      setError('Describí el caso con al menos unas palabras.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await enviarFeedback({
        tipo,
        mensaje: texto,
        anonimo,
        captura: captura ?? undefined,
        urlVista: typeof window !== 'undefined' ? window.location.href : undefined,
      });
      setExito(true);
      setTimeout(() => onCerrar(), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar.');
    } finally {
      setEnviando(false);
    }
  };

  if (!paso) return null;

  const esBug = tipo === 'bug';
  const tituloForm = esBug ? 'Reportar un bug' : 'Propuesta de mejora';
  const posClass =
    placement === 'header'
      ? 'fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex flex-col items-end gap-2'
      : 'fixed bottom-5 right-5 z-[90] flex flex-col items-end gap-2';

  return (
    <div data-feedback-ui className={`pointer-events-none ${posClass}`}>
      {paso === 'menu' && (
        <div
          ref={panelRef}
          className="pointer-events-auto w-[min(100vw-2rem,300px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/10"
          role="menu"
          aria-labelledby={tituloId}
        >
          <p id={tituloId} className="border-b border-zinc-100 px-4 py-3 text-[13px] font-semibold text-zinc-800">
            Feedback
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => abrirForm('bug')}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-red-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <IconoBug />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-zinc-900">Reportar un bug</span>
              <span className="block text-[11px] text-zinc-500">Error o problema al usar la app</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => abrirForm('mejora')}
            className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-amber-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <IconoMejora />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-zinc-900">Propuesta de mejora</span>
              <span className="block text-[11px] text-zinc-500">Idea o sugerencia para mejorar</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setPaso('mios')}
            className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3 text-left transition-colors hover:bg-brand-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
              <IconoLista />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-zinc-900">
                Ver mis propuestas o bugs
              </span>
              <span className="block text-[11px] text-zinc-500">
                Estado: pendiente, aprobado o tratado
              </span>
            </span>
          </button>
        </div>
      )}

      {paso === 'form' && (
        <div
          ref={panelRef}
          className="pointer-events-auto max-h-[min(80dvh,560px)] w-[min(100vw-2rem,380px)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/15"
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaso('menu')}
                className="rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              >
                ←
              </button>
              <h2 id={tituloId} className="text-[14px] font-semibold text-zinc-900">
                {tituloForm}
              </h2>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          {exito ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-emerald-800">¡Gracias! Lo recibimos.</p>
              <p className="mt-1 text-[12px] text-zinc-500">
                {anonimo
                  ? 'Se envió de forma anónima (igual podés ver el estado en «mis reportes»).'
                  : 'Quedó asociado a tu usuario.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 px-4 py-3">
              <label className="block">
                <span className="text-[12px] font-medium text-zinc-600">
                  {esBug ? '¿Qué pasó?' : '¿Qué proponés mejorar?'}
                </span>
                <textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder={
                    esBug
                      ? 'Contá los pasos para reproducirlo, qué esperabas y qué ocurrió…'
                      : 'Describí tu idea con el mayor detalle posible…'
                  }
                  className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-900 outline-none ring-brand-500/30 placeholder:text-zinc-400 focus:border-brand-400 focus:bg-white focus:ring-2"
                />
              </label>

              {esBug && (
                <div className="space-y-2">
                  <p className="text-[12px] font-medium text-zinc-600">Captura (opcional)</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={capturando || enviando}
                      onClick={() => void tomarCaptura()}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {capturando ? 'Capturando…' : 'Tomar captura ahora'}
                    </button>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => fileRef.current?.click()}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Subir captura
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      className="hidden"
                      onChange={(e) => onArchivo(e.target.files?.[0])}
                    />
                  </div>
                  {previewUrl && (
                    <div className="relative overflow-hidden rounded-xl border border-zinc-200">
                      <img
                        src={previewUrl}
                        alt="Vista previa de captura"
                        className="max-h-40 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setCaptura(null)}
                        className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-black/80"
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </div>
              )}

              <fieldset className="space-y-1.5">
                <legend className="text-[12px] font-medium text-zinc-600">Identidad</legend>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 px-3 py-2 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/50">
                  <input
                    type="radio"
                    name="feedback-anon"
                    checked={!anonimo}
                    onChange={() => setAnonimo(false)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-zinc-900">
                      Que sepan quién soy
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      Se adjunta tu nombre y usuario a este reporte
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 px-3 py-2 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/50">
                  <input
                    type="radio"
                    name="feedback-anon"
                    checked={anonimo}
                    onChange={() => setAnonimo(true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-zinc-900">
                      De forma anónima
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      El admin no ve tu nombre; vos sí ves el estado en «mis reportes»
                    </span>
                  </span>
                </label>
              </fieldset>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={enviando || capturando}
                onClick={() => void enviar()}
                className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          )}
        </div>
      )}

      {paso === 'mios' && (
        <div
          ref={panelRef}
          className="pointer-events-auto max-h-[min(80dvh,560px)] w-[min(100vw-2rem,400px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/15"
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaso('menu')}
                className="rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              >
                ←
              </button>
              <h2 id={tituloId} className="text-[14px] font-semibold text-zinc-900">
                Mis propuestas o bugs
              </h2>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg px-2 py-1 text-[12px] font-medium text-zinc-500 hover:bg-zinc-100"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="max-h-[min(68dvh,480px)] overflow-y-auto px-4 py-3">
            {error && (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                {error}
              </p>
            )}
            {cargandoMios ? (
              <p className="py-6 text-center text-[13px] text-zinc-500">Cargando…</p>
            ) : mios.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-zinc-400">
                Todavía no enviaste reportes desde esta cuenta.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {mios.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          item.tipo === 'bug'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {item.tipo === 'bug' ? 'Bug' : 'Mejora'}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${claseEstadoFeedback(item.estado)}`}
                      >
                        {etiquetaEstadoFeedback(item.estado)}
                      </span>
                      {item.anonimo && (
                        <span className="text-[10px] font-medium text-zinc-400">Anónimo</span>
                      )}
                      <span className="ml-auto text-[11px] text-zinc-400">
                        {formatoFecha(item.creadoEn)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12px] text-zinc-800">
                      {item.mensaje}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <style>{`
        html[data-feedback-capturing] [data-feedback-ui] {
          visibility: hidden !important;
        }
      `}</style>
    </div>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [paso, setPaso] = useState<Paso>(null);
  const [placement, setPlacement] = useState<Placement>('fab');
  const tituloId = useId();

  const close = useCallback(() => setPaso(null), []);

  const openMenu = useCallback((opts?: { placement?: Placement }) => {
    setPlacement(opts?.placement ?? 'fab');
    setPaso('menu');
  }, []);

  return (
    <FeedbackContext.Provider value={{ openMenu, close, isOpen: paso !== null }}>
      {children}
      <FeedbackHost
        paso={paso}
        setPaso={setPaso}
        placement={placement}
        tituloId={tituloId}
        onCerrar={close}
      />
    </FeedbackContext.Provider>
  );
}

/** Botón flotante fijo (esquina inferior derecha). */
export function FeedbackFab() {
  const { openMenu, close, isOpen } = useFeedback();
  return (
    <button
      type="button"
      data-feedback-ui
      onClick={() => {
        if (isOpen) close();
        else openMenu({ placement: 'fab' });
      }}
      aria-expanded={isOpen}
      aria-label="Reportar bug o propuesta de mejora"
      className={`pointer-events-auto fixed bottom-5 right-5 z-[85] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-zinc-900/25 transition-transform hover:scale-105 active:scale-95 ${
        isOpen ? 'bg-zinc-700' : 'bg-brand-600 hover:bg-brand-700'
      }`}
    >
      {isOpen ? (
        <span className="text-xl leading-none" aria-hidden>
          ✕
        </span>
      ) : (
        <IconoBug className="text-white" />
      )}
    </button>
  );
}

/** Icono compacto para el header del lead u otras barras. */
export function FeedbackHeaderButton({ className = '' }: { className?: string }) {
  const fb = useFeedbackOptional();
  if (!fb) return null;
  return (
    <button
      type="button"
      data-feedback-ui
      onClick={(e) => {
        e.stopPropagation();
        fb.openMenu({ placement: 'header' });
      }}
      style={{ touchAction: 'manipulation' }}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-brand-700 active:bg-brand-50 active:text-brand-700 ${className}`}
      aria-label="Feedback: reportar o ver mis propuestas"
      title="Feedback"
    >
      <IconoBug />
    </button>
  );
}
