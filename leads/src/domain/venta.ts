import type { Barrio, EstadoPago, FormaPago, RolUsuario } from '../types';

export const ID_PRODUCTO_PIJ = 'prod-pij';
export const ID_PRODUCTO_TERRENO = 'prod-terreno';
export const MONTO_ADHESION_PIJ = 33000;

export const ETIQUETA_FORMA_PAGO: Record<FormaPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export function opcionesFormaPago(): { value: FormaPago; label: string }[] {
  return [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'mixto', label: 'Mixto' },
  ];
}

function parseMontoInput(value: string | number | null | undefined): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatearMontoArs(monto: number | null | undefined): string {
  if (monto == null || !Number.isFinite(monto)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}

/** Recorta el input numérico para que no supere el total PIJ ($33.000). */
export function limitarMontoPijInput(
  raw: string,
  montoTotal = MONTO_ADHESION_PIJ,
): string {
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  if (n > montoTotal) return String(montoTotal);
  return digits;
}

/** Diferencia para cerrar el total PIJ en pago mixto (ej. 20000 → "13000"). */
export function complementoMontoMixtoPij(
  montoIngresado: string,
  montoTotal = MONTO_ADHESION_PIJ,
): string {
  if (!montoIngresado.trim()) return '';
  const n = parseMontoInput(montoIngresado);
  if (n == null) return '';
  return String(Math.max(0, montoTotal - Math.min(n, montoTotal)));
}

/** Valida medio de pago PIJ; devuelve mensaje de error o null si OK. */
export function validarMedioPagoPij(
  formaPago: FormaPago | null | undefined,
  montoEfectivoInput: string | number | null | undefined,
  montoTransferenciaInput: string | number | null | undefined,
  montoTotal = MONTO_ADHESION_PIJ,
): string | null {
  if (!formaPago) return 'Indicá si el pago fue en efectivo, transferencia o mixto.';

  if (formaPago === 'efectivo') {
    const monto = parseMontoInput(montoEfectivoInput) ?? montoTotal;
    if (monto <= 0) return 'Ingresá el monto en efectivo.';
    if (monto > montoTotal) {
      return `El monto no puede superar ${formatearMontoArs(montoTotal)}.`;
    }
    return null;
  }

  if (formaPago === 'transferencia') {
    const monto = parseMontoInput(montoTransferenciaInput) ?? montoTotal;
    if (monto <= 0) return 'Ingresá el monto transferido.';
    if (monto > montoTotal) {
      return `El monto no puede superar ${formatearMontoArs(montoTotal)}.`;
    }
    return null;
  }

  const ef = parseMontoInput(montoEfectivoInput);
  const tr = parseMontoInput(montoTransferenciaInput);
  if (ef == null || ef <= 0) return 'Ingresá el monto en efectivo.';
  if (tr == null || tr <= 0) return 'Ingresá el monto transferido.';
  if (ef > montoTotal || tr > montoTotal) {
    return `Ningún monto puede superar ${formatearMontoArs(montoTotal)}.`;
  }
  if (ef + tr !== montoTotal) {
    return `En pago mixto, efectivo + transferencia deben sumar ${formatearMontoArs(montoTotal)}.`;
  }
  return null;
}

/** Valida titular TRF (coincide con cliente o nombre manual). */
export function validarTitularTransferenciaPij(
  formaPago: FormaPago | null | undefined,
  titularCoincideCliente: boolean | null | undefined,
  titularTransferencia: string | null | undefined,
): string | null {
  if (formaPago !== 'transferencia' && formaPago !== 'mixto') return null;
  if (titularCoincideCliente == null) {
    return 'Indicá si el titular de la transferencia coincide con el cliente.';
  }
  if (titularCoincideCliente === false && !String(titularTransferencia ?? '').trim()) {
    return 'Ingresá el apellido y nombre del titular de la transferencia.';
  }
  if (titularCoincideCliente === true && !String(titularTransferencia ?? '').trim()) {
    return 'No se pudo tomar el nombre del cliente como titular.';
  }
  return null;
}

/** Convierte entradas del formulario a montos numéricos para guardar. */
export function montosPijDesdeEntrada(
  formaPago: FormaPago,
  montoEfectivoInput: string | number | null | undefined,
  montoTransferenciaInput: string | number | null | undefined,
  montoTotal = MONTO_ADHESION_PIJ,
): { montoCierre: number; montoEfectivo: number | null; montoTransferencia: number | null } {
  if (formaPago === 'efectivo') {
    const monto = parseMontoInput(montoEfectivoInput) ?? montoTotal;
    return { montoCierre: monto, montoEfectivo: monto, montoTransferencia: null };
  }
  if (formaPago === 'transferencia') {
    const monto = parseMontoInput(montoTransferenciaInput) ?? montoTotal;
    return { montoCierre: monto, montoEfectivo: null, montoTransferencia: monto };
  }
  const ef = parseMontoInput(montoEfectivoInput) ?? 0;
  const tr = parseMontoInput(montoTransferenciaInput) ?? 0;
  return { montoCierre: montoTotal, montoEfectivo: ef, montoTransferencia: tr };
}

export function etiquetaMedioPagoPij(
  formaPago: FormaPago | null | undefined,
  montoCierre?: number | null,
  montoEfectivo?: number | null,
  montoTransferencia?: number | null,
): string | null {
  if (!formaPago) return null;
  const base = ETIQUETA_FORMA_PAGO[formaPago];
  if (formaPago === 'mixto') {
    return `${base} (${formatearMontoArs(montoEfectivo)} + ${formatearMontoArs(montoTransferencia)})`;
  }
  return `${base} · ${formatearMontoArs(montoCierre ?? montoEfectivo ?? montoTransferencia)}`;
}

export function requiereComprobanteTransferenciaPij(formaPago: FormaPago | null | undefined): boolean {
  return formaPago === 'transferencia' || formaPago === 'mixto';
}

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

export type OpcionPago = {
  value: EstadoPago;
  label: string;
  hint?: string;
  /** Visible pero no seleccionable (ej. Entrega $55.000 en PIJ). */
  disabled?: boolean;
};

/** Plan Inversión Joven: sin seña; solo entrega $33k activa; $55k informativa. */
export function opcionesPagoPlanInversion(): OpcionPago[] {
  return [
    {
      value: 'entrega_33',
      label: 'Entrega $33.000',
      hint: 'Equivale al 100% del plan. Adhesión a terreno tras 12 meses.',
    },
    { value: 'entrega_55', label: 'Entrega $55.000', disabled: true },
  ];
}

/** Al editar un cierre PIJ, solo se puede elegir entrega $33k. */
export function estadoPagoEditablePlanInversion(
  estadoPago: EstadoPago | null | undefined,
): EstadoPago | null {
  return estadoPago === 'entrega_33' ? 'entrega_33' : null;
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

/** Plan Inversión Joven: anexo; Terreno: recibo (mismo campo `numeroRecibo` en API). */
export function etiquetaNumeroDocumentoVenta(idProducto: string | null | undefined): string {
  return esPlanInversion(idProducto) ? 'Número de anexo' : 'Número de recibo';
}

export function etiquetaCortaNumeroDocumentoVenta(idProducto: string | null | undefined): string {
  return esPlanInversion(idProducto) ? 'Anexo' : 'Recibo';
}

export function mensajeErrorNumeroDocumentoVenta(idProducto: string | null | undefined): string {
  return esPlanInversion(idProducto)
    ? 'Ingresá el número de anexo.'
    : 'Ingresá el número de recibo.';
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
  formaPago: null;
  montoEfectivo: string;
  montoTransferencia: string;
  titularCoincideCliente: null;
  titularTransferencia: string;
  dniCliente: string;
} {
  return {
    idProducto: '',
    estadoPago: null,
    idBarrio: '',
    numeroRecibo: '',
    formaPago: null,
    montoEfectivo: '',
    montoTransferencia: '',
    titularCoincideCliente: null,
    titularTransferencia: '',
    dniCliente: '',
  };
}

export function resetCamposAlCambiarProducto(idProducto: string) {
  return {
    idProducto,
    estadoPago: null,
    idBarrio: '',
    numeroRecibo: '',
    formaPago: null,
    montoEfectivo: '',
    montoTransferencia: '',
    dniCliente: '',
  };
}
