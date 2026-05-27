import { useMemo, useRef, useState } from 'react';
import { startOfMonth } from 'date-fns';
import { Drawer } from 'vaul';

import type { Lead, Promotor, ResultadoEntrevista, SeguimientoLead } from '../../types';
import { getHolidaysAR } from '../../lib/holidays-ar';
import { isBlockedDay } from '../../lib/holidays-ar';
import {
  formatLongDate,
  formatMonthYear,
  formatTime,
  getDateISO,
  nextMonthDate,
  prevMonthDate,
} from '../../lib/calendar';

import { buildCalendarEvents, type CalendarEvent } from './calendar-types';
import { CalendarGrid } from './CalendarGrid';
import { DayEventsPanel } from './DayEventsPanel';
import { RescheduleSheet } from './RescheduleSheet';
import { ChangeStatusSheet } from './ChangeStatusSheet';

interface CalendarioViewProps {
  leads: Lead[];
  promotores: Promotor[];
  onActualizarLead: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
  onVolver: () => void;
}

export function CalendarioView({
  leads,
  promotores,
  onActualizarLead,
  onVolver,
}: CalendarioViewProps) {
  const hoy = useMemo(() => new Date(), []);
  const [mesVisible, setMesVisible] = useState(() => startOfMonth(hoy));
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(hoy);

  const [eventoAbierto, setEventoAbierto] = useState<CalendarEvent | null>(null);
  const [reagendaEvento, setReagendaEvento] = useState<CalendarEvent | null>(null);
  const [statusEvento, setStatusEvento] = useState<CalendarEvent | null>(null);

  const panelRef = useRef<HTMLElement>(null);

  const holidays = useMemo(
    () => getHolidaysAR(mesVisible.getFullYear()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mesVisible.getFullYear()],
  );

  const eventos = useMemo(
    () => buildCalendarEvents(leads, promotores),
    [leads, promotores],
  );

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    eventos.forEach((ev) => {
      const d = new Date(ev.date);
      if (!isNaN(d.getTime())) {
        const iso = getDateISO(d);
        map.set(iso, [...(map.get(iso) ?? []), ev]);
      }
    });
    return map;
  }, [eventos]);

  const eventosDia = useMemo(() => {
    if (!diaSeleccionado) return [];
    const iso = getDateISO(diaSeleccionado);
    return eventosPorDia.get(iso) ?? [];
  }, [eventosPorDia, diaSeleccionado]);

  const { month: mesLabel, year: anioLabel } = formatMonthYear(mesVisible);

  const handleSelectDay = (date: Date) => {
    setDiaSeleccionado(date);
    setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handlePrevMonth = () => setMesVisible((m) => prevMonthDate(m));
  const handleNextMonth = () => setMesVisible((m) => nextMonthDate(m));
  const handleHoy = () => {
    const now = new Date();
    setMesVisible(startOfMonth(now));
    setDiaSeleccionado(now);
  };

  const handleReagendar = async (event: CalendarEvent, newDate: string) => {
    await onActualizarLead(event.leadId, {
      ...event.lead.seguimiento,
      resultadoEntrevista: 'reagenda',
      fechaReagenda: newDate,
    });
  };

  const handleCambiarEstado = async (
    event: CalendarEvent,
    newStatus: ResultadoEntrevista,
  ) => {
    await onActualizarLead(event.leadId, {
      ...event.lead.seguimiento,
      resultadoEntrevista: newStatus,
      fechaReagenda: newStatus === 'reagenda' ? event.lead.seguimiento.fechaReagenda : null,
    });
  };

  const diaEsBloqueado =
    diaSeleccionado ? isBlockedDay(diaSeleccionado, holidays) : false;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header de página */}
      <header
        className="sticky top-0 z-20 grid items-center border-b border-zinc-100 bg-white/92 backdrop-blur-sm"
        style={{
          gridTemplateColumns: '44px 1fr 44px',
          height: '56px',
          padding: '0 8px',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <button
          type="button"
          onClick={onVolver}
          style={{ touchAction: 'manipulation' }}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors active:bg-brand-50 active:text-brand-700"
          aria-label="Volver"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-center text-[16px] font-semibold tracking-[-0.01em] text-zinc-900">
          Calendario
        </h1>
        <div />
      </header>

      {/* Navegación de mes */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{ touchAction: 'manipulation' }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors active:bg-zinc-100"
          aria-label="Mes anterior"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <h2 className="flex-1 text-center text-[17px] font-semibold tracking-[-0.01em]" aria-live="polite">
          <span className="capitalize text-zinc-900">{mesLabel}</span>
          <span className="ml-1.5 font-[500] text-zinc-400">{anioLabel}</span>
        </h2>

        <button
          type="button"
          onClick={handleNextMonth}
          style={{ touchAction: 'manipulation' }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors active:bg-zinc-100"
          aria-label="Mes siguiente"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleHoy}
          style={{ touchAction: 'manipulation' }}
          className="h-8 rounded-full border border-zinc-200 bg-zinc-100 px-3 text-[13px] font-[500] text-zinc-600 transition-colors active:border-brand-600 active:bg-brand-50 active:text-brand-700"
        >
          Hoy
        </button>
      </div>

      {/* Grid */}
      <CalendarGrid
        month={mesVisible}
        selectedDate={diaSeleccionado}
        holidays={holidays}
        eventsByDay={eventosPorDia}
        onSelectDay={handleSelectDay}
      />

      {/* Aviso si el día seleccionado es feriado o domingo */}
      {diaSeleccionado && diaEsBloqueado && (
        <p className="mx-4 mb-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-500">
          Este día es feriado o domingo.
        </p>
      )}

      {/* Panel de eventos */}
      <DayEventsPanel
        ref={panelRef}
        date={diaSeleccionado}
        events={eventosDia}
        onOpenEvent={setEventoAbierto}
      />

      {/* Sheet: detalle del evento */}
      <Drawer.Root
        open={Boolean(eventoAbierto)}
        onOpenChange={(isOpen) => !isOpen && setEventoAbierto(null)}
        shouldScaleBackground
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-[2px]" />
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
            style={{ maxHeight: 'min(90dvh, 600px)' }}
            aria-labelledby="evento-title"
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200" aria-hidden="true" />

            <div className="flex shrink-0 items-start justify-between border-b border-zinc-100 px-4 pb-4 pt-3">
              <div>
                <Drawer.Title
                  id="evento-title"
                  className="text-[18px] font-semibold tracking-[-0.01em] text-zinc-900"
                >
                  {eventoAbierto?.leadName}
                </Drawer.Title>
                <p className="mt-0.5 text-[13px] tabular-nums text-zinc-500">
                  {eventoAbierto?.leadPhone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEventoAbierto(null)}
                style={{ touchAction: 'manipulation' }}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-xl text-zinc-500 transition-colors active:bg-brand-50 active:text-brand-700"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {eventoAbierto && (
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                {/* Metadatos del evento */}
                <dl className="mb-6 space-y-3 text-[14px]">
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Cuándo</dt>
                    <dd className="font-medium text-zinc-900 tabular-nums">
                      {formatLongDate(new Date(eventoAbierto.date))} · {formatTime(eventoAbierto.date)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Tipo</dt>
                    <dd>
                      <span className="inline-flex h-5 items-center rounded-full border border-brand-100 bg-brand-50 px-2 text-[11px] font-semibold text-brand-700">
                        Reagenda
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Promotor</dt>
                    <dd className="font-medium text-zinc-900">{eventoAbierto.promotor}</dd>
                  </div>
                </dl>

                {/* Acciones */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      const ev = eventoAbierto;
                      setEventoAbierto(null);
                      setReagendaEvento(ev);
                    }}
                    style={{ touchAction: 'manipulation' }}
                    className="h-[52px] w-full rounded-xl border border-zinc-200 bg-white text-[15px] font-semibold text-zinc-800 transition-all duration-[120ms] ease-out active:border-brand-200 active:bg-brand-50 active:text-brand-700"
                  >
                    Reagendar entrevista
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ev = eventoAbierto;
                      setEventoAbierto(null);
                      setStatusEvento(ev);
                    }}
                    style={{ touchAction: 'manipulation' }}
                    className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98]"
                  >
                    Cambiar estado del lead
                  </button>
                </div>
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Sheet: reagendar */}
      <RescheduleSheet
        event={reagendaEvento}
        open={Boolean(reagendaEvento)}
        onClose={() => setReagendaEvento(null)}
        onSave={handleReagendar}
      />

      {/* Sheet: cambiar estado */}
      <ChangeStatusSheet
        event={statusEvento}
        open={Boolean(statusEvento)}
        onClose={() => setStatusEvento(null)}
        onSave={handleCambiarEstado}
      />
    </div>
  );
}
