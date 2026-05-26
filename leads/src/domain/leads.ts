import type { Lead, Producto, Promotor, RolUsuario } from '../types';

export function leadCompro(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

export function leadReagendaEntrevista(lead: Lead) {
  return lead.seguimiento?.resultadoEntrevista === 'reagenda';
}

export function formatFechaReagenda(isoLocal?: string | null) {
  if (!isoLocal) return '';
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return isoLocal;
  return d.toLocaleString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPromotorNombre(
  promotorId: string,
  lista: Promotor[] = [],
  fallback?: string,
) {
  return lista.find((p) => p.id === promotorId)?.nombre ?? fallback ?? 'Sin promotor';
}

export function getProductoNombre(idProducto: string | null | undefined, productos: Producto[]) {
  return productos.find((p) => p.id === idProducto)?.nombre ?? null;
}

export function getProductosPorRol(productos: Producto[], rol: RolUsuario) {
  return productos.filter((p) => p.rolesPermitidos.includes(rol));
}

export function puedeVenderProducto(productos: Producto[], rol: RolUsuario, idProducto: string) {
  const prod = productos.find((p) => p.id === idProducto);
  return Boolean(prod?.rolesPermitidos.includes(rol));
}
