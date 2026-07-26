import { fechaIsoLocal, rangoPorPeriodo } from './admin-metrics';

const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** YYYY-MM-DD */
export function esPeriodoDia(periodo: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(periodo);
}

/** YYYY-MM — mes calendario específico (ej. 2026-06). */
export function esPeriodoMesCalendario(periodo: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo);
}

/** `anio` (año en curso) o `YYYY` (año calendario). */
export function esPeriodoAnio(periodo: string) {
  return periodo === 'anio' || /^\d{4}$/.test(periodo);
}

export function mesCalendarioIso(hoy = new Date()) {
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function anioCalendarioIso(hoy = new Date()) {
  return String(hoy.getFullYear());
}

export function etiquetaMesCalendario(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MESES_LARGO[idx] ?? m} ${y}`;
}

export function etiquetaAnioPeriodo(periodo: string, hoy = new Date()) {
  if (periodo === 'anio') return String(hoy.getFullYear());
  return periodo;
}

/** Título largo del tipo de período (informe / panel). */
export function etiquetaTipoPeriodo(periodo: string): string {
  if (esPeriodoDia(periodo)) return 'Día seleccionado';
  if (periodo === 'hoy') return 'Diario';
  if (periodo === 'semana') return 'Semana móvil';
  if (esPeriodoAnio(periodo)) return `Año ${etiquetaAnioPeriodo(periodo)}`;
  if (esPeriodoMesCalendario(periodo)) return `Mes ${etiquetaMesCalendario(periodo)}`;
  return 'Mes actual';
}

/** Etiqueta corta para columnas (ent./cierres). */
export function etiquetaPeriodoCorto(periodo: string): string {
  if (esPeriodoDia(periodo)) return 'día';
  if (periodo === 'hoy') return 'hoy';
  if (periodo === 'semana') return 'sem.';
  if (esPeriodoAnio(periodo)) return etiquetaAnioPeriodo(periodo);
  if (esPeriodoMesCalendario(periodo)) return etiquetaMesCalendario(periodo);
  return 'mes';
}

/** Rango YYYY-MM-DD para filtro de anexos/recibos, alineado al período del panel. */
export function rangoFechasIsoPorPeriodo(periodo: string, hoy = new Date()) {
  const { desde, hasta } = rangoPorPeriodo(periodo, hoy);
  return {
    desde: fechaIsoLocal(desde),
    hasta: fechaIsoLocal(hasta),
  };
}
