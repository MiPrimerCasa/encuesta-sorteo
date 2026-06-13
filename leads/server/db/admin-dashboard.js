import { buildAdminDashboard, rangoSemanaMovil, startOfDay } from '../domain/admin-metrics.js';
import { listAllLeadsFromEncuestas, normalizeNombre } from './encuestas.js';
import {
  fetchHistorialAdminDesde,
  fetchUltimosSeguimientoPorOperadores,
  useSeguimientoSql,
} from './seguimiento-sql.js';
import { adminSupervisorOperadorIds } from './superadmin-auth.js';

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

  let rows = await fetchHistorialAdminDesde(desde);
  if (rows.length) return rows;

  const operadores = adminSupervisorOperadorIds();
  if (operadores.length) {
    const ultimos = await fetchUltimosSeguimientoPorOperadores(operadores);
    return ultimos.filter((row) => {
      const fecha = row.creado_en ?? row.creadoEn;
      if (!fecha) return true;
      const t = new Date(fecha).getTime();
      return !Number.isNaN(t) && t >= desde.getTime();
    });
  }

  console.warn(
    '[admin] Sin historial SP — pedí al DBA SP_HistorialSeguimientoAdmin o configurá ADMIN_SUPERVISOR_IDS.',
  );
  return [];
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
        sin_tratar: 0,
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
