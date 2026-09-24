/** Pasa a mayúsculas sin tocar los espacios. */
export function textoCargaMayusculas(raw) {
  return String(raw ?? '').toLocaleUpperCase('es-AR');
}
