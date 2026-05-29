import type { FuenteLead, OrigenIngresoManual } from '../types';

export const FUENTE_LABEL: Record<FuenteLead, string> = {
  qr: 'QR',
  app: 'Manual',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

/** Mapeo carga manual / SP → fuente de métricas. */
export function origenIngresoToFuente(origen: OrigenIngresoManual): FuenteLead | null {
  switch (origen) {
    case 'qr':
    case 'sorteo':
      return 'qr';
    case 'facebook':
      return 'facebook';
    case 'instagram':
      return 'instagram';
    case 'manual':
    case 'referido':
      return 'app';
    case 'otro':
      return null;
    default:
      return null;
  }
}

export function origenIngresoToOrigenLead(
  origen: OrigenIngresoManual,
): 'sorteo' | 'manual' | 'redes' {
  if (origen === 'qr' || origen === 'sorteo') return 'sorteo';
  if (origen === 'facebook' || origen === 'instagram') return 'redes';
  return 'manual';
}
