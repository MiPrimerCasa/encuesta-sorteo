/**
 * Informe de cierres — exec dbo.SP_Informe_Cierre_Operadores
 * Períodos — exec dbo.SP_periodo_selecciona
 * @idOperador, @idEjercicioDetalle, @idVendedor (0 = todos)
 */
import sql from 'mssql';
import { getSqlPool, isSqlServerConfigured } from './mssql.js';

function spInformeName() {
  const raw = process.env.SP_INFORME_CIERRE_OPERADORES || 'dbo.SP_Informe_Cierre_Operadores';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function spPeriodoName() {
  const raw = process.env.SP_PERIODO_SELECCIONA || 'dbo.SP_periodo_selecciona';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function pick(row, ...names) {
  if (!row) return null;
  for (const n of names) {
    if (row[n] != null && row[n] !== '') return row[n];
  }
  const keys = Object.keys(row);
  for (const n of names) {
    const found = keys.find((k) => k.toLowerCase() === String(n).toLowerCase());
    if (found != null && row[found] != null && row[found] !== '') return row[found];
  }
  return null;
}

function num(val) {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function str(val) {
  return String(val ?? '').trim();
}

function fechaIso(val) {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toISOString();
  const d = new Date(String(val));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapPeriodo(row) {
  return {
    idEjercicioDetalle: num(pick(row, 'idEjercicioDetalle')),
    idEjercicio: num(pick(row, 'idEjercicio')),
    codigo: str(pick(row, 'ejercicioDetalleCodigo')),
    descripcion: str(pick(row, 'ejercicioDetalleDescripcion')),
    fechaDesde: fechaIso(pick(row, 'ejercicioDetalleFechaDesde')),
    fechaHasta: fechaIso(pick(row, 'ejercicioDetalleFechaHasta')),
    activo: Boolean(pick(row, 'ejercicioDetalleEstado')),
  };
}

/** Lista de períodos para el selector del informe de cierres. */
export async function fetchPeriodosInformeCierres() {
  if (!isSqlServerConfigured()) {
    throw new Error('SQL Server no configurado');
  }
  const pool = await getSqlPool();
  const proc = spPeriodoName();
  const result = await pool.request().execute(proc);
  const periodos = (result.recordset ?? []).map(mapPeriodo);
  return {
    generadoEn: new Date().toISOString(),
    source: `dbo.${proc}`,
    periodos,
  };
}

/** Barrio del SP que identifica Plan Inversión Joven (el resto = adhesión lotes/terreno). */
function esBarrioPlanJoven(barrio) {
  return str(barrio)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim() === 'PLAN JOVEN';
}

function mapFila(row) {
  const barrio = str(pick(row, 'barrio'));
  const tipo = esBarrioPlanJoven(barrio) ? 'pij' : 'terreno';
  // El SP puede traer el cliente con distintos nombres de columna.
  let nombreCliente = str(
    pick(
      row,
      'CLIENTE',
      'Cliente',
      'cliente',
      'nombreCliente',
      'NombreCliente',
      'nombre_cliente',
      'Nombre Cliente',
      'nombre',
      'Nombre',
    ),
  );
  if (!nombreCliente && row) {
    const key = Object.keys(row).find(
      (k) => /cliente|nombre\s*cli/i.test(k) && !/vendedor|operador|barrio/i.test(k),
    );
    if (key) nombreCliente = str(row[key]);
  }
  return {
    orden: num(pick(row, 'orden')),
    idOperador: num(pick(row, 'idOperador')),
    vendedor: str(pick(row, 'vendedor')),
    nombreCliente,
    barrio,
    tipo,
    mz: str(pick(row, 'MZ', 'mz')),
    pc: str(pick(row, 'PC', 'pc')),
    idLoteVenta: num(pick(row, 'idLoteVenta')),
    reciboOperadorAsignado: num(pick(row, 'reciboOperadorAsignado')),
    precioLote: num(pick(row, 'precioLote')),
    montoPactadoAdhesion: num(pick(row, 'Monto Pactado adhesión', 'Monto Pactado adhesion')),
    fechaInicioCobranza: fechaIso(pick(row, 'Fecha inicio cobranza mes')),
    fechaFinCobranza: fechaIso(pick(row, 'Fecha fin cobranza mes')),
    fechaSenaPeriodoAnterior: fechaIso(
      pick(row, 'Fecha seña periodo anterior', 'Fecha sena periodo anterior'),
    ),
    senaRecuperada: num(pick(row, 'Seña recuperada', 'Sena recuperada')),
    cantidadRecibosPeriodo: num(pick(row, 'Cantidad Recibos Periodo')),
    montoCobradoEfectivo: num(pick(row, 'Monto cobrado efectivo periodo')),
    montoCobradoMep: num(pick(row, 'Monto cobrado MEP periodo')),
    totalCobradoPeriodo: num(pick(row, 'Total Cobrado periodo')),
    saldoAdhesion: num(pick(row, 'Saldo adhesion', 'Saldo adhesión')),
    adhesionCelebrada: num(
      pick(row, 'Adhesion celebrada en periodo', 'Adhesión celebrada en periodo'),
    ),
    adhesionCancelada: num(
      pick(row, 'Adhesion cancelada en periodo', 'Adhesión cancelada en periodo'),
    ),
    senaEnPeriodo: num(pick(row, 'Seña en periodo', 'Sena en periodo')),
    recibosEnPeriodo: str(pick(row, 'Recibos en periodo', 'recibosEnPeriodo')),
  };
}

function seccionDesdeFilas(filas) {
  return {
    totales: sumarTotales(filas),
    porVendedor: agruparPorVendedor(filas),
    filas,
  };
}

function sumarTotales(filas) {
  const t = {
    filas: filas.length,
    precioLote: 0,
    montoPactadoAdhesion: 0,
    senaRecuperada: 0,
    cantidadRecibosPeriodo: 0,
    montoCobradoEfectivo: 0,
    montoCobradoMep: 0,
    totalCobradoPeriodo: 0,
    saldoAdhesion: 0,
    adhesionCelebrada: 0,
    adhesionCancelada: 0,
    senaEnPeriodo: 0,
  };
  for (const f of filas) {
    t.precioLote += f.precioLote;
    t.montoPactadoAdhesion += f.montoPactadoAdhesion;
    t.senaRecuperada += f.senaRecuperada;
    t.cantidadRecibosPeriodo += f.cantidadRecibosPeriodo;
    t.montoCobradoEfectivo += f.montoCobradoEfectivo;
    t.montoCobradoMep += f.montoCobradoMep;
    t.totalCobradoPeriodo += f.totalCobradoPeriodo;
    t.saldoAdhesion += f.saldoAdhesion;
    t.adhesionCelebrada += f.adhesionCelebrada;
    t.adhesionCancelada += f.adhesionCancelada;
    t.senaEnPeriodo += f.senaEnPeriodo;
  }
  return t;
}

function agruparPorVendedor(filas) {
  const map = new Map();
  for (const f of filas) {
    const key = f.vendedor || 'Sin vendedor';
    if (!map.has(key)) {
      map.set(key, {
        vendedor: key,
        idOperador: f.idOperador,
        filas: [],
      });
    }
    map.get(key).filas.push(f);
  }
  return [...map.values()]
    .map((g) => ({
      vendedor: g.vendedor,
      idOperador: g.idOperador,
      totales: sumarTotales(g.filas),
      cierres: g.filas,
    }))
    .sort((a, b) => a.vendedor.localeCompare(b.vendedor, 'es'));
}

/**
 * @param {{ idOperador?: number, idEjercicioDetalle?: number, idVendedor?: number }} params
 */
export async function fetchInformeCierresOperadores(params = {}) {
  if (!isSqlServerConfigured()) {
    throw new Error('SQL Server no configurado');
  }

  const idOperador = Number.isFinite(Number(params.idOperador))
    ? Number(params.idOperador)
    : Number(process.env.INFORME_CIERRE_ID_OPERADOR || 1);
  const idEjercicioDetalle = Number.isFinite(Number(params.idEjercicioDetalle))
    ? Number(params.idEjercicioDetalle)
    : Number(process.env.INFORME_CIERRE_ID_EJERCICIO || 86);
  const idVendedor = Number.isFinite(Number(params.idVendedor))
    ? Number(params.idVendedor)
    : Number(process.env.INFORME_CIERRE_ID_VENDEDOR || 0);

  const pool = await getSqlPool();
  const proc = spInformeName();
  const result = await pool
    .request()
    .input('idOperador', sql.Int, idOperador)
    .input('idEjercicioDetalle', sql.Int, idEjercicioDetalle)
    .input('idVendedor', sql.Int, idVendedor)
    .execute(proc);

  const filas = (result.recordset ?? []).map(mapFila);
  const filasPij = filas.filter((f) => f.tipo === 'pij');
  const filasTerreno = filas.filter((f) => f.tipo !== 'pij');

  /** Cantidad de adhesiones del Excel de Caja del mes (× $33.000 = recaudado adhesiones). */
  let excel = {
    fuente: null,
    cantidad: 0,
    totalRecaudado: 0,
    montoUnitario: 33000,
    error: null,
  };
  try {
    const { fetchCajaData, CAJA_SHEETS, esFilaAdhesionCaja } = await import(
      '../services/sync-caja.js'
    );
    const periodos = await fetchPeriodosInformeCierres();
    const periodo = (periodos.periodos || []).find(
      (p) => Number(p.idEjercicioDetalle) === Number(idEjercicioDetalle),
    );
    const codigo = String(periodo?.codigo || periodo?.descripcion || '').toLowerCase();
    let gid = CAJA_SHEETS.julio.gid;
    let label = CAJA_SHEETS.julio.label;
    if (codigo.includes('junio')) {
      gid = CAJA_SHEETS.junio.gid;
      label = CAJA_SHEETS.junio.label;
    } else if (codigo.includes('julio')) {
      gid = CAJA_SHEETS.julio.gid;
      label = CAJA_SHEETS.julio.label;
    } else if (periodo?.fechaDesde) {
      const m = new Date(periodo.fechaDesde).getUTCMonth() + 1;
      if (m === 6) {
        gid = CAJA_SHEETS.junio.gid;
        label = CAJA_SHEETS.junio.label;
      }
    }
    const rows = await fetchCajaData({ sheetGids: [gid] });
    const adhesiones = rows.filter(esFilaAdhesionCaja);
    const MONTO_ADHESION = 33000;
    excel = {
      fuente: label,
      cantidad: adhesiones.length,
      totalRecaudado: adhesiones.length * MONTO_ADHESION,
      montoUnitario: MONTO_ADHESION,
      error: null,
      periodoCodigo: periodo?.descripcion || periodo?.codigo || null,
    };
  } catch (err) {
    excel = {
      ...excel,
      error: err instanceof Error ? err.message : 'No se pudo leer Excel de Caja',
    };
  }

  const terrenoSeccion = seccionDesdeFilas(filasTerreno);
  return {
    generadoEn: new Date().toISOString(),
    source: `dbo.${proc}`,
    params: { idOperador, idEjercicioDetalle, idVendedor },
    totales: sumarTotales(filas),
    porVendedor: agruparPorVendedor(filas),
    filas,
    /** Plan Joven = barrio "PLAN JOVEN"; lotes = cualquier otro barrio. */
    pij: seccionDesdeFilas(filasPij),
    terreno: terrenoSeccion,
    /** Resumen Excel Caja (adhesiones PIJ) + lotes del SP. */
    excel,
    resumenPanel: {
      adhesionesExcelCantidad: excel.cantidad,
      adhesionesExcelTotal: excel.totalRecaudado,
      adhesionesExcelMontoUnitario: excel.montoUnitario,
      adhesionesExcelFuente: excel.fuente,
      lotesCantidad: terrenoSeccion.totales.filas,
      lotesMontoTotal: terrenoSeccion.totales.totalCobradoPeriodo,
    },
  };
}
