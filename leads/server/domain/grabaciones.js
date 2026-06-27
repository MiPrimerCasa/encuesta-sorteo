import { getCuotaDiaria, getCuotaFranja } from '../config/grabaciones-config.js';

/** Mañana 06:00–12:59 · Tarde 13:00–23:59 */
export function calcularFranja(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return 'tarde';
  const h = d.getHours();
  if (h >= 6 && h < 13) return 'manana';
  return 'tarde';
}

export function fechaDiaKey(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fechaMesKey(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function semaforoCumplimiento(cantidad, meta) {
  if (cantidad >= meta) return 'verde';
  if (cantidad >= Math.ceil(meta / 2)) return 'amarillo';
  return 'rojo';
}

/** Resumen diario de promociones aprobadas (entrevistas no cuentan hacia el objetivo 4/día). */
export function buildResumenCumplimiento(grabacionesPromocionActivas) {
  const manana = grabacionesPromocionActivas.filter((g) => g.franja === 'manana').length;
  const tarde = grabacionesPromocionActivas.filter((g) => g.franja === 'tarde').length;
  const total = grabacionesPromocionActivas.length;
  const metaTotal = getCuotaDiaria();
  const metaFranja = getCuotaFranja();

  return {
    manana,
    tarde,
    total,
    metaManana: metaFranja,
    metaTarde: metaFranja,
    metaTotal,
    semaforoManana: semaforoCumplimiento(manana, metaFranja),
    semaforoTarde: semaforoCumplimiento(tarde, metaFranja),
    semaforoTotal: semaforoCumplimiento(total, metaTotal),
    cumple: total >= metaTotal,
  };
}
