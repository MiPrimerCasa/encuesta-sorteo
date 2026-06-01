export interface Holiday {
  date: string;
  name: string;
  type: 'inamovible' | 'trasladable' | 'movil';
}

// Algoritmo de Pascua (Gauss / Meeus)
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Puentes turísticos decretados anualmente — agregar manualmente por año
export const OVERRIDE_HOLIDAYS: Holiday[] = [];

export function getHolidaysAR(year: number): Holiday[] {
  const easterDay = easter(year);

  const fijos: Holiday[] = [
    { date: `${year}-01-01`, name: 'Año Nuevo', type: 'inamovible' },
    { date: `${year}-03-24`, name: 'Día Nacional de la Memoria', type: 'inamovible' },
    { date: `${year}-04-02`, name: 'Día del Veterano y Caídos en Malvinas', type: 'inamovible' },
    { date: `${year}-05-01`, name: 'Día del Trabajador', type: 'inamovible' },
    { date: `${year}-05-25`, name: 'Revolución de Mayo', type: 'inamovible' },
    { date: `${year}-06-20`, name: 'Paso a la Inmortalidad de Belgrano', type: 'inamovible' },
    { date: `${year}-07-09`, name: 'Día de la Independencia', type: 'inamovible' },
    { date: `${year}-12-08`, name: 'Inmaculada Concepción', type: 'inamovible' },
    { date: `${year}-12-25`, name: 'Navidad', type: 'inamovible' },
  ];

  const trasladables: Holiday[] = [
    { date: `${year}-06-17`, name: 'Paso a la Inmortalidad de Güemes', type: 'trasladable' },
    { date: `${year}-08-17`, name: 'Paso a la Inmortalidad de San Martín', type: 'trasladable' },
    { date: `${year}-10-12`, name: 'Día del Respeto a la Diversidad Cultural', type: 'trasladable' },
    { date: `${year}-11-20`, name: 'Día de la Soberanía Nacional', type: 'trasladable' },
  ];

  const moviles: Holiday[] = [
    { date: toISODate(addDays(easterDay, -48)), name: 'Carnaval', type: 'movil' },
    { date: toISODate(addDays(easterDay, -47)), name: 'Carnaval', type: 'movil' },
    { date: toISODate(addDays(easterDay, -2)), name: 'Viernes Santo', type: 'movil' },
  ];

  return [...fijos, ...trasladables, ...moviles, ...OVERRIDE_HOLIDAYS]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isHolidayAR(date: Date, holidays: Holiday[]): Holiday | null {
  const iso = toISODate(date);
  return holidays.find((h) => h.date === iso) ?? null;
}

export function isSundayDay(date: Date): boolean {
  return date.getDay() === 0;
}

export function isSaturdayDay(date: Date): boolean {
  return date.getDay() === 6;
}

/**
 * Referencia visual en el calendario (feriado, sábado o domingo).
 * No restringe cerrar ventas ni guardar seguimiento: promotores y supervisores operan todos los días.
 */
export function isDiaDestacadoCalendario(date: Date, holidays: Holiday[]): boolean {
  return (
    isSaturdayDay(date) ||
    isSundayDay(date) ||
    isHolidayAR(date, holidays) !== null
  );
}

/** @deprecated Usar isDiaDestacadoCalendario — el nombre «blocked» no implica restricción operativa. */
export function isBlockedDay(date: Date, holidays: Holiday[]): boolean {
  return isDiaDestacadoCalendario(date, holidays);
}
