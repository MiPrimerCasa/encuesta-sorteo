import type { CalendarEvent } from './calendar-types';
import { formatTime } from '../../lib/calendar';
import { StatusPill } from '../ui/StatusPill';

interface EventListItemProps {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
}

export function EventListItem({ event, onOpen }: EventListItemProps) {
  const time = formatTime(event.date);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(event)}
        style={{ touchAction: 'manipulation' }}
        className="grid w-full min-h-[72px] grid-cols-[56px_1fr_16px] items-center gap-3 rounded-xl border border-zinc-100 bg-white p-3 text-left transition-all duration-[140ms] ease-out active:scale-[0.995] active:border-brand-200 active:bg-brand-50"
      >
        {/* Hora */}
        <time className="text-[15px] font-semibold tabular-nums text-zinc-900 leading-tight">
          {time || 'Todo el día'}
        </time>

        {/* Cuerpo */}
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex-1 truncate text-[14px] font-semibold text-zinc-900">
              {event.leadName}
            </span>
            {/* Chip de tipo */}
            <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-brand-100 bg-brand-50 px-2 text-[11px] font-semibold text-brand-700">
              {event.type === 'entrevista' ? 'Entrevista' : 'Reagenda'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-zinc-400">
            <span>{event.promotor}</span>
            <span aria-hidden="true">·</span>
            <StatusPill variant="reagendado" dot>
              En seguimiento
            </StatusPill>
          </div>
        </div>

        {/* Chevron */}
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          className="shrink-0 text-zinc-300"
          aria-hidden="true"
        >
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </li>
  );
}
