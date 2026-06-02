import { useMemo, useRef, useState } from 'react';
import { startOfMonth } from 'date-fns';
import { Drawer } from 'vaul';

import type { Lead, Promotor, SeguimientoLead } from '../../types';
import { getHolidaysAR } from '../../lib/holidays-ar';
import { isDiaDestacadoCalendario } from '../../lib/holidays-ar';
import {
  formatLongDate,
  formatMonthYear,
  formatTime,
  getDateISO,
  nextMonthDate,
  prevMonthDate,
} from '../../lib/calendar';

import { leadSoloLecturaSupervisor } from '../../domain/leads';
import { buildCalendarEvents, type CalendarEvent } from './calendar-types';
import { CalendarGrid } from './CalendarGrid';
import { DayEventsPanel } from './DayEventsPanel';
import { RescheduleSheet } from './RescheduleSheet';

function buildWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('54') && digits.length >= 12) return `https://wa.me/${digits}`;
  if (digits.startsWith('0')) return `https://wa.me/54${digits.slice(1)}`;
  return `https://wa.me/54${digits}`;
}

interface CalendarioViewProps {
  leads: Lead[];
  promotores: Promotor[];
  onActualizarLead: (leadId: string, seguimiento: SeguimientoLead) => void | Promise<void>;
  onVolver: () => void;
  /** Ir a Leads y abrir el formulario de seguimiento del cliente. */
  onAbrirSeguimientoLead: (leadId: string) => void;
}

export function CalendarioView({
  leads,
  promotores,
  onActualizarLead,
  onVolver,
  onAbrirSeguimientoLead,
}: CalendarioViewProps) {
  const hoy = useMemo(() => new Date(), []);
  const [mesVisible, setMesVisible] = useState(() => startOfMonth(hoy));
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date | null>(hoy);

  const [eventoAbierto, setEventoAbierto] = useState<CalendarEvent | null>(null);
  const [reagendaEvento, setReagendaEvento] = useState<CalendarEvent | null>(null);
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

  const diaEsFinDeSemanaOFeriado =
    diaSeleccionado ? isDiaDestacadoCalendario(diaSeleccionado, holidays) : false;

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
        <h1 className="text-center text-[16px] font-semibold tracking-[-0.01em] text-brand-800">
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
          <span className="capitalize text-brand-800">{mesLabel}</span>
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

      {diaSeleccionado && diaEsFinDeSemanaOFeriado && (
        <p className="mx-4 mb-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[12px] text-brand-800">
          Feriado, sábado o domingo. Podés reagendar, cambiar estado y cerrar ventas con normalidad.
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
                  className="text-[18px] font-semibold tracking-[-0.01em] text-brand-800"
                >
                  {eventoAbierto?.leadName}
                </Drawer.Title>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[13px] tabular-nums text-zinc-500">
                    {eventoAbierto?.leadPhone}
                  </p>
                  {eventoAbierto?.leadPhone && (
                    <a
                      href={buildWhatsAppUrl(eventoAbierto.leadPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ touchAction: 'manipulation' }}
                      className="flex items-center gap-1.5 rounded-full bg-[#25D366] px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity active:opacity-70"
                      aria-label="Contactar por WhatsApp"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}
                </div>
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

            {eventoAbierto && (() => {
              const leadEvento = leads.find((l) => l.id === eventoAbierto.leadId);
              const soloLecturaPij = leadEvento
                ? leadSoloLecturaSupervisor(leadEvento)
                : false;
              return (
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
                {soloLecturaPij && (
                  <p className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-[13px] text-indigo-900">
                    Seguimiento del promotor por Plan Inversión Joven. Solo lectura en calendario.
                  </p>
                )}
                {/* Metadatos del evento */}
                <dl className="mb-6 space-y-3 text-[14px]">
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Cuándo</dt>
                    <dd className="font-medium text-zinc-700 tabular-nums">
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
                    <dd className="font-medium text-zinc-700">{eventoAbierto.promotor}</dd>
                  </div>
                </dl>

                {/* Acciones */}
                {!soloLecturaPij && (
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
                        const leadId = eventoAbierto.leadId;
                        setEventoAbierto(null);
                        onAbrirSeguimientoLead(leadId);
                      }}
                      style={{ touchAction: 'manipulation' }}
                      className="h-[52px] w-full rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-all duration-[120ms] ease-out active:bg-brand-800 active:scale-[0.98]"
                    >
                      Cambiar estado del lead
                    </button>
                  </div>
                )}
              </div>
              );
            })()}
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

    </div>
  );
}
