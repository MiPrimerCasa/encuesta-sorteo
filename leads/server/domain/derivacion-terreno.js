/** Seguimiento con derivación a terreno activa (promotor → supervisor). */
export function seguimientoDerivacionTerrenoActiva(seguimiento = {}) {
  if (seguimiento?.resultadoEntrevista === 'derivar_terreno') return true;
  if (seguimiento?.derivacionTerrenoActiva === true || seguimiento?.derivacionTerrenoActiva === 1) {
    return true;
  }
  return false;
}

/**
 * El supervisor puede seguir gestionando un lead del promotor tras derivar terreno
 * (contacto, reagenda, cierre) aunque el resultado ya no sea derivar_terreno.
 */
export function leadDerivacionTerrenoSupervisorActiva(lead) {
  const seg = lead?.seguimiento ?? {};
  if (seguimientoDerivacionTerrenoActiva(seg)) return true;

  if (lead?.cargadoPorRol !== 'promotor') return false;
  if (seg.seguimientoPijPromotor === true) return false;

  // Compatibilidad con filas guardadas antes del flag derivacionTerrenoActiva
  if (
    seg.resultadoEntrevista === 'reagenda' &&
    String(seg.operadorRol ?? '').toLowerCase() === 'supervisor'
  ) {
    return true;
  }

  return false;
}
