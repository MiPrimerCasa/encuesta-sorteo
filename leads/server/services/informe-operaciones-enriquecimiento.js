/**
 * Enriquecimiento silencioso del Informe de Operaciones:
 * - PIJ del mes = cantidad Excel de adhesiones (ej. julio = 217)
 * - Lotes / Terrenos 100% desde SP_Informe_Cierre_Operadores
 */
import {
  periodoPanelAYyyyMm,
  resolverPeriodoPorYyyyMm,
  fetchInformeCierresOperadores,
} from '../db/informe-cierres.js';
import {
  buildExcelAdhesionesDelMes,
  buildFaltantesExcelVsCrmEnPeriodo,
  cajaSheetParaYyyyMm,
  CAJA_SHEETS,
} from './sync-caja.js';

function fechaEventoIso(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function midMonthIso(yyyyMm) {
  const [y, m] = String(yyyyMm).split('-');
  return `${y}-${m}-15`;
}

/**
 * @param {string} periodoPanel
 * @param {unknown[]} leadsDB
 * @param {{ idOperador?: number }} [opts]
 */
export async function buildEnriquecimientoInformeOperaciones(periodoPanel, leadsDB, opts = {}) {
  const yyyyMm = periodoPanelAYyyyMm(periodoPanel);
  const vacio = {
    aplicable: false,
    periodoPanel: String(periodoPanel || ''),
    yyyyMm: yyyyMm || null,
    idEjercicioDetalle: null,
    periodoCodigo: null,
    /** Total oficial PIJ del mes (Excel). */
    pijExcelCantidad: 0,
    pijExcelPorVendedor: [],
    pijExcelItems: [],
    pijFaltantesCantidad: 0,
    pijFaltantes: [],
    pijPorVendedor: [],
    pijEventos: [],
    lotesSpCantidad: 0,
    lotesSp: [],
    lotesPorVendedor: [],
    lotesEventos: [],
    excelError: null,
    error: null,
    meta: null,
  };

  if (!yyyyMm) {
    return { ...vacio, aplicable: false };
  }

  let periodoSp = null;
  try {
    periodoSp = await resolverPeriodoPorYyyyMm(yyyyMm);
  } catch (err) {
    return {
      ...vacio,
      aplicable: true,
      error: err instanceof Error ? err.message : 'No se pudo resolver el período SP',
    };
  }

  if (!periodoSp) {
    return {
      ...vacio,
      aplicable: true,
      error: `Sin período SP_periodo_selecciona para ${yyyyMm}`,
    };
  }

  const idOperador = opts.idOperador ?? Number(process.env.INFORME_CIERRE_ID_OPERADOR || 1);
  const sheet = cajaSheetParaYyyyMm(yyyyMm);
  const mesNombre = sheet
    ? Object.entries(CAJA_SHEETS).find(([, s]) => s.gid === sheet.gid)?.[0]
    : undefined;

  let excelMes = {
    adhesiones: [],
    porVendedor: [],
    cantidad: 0,
    excelError: sheet ? null : `No hay hoja Caja para ${yyyyMm}`,
    fuente: null,
  };
  let faltantesPeriodo = {
    faltantes: [],
    porVendedor: [],
    adhesionesExcel: 0,
    matchedEnPeriodo: 0,
    excelError: null,
    fuente: null,
  };

  try {
    excelMes = await buildExcelAdhesionesDelMes({
      yyyyMm,
      mes: mesNombre,
      sheetGids: sheet ? [sheet.gid] : undefined,
    });
  } catch (err) {
    excelMes.excelError =
      err instanceof Error ? err.message : 'Error al leer adhesiones Excel del mes';
  }

  try {
    if (excelMes.cantidad > 0) {
      faltantesPeriodo = await buildFaltantesExcelVsCrmEnPeriodo(leadsDB, {
        yyyyMm,
        mes: mesNombre,
        sheetGids: sheet ? [sheet.gid] : undefined,
      });
    }
  } catch (err) {
    faltantesPeriodo.excelError =
      err instanceof Error ? err.message : 'Error al cruzar Caja vs CRM del período';
  }

  const adhesiones = excelMes.adhesiones || [];
  const faltantes = faltantesPeriodo.faltantes || [];

  // Eventos de gráfico = todas las adhesiones Excel del mes (total = 217 en julio).
  const pijEventos = adhesiones.map((f) => ({
    fecha: fechaEventoIso(f.fechaIso || f.fechaExcel) || midMonthIso(yyyyMm),
    tipo: 'pij',
    supervisorNombre: null,
    vendedor: f.vendedorExcel || '',
    nombreCliente: f.nombreClienteExcel || '',
    recibo: f.reciboSugerido || '',
  }));

  let lotesSp = [];
  let lotesPorVendedor = [];
  let lotesSpCantidad = 0;
  let lotesEventos = [];
  let lotesError = null;

  try {
    const informe = await fetchInformeCierresOperadores({
      idOperador,
      idEjercicioDetalle: periodoSp.idEjercicioDetalle,
      idVendedor: 0,
    });
    lotesSp = (informe.terreno?.filas || []).map((f) => ({
      vendedor: f.vendedor || '',
      nombreCliente: f.nombreCliente || '',
      barrio: f.barrio || '',
      mz: f.mz || '',
      pc: f.pc || '',
      idLoteVenta: f.idLoteVenta || 0,
      fechaInicioCobranza: f.fechaInicioCobranza || null,
      totalCobradoPeriodo: f.totalCobradoPeriodo || 0,
      precioLote: f.precioLote || 0,
    }));
    lotesSpCantidad = lotesSp.length;
    lotesPorVendedor = (informe.terreno?.porVendedor || []).map((g) => ({
      vendedor: g.vendedor || '',
      cantidad: g.totales?.filas ?? g.cierres?.length ?? 0,
    }));
    lotesEventos = lotesSp.map((f) => ({
      fecha: fechaEventoIso(f.fechaInicioCobranza) || midMonthIso(yyyyMm),
      tipo: 'terreno',
      supervisorNombre: null,
      vendedor: f.vendedor || '',
      nombreCliente: f.nombreCliente || '',
    }));
  } catch (err) {
    lotesError = err instanceof Error ? err.message : 'Error al consultar SP de cierres';
  }

  return {
    aplicable: true,
    periodoPanel: String(periodoPanel || ''),
    yyyyMm,
    idEjercicioDetalle: periodoSp.idEjercicioDetalle,
    periodoCodigo: periodoSp.codigo,
    pijExcelCantidad: excelMes.cantidad || 0,
    pijExcelPorVendedor: (excelMes.porVendedor || []).map((g) => ({
      vendedor: g.vendedor,
      cantidad: g.cantidad,
      clientes: g.clientes || [],
    })),
    pijExcelItems: adhesiones.map((f) => ({
      nombreCliente: f.nombreClienteExcel || '',
      vendedor: f.vendedorExcel || '',
      recibo: f.reciboSugerido || '',
      fecha: f.fechaExcel || '',
      fechaIso: f.fechaIso || null,
    })),
    pijFaltantesCantidad: faltantes.length,
    pijFaltantes: faltantes.map((f) => ({
      nombreCliente: f.nombreClienteExcel || '',
      vendedor: f.vendedorExcel || '',
      recibo: f.reciboSugerido || '',
      fecha: f.fechaExcel || '',
      fechaIso: f.fechaIso || null,
    })),
    /** Alias: por vendedor Excel (misma fuente que el total oficial). */
    pijPorVendedor: (excelMes.porVendedor || []).map((g) => ({
      vendedor: g.vendedor,
      cantidad: g.cantidad,
      clientes: g.clientes || [],
    })),
    pijEventos,
    lotesSpCantidad,
    lotesSp,
    lotesPorVendedor,
    lotesEventos,
    excelError: excelMes.excelError || faltantesPeriodo.excelError || null,
    error: lotesError,
    meta: {
      adhesionesExcel: excelMes.cantidad || 0,
      matchedEnPeriodo: faltantesPeriodo.matchedEnPeriodo || 0,
      faltantesEnPeriodo: faltantes.length,
      fuenteExcel: excelMes.fuente || null,
    },
  };
}
