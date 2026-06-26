import { useMemo } from 'react';
import type { AdminChartEvent } from '../types';

type Agrupacion = 'semana' | 'mes' | 'anio';

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

function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function periodKey(fechaISO: string, agrupacion: Agrupacion) {
  const d = new Date(fechaISO);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  if (agrupacion === 'anio') return String(y);
  if (agrupacion === 'mes') return `${MESES[d.getMonth()]} ${y}`;
  const sem = getISOWeek(d);
  return `Sem ${sem} · ${y}`;
}

function sortPeriodos(periodos: Set<string>, agrupacion: Agrupacion) {
  const parse = (label: string) => {
    if (agrupacion === 'anio') return Number(label);
    const yearMatch = label.match(/\d{4}/);
    const year = yearMatch ? Number(yearMatch[0]) : 0;
    if (agrupacion === 'mes') {
      const mesIdx = MESES.findIndex((m) => label.startsWith(m));
      return year * 100 + (mesIdx >= 0 ? mesIdx : 0);
    }
    const semMatch = label.match(/Sem (\d+)/);
    return year * 100 + (semMatch ? Number(semMatch[1]) : 0);
  };
  return [...periodos].sort((a, b) => parse(a) - parse(b));
}

export function useAdminChartData(
  eventos: AdminChartEvent[],
  agrupacion: Agrupacion,
  supervisorNombre: string | null = null,
) {
  return useMemo(() => {
    const filtrados = supervisorNombre
      ? eventos.filter((e) => e.supervisorNombre === supervisorNombre)
      : eventos;

    const periodosSet = new Set<string>();
    const matrix: Record<string, Record<string, number>> = {};

    for (const ev of filtrados) {
      const periodo = periodKey(ev.fecha, agrupacion);
      if (!periodo) continue;
      periodosSet.add(periodo);
      if (!matrix[periodo]) matrix[periodo] = {};
      const serie = ADMIN_CHART_SERIES.find((s) => s.tipo === ev.tipo);
      if (!serie) continue;
      matrix[periodo][serie.key] = (matrix[periodo][serie.key] ?? 0) + 1;
    }

    const periodos = sortPeriodos(periodosSet, agrupacion);
    const chartData = periodos.map((periodo) => {
      const row: Record<string, string | number> = { periodo };
      for (const serie of ADMIN_CHART_SERIES) {
        row[serie.key] = matrix[periodo]?.[serie.key] ?? 0;
      }
      return row;
    });

    return { chartData, series: ADMIN_CHART_SERIES };
  }, [eventos, agrupacion, supervisorNombre]);
}
