/**
 * Informe de comisiones y salarios contable (Mi Primer Casa).
 * - Salario fijo: $800.000
 * - PIJ: $2.000 c/u solo si se alcanza el objetivo de 100 adhesiones
 * - Terrenos: 1% del recaudado solo si se alcanzan 30 adhesiones
 */
import { periodoPanelAYyyyMm, resolverPeriodoPorYyyyMm } from '../db/informe-cierres.js';
import { buildEnriquecimientoInformeOperaciones } from './informe-operaciones-enriquecimiento.js';

export const COMISION_PIJ_UNITARIO = 2000;
export const COMISION_TERRENO_PCT = 0.01;
export const SALARIO_FIJO_MENSUAL = 800000;

/** Objetivo mínimo de PIJ del mes para cobrar comisión. */
export const OBJETIVO_PIJ = 100;
/** Tramo de mensajes motivacionales PIJ. */
export const PROGRESO_PIJ_CADA = 30;

/** Objetivo mínimo de adhesiones de terreno para cobrar el 1%. */
export const OBJETIVO_TERRENOS = 30;
/** Tramo de mensajes motivacionales terrenos. */
export const PROGRESO_TERRENOS_CADA = 10;

const MENSAJES_PIJ = [
  'Cada PIJ cuenta. Meta del mes: 100 adhesiones para desbloquear la comisión.',
  'Primer tercio listo. Mantené el ritmo: vas camino a las 100.',
  'Más de la mitad: el objetivo de 100 está cerca. ¡Dale hasta el final!',
];

const MENSAJES_TERRENOS = [
  'Arrancá fuerte: cada adhesión de terreno suma. Meta: 30 para el 1%.',
  'Vas bien: ya superaste las 10. Seguís rumbo a las 30 adhesiones.',
  'Último tramo: faltan pocas para desbloquear el 1% de comisión.',
];

/**
 * @param {number} cantidad
 * @param {number} objetivo
 * @param {number} cada
 * @param {string[]} mensajes
 */
function buildProgreso(cantidad, objetivo, cada, mensajes) {
  const actual = Math.max(0, Number(cantidad) || 0);
  const meta = Math.max(1, Number(objetivo) || 1);
  const cumplido = actual >= meta;
  const faltan = cumplido ? 0 : Math.max(0, meta - actual);
  const pct = Math.min(100, Math.round((actual / meta) * 1000) / 10);
  const tramo = Math.min(mensajes.length - 1, Math.floor(actual / cada));
  const mensaje = cumplido
    ? '¡Objetivo cumplido! Comisión activada.'
    : mensajes[tramo] || mensajes[0];

  return {
    actual,
    objetivo: meta,
    cada,
    faltan,
    porcentaje: pct,
    cumplido,
    tramo: cumplido ? mensajes.length : tramo,
    mensaje,
  };
}

/**
 * @param {string} periodoPanel
 * @param {unknown[]} leadsDB
 * @param {{ idOperador?: number }} [opts]
 */
export async function buildInformeComisionesContable(periodoPanel, leadsDB, opts = {}) {
  const enriquecimiento = await buildEnriquecimientoInformeOperaciones(periodoPanel, leadsDB, opts);
  const yyyyMm = enriquecimiento.yyyyMm || periodoPanelAYyyyMm(periodoPanel);

  const cantidadPij = Number(enriquecimiento.pijExcelCantidad || 0);
  const cantidadTerrenos = Number(enriquecimiento.lotesSpCantidad || 0);
  const montoTerrenos = (enriquecimiento.lotesSp || []).reduce(
    (acc, f) => acc + Number(f.totalCobradoPeriodo || 0),
    0,
  );

  const progresoPij = buildProgreso(cantidadPij, OBJETIVO_PIJ, PROGRESO_PIJ_CADA, MENSAJES_PIJ);
  const progresoTerrenos = buildProgreso(
    cantidadTerrenos,
    OBJETIVO_TERRENOS,
    PROGRESO_TERRENOS_CADA,
    MENSAJES_TERRENOS,
  );

  const comisionPijBruta = cantidadPij * COMISION_PIJ_UNITARIO;
  const comisionTerrenosBruta = Math.round(montoTerrenos * COMISION_TERRENO_PCT);
  const comisionPij = progresoPij.cumplido ? comisionPijBruta : 0;
  const comisionTerrenos = progresoTerrenos.cumplido ? comisionTerrenosBruta : 0;
  const totalComision = comisionPij + comisionTerrenos;
  const salarioFijo = SALARIO_FIJO_MENSUAL;
  const totalALiquidar = totalComision + salarioFijo;

  let periodoSp = null;
  if (yyyyMm) {
    try {
      periodoSp = await resolverPeriodoPorYyyyMm(yyyyMm);
    } catch {
      periodoSp = null;
    }
  }

  return {
    generadoEn: new Date().toISOString(),
    destinatario: 'Departamento Contable — Mi Primer Casa',
    periodoPanel: String(periodoPanel || ''),
    yyyyMm,
    idEjercicioDetalle:
      enriquecimiento.idEjercicioDetalle ?? periodoSp?.idEjercicioDetalle ?? null,
    periodoCodigo: enriquecimiento.periodoCodigo ?? periodoSp?.codigo ?? null,
    reglas: {
      pijUnitario: COMISION_PIJ_UNITARIO,
      terrenoPorcentaje: COMISION_TERRENO_PCT,
      salarioFijo: SALARIO_FIJO_MENSUAL,
      objetivoPij: OBJETIVO_PIJ,
      objetivoTerrenos: OBJETIVO_TERRENOS,
      descripcionPij: `$${COMISION_PIJ_UNITARIO.toLocaleString('es-AR')} por cada PIJ, solo si se alcanzan ${OBJETIVO_PIJ} adhesiones`,
      descripcionTerreno: `${(COMISION_TERRENO_PCT * 100).toFixed(0)}% del recaudado en adhesiones de terrenos, solo si se alcanzan ${OBJETIVO_TERRENOS}`,
      descripcionSalario: `Salario fijo mensual $${SALARIO_FIJO_MENSUAL.toLocaleString('es-AR')}`,
    },
    pij: {
      cantidad: cantidadPij,
      unitario: COMISION_PIJ_UNITARIO,
      comision: comisionPij,
      comisionBruta: comisionPijBruta,
      objetivoCumplido: progresoPij.cumplido,
      progreso: progresoPij,
      porVendedor: enriquecimiento.pijExcelPorVendedor || enriquecimiento.pijPorVendedor || [],
    },
    terrenos: {
      cantidad: cantidadTerrenos,
      montoRecaudado: montoTerrenos,
      porcentaje: COMISION_TERRENO_PCT,
      comision: comisionTerrenos,
      comisionBruta: comisionTerrenosBruta,
      objetivoCumplido: progresoTerrenos.cumplido,
      progreso: progresoTerrenos,
      porVendedor: enriquecimiento.lotesPorVendedor || [],
      filas: enriquecimiento.lotesSp || [],
    },
    salarioFijo,
    totalComision,
    /** Comisiones + salario fijo. */
    totalALiquidar,
    excelError: enriquecimiento.excelError || null,
    error: enriquecimiento.error || null,
    aplicable: enriquecimiento.aplicable,
  };
}
