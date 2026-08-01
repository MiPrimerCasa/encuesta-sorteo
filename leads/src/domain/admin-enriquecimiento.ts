/** Normaliza nombre de vendedor/promotor para cruce silencioso CRM ↔ SP/Caja. */
export function normalizarNombreVendedor(nombre: string | null | undefined): string {
  return String(nombre ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function vendedoresCoincidenUi(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const va = normalizarNombreVendedor(a);
  const vb = normalizarNombreVendedor(b);
  if (!va || !vb) return false;
  if (va === vb || va.includes(vb) || vb.includes(va)) return true;
  const w1 = va.split(' ').filter((w) => w.length > 2);
  const w2 = vb.split(' ').filter((w) => w.length > 2);
  return w1.some((w) => w2.includes(w));
}

/**
 * Busca cantidad de un mapa porVendedor (clave = nombre) matcheando al promotor.
 */
export function cantidadPorVendedorMatch(
  porVendedor: Array<{ vendedor: string; cantidad: number }>,
  promotorNombre: string,
): number {
  let total = 0;
  for (const g of porVendedor) {
    if (vendedoresCoincidenUi(g.vendedor, promotorNombre)) total += g.cantidad;
  }
  return total;
}
