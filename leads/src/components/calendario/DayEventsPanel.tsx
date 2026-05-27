import { forwardRef } from 'react';
import type { CalendarEvent } from './calendar-types';
import { formatLongDate } from '../../lib/calendar';
import { EventListItem } from './EventListItem';

interface DayEventsPanelProps {
  date: Date | null;
  events: CalendarEvent[];
  onOpenEvent: (event: CalendarEvent) => void;
}

export const DayEventsPanel = forwardRef<HTMLElement, DayEventsPanelProps>(
  function DayEventsPanel({ date, events, onOpenEvent }, ref) {
    return (
      <section
        ref={ref}
        className="mt-4 border-t border-zinc-100 px-4 pb-8 pt-6"
        aria-label="Eventos del día seleccionado"
      >
        <header className="mb-4 flex flex-wrap items-baseline gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-900">
            Eventos
          </span>
          {date && (
            <span className="text-[13px] capitalize text-zinc-400">
              {formatLongDate(date)}
            </span>
          )}
          <span className="ml-auto text-[13px] tabular-nums text-zinc-400">
            {events.length}
          </span>
        </header>

        {events.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-zinc-400">
            Sin eventos para este día.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((ev) => (
              <EventListItem key={ev.id} event={ev} onOpen={onOpenEvent} />
            ))}
          </ul>
        )}
      </section>
    );
  },
);
