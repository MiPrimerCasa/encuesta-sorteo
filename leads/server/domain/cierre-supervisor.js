/** Reglas espejo de src/domain/leads.ts — cierre del supervisor bloqueado para promotor. */

const ID_PRODUCTO_TERRENO = 'prod-terreno';

function normalizarRolOperador(rol) {
  const r = String(rol ?? '').trim().toLowerCase();
  if (r === 'supervisor' || r === 'promotor') return r;
  return null;
}

/**
 * El promotor con cita también guarda confirmoEntrevista; no usar ese campo como rol.
 * @param {import('../../src/types/index.js').SeguimientoLead | Record<string, unknown>} seguimiento
 */
export function cierreRegistradoPorSupervisor(seguimiento) {
  if (seguimiento?.resultadoEntrevista !== 'compro') return false;
  const rol = normalizarRolOperador(seguimiento.operadorRol);
  if (rol === 'promotor') return false;
  if (rol === 'supervisor') return true;
  // Legado sin operador_rol: terreno lo carga el supervisor.
  return seguimiento.idProducto === ID_PRODUCTO_TERRENO;
}
