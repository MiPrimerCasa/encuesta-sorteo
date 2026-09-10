import type { FormaPago, ImagenCierrePij, TipoImagenCierrePij } from '../types';

/** Códigos alineados al sistema de administración (img1, img2, img5, img6, img7). */
export const ETIQUETAS_IMAGEN_CIERRE_PIJ: Record<TipoImagenCierrePij, string> = {
  img1: 'DNI persona 1 — frente',
  img2: 'DNI persona 1 — reverso',
  img5: 'Consentimiento / solicitud (imgSolicitud en sistema integral)',
  img6: 'Foto de anexo',
  img7: 'Comprobante de transferencia',
};

/** DNI frente/reverso: se reutilizan entre planes del mismo lead. */
export const TIPOS_DNI_CIERRE_PIJ: TipoImagenCierrePij[] = ['img1', 'img2'];

/** Fotos que sí cambian por plan (adhesión, anexo, comprobante). */
export function tiposFotoVariablesPorPlan(
  formaPago?: FormaPago | null,
): TipoImagenCierrePij[] {
  const out: TipoImagenCierrePij[] = ['img5', 'img6'];
  if (formaPagoRequiereComprobanteTransferencia(formaPago)) out.push('img7');
  return out;
}

function imagenDeTipoEnVenta(
  imagenes: ImagenCierrePij[],
  ventaKey: string,
  tipo: TipoImagenCierrePij,
): ImagenCierrePij | undefined {
  return imagenes.find(
    (i) =>
      i.ventaKey === ventaKey &&
      normalizarTipoImagenCierrePij(i.tipo) === tipo &&
      Boolean(i.storagePath),
  );
}

/**
 * Slots DNI faltantes en destinos, con la imagen fuente a clonar (archivo real).
 * No inventa metadatos: el clon debe copiar el archivo vía API.
 */
export type DniPendienteClonar = {
  destinoVentaKey: string;
  tipo: TipoImagenCierrePij;
  fuente: ImagenCierrePij;
};

export function listarDniPendientesDeClonar(
  imagenes: ImagenCierrePij[] | null | undefined,
  destinos: string[],
  fuentesPrioridad: string[],
): DniPendienteClonar[] {
  const list = imagenes ?? [];
  const out: DniPendienteClonar[] = [];
  for (const dest of destinos) {
    if (!dest) continue;
    for (const tipo of TIPOS_DNI_CIERRE_PIJ) {
      if (imagenDeTipoEnVenta(list, dest, tipo)) continue;
      let fuente: ImagenCierrePij | undefined;
      for (const vk of fuentesPrioridad) {
        if (vk === dest) continue;
        fuente = imagenDeTipoEnVenta(list, vk, tipo);
        if (fuente) break;
      }
      if (fuente) out.push({ destinoVentaKey: dest, tipo, fuente });
    }
  }
  return out;
}

/**
 * Comparte DNI (img1/img2) entre ventas del mismo lead: mismo id y storagePath.
 * No copia el archivo en disco. No toca img5/img6/img7.
 */
export function clonarDniEntreVentas(
  imagenes: ImagenCierrePij[] | null | undefined,
  destinoVentaKey: string,
  fuentesPrioridad: string[],
): ImagenCierrePij[] {
  const list = [...(imagenes ?? [])];
  const destTipos = new Set(
    list
      .filter((i) => i.ventaKey === destinoVentaKey)
      .map((i) => normalizarTipoImagenCierrePij(i.tipo))
      .filter((t): t is TipoImagenCierrePij => t != null),
  );

  for (const tipo of TIPOS_DNI_CIERRE_PIJ) {
    if (destTipos.has(tipo)) continue;
    let fuente: ImagenCierrePij | undefined;
    for (const vk of fuentesPrioridad) {
      if (vk === destinoVentaKey) continue;
      fuente = imagenDeTipoEnVenta(list, vk, tipo);
      if (fuente) break;
    }
    if (!fuente?.storagePath) continue;
    // Misma foto en disco: solo cambia ventaKey (caja/UI leen por venta).
    list.push({
      ...fuente,
      ventaKey: destinoVentaKey,
    });
    destTipos.add(tipo);
  }
  return list;
}

/** Comparte DNI a varios destinos sin duplicar archivos. */
export function propagarDniAVentasSinDni(
  imagenes: ImagenCierrePij[] | null | undefined,
  destinos: string[],
  fuentesPrioridad: string[],
): ImagenCierrePij[] {
  let list = [...(imagenes ?? [])];
  for (const dest of destinos) {
    if (!dest) continue;
    list = clonarDniEntreVentas(list, dest, fuentesPrioridad);
  }
  return list;
}

/**
 * True si el destino referencia el mismo archivo/id de DNI que alguna fuente.
 */
export function dniReutilizadoDesdeFuente(
  imagenes: ImagenCierrePij[] | null | undefined,
  destinoVentaKey: string,
  fuentesPrioridad: string[],
): boolean {
  const list = imagenes ?? [];
  for (const tipo of TIPOS_DNI_CIERRE_PIJ) {
    const dest = imagenDeTipoEnVenta(list, destinoVentaKey, tipo);
    if (!dest?.storagePath) continue;
    for (const vk of fuentesPrioridad) {
      if (vk === destinoVentaKey) continue;
      const src = imagenDeTipoEnVenta(list, vk, tipo);
      if (
        src &&
        (src.id === dest.id || src.storagePath === dest.storagePath)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** True si algún destino aún no tiene img1/img2 y hay fuente disponible. */
export function hayDniPendienteDeClonar(
  imagenes: ImagenCierrePij[] | null | undefined,
  destinos: string[],
  fuentesPrioridad: string[],
): boolean {
  return listarDniPendientesDeClonar(imagenes, destinos, fuentesPrioridad).length > 0;
}

/** DNI (frente/reverso) tomados de la primera fuente que los tenga. */
export function imagenesDniDesdeFuentes(
  imagenes: ImagenCierrePij[] | null | undefined,
  fuentesPrioridad: string[],
): ImagenCierrePij[] {
  const list = imagenes ?? [];
  const out: ImagenCierrePij[] = [];
  for (const tipo of TIPOS_DNI_CIERRE_PIJ) {
    for (const vk of fuentesPrioridad) {
      const hit = imagenDeTipoEnVenta(list, vk, tipo);
      if (hit) {
        out.push(hit);
        break;
      }
    }
  }
  return out;
}

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

/** True si falta al menos una foto aplicable (ADH/ANEXO/DNI/COMPROBANTE). */
export function faltanFotosCierrePij(
  ventaKey: string,
  formaPago: FormaPago | null | undefined,
  imagenes: { ventaKey: string; tipo: string }[] | null | undefined,
): boolean {
  return badgesFotosCierrePij(ventaKey, formaPago, imagenes).some(
    (b) => b.aplica && !b.cargada,
  );
}

/**
 * Slots a pedir en «Cargar fotos faltantes».
 * DNI pide frente y/o reverso según lo que falte.
 */
export function tiposFotosCierrePijFaltantes(
  ventaKey: string,
  formaPago: FormaPago | null | undefined,
  imagenes: { ventaKey: string; tipo: string }[] | null | undefined,
): TipoImagenCierrePij[] {
  const deVenta = (imagenes ?? []).filter((i) => i.ventaKey === ventaKey);
  const tipos = new Set(
    deVenta
      .map((i) => normalizarTipoImagenCierrePij(i.tipo))
      .filter((t): t is TipoImagenCierrePij => t != null),
  );
  const out: TipoImagenCierrePij[] = [];
  if (!tipos.has('img5')) out.push('img5');
  if (!tipos.has('img6')) out.push('img6');
  if (!tipos.has('img1')) out.push('img1');
  if (!tipos.has('img2')) out.push('img2');
  if (formaPagoRequiereComprobanteTransferencia(formaPago) && !tipos.has('img7')) {
    out.push('img7');
  }
  return out;
}
