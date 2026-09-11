import type { Lead } from '../types';
import { fechaDiaNegocio } from './actividad-hoy';
import { leadTieneCierreEnRango, rangoPorPeriodo } from './admin-metrics';
import { etiquetaMesCalendario, mesCalendarioIso } from './admin-periodo';
import { leadCompro } from './leads';
import { esPlanInversion } from './venta';

/** Filtro de periodo en la bandeja Cierres. */
export type PeriodoCierresBandeja = 'mes' | 'mes_anterior' | 'todos';

export function mesAnteriorIso(hoy = new Date()) {
  return mesCalendarioIso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
}

export function periodoCierresAClave(
  periodo: PeriodoCierresBandeja,
  hoy = new Date(),
): string | null {
  if (periodo === 'todos') return null;
  if (periodo === 'mes_anterior') return mesAnteriorIso(hoy);
  return mesCalendarioIso(hoy);
}

export function etiquetaPeriodoCierres(
  periodo: PeriodoCierresBandeja,
  hoy = new Date(),
): string {
  if (periodo === 'todos') return 'Todos';
  const clave = periodoCierresAClave(periodo, hoy);
  return clave ? etiquetaMesCalendario(clave) : 'Mes';
}

function yyyyMmDeFecha(raw?: string | null): string | null {
  const dia = fechaDiaNegocio(raw);
  return dia ? dia.slice(0, 7) : null;
}

/** Cuenta planes PIJ (principal + adicionales) con fecha de cierre en el mes YYYY-MM. */
export function contarPlanesPijEnMes(leads: Lead[], yyyyMm: string): number {
  let n = 0;
  for (const lead of leads) {
    if (!leadCompro(lead)) continue;
    const seg = lead.seguimiento;
    if (esPlanInversion(seg?.idProducto)) {
      const m = yyyyMmDeFecha(seg?.fechaCierre ?? seg?.creadoEn ?? null);
      if (m === yyyyMm) n += 1;
    }
    for (const c of seg?.comprasAdicionales ?? []) {
      if (!esPlanInversion(c.idProducto)) continue;
      const m = yyyyMmDeFecha(c.fechaCierre ?? c.creadoEn ?? null);
      if (m === yyyyMm) n += 1;
    }
  }
  return n;
}

/** Planes (cualquier producto) con cierre en el mes. */
export function contarPlanesCierreEnMes(leads: Lead[], yyyyMm: string): number {
  let n = 0;
  for (const lead of leads) {
    if (!leadCompro(lead)) continue;
    const seg = lead.seguimiento;
    if (seg) {
      const m = yyyyMmDeFecha(seg.fechaCierre ?? seg.creadoEn ?? null);
      if (m === yyyyMm) n += 1;
    }
    for (const c of seg?.comprasAdicionales ?? []) {
      const m = yyyyMmDeFecha(c.fechaCierre ?? c.creadoEn ?? null);
      if (m === yyyyMm) n += 1;
    }
  }
  return n;
}

/** Filtra leads compro que tienen al menos un cierre (principal o adicional) en el periodo. */
export function filtrarCierresPorPeriodo(
  leads: Lead[],
  periodo: PeriodoCierresBandeja,
  hoy = new Date(),
): Lead[] {
  if (periodo === 'todos') return leads;
  const clave = periodoCierresAClave(periodo, hoy);
  if (!clave) return leads;
  const { desde, hasta } = rangoPorPeriodo(clave, hoy);
  return leads.filter((l) => leadTieneCierreEnRango(l, desde, hasta));
}

export type GrupoCierresVendedor = {
  key: string;
  nombre: string;
  leads: Lead[];
  planesEnPeriodo: number;
  planesPijEnMesActual: number;
};

function claveVendedor(lead: Lead): string {
  return String(lead.promotorId || lead.idVendedor || lead.promotorNombre || 'sin-vendedor');
}

function nombreVendedor(lead: Lead): string {
  return (
    lead.promotorNombre?.trim() ||
    (lead.idVendedor != null ? `Vendedor ${lead.idVendedor}` : 'Sin vendedor')
  );
}

/**
 * Agrupa cierres por vendedor. `mesActualYyyyMm` se usa para el contador PIJ del mes
 * (siempre mes calendario actual, independiente del filtro de lista).
 */
export function agruparCierresPorVendedor(
  leads: Lead[],
  periodoLista: PeriodoCierresBandeja,
  hoy = new Date(),
): GrupoCierresVendedor[] {
  const mesActual = mesCalendarioIso(hoy);
  const clavePeriodo = periodoCierresAClave(periodoLista, hoy);
  const map = new Map<string, GrupoCierresVendedor>();

  for (const lead of leads) {
    const key = claveVendedor(lead);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        nombre: nombreVendedor(lead),
        leads: [],
        planesEnPeriodo: 0,
        planesPijEnMesActual: 0,
      };
      map.set(key, g);
    }
    g.leads.push(lead);
  }

  for (const g of map.values()) {
    if (clavePeriodo) {
      g.planesEnPeriodo = contarPlanesCierreEnMes(g.leads, clavePeriodo);
    } else {
      g.planesEnPeriodo = g.leads.reduce(
        (acc, l) => acc + 1 + (l.seguimiento?.comprasAdicionales?.length ?? 0),
        0,
      );
    }
    g.planesPijEnMesActual = contarPlanesPijEnMes(g.leads, mesActual);
    g.leads.sort((a, b) => {
      const fa = a.seguimiento?.fechaCierre ?? a.seguimiento?.creadoEn ?? '';
      const fb = b.seguimiento?.fechaCierre ?? b.seguimiento?.creadoEn ?? '';
      return String(fb).localeCompare(String(fa));
    });
  }

  return [...map.values()].sort((a, b) => {
    if (b.planesPijEnMesActual !== a.planesPijEnMesActual) {
      return b.planesPijEnMesActual - a.planesPijEnMesActual;
    }
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}
