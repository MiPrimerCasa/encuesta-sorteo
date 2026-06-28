import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMisGrabaciones, fetchGrabacionAudioBlob, uploadGrabacion } from '../../api/client';
import type { GrabacionPromotor, Lead, ResumenGrabacionesDia, ResumenTopeGrabacionesMes, TipoGrabacion } from '../../types';

interface GrabacionDiariaPanelProps {
  leads: Lead[];
  maxMb: number;
  formatos: string[];
}

function estiloSemaforo(semaforo: string): string {
  if (semaforo === 'verde') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (semaforo === 'amarillo') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-red-50 text-red-700 ring-1 ring-red-200';
}

function ResumenTopeMes({ resumen }: { resumen: ResumenTopeGrabacionesMes }) {
  return (
    <p className="text-[12px] text-zinc-500">
      Tope del mes: {resumen.usados}/{resumen.maximo} audios subidos (promoción + entrevista). Las
      entrevistas no tienen cuota diaria; el tope evita abusos de almacenamiento.
    </p>
  );
}

function ResumenDia({ resumen }: { resumen: ResumenGrabacionesDia }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-zinc-500">
        Promoción aprobada · objetivo 4/día (2 mañana + 2 tarde)
      </p>
      <div className="grid grid-cols-3 gap-3">
      {(
        [
          ['Mañana', resumen.manana, resumen.metaManana, resumen.semaforoManana],
          ['Tarde', resumen.tarde, resumen.metaTarde, resumen.semaforoTarde],
          ['Total', resumen.total, resumen.metaTotal, resumen.semaforoTotal],
        ] as const
      ).map(([label, cant, meta, sem]) => (
        <div
          key={label}
          className={`rounded-xl px-3 py-3 text-center ${estiloSemaforo(sem)}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {cant}/{meta}
          </p>
        </div>
      ))}
      </div>
    </div>
  );
}

function formatDuracion(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function AudioPromotor({ grabacionId }: { grabacionId: number }) {
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
      setError(err instanceof Error ? err.message : 'No se pudo cargar el audio');
    } finally {
      setCargando(false);
    }
  };

  if (error) {
    return <p className="mt-2 text-[12px] text-red-600">{error}</p>;
  }
  if (!src) {
    return (
      <button
        type="button"
        onClick={() => void cargar()}
        disabled={cargando}
        className="mt-2 text-[12px] font-semibold text-brand-600 hover:text-brand-700"
      >
        {cargando ? 'Cargando…' : 'Escuchar mi audio'}
      </button>
    );
  }
  return (
    <audio controls preload="none" src={src} className="mt-2 h-9 w-full max-w-md" />
  );
}

const SPEECH_PROMOCION = [
  {
    titulo: 'Opción 1 — cuando el cliente puede desconfiar',
    texto:
      'Hola muy buenos días 👋 le invitamos a que participe GRATIS de un sorteo por dos motos y un terreno, es simple solo con su nombre y su número de teléfono usted está participando. ¿Le gustaría?',
  },
  {
    titulo: 'Opción 2 — con QR',
    texto:
      'Hola muy buenos días 👋 le invitamos a que participe GRATIS de un sorteo por dos motos y un terreno, es simple escaneando este QR usted ya está participando. ¿Le gustaría?',
  },
] as const;

function ModalSpeechPromocion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  if (!abierto) return null;

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
        aria-labelledby="speech-promocion-titulo"
        className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="speech-promocion-titulo" className="text-[16px] font-semibold text-zinc-900">
            Speech recomendado para promoción
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-zinc-500 hover:bg-zinc-100"
          >
            Cerrar
          </button>
        </div>
        <div className="space-y-4">
          {SPEECH_PROMOCION.map((op) => (
            <div key={op.titulo} className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand-700">
                {op.titulo}
              </p>
              <p className="text-[14px] leading-relaxed text-zinc-800">{op.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GrabacionDiariaPanel({
  leads,
  maxMb,
  formatos,
}: GrabacionDiariaPanelProps) {
  const [tipo, setTipo] = useState<TipoGrabacion>('promocion');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leadId, setLeadId] = useState('');
  const [busquedaLead, setBusquedaLead] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [resumen, setResumen] = useState<ResumenGrabacionesDia | null>(null);
  const [resumenTopeMes, setResumenTopeMes] = useState<ResumenTopeGrabacionesMes | null>(null);
  const [lista, setLista] = useState<GrabacionPromotor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [speechAbierto, setSpeechAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await fetchMisGrabaciones();
      setResumen(data.resumen);
      setResumenTopeMes(data.resumenTopeMes);
      setLista(data.grabaciones);
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'No se pudo cargar el resumen',
      });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const leadsFiltrados = useMemo(() => {
    const q = busquedaLead.trim().toLowerCase();
    const base = [...leads].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!q) return base.slice(0, 30);
    return base
      .filter(
        (l) =>
          l.nombre.toLowerCase().includes(q) ||
          l.telefono.includes(q) ||
          l.id.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [leads, busquedaLead]);

  const leadSeleccionado = leads.find((l) => l.id === leadId);

  const promocionesHoy = useMemo(
    () =>
      lista.filter(
        (g) => g.tipo === 'promocion' && g.estado !== 'rechazado',
      ).length,
    [lista],
  );

  const topeMensualOk = resumenTopeMes == null || resumenTopeMes.usados < resumenTopeMes.maximo;
  const cupoPromocionOk = promocionesHoy < (resumen?.metaTotal ?? 4);

  const puedeSubir =
    Boolean(archivo) &&
    !subiendo &&
    topeMensualOk &&
    (tipo === 'promocion'
      ? cupoPromocionOk
      : Boolean(leadId));

  const onSubmit = async () => {
    if (!archivo || !puedeSubir) return;
    if (tipo === 'entrevista' && !leadId) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná el lead de la entrevista' });
      return;
    }

    setSubiendo(true);
    setProgreso(0);
    setMensaje(null);
    try {
      const result = await uploadGrabacion(
        archivo,
        {
          tipo,
          leadId: leadId || undefined,
          leadNombre: leadSeleccionado?.nombre,
        },
        setProgreso,
      );
      setResumen(result.resumen);
      setResumenTopeMes(result.resumenTopeMes);
      setLista((prev) => [...prev, result.grabacion]);
      setArchivo(null);
      setLeadId('');
      setBusquedaLead('');
      setMensaje({ tipo: 'ok', texto: 'Audio subido. Queda pendiente de revisión del supervisor.' });
    } catch (err) {
      const texto = err instanceof Error ? err.message : 'No se pudo subir. Reintentá cuando tengas señal.';
      setMensaje({ tipo: 'error', texto });
    } finally {
      setSubiendo(false);
      setProgreso(0);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6 md:max-w-2xl md:px-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-zinc-900">Grabación diaria</h2>
      <p className="mt-1 text-[13px] text-zinc-500">
        Promoción: 4/día (2 mañana + 2 tarde), solo audios aprobados cuentan para el objetivo.
        Entrevistas: sin cuota diaria. Tope {resumenTopeMes?.maximo ?? 20} audios/mes en total
        (promoción + entrevista). Máx. {maxMb} MB por archivo. El supervisor aprueba o rechaza cada
        audio; si se rechaza, verás el motivo indicado (promoción 7 días, entrevista 30 días).
      </p>

      {resumen && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
              Promoción de hoy
            </p>
            <ResumenDia resumen={resumen} />
          </div>
          {resumenTopeMes && <ResumenTopeMes resumen={resumenTopeMes} />}
        </div>
      )}

      <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="text-[13px] font-semibold text-zinc-700">Archivo de audio</label>
            {tipo === 'promocion' && (
              <button
                type="button"
                disabled={subiendo}
                onClick={() => setSpeechAbierto(true)}
                className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
              >
                Ver speech recomendado para promoción
              </button>
            )}
          </div>
          <input
            type="file"
            accept={formatos.join(',') + ',audio/*'}
            disabled={subiendo}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-brand-700"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Formatos: {formatos.join(', ')}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-zinc-700">Tipo</label>
          <div className="flex gap-2">
            {(['promocion', 'entrevista'] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={subiendo}
                onClick={() => setTipo(t)}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
                  tipo === t
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                }`}
              >
                {t === 'promocion' ? 'Promoción' : 'Entrevista'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-zinc-700">
            Lead {tipo === 'entrevista' ? '(obligatorio)' : '(opcional)'}
          </label>
          <input
            type="search"
            value={busquedaLead}
            onChange={(e) => setBusquedaLead(e.target.value)}
            placeholder="Buscar por nombre, teléfono o ID…"
            disabled={subiendo}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            disabled={subiendo}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-brand-500"
          >
            <option value="">— Sin lead —</option>
            {leadsFiltrados.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre} · {l.telefono}
              </option>
            ))}
          </select>
        </div>

        {subiendo && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-brand-600 transition-all duration-200"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Subiendo… {progreso}%</p>
          </div>
        )}

        {mensaje && (
          <p
            className={`rounded-lg px-3 py-2 text-[13px] font-medium ${
              mensaje.tipo === 'ok'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {mensaje.texto}
          </p>
        )}

        <button
          type="button"
          disabled={!puedeSubir}
          onClick={() => void onSubmit()}
          className="w-full rounded-xl bg-brand-600 py-3 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {subiendo ? 'Subiendo…' : 'Subir audio'}
        </button>
      </section>

      <ModalSpeechPromocion abierto={speechAbierto} onCerrar={() => setSpeechAbierto(false)} />

      <section className="mt-8">
        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
          Audios de hoy
        </h3>
        {cargando ? (
          <p className="text-[13px] text-zinc-500">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-[13px] text-zinc-500">Todavía no subiste audios hoy.</p>
        ) : (
          <ul className="space-y-2">
            {lista.map((g) => (
              <li
                key={g.id}
                className={`rounded-xl border px-3 py-2.5 text-[13px] ${
                  g.estado === 'rechazado'
                    ? 'border-red-200 bg-red-50/50 text-red-800'
                    : g.estado === 'pendiente'
                      ? 'border-amber-200 bg-amber-50/50 text-amber-900'
                      : 'border-zinc-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold capitalize">
                    {g.tipo === 'promocion' ? 'Promoción' : 'Entrevista'}
                  </span>
                  <span className="text-zinc-500">
                    {g.franja === 'manana' ? 'Mañana' : 'Tarde'} · {formatDuracion(g.duracionSeg)}
                  </span>
                </div>
                <p className="mt-0.5 text-zinc-600">
                  {g.leadNombre ? `Lead: ${g.leadNombre}` : 'Sin lead asociado'}
                </p>
                <AudioPromotor grabacionId={g.id} />
                {g.estado === 'pendiente' && (
                  <p className="mt-1 text-[12px] text-amber-700">
                    Pendiente de revisión del supervisor
                  </p>
                )}
                {g.estado === 'activo' && (
                  <p className="mt-1 text-[12px] text-emerald-700">Aprobado</p>
                )}
                {g.estado === 'rechazado' && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-white/80 px-3 py-2">
                    <p className="text-[12px] font-semibold text-red-700">Rechazado por el supervisor</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-red-800">
                      {g.motivoRechazo?.trim()
                        ? g.motivoRechazo
                        : 'Sin motivo indicado.'}
                    </p>
                    <p className="mt-1.5 text-[11px] text-red-600/80">
                      {g.tipo === 'promocion'
                        ? 'El audio se conservará 7 días y podés volver a subir uno nuevo.'
                        : 'El audio se conservará 30 días y podés volver a subir uno nuevo.'}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
