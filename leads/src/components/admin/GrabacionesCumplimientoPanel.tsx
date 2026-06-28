import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  aprobarGrabacion,
  fetchGrabacionAudioBlob,
  fetchGrabacionesCumplimiento,
  rechazarGrabacion,
} from '../../api/client';
import type { FilaCumplimientoGrabaciones, GrabacionPromotor, SemaforoGrabacion } from '../../types';
import { PromotorInformeFilter } from './PromotorInformeFilter';

function estiloSemaforo(semaforo: SemaforoGrabacion): string {
  if (semaforo === 'verde') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (semaforo === 'amarillo') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-red-50 text-red-700 ring-1 ring-red-200';
}

function CeldaCumplimiento({
  cantidad,
  meta,
  semaforo,
}: {
  cantidad: number;
  meta: number;
  semaforo: SemaforoGrabacion;
}) {
  return (
    <span
      className={`inline-flex min-w-[3rem] items-center justify-center rounded-md px-2 py-0.5 text-[13px] font-bold tabular-nums ${estiloSemaforo(semaforo)}`}
    >
      {cantidad}/{meta}
    </span>
  );
}

function AudioPlayer({ grabacionId }: { grabacionId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  const cargar = async () => {
    if (src || cargando) return;
    setCargando(true);
    setError('');
    try {
      const url = await fetchGrabacionAudioBlob(grabacionId);
      setSrc(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar audio');
    } finally {
      setCargando(false);
    }
  };

  if (error) return <span className="text-[11px] text-red-600">{error}</span>;
  if (!src) {
    return (
      <button
        type="button"
        onClick={() => void cargar()}
        disabled={cargando}
        className="text-[12px] font-semibold text-brand-600 hover:text-brand-700"
      >
        {cargando ? 'Cargando…' : 'Escuchar'}
      </button>
    );
  }
  return <audio controls preload="none" src={src} className="h-8 max-w-[180px]" />;
}

function ModalRechazoGrabacion({
  abierto,
  tipo,
  onCerrar,
  onConfirmar,
  procesando,
}: {
  abierto: boolean;
  tipo: 'promocion' | 'entrevista';
  onCerrar: () => void;
  onConfirmar: (motivo: string) => void;
  procesando: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (abierto) {
      setMotivo('');
      setError('');
    }
  }, [abierto]);

  if (!abierto) return null;

  const diasRetencion = tipo === 'promocion' ? 7 : 30;
  const etiquetaTipo = tipo === 'promocion' ? 'promoción' : 'entrevista';

  const confirmar = () => {
    const texto = motivo.trim();
    if (!texto) {
      setError('Escribí el motivo del rechazo para que el promotor lo vea.');
      return;
    }
    onConfirmar(texto);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm"
        onClick={onCerrar}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rechazo-grabacion-titulo"
        className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <h3 id="rechazo-grabacion-titulo" className="text-[16px] font-semibold text-zinc-900">
          Rechazar audio de {etiquetaTipo}
        </h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          El promotor verá el motivo en su pantalla. El audio se conservará {diasRetencion} días
          y luego se eliminará del servidor.
        </p>
        <div className="mt-4 space-y-1.5">
          <label
            htmlFor="motivo-rechazo-grabacion"
            className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
          >
            Motivo del rechazo
          </label>
          <textarea
            id="motivo-rechazo-grabacion"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (error) setError('');
            }}
            rows={4}
            maxLength={500}
            placeholder="Ej.: audio muy corto, ruido de fondo, no se escucha el speech completo…"
            className="w-full resize-y rounded-xl border border-zinc-200 px-3 py-2.5 text-[14px] text-zinc-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={procesando}
            className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {procesando ? 'Rechazando…' : 'Rechazar audio'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalleGrabaciones({
  grabaciones,
  onActualizado,
}: {
  grabaciones: GrabacionPromotor[];
  onActualizado: () => void;
}) {
  const [procesandoId, setProcesandoId] = useState<number | null>(null);
  const [rechazoModal, setRechazoModal] = useState<GrabacionPromotor | null>(null);

  const handleAprobar = async (id: number) => {
    setProcesandoId(id);
    try {
      await aprobarGrabacion(id);
      onActualizado();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo aprobar');
    } finally {
      setProcesandoId(null);
    }
  };

  const handleConfirmarRechazo = async (motivo: string) => {
    if (!rechazoModal) return;
    setProcesandoId(rechazoModal.id);
    try {
      await rechazarGrabacion(rechazoModal.id, motivo);
      setRechazoModal(null);
      onActualizado();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo rechazar');
    } finally {
      setProcesandoId(null);
    }
  };

  if (!grabaciones.length) {
    return <p className="text-[12px] text-zinc-400">Sin audios este día.</p>;
  }

  return (
    <>
      <ModalRechazoGrabacion
        abierto={rechazoModal != null}
        tipo={rechazoModal?.tipo ?? 'promocion'}
        onCerrar={() => {
          if (procesandoId == null) setRechazoModal(null);
        }}
        onConfirmar={(motivo) => void handleConfirmarRechazo(motivo)}
        procesando={procesandoId != null}
      />
      <ul className="space-y-2">
      {grabaciones.map((g) => (
        <li
          key={g.id}
          className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[12px] ${
            g.estado === 'rechazado'
              ? 'border-red-200 bg-red-50/40'
              : g.estado === 'pendiente'
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-zinc-100 bg-zinc-50'
          }`}
        >
          <span className="font-semibold capitalize">
            {g.tipo === 'promocion' ? 'Promoción' : 'Entrevista'}
          </span>
          <span className="text-zinc-500">{g.franja === 'manana' ? 'Mañana' : 'Tarde'}</span>
          <span className="text-zinc-500">{Math.round(g.duracionSeg)}s</span>
          <span className="text-zinc-600">
            {g.leadNombre ? `Lead: ${g.leadNombre}` : 'Sin lead asociado'}
          </span>
          {g.estado === 'pendiente' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
              Pendiente
            </span>
          )}
          {g.estado === 'activo' && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
              Aprobado
            </span>
          )}
          {g.estado !== 'rechazado' && <AudioPlayer grabacionId={g.id} />}
          {g.estado === 'pendiente' && (
            <>
              <button
                type="button"
                disabled={procesandoId === g.id}
                onClick={() => void handleAprobar(g.id)}
                className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={procesandoId === g.id}
                onClick={() => setRechazoModal(g)}
                className="text-[12px] font-semibold text-red-600 hover:text-red-700"
              >
                Rechazar
              </button>
            </>
          )}
          {g.estado === 'rechazado' && (
            <span className="text-red-600">
              Rechazado{g.motivoRechazo ? `: ${g.motivoRechazo}` : ''}
            </span>
          )}
        </li>
      ))}
      </ul>
    </>
  );
}

export function GrabacionesCumplimientoPanel() {
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fecha, setFecha] = useState(hoy);
  const [promotoresSeleccionados, setPromotoresSeleccionados] = useState<Set<string>>(
    () => new Set(),
  );
  const [filas, setFilas] = useState<FilaCumplimientoGrabaciones[]>([]);
  const [promotoresConfig, setPromotoresConfig] = useState<Array<{ id: string; nombre: string }>>(
    [],
  );
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const fechaInputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const ids =
        promotoresSeleccionados.size > 0 ? Array.from(promotoresSeleccionados) : undefined;
      const data = await fetchGrabacionesCumplimiento(fecha, ids);
      setFilas(data.filas);
      setPromotoresConfig(data.promotoresConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cumplimiento');
    } finally {
      setCargando(false);
    }
  }, [fecha, promotoresSeleccionados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const opcionesPromotor = useMemo(
    () =>
      promotoresConfig.map((p) => ({
        promotorId: p.id,
        promotorNombre: p.nombre,
      })),
    [promotoresConfig],
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[16px] font-semibold text-zinc-900">Grabaciones diarias</h3>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Cumplimiento de promociones aprobadas · objetivo 4/día (2 mañana + 2 tarde). Entrevistas
          listadas aparte, no suman al objetivo diario. Tope 20 audios/mes total (no es cuota).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Fecha
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFecha(hoy)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                fecha === hoy
                  ? 'bg-brand-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Hoy
            </button>
            <input
              ref={fechaInputRef}
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => setFecha(e.target.value || hoy)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px]"
            />
          </div>
        </div>

        {opcionesPromotor.length > 0 && (
          <PromotorInformeFilter
            promotores={opcionesPromotor}
            selectedIds={promotoresSeleccionados}
            onChangeSelected={setPromotoresSeleccionados}
          />
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <th className="py-2.5 px-4">Promotor</th>
              <th className="py-2.5 px-2 text-center">Mañana</th>
              <th className="py-2.5 px-2 text-center">Tarde</th>
              <th className="py-2.5 px-2 text-center">Total</th>
              <th className="py-2.5 px-4 text-center">Estado</th>
              <th className="py-2.5 px-4" />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-400">
                  Cargando…
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-400">
                  Sin promotores configurados o sin datos para esta fecha.
                </td>
              </tr>
            ) : (
              filas.map((fila) => (
                <Fragment key={fila.promotorId}>
                  <tr className="border-b border-zinc-50 hover:bg-zinc-50/50">
                    <td className="py-2.5 px-4 font-medium text-zinc-900">{fila.promotorNombre}</td>
                    <td className="py-2.5 px-2 text-center">
                      <CeldaCumplimiento
                        cantidad={fila.manana}
                        meta={fila.metaManana}
                        semaforo={fila.semaforoManana}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <CeldaCumplimiento
                        cantidad={fila.tarde}
                        meta={fila.metaTarde}
                        semaforo={fila.semaforoTarde}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <CeldaCumplimiento
                        cantidad={fila.total}
                        meta={fila.metaTotal}
                        semaforo={fila.semaforoTotal}
                      />
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[12px] font-semibold ${estiloSemaforo(fila.semaforoTotal)}`}
                      >
                        {fila.cumple ? 'Cumple' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandido((prev) =>
                            prev === fila.promotorId ? null : fila.promotorId,
                          )
                        }
                        className="text-[12px] font-semibold text-brand-600 hover:text-brand-700"
                      >
                        {expandido === fila.promotorId ? 'Ocultar' : 'Ver audios'}
                      </button>
                    </td>
                  </tr>
                  {expandido === fila.promotorId && (
                    <tr>
                      <td colSpan={6} className="bg-zinc-50/80 px-4 py-3">
                        <DetalleGrabaciones
                          grabaciones={fila.grabaciones}
                          onActualizado={() => void cargar()}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
