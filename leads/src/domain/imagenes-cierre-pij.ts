import type { FormaPago, TipoImagenCierrePij } from '../types';

/** Códigos alineados al sistema de administración (img1, img2, img5, img6, img7). */
export const ETIQUETAS_IMAGEN_CIERRE_PIJ: Record<TipoImagenCierrePij, string> = {
  img1: 'DNI persona 1 — frente',
  img2: 'DNI persona 1 — reverso',
  img5: 'Consentimiento / solicitud (imgSolicitud en sistema integral)',
  img6: 'Foto de anexo',
  img7: 'Comprobante de transferencia',
};

/** Orden de carga en el formulario. */
export const SLOTS_IMAGEN_CIERRE_PIJ: TipoImagenCierrePij[] = [
  'img1',
  'img2',
  'img5',
  'img6',
  'img7',
];

/** Marcadas con * en UI. Vacío = ninguna obligatoria (piloto / prueba SOAP). */
export const IMAGENES_CIERRE_PIJ_OBLIGATORIAS_UI: TipoImagenCierrePij[] = [];

/** @deprecated Usar IMAGENES_CIERRE_PIJ_OBLIGATORIAS_UI */
export const IMAGENES_CIERRE_PIJ_OBLIGATORIAS = IMAGENES_CIERRE_PIJ_OBLIGATORIAS_UI;

export function formaPagoRequiereComprobanteTransferencia(
  formaPago: FormaPago | null | undefined,
): boolean {
  return formaPago === 'transferencia' || formaPago === 'mixto';
}

/** Normaliza tipos legacy guardados antes del cambio de códigos. */
export function normalizarTipoImagenCierrePij(tipo: string): TipoImagenCierrePij | null {
  const map: Record<string, TipoImagenCierrePij> = {
    img1: 'img1',
    img2: 'img2',
    img5: 'img5',
    img6: 'img6',
    img7: 'img7',
    recibo: 'img6',
    comprobante_transferencia: 'img7',
  };
  return map[tipo] ?? null;
}

export function esImagenCierrePijObligatoria(
  tipo: TipoImagenCierrePij,
  formaPago?: FormaPago | null,
): boolean {
  void tipo;
  void formaPago;
  // Piloto: ninguna foto bloquea el guardado.
  return false;
}

/** Tipos que bloquean el guardado si faltan. Vacío = se puede cerrar sin fotos. */
export function tiposImagenCierrePijRequeridosAlGuardar(
  formaPago?: FormaPago | null,
): TipoImagenCierrePij[] {
  void formaPago;
  return [];
}

/** Valida fotos obligatorias al guardar; devuelve mensaje de error o null si OK. */
export function validarImagenesCierrePij(
  ventaKey: string,
  formaPago: FormaPago | null | undefined,
  imagenes: { ventaKey: string; tipo: string }[] | null | undefined,
): string | null {
  const deVenta = (imagenes ?? []).filter((i) => i.ventaKey === ventaKey);
  const tiposSubidos = new Set(
    deVenta
      .map((i) => normalizarTipoImagenCierrePij(i.tipo))
      .filter((t): t is TipoImagenCierrePij => t != null),
  );

  for (const tipo of tiposImagenCierrePijRequeridosAlGuardar(formaPago)) {
    if (!tiposSubidos.has(tipo)) {
      return `Subí: ${ETIQUETAS_IMAGEN_CIERRE_PIJ[tipo]}.`;
    }
  }
  return null;
}

/** img7 solo se muestra con transferencia o mixto. */
export function slotImagenCierrePijVisible(
  tipo: TipoImagenCierrePij,
  formaPago?: FormaPago | null,
): boolean {
  if (tipo === 'img7') return formaPagoRequiereComprobanteTransferencia(formaPago);
  return true;
}

/**
 * Fotos que la caja exige para validar el cierre PIJ (contrato CRM ↔ caja).
 * Distinto de `tiposImagenCierrePijRequeridosAlGuardar` (piloto: vacío).
 */
export function tiposImagenCierrePijParaCaja(
  formaPago?: FormaPago | null,
): TipoImagenCierrePij[] {
  const base: TipoImagenCierrePij[] = ['img1', 'img2', 'img5', 'img6'];
  if (formaPagoRequiereComprobanteTransferencia(formaPago)) {
    base.push('img7');
  }
  return base;
}

export type ResumenFotosCierrePij = {
  requeridas: TipoImagenCierrePij[];
  presentes: TipoImagenCierrePij[];
  faltantes: TipoImagenCierrePij[];
  etiquetasFaltantes: string[];
  completo: boolean;
};

/** Resumen de fotos subidas vs las que pide la caja para completar la venta. */
export function resumenFotosCierrePij(
  ventaKey: string,
  formaPago: FormaPago | null | undefined,
  imagenes: { ventaKey: string; tipo: string }[] | null | undefined,
): ResumenFotosCierrePij {
  const requeridas = tiposImagenCierrePijParaCaja(formaPago);
  const deVenta = (imagenes ?? []).filter((i) => i.ventaKey === ventaKey);
  const presentes = [
    ...new Set(
      deVenta
        .map((i) => normalizarTipoImagenCierrePij(i.tipo))
        .filter((t): t is TipoImagenCierrePij => t != null),
    ),
  ];
  const setPresentes = new Set(presentes);
  const faltantes = requeridas.filter((t) => !setPresentes.has(t));
  return {
    requeridas,
    presentes,
    faltantes,
    etiquetasFaltantes: faltantes.map((t) => ETIQUETAS_IMAGEN_CIERRE_PIJ[t]),
    completo: faltantes.length === 0,
  };
}

export type BadgeFotoCierrePij = {
  key: 'adh' | 'anexo' | 'dni' | 'comprobante';
  label: string;
  cargada: boolean;
  /** Si false, no aplica (ej. efectivo sin comprobante de transferencia). */
  aplica: boolean;
};

/**
 * Chips cortos para la tarjeta/modal: ADH · ANEXO · DNI · COMPROBANTE.
 * Verde si están cargadas; rojo si faltan (cuando aplican).
 * No bloquean el guardado del lead.
 */
export function badgesFotosCierrePij(
  ventaKey: string,
  formaPago: FormaPago | null | undefined,
  imagenes: { ventaKey: string; tipo: string }[] | null | undefined,
): BadgeFotoCierrePij[] {
  const deVenta = (imagenes ?? []).filter((i) => i.ventaKey === ventaKey);
  const tipos = new Set(
    deVenta
      .map((i) => normalizarTipoImagenCierrePij(i.tipo))
      .filter((t): t is TipoImagenCierrePij => t != null),
  );
  const requiereComp = formaPagoRequiereComprobanteTransferencia(formaPago);
  return [
    { key: 'adh', label: 'ADH', cargada: tipos.has('img5'), aplica: true },
    { key: 'anexo', label: 'ANEXO', cargada: tipos.has('img6'), aplica: true },
    {
      key: 'dni',
      label: 'DNI',
      cargada: tipos.has('img1') && tipos.has('img2'),
      aplica: true,
    },
    {
      key: 'comprobante',
      label: 'COMPROBANTE',
      cargada: tipos.has('img7'),
      aplica: requiereComp,
    },
  ];
}
