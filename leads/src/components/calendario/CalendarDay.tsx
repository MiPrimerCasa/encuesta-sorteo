import type { CalendarEvent } from './calendar-types';
import { formatLongDate } from '../../lib/calendar';
import type { Holiday } from '../../lib/holidays-ar';
import { isHolidayAR } from '../../lib/holidays-ar';

interface CalendarDayProps {
  date: Date;
  isOutside: boolean;
  /** Feriado, sábado o domingo — solo estilo; no bloquea ventas. */
  esFinDeSemanaOFeriado: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
  holidays: Holiday[];
  onSelect: () => void;
}

export function CalendarDay({
  date,
  isOutside,
  esFinDeSemanaOFeriado,
  isToday,
  isSelected,
  events,
  holidays,
  onSelect,
}: CalendarDayProps) {
  const hasEvents = events.length > 0;
  const count = events.length;
  const holiday = isHolidayAR(date, holidays);

  const ariaLabel = [
    formatLongDate(date),
    hasEvents ? `${count} evento${count > 1 ? 's' : ''}` : '',
    holiday ? `feriado: ${holiday.name}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const dotColor = isSelected ? 'bg-white' : esFinDeSemanaOFeriado ? 'bg-zinc-400' : 'bg-brand-600';
  const countBg = isSelected
    ? 'bg-white text-brand-700'
    : esFinDeSemanaOFeriado
      ? 'bg-zinc-200 text-zinc-500'
      : 'bg-brand-600 text-white';

  const baseClass =
    'relative flex flex-col items-center justify-start rounded-lg cursor-pointer ' +
    'transition-all duration-[120ms] min-h-[44px] aspect-square tabular-nums ' +
    'focus-visible:outline-none select-none -webkit-tap-highlight-color-transparent ' +
    'active:scale-[0.94] px-1 pt-1.5 pb-1';

  let stateClass = 'text-zinc-800';
  if (isSelected) {
    stateClass = 'bg-brand-600 text-white border border-brand-800';
  } else if (esFinDeSemanaOFeriado) {
    stateClass = 'bg-zinc-100 text-zinc-500 border border-zinc-200';
  } else if (hasEvents) {
    stateClass = 'bg-brand-50 text-brand-800 border border-brand-100';
  }

  const todayClass = isToday && !isSelected ? 'ring-2 ring-inset ring-brand-600' : '';
  const outsideClass = isOutside ? 'opacity-40 pointer-events-none' : '';

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={ariaLabel}
      aria-selected={isSelected}
      onClick={onSelect}
      style={{ touchAction: 'manipulation' }}
      className={`${baseClass} ${stateClass} ${todayClass} ${outsideClass}`}
    >
      <span className="text-[13px] font-[500] leading-none">{date.getDate()}</span>

      {hasEvents && (
        <span className="mt-auto flex items-center gap-[3px] pb-0.5" aria-hidden="true">
          {count <= 3 ? (
            Array.from({ length: count }).map((_, i) => (
              <span key={i} className={`h-[5px] w-[5px] rounded-full ${dotColor}`} />
            ))
          ) : (
            <span
              className={`rounded-full px-1.5 py-[1px] text-[10px] font-semibold leading-[1.2] ${countBg}`}
            >
              {count}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
