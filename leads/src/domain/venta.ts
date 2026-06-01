import type { Barrio, EstadoPago, RolUsuario } from '../types';

export const ID_PRODUCTO_PIJ = 'prod-pij';
export const ID_PRODUCTO_TERRENO = 'prod-terreno';

export const ETIQUETA_ESTADO_PAGO: Record<EstadoPago, string> = {
  sena: 'Seña',
  cien: '100%',
  entrega_33: 'Entrega $33.000',
  entrega_55: 'Entrega $55.000',
};

export function esPlanInversion(idProducto: string | null | undefined) {
  return idProducto === ID_PRODUCTO_PIJ;
}

export function esTerreno(idProducto: string | null | undefined) {
  return idProducto === ID_PRODUCTO_TERRENO;
}

export type OpcionPago = { value: EstadoPago; label: string; hint?: string };

export function opcionesPagoPlanInversion(): OpcionPago[] {
  return [
    { value: 'sena', label: 'Operaciones en Seña' },
    {
      value: 'entrega_33',
      label: 'Entrega $33.000',
      hint: 'Equivale al 100% del plan. Adhesión a terreno tras 12 meses.',
    },
    { value: 'entrega_55', label: 'Entrega $55.000' },
  ];
}

export function opcionesPagoTerreno(): OpcionPago[] {
  return [
    { value: 'sena', label: 'Operaciones en Seña' },
    { value: 'cien', label: 'Cobrado 100%' },
  ];
}

export function opcionesPagoParaRol(
  _rol: RolUsuario,
  idProducto: string | null | undefined,
): OpcionPago[] {
  if (esTerreno(idProducto)) {
    return opcionesPagoTerreno();
  }
  if (esPlanInversion(idProducto)) {
    return opcionesPagoPlanInversion();
  }
  return [];
}

export function etiquetasResultadoEntrevista(rol?: RolUsuario) {
  const base = { compro: 'SI COMPRO', noCompro: 'NO COMPRO' };
  if (rol === 'promotor') {
    return {
      ...base,
      derivarTerreno: 'Derivar con supervisor — interés terreno',
    };
  }
  return base;
}

export function etiquetaEstadoPagoVisible(
  _rol: RolUsuario | undefined,
  estadoPago: EstadoPago,
  _idProducto?: string | null,
) {
  if (estadoPago === 'sena') return 'Operaciones en Seña';
  if (estadoPago === 'cien') return 'Cobrado 100%';
  return ETIQUETA_ESTADO_PAGO[estadoPago] ?? estadoPago;
}

export function tituloEstadoCompra(_rol?: RolUsuario) {
  return 'Estado de compra';
}

/** Supervisor: recibo; promotor: comprobante (mismo campo `numeroRecibo` en API). */
export function etiquetaNumeroDocumentoVenta(rol: RolUsuario): string {
  return rol === 'supervisor' ? 'Número de recibo' : 'Número de comprobante';
}

export function etiquetaCortaNumeroDocumentoVenta(rol: RolUsuario): string {
  return rol === 'supervisor' ? 'Recibo' : 'Comprobante';
}

export function mensajeErrorNumeroDocumentoVenta(rol: RolUsuario): string {
  return rol === 'supervisor'
    ? 'Ingresá el número de recibo.'
    : 'Ingresá el número de comprobante.';
}

export function requiereNumeroRecibo(
  idProducto: string | null | undefined,
  estadoPago: EstadoPago | null | undefined,
) {
  if (!idProducto || !estadoPago) return false;
  if (esPlanInversion(idProducto)) {
    return estadoPago === 'entrega_33' || estadoPago === 'entrega_55';
  }
  if (esTerreno(idProducto)) {
    return estadoPago === 'sena' || estadoPago === 'cien';
  }
  return false;
}

export function getBarrioNombre(idBarrio: string | null | undefined, barrios: Barrio[]) {
  return barrios.find((b) => b.id === idBarrio)?.nombre ?? null;
}

export function etiquetaPagoProducto(
  idProducto: string | null | undefined,
  estadoPago: EstadoPago | null | undefined,
  barrios: Barrio[],
  idBarrio?: string | null,
  rol?: RolUsuario,
) {
  if (!estadoPago) return null;
  const pago = etiquetaEstadoPagoVisible(rol ?? 'promotor', estadoPago, idProducto);
  if (esTerreno(idProducto) && idBarrio) {
    const barrio = getBarrioNombre(idBarrio, barrios);
    return barrio ? `${pago} · ${barrio}` : pago;
  }
  return pago;
}

export function resetCamposVenta(): {
  idProducto: string;
  estadoPago: null;
  idBarrio: string;
  numeroRecibo: string;
} {
  return { idProducto: '', estadoPago: null, idBarrio: '', numeroRecibo: '' };
}

export function resetCamposAlCambiarProducto(idProducto: string) {
  return { idProducto, estadoPago: null, idBarrio: '', numeroRecibo: '' };
}
