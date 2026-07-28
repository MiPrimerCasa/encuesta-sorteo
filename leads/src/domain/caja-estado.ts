import type { SeguimientoLead } from '../types';

export type CajaEstado = NonNullable<SeguimientoLead['cajaEstado']>;

export type CajaPillVariant = 'caja-pendiente' | 'caja-ok' | 'caja-rechazo' | 'pending';

export function etiquetaCajaEstado(estado: CajaEstado | null | undefined): string | null {
  if (estado === 'pendiente') return 'Caja: pendiente';
  if (estado === 'verificado') return 'Caja: verificado';
  if (estado === 'rechazado') return 'Caja: rechazado';
  return null;
}

/**
 * Etiqueta para UI de cierres PIJ aunque aún no haya sync con caja
 * (MySQL deshabilitado / ingest caído).
 */
export function etiquetaCajaEstadoUi(estado: CajaEstado | null | undefined): string {
  return etiquetaCajaEstado(estado) ?? 'Caja: sin enviar';
}

export function variantCajaEstado(
  estado: CajaEstado | null | undefined,
): CajaPillVariant {
  if (estado === 'pendiente') return 'caja-pendiente';
  if (estado === 'verificado') return 'caja-ok';
  if (estado === 'rechazado') return 'caja-rechazo';
  return 'pending';
}

export function detalleCajaEstado(seg: SeguimientoLead | null | undefined): string | null {
  if (!seg?.cajaEstado) return null;
  const partes: string[] = [];
  if (seg.cajaConfirmadoPor) partes.push(`por ${seg.cajaConfirmadoPor}`);
  if (seg.cajaComprobanteId) partes.push(`comp. ${seg.cajaComprobanteId}`);
  if (seg.cajaSucursal) partes.push(`suc. ${seg.cajaSucursal}`);
  if (seg.cajaEstado === 'rechazado' && seg.cajaMotivoRechazo) {
    partes.push(seg.cajaMotivoRechazo);
  }
  return partes.length ? partes.join(' · ') : null;
}
