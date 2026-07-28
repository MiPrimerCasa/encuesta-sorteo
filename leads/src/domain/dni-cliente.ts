/** Solo dígitos, máx. 16 (columna SQL). */
export function normalizarDniCliente(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 16);
}

/** DNI argentino habitual: 7 u 8 dígitos. */
export function esDniClienteValido(dni: string | null | undefined): boolean {
  const n = normalizarDniCliente(dni);
  return n.length >= 7 && n.length <= 8;
}

export function validarDniCliente(dni: string | null | undefined): string | null {
  const n = normalizarDniCliente(dni);
  if (!n) return 'Ingresá el DNI del cliente.';
  if (!esDniClienteValido(n)) return 'El DNI debe tener 7 u 8 dígitos.';
  return null;
}

export function formatearDniCliente(dni: string | null | undefined): string {
  return normalizarDniCliente(dni);
}
