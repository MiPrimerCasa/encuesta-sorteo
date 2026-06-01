import { useRef, useState } from 'react';
import type {
  Barrio,
  CanalContacto,
  Lead,
  Producto,
  Promotor,
  RolUsuario,
  SeguimientoLead,
} from '../../types';
import { LeadCard } from './LeadCard';

const REVEAL_WIDTH = 210;

interface Props {
  lead: Lead;
  onClick: (lead: Lead) => void;
  variante?: 'activo' | 'seguimiento' | 'compro';
  promotores?: Promotor[];
  productos?: Producto[];
  barrios?: Barrio[];
  nombreUsuario?: string;
  ocultarPromotor?: boolean;
  rolUsuario?: RolUsuario;
  onQuickSave: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
}

export function SwipeableLeadCard({
  lead,
  onClick,
  variante,
  promotores,
  productos,
  barrios,
  nombreUsuario,
  ocultarPromotor,
  rolUsuario = 'promotor',
  onQuickSave,
}: Props) {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [canal, setCanal] = useState<CanalContacto | null>(null);
  const [confirmo, setConfirmo] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const currentOffset = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);

  const resetForm = () => {
    setCanal(null);
    setConfirmo(null);
  };

  const close = () => {
    currentOffset.current = 0;
    setOffset(0);
    setRevealed(false);
    resetForm();
  };

  /* ── Touch (mobile swipe) ── */
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = currentOffset.current;
    isDragging.current = true;
    isHorizontal.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = startX.current - e.touches[0].clientX;
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    if (isHorizontal.current === null) {
      if (Math.abs(dx) < 8 && dy < 8) return;
      isHorizontal.current = Math.abs(dx) > dy;
    }
    if (!isHorizontal.current) return;
    const newOffset = Math.max(0, Math.min(startOffset.current + dx, REVEAL_WIDTH));
    currentOffset.current = newOffset;
    setOffset(newOffset);
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    if (!isHorizontal.current) return;
    if (currentOffset.current > REVEAL_WIDTH / 2) {
      currentOffset.current = REVEAL_WIDTH;
      setOffset(REVEAL_WIDTH);
      setRevealed(true);
    } else {
      currentOffset.current = 0;
      setOffset(0);
      setRevealed(false);
      resetForm();
    }
  };

  /* ── Shared save logic ── */
  const handleSave = async () => {
    if (canal === null && confirmo === null) return;
    setSaving(true);
    try {
      await onQuickSave(lead.id, {
        ...lead.seguimiento,
        ...(canal !== null && { canal }),
        ...(confirmo !== null && { confirmoEntrevista: confirmo }),
      });
      close();
      setDesktopOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const canSave = canal !== null || confirmo !== null;
  /** Promotor en calle: seguimiento completo en el modal, sin canal/confirmó por swipe */
  const accionesRapidas = !ocultarPromotor;

  /* ── Desktop panel state ── */
  const [desktopOpen, setDesktopOpen] = useState(false);

  const ActionButtons = () => (
    <>
      {/* Canal */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
          Canal
        </span>
        {(['llamada', 'mensaje'] as CanalContacto[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCanal(canal === c ? null : c)}
            style={{ touchAction: 'manipulation' }}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              canal === c
                ? 'bg-brand-600 text-white'
                : 'border border-brand-200 bg-white text-brand-700 hover:bg-brand-50'
            }`}
          >
            {c === 'llamada' ? 'Llamada' : 'Mensaje'}
          </button>
        ))}
      </div>

      {/* Confirmó */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
          ¿Confirmó?
        </span>
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setConfirmo(confirmo === v ? null : v)}
            style={{ touchAction: 'manipulation' }}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              confirmo === v
                ? v ? 'bg-ok text-white' : 'bg-red-500 text-white'
                : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {v ? 'Sí' : 'No'}
          </button>
        ))}
      </div>

      {/* Guardar */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !canSave}
        style={{ touchAction: 'manipulation' }}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 hover:bg-brand-700 transition-colors ml-auto"
      >
        {saving ? '…' : 'Guardar'}
      </button>
    </>
  );

  return (
    <div>
      {/* ── Mobile: slide-to-reveal (touch only) ── */}
      <div className="relative overflow-hidden rounded-xl md:rounded-b-none md:rounded-t-xl">

        {accionesRapidas && (
        <div
          className="absolute inset-y-0 right-0 flex flex-col justify-center gap-2.5 rounded-xl bg-brand-50 px-3 md:hidden"
          style={{ width: REVEAL_WIDTH }}
        >
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
              Canal
            </p>
            <div className="flex gap-1.5">
              {(['llamada', 'mensaje'] as CanalContacto[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCanal(canal === c ? null : c)}
                  style={{ touchAction: 'manipulation' }}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-semibold capitalize transition-colors ${
                    canal === c
                      ? 'bg-brand-600 text-white'
                      : 'border border-brand-200 bg-white text-brand-700'
                  }`}
                >
                  {c === 'llamada' ? 'Llamada' : 'Mensaje'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-400">
              ¿Confirmó?
            </p>
            <div className="flex gap-1.5">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setConfirmo(confirmo === v ? null : v)}
                  style={{ touchAction: 'manipulation' }}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition-colors ${
                    confirmo === v
                      ? v ? 'bg-ok text-white' : 'bg-red-500 text-white'
                      : 'border border-zinc-200 bg-white text-zinc-600'
                  }`}
                >
                  {v ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={close}
              style={{ touchAction: 'manipulation' }}
              className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-[12px] font-semibold text-zinc-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canSave}
              style={{ touchAction: 'manipulation' }}
              className="flex-1 rounded-lg bg-brand-600 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {saving ? '…' : 'Guardar'}
            </button>
          </div>
        </div>
        )}

        {/* Card — slides left on touch swipe (solo supervisor) */}
        <div
          style={{
            transform: accionesRapidas ? `translateX(-${offset}px)` : undefined,
            transition: isDragging.current ? 'none' : 'transform 220ms ease-out',
          }}
          onTouchStart={accionesRapidas ? onTouchStart : undefined}
          onTouchMove={accionesRapidas ? onTouchMove : undefined}
          onTouchEnd={accionesRapidas ? onTouchEnd : undefined}
        >
          <LeadCard
            lead={lead}
            onClick={revealed ? close : onClick}
            variante={variante}
            promotores={promotores}
            productos={productos}
            barrios={barrios}
            nombreUsuario={nombreUsuario}
            ocultarPromotor={ocultarPromotor}
            rolUsuario={rolUsuario}
          />
        </div>
      </div>

      {accionesRapidas && (
      <div className="hidden md:block overflow-hidden rounded-b-xl border-x border-b border-zinc-200 bg-zinc-50">
        {desktopOpen ? (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <ActionButtons />
            <button
              type="button"
              onClick={() => { setDesktopOpen(false); resetForm(); }}
              style={{ touchAction: 'manipulation' }}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDesktopOpen(true)}
            style={{ touchAction: 'manipulation' }}
            className="flex w-full items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-zinc-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Registrar contacto
          </button>
        )}
      </div>
      )}
    </div>
  );
}
