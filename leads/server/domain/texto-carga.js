/** Nombre y domicilio de carga manual: mayúsculas, sin espacios de más. */
export function textoCargaMayusculas(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es-AR');
}
