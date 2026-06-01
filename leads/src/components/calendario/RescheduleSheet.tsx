import { useState, type FormEvent } from 'react';
import { Drawer } from 'vaul';
import { DateTimePicker } from '../ui/DateTimePicker';
import type { CalendarEvent } from './calendar-types';
import { formatShortDate } from '../../lib/calendar';

interface RescheduleSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent, newDate: string) => void | Promise<void>;
}

export function RescheduleSheet({ event, open, onClose, onSave }: RescheduleSheetProps) {
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setNewDate('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!event || !newDate) return;
    setSaving(true);
    try {
      await onSave(event, newDate);
      onClose();
      setNewDate('');
    } finally {
      setSaving(false);
    }
  };

  const currentDateLabel = event
    ? formatShortDate(new Date(event.date))
    : '';

  return (
    <Drawer.Root open={open} onOpenChange={handleOpen} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
          style={{ maxHeight: 'min(90dvh, 560px)' }}
          aria-labelledby="reschedule-title"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

          <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
            <div>
              <Drawer.Title
                id="reschedule-title"
                className="text-[18px] font-semibold tracking-[-0.01em] text-brand-800"
              >
                Reagendar entrevista
              </Drawer.Title>
              {event && (
                <p className="mt-0.5 text-[13px] text-zinc-500">
                  {event.leadName} · actualmente {currentDateLabel}
                </p>
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
            id="reschedule-form"
            onSubmit={handleSubmit}
            className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                Nueva fecha y hora
              </p>
              <DateTimePicker
                value={newDate}
                onChange={setNewDate}
                required
              />
            </div>

            {event && newDate && (
              <p className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[13px] text-brand-700">
                Reagendando entrevista de{' '}
                <span className="font-medium">{event.leadName}</span>,
                originalmente {currentDateLabel}.
              </p>
            )}

            <div className="h-2" aria-hidden="true" />
          </form>

          <div
            className="shrink-0 border-t border-zinc-100 px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              type="submit"
              form="reschedule-form"
              disabled={!newDate || saving}
              style={{ touchAction: 'manipulation' }}
              className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Confirmar nuevo horario'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
