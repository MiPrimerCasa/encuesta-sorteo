import { useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import type { CalendarEvent } from './calendar-types';
import type { ResultadoEntrevista } from '../../types';

type OpcionEstado = {
  value: ResultadoEntrevista;
  label: string;
  hint: string;
};

const OPCIONES: OpcionEstado[] = [
  {
    value: 'no_compro',
    label: 'NO COMPRO',
    hint: 'Hubo entrevista, pero no cerró la venta.',
  },
  {
    value: 'sin_interes',
    label: 'Sin interés',
    hint: 'No respondió o ya no tiene interés.',
  },
  {
    value: 'compro',
    label: 'SI COMPRO',
    hint: 'Venta cerrada. Completá los detalles en el lead.',
  },
];

interface ChangeStatusSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent, newStatus: ResultadoEntrevista) => void | Promise<void>;
}

export function ChangeStatusSheet({ event, open, onClose, onSave }: ChangeStatusSheetProps) {
  const [status, setStatus] = useState<ResultadoEntrevista | null>(null);
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setStatus(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!event || !status) return;
    setSaving(true);
    try {
      await onSave(event, status);
      onClose();
      setStatus(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={handleOpen} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(90dvh, 520px)' }}
          aria-labelledby="changestatus-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
            <div>
              <Drawer.Title
                id="changestatus-title"
                className="text-[18px] font-semibold tracking-[-0.01em] text-brand-800"
              >
                Cambiar estado del lead
              </Drawer.Title>
              {event && (
                <p className="mt-0.5 text-[13px] text-zinc-500">{event.leadName}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: 'manipulation' }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-xl text-zinc-500 transition-colors active:bg-brand-50 active:text-brand-700"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <form
            id="changestatus-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <fieldset className="space-y-3">
              <legend className="sr-only">Estado del lead</legend>
              {OPCIONES.map((op) => {
                const checked = status === op.value;
                return (
                  <label
                    key={op.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all duration-[120ms] ${
                      checked
                        ? 'border-brand-200 bg-brand-50'
                        : 'border-zinc-200 bg-white active:border-brand-200 active:bg-brand-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="lead-status"
                      value={op.value}
                      checked={checked}
                      onChange={() => setStatus(op.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className={`text-[14px] font-semibold ${checked ? 'text-brand-800' : 'text-zinc-700'}`}>
                        {op.label}
                      </span>
                      <span className="text-[12px] text-zinc-400">{op.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <div className="h-2" aria-hidden="true" />
          </form>

          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="submit"
              form="changestatus-form"
              disabled={!status || saving}
              style={{ touchAction: 'manipulation' }}
              className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar cambio'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
