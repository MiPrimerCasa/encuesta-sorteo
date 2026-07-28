/** Solo dígitos, máx. 16 (columna SQL). */
export function normalizarDniCliente(raw) {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 16);
}

export function esDniClienteValido(dni) {
  const n = normalizarDniCliente(dni);
  return n.length >= 7 && n.length <= 8;
}

export function validarDniCliente(dni) {
  const n = normalizarDniCliente(dni);
  if (!n) return 'Ingresá el DNI del cliente.';
  if (!esDniClienteValido(n)) return 'El DNI debe tener 7 u 8 dígitos.';
  return null;
}
