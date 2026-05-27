import { useMemo } from 'react';
import type { Lead, Promotor } from '../types';

type Agrupacion = 'semana' | 'mes' | 'anio';
type Variacion = 'up' | 'down' | 'flat';

export type TrendChartPoint = {
  periodo: string;
  cantidad: number;
  variacion: Variacion | null;
};

const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** Paleta monocroma brand + grises para vista comparativa */
export const COLORES_PROMOTORES = [
  '#7A1019',
  '#B81E2A',
  '#3F3F46',
  '#A1A1AA',
  '#9A1620',
  '#71717A',
  '#5C0B12',
  '#D4D4D8',
];

function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function periodKey(fechaISO: string, agrupacion: Agrupacion) {
  const d = new Date(fechaISO + 'T12:00:00');
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

function buildMatrix(leads: Lead[], agrupacion: Agrupacion) {
  const periodosSet = new Set<string>();
  const matrix: Record<string, Record<string, number>> = {};

  for (const lead of leads) {
    const periodo = periodKey(lead.fechaObtencion, agrupacion);
    periodosSet.add(periodo);
    if (!matrix[periodo]) matrix[periodo] = {};
    matrix[periodo][lead.promotorId] = (matrix[periodo][lead.promotorId] ?? 0) + 1;
  }

  return { periodos: sortPeriodos(periodosSet, agrupacion), matrix };
}

export function usePromotoresChartData(
  leads: Lead[],
  promotores: Promotor[],
  agrupacion: Agrupacion,
  promotorId: string | null = null,
) {
  return useMemo(() => {
    if (promotorId) {
      const filtrados = leads.filter((l) => l.promotorId === promotorId);
      const { periodos, matrix } = buildMatrix(filtrados, agrupacion);
      const promotor = promotores.find((p) => p.id === promotorId);

      const chartData = periodos.map((periodo, index) => {
        const cantidad = matrix[periodo]?.[promotorId] ?? 0;
        const prev = index > 0 ? (matrix[periodos[index - 1]]?.[promotorId] ?? 0) : null;
        let variacion: Variacion | null = null;
        if (prev !== null) {
          if (cantidad > prev) variacion = 'up';
          else if (cantidad < prev) variacion = 'down';
          else variacion = 'flat';
        }
        return { periodo, cantidad, variacion };
      });

      return {
        mode: 'trend' as const,
        chartData,
        promotorNombre: promotor?.nombre ?? 'Promotor',
        color: '#9A1620',
      };
    }

    const { periodos, matrix } = buildMatrix(leads, agrupacion);

    const chartData = periodos.map((periodo) => {
      const row: Record<string, string | number> = { periodo };
      for (const p of promotores) {
        row[p.nombre] = matrix[periodo]?.[p.id] ?? 0;
      }
      return row;
    });

    const promotorKeys = promotores.map((p) => p.nombre);
    const colores = promotores.map((_, i) => COLORES_PROMOTORES[i % COLORES_PROMOTORES.length]);

    return {
      mode: 'comparativo' as const,
      chartData,
      promotorKeys,
      colores,
    };
  }, [leads, promotores, agrupacion, promotorId]);
}
