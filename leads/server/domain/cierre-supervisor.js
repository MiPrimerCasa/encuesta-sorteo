/** Reglas espejo de src/domain/leads.ts — cierre del supervisor bloqueado para promotor. */

const ID_PRODUCTO_TERRENO = 'prod-terreno';

function normalizarRolOperador(rol) {
  const r = String(rol ?? '').trim().toLowerCase();
  if (r === 'supervisor' || r === 'promotor') return r;
  return null;
}

function seguimientoIndicaCierreSupervisor(seguimiento = {}) {
  if (normalizarRolOperador(seguimiento.operadorRol) === 'supervisor') return true;
  if (seguimiento.idProducto === ID_PRODUCTO_TERRENO) return true;
  if (seguimiento.confirmoEntrevista != null) return true;
  return false;
}

/** @param {import('../../src/types/index.js').SeguimientoLead | Record<string, unknown>} seguimiento */
export function cierreRegistradoPorSupervisor(seguimiento) {
  return (
    seguimiento?.resultadoEntrevista === 'compro' &&
    seguimientoIndicaCierreSupervisor(seguimiento)
  );
}
