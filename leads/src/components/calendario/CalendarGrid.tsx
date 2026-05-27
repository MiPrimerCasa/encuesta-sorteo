import { startOfMonth } from 'date-fns';
import {
  getMonthGrid,
  getDateISO,
  isSameDayDate,
  isTodayDate,
  isOutsideMonth,
} from '../../lib/calendar';
import { isBlockedDay } from '../../lib/holidays-ar';
import type { Holiday } from '../../lib/holidays-ar';
import type { CalendarEvent } from './calendar-types';
import { CalendarDay } from './CalendarDay';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface CalendarGridProps {
  month: Date;
  selectedDate: Date | null;
  holidays: Holiday[];
  eventsByDay: Map<string, CalendarEvent[]>;
  onSelectDay: (date: Date) => void;
}

export function CalendarGrid({
  month,
  selectedDate,
  holidays,
  eventsByDay,
  onSelectDay,
}: CalendarGridProps) {
  const days = getMonthGrid(month);
  const monthStart = startOfMonth(month);

  return (
    <div className="px-2 pb-4">
      {/* Etiquetas de días de la semana */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span
            key={i}
            className={`py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${
              i === 6 ? 'text-brand-700' : 'text-zinc-400'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 gap-0.5" role="grid">
        {days.map((day) => {
          const iso = getDateISO(day);
          const outside = isOutsideMonth(day, monthStart);
          const blocked = isBlockedDay(day, holidays);
          const today = isTodayDate(day);
          const selected = selectedDate ? isSameDayDate(day, selectedDate) : false;
          const events = eventsByDay.get(iso) ?? [];

          return (
            <CalendarDay
              key={iso}
              date={day}
              isOutside={outside}
              isBlocked={blocked}
              isToday={today}
              isSelected={selected}
              events={events}
              holidays={holidays}
              onSelect={() => onSelectDay(day)}
            />
          );
        })}
      </div>
    </div>
  );
}
