/**
 * URLs wa.me — mismo formato que la planilla (guiones bajos, sin espacios).
 * La DB del sorteo parsea el texto y asigna el origen según el código compacto.
 *
 * Ejemplo:
 * Gracias_por_su_atencion!!.ENVIE_este_codigo_INSTAGRAM_y_PARTICIPE_GRATIS_del:_SORTEO01S07P01
 */

/** Código compacto para SP/lookup y mensaje wa.me (sin espacios ni guiones). */
export function compactarCodigoSorteo(valor) {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\u00A0_\-]+/g, '');
}

/**
 * Texto del parámetro ?text= (guiones bajos, código pegado como en la planilla).
 */
const CANAL_POR_RED = {
  instagram: 'INSTAGRAM',
  facebook: 'FACEBOOK',
  whatsapp: 'WHATSAPP',
  tiktok: 'TIKTOK',
};

export function buildMensajeLinkRedes(codigoCompacto, red) {
  const canal = CANAL_POR_RED[red] ?? String(red).toUpperCase();
  const codigo = compactarCodigoSorteo(codigoCompacto);
  return `Gracias_por_su_atencion!!.ENVIE_este_codigo_${canal}_y_PARTICIPE_GRATIS_del:_${codigo}`;
}

export function buildWaMeUrl(phone, codigoCompacto, red) {
  const text = buildMensajeLinkRedes(codigoCompacto, red);
  return `https://wa.me/${phone}?text=${text}&type=phone_number&app_absent=0`;
}
