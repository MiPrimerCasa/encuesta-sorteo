import { useMemo } from 'react';
import { rangoPorPeriodo } from '../domain/admin-metrics';
import { esPeriodoDia, esPeriodoMesCalendario } from '../domain/admin-periodo';
import type { AdminChartEvent } from '../types';

export type AgrupacionChart = 'dia' | 'semana' | 'mes' | 'anio';

const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export const ADMIN_CHART_SERIES = [
  { key: 'Leads', tipo: 'lead' as const, color: '#71717A' },
  { key: 'Entrevistas', tipo: 'entrevista' as const, color: '#9A1620' },
  { key: 'Cierres', tipo: 'cierre' as const, color: '#059669' },
  { key: 'Terrenos 100%', tipo: 'terreno' as const, color: '#D97706' },
  { key: 'T. Seña', tipo: 'terreno_sena' as const, color: '#F97316' },
  { key: 'PIJ', tipo: 'pij' as const, color: '#6366F1' },
];

export function agrupacionSugeridaChart(periodo: string): AgrupacionChart {
  if (periodo === 'hoy' || esPeriodoDia(periodo)) return 'dia';
  if (periodo === 'semana') return 'dia';
  if (periodo === 'mes' || esPeriodoMesCalendario(periodo)) return 'semana';
  return 'mes';
}

function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function periodKey(fechaISO: string, agrupacion: AgrupacionChart) {
  const d = new Date(fechaISO);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  if (agrupacion === 'anio') return String(y);
  if (agrupacion === 'mes') return `${MESES[d.getMonth()]} ${y}`;
  if (agrupacion === 'dia') {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const sem = getISOWeek(d);
  return `Sem ${sem} · ${y}`;
}

function sortPeriodos(periodos: Set<string>, agrupacion: AgrupacionChart) {
  const parse = (label: string) => {
    if (agrupacion === 'anio') return Number(label);
    const yearMatch = label.match(/\d{4}/);
    const year = yearMatch ? Number(yearMatch[0]) : 0;
    if (agrupacion === 'mes') {
      const mesIdx = MESES.findIndex((m) => label.startsWith(m));
      return year * 100 + (mesIdx >= 0 ? mesIdx : 0);
    }
    if (agrupacion === 'dia') {
      const m = label.match(/^(\d{2})\/(\d{2})/);
      if (m) return year * 10000 + Number(m[2]) * 100 + Number(m[1]);
      return 0;
    }
    const semMatch = label.match(/Sem (\d+)/);
    return year * 100 + (semMatch ? Number(semMatch[1]) : 0);
  };
  return [...periodos].sort((a, b) => parse(a) - parse(b));
}

export function useAdminChartData(
  eventos: AdminChartEvent[],
  agrupacion: AgrupacionChart,
  supervisorNombre: string | null = null,
  periodo = 'mes',
) {
  return useMemo(() => {
    const { desde, hasta } = rangoPorPeriodo(periodo);
    const desdeMs = desde.getTime();
    const hastaMs = hasta.getTime();

    const filtrados = eventos.filter((ev) => {
      const t = new Date(ev.fecha).getTime();
      if (Number.isNaN(t) || t < desdeMs || t > hastaMs) return false;
      if (supervisorNombre && ev.supervisorNombre !== supervisorNombre) return false;
      return true;
    });

    const periodosSet = new Set<string>();
    const matrix: Record<string, Record<string, number>> = {};

    for (const ev of filtrados) {
      const periodoLabel = periodKey(ev.fecha, agrupacion);
      if (!periodoLabel) continue;
      periodosSet.add(periodoLabel);
      if (!matrix[periodoLabel]) matrix[periodoLabel] = {};
      const serie = ADMIN_CHART_SERIES.find((s) => s.tipo === ev.tipo);
      if (!serie) continue;
      matrix[periodoLabel][serie.key] = (matrix[periodoLabel][serie.key] ?? 0) + 1;
    }

    const periodos = sortPeriodos(periodosSet, agrupacion);
    const chartData = periodos.map((periodoLabel) => {
      const row: Record<string, string | number> = { periodo: periodoLabel };
      for (const serie of ADMIN_CHART_SERIES) {
        row[serie.key] = matrix[periodoLabel]?.[serie.key] ?? 0;
      }
      return row;
    });

    return { chartData, series: ADMIN_CHART_SERIES };
  }, [eventos, agrupacion, supervisorNombre, periodo]);
}
