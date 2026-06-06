import sql from 'mssql';
import { buildAdminDashboard, parseFecha, rangoSemanaMovil, startOfDay } from '../domain/admin-metrics.js';
import { listAllLeadsFromEncuestas, normalizeNombre } from './encuestas.js';
import { getSqlPoolEncuestas } from './mssql.js';
import { adminSupervisorOperadorIds } from './superadmin-auth.js';
import {
  fetchUltimosSeguimientoPorOperadores,
  useSeguimientoSql,
} from './seguimiento-sql.js';

function getEncuestasAdminProcedureName() {
  const raw = process.env.SP_ENCUESTAS_ADMIN || 'encuestasMuestra';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function supervisorIdDesdeLead(lead) {
  if (lead.idSupervisor != null && String(lead.idSupervisor).trim() !== '') {
    return String(lead.idSupervisor);
  }
  return normalizeNombre(lead.supervisorNombre ?? 'Sin supervisor') || 'sin-supervisor';
}

async function fetchHistorialDesde(desde) {
  if (!useSeguimientoSql()) return [];

  const table = String(process.env.SEGUIMIENTO_TABLE || 'registrarSeguimientoLead').replace(
    /[\[\]]/g,
    '',
  );

  try {
    const pool = await getSqlPoolEncuestas();
    const request = pool.request().input('desde', sql.DateTime2, desde);
    let rows;
    try {
      const result = await request.query(`
        SELECT *
        FROM ${table}
        WHERE creado_en >= @desde
      `);
      rows = result.recordset ?? [];
    } catch (colError) {
      const msg = colError instanceof Error ? colError.message : String(colError);
      if (!/Invalid column name/i.test(msg)) throw colError;
      // Tabla sin creado_en: traer recientes por id y filtrar en Node si hay fecha parseable
      const result = await pool.request().query(`
        SELECT TOP 50000 *
        FROM ${table}
        ORDER BY id DESC
      `);
      rows = (result.recordset ?? []).filter((row) => {
        const fecha = parseFecha(row.creado_en ?? row.creadoEn);
        return fecha ? fecha.getTime() >= desde.getTime() : true;
      });
    }
    return rows;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/permission|denied/i.test(msg) && useSeguimientoSql()) {
      const operadores = adminSupervisorOperadorIds();
      if (operadores.length) {
        const ultimos = await fetchUltimosSeguimientoPorOperadores(operadores);
        return ultimos.filter((row) => {
          const fecha = parseFecha(row.creado_en ?? row.creadoEn);
          return fecha ? fecha.getTime() >= desde.getTime() : true;
        });
      }
      console.warn(
        '[admin] Historial: SELECT denegado y ADMIN_SUPERVISOR_IDS vacío — KPIs de entrevistas/cierres en 0.',
      );
    } else {
      console.warn('[admin] Historial no disponible:', msg);
    }
    return [];
  }
}

/** Historial extendido (~13 meses) para gráficos semana/mes/año. */
function rangoHistorialGraficos(hoy = new Date()) {
  const desde = startOfDay(hoy);
  desde.setDate(desde.getDate() - 400);
  return desde;
}

function dashboardVacio(aviso) {
  const { desde, hasta, hoy } = rangoSemanaMovil();
  return {
    generadoEn: new Date().toISOString(),
    semanaDesde: desde.toISOString(),
    semanaHasta: hasta.toISOString(),
    hoy: hoy.toISOString(),
    supervisores: [],
    resumenHoy: { entrevistas: 0, cierres: 0, ventasTerreno: 0, ventasPij: 0 },
    rankings: {
      entrevistasSemana: [],
      cierresSemana: [],
      leadsSemana: [],
      ventasTerrenoSemana: [],
      ventasPijSemana: [],
    },
    eventos: [],
    conocimientoLeads: {
      total: 0,
      conoceMpc: { si: 0, no: 0, sinResponder: 0 },
      sabiaPlanInversionJoven: { si: 0, no: 0, sinResponder: 0 },
    },
    productividad: {
      embudoGlobal: {
        leads: 0,
        conEntrevista: 0,
        conCierre: 0,
        tasaEntrevistaPct: null,
        tasaCierreEntrevistaPct: null,
        tasaCierreLeadPct: null,
      },
      embudoPromotores: [],
      resultadosEntrevista: {
        compro: 0,
        no_compro: 0,
        reagenda: 0,
        sin_interes: 0,
        derivar_terreno: 0,
        pendiente: 0,
      },
      canales: [],
      backlog: { sinGestion7: 0, sinGestion14: 0, sinGestion30: 0 },
      tiempoPrimeraEntrevista: { promedioDias: null, medianaDias: null, muestras: 0 },
      conocimientoVsCierre: [],
      pijRecuperacion: { totalSeguimiento: 0, conCierre: 0, tasaRecuperacionPct: null },
      referidos: { cierresConReferidos: 0, totalReferidos: 0 },
    },
    aviso,
  };
}

/**
 * Dashboard global: exec encuestasMuestra → agrupa por supervisor → métricas semana + hoy.
 */
export async function fetchAdminDashboard() {
  const proc = getEncuestasAdminProcedureName();
  let leads = [];

  try {
    leads = await listAllLeadsFromEncuestas();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[admin] ${proc}:`, msg);
    return dashboardVacio(
      `No se pudo ejecutar ${proc}. Verificá GRANT EXECUTE en STRSYSTEM (sql/grants-mpcsp-leads.sql). Detalle: ${msg}`,
    );
  }

  if (!leads.length) {
    return dashboardVacio(`El SP ${proc} no devolvió encuestas.`);
  }

  const leadsConSupervisor = leads.map((lead) => ({
    lead,
    supervisorId: supervisorIdDesdeLead(lead),
    supervisorNombre: lead.supervisorNombre ?? 'Sin supervisor',
  }));

  const historialDesde = rangoHistorialGraficos();
  const historialRows = await fetchHistorialDesde(historialDesde);
  const dashboard = buildAdminDashboard(leadsConSupervisor, historialRows);

  const supervisorIds = new Set(leadsConSupervisor.map((item) => item.supervisorId));

  return {
    ...dashboard,
    totalLeads: leads.length,
    totalSupervisores: supervisorIds.size,
    source: proc,
  };
}

/** Agrupa leads demo por supervisorNombre para buildAdminDashboard. */
export function buildAdminDashboardFromLeads(leads, historialRows = []) {
  const leadsConSupervisor = leads.map((lead) => ({
    lead,
    supervisorId: supervisorIdDesdeLead(lead),
    supervisorNombre: lead.supervisorNombre ?? 'Sin supervisor',
  }));

  return buildAdminDashboard(leadsConSupervisor, historialRows);
}
