/** Pasa a mayúsculas sin tocar los espacios. */
export function textoCargaMayusculas(raw: string): string {
  return String(raw ?? '').toLocaleUpperCase('es-AR');
}
