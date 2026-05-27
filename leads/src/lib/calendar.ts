import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  format,
} from 'date-fns';
import { es } from 'date-fns/locale/es';

export function getMonthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function isOutsideMonth(date: Date, month: Date): boolean {
  return !isSameMonth(date, month);
}

export function isTodayDate(date: Date): boolean {
  return isToday(date);
}

export function isSameDayDate(a: Date, b: Date): boolean {
  return isSameDay(a, b);
}

export function nextMonthDate(date: Date): Date {
  return addMonths(date, 1);
}

export function prevMonthDate(date: Date): Date {
  return subMonths(date, 1);
}

export function formatMonthYear(date: Date): { month: string; year: string } {
  return {
    month: format(date, 'MMMM', { locale: es }),
    year: format(date, 'yyyy'),
  };
}

export function formatLongDate(date: Date): string {
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

export function formatShortDate(date: Date): string {
  return format(date, "d MMM", { locale: es });
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return format(d, 'HH:mm');
}

export function getDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
