import { buildAdminDashboard, rangoPorPeriodo } from '../domain/admin-metrics.js';
import { normalizeNombre } from './encuestas.js';
import { getAdminDashboardRawData } from './admin-dashboard-cache.js';

function supervisorIdDesdeLead(lead) {
  if (lead.idSupervisor != null && String(lead.idSupervisor).trim() !== '') {
    return String(lead.idSupervisor);
  }
  return normalizeNombre(lead.supervisorNombre ?? 'Sin supervisor') || 'sin-supervisor';
}

function dashboardVacio(aviso, periodo = 'mes') {
  const { desde, hasta, hoy } = rangoPorPeriodo(periodo);
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
    pijCierresPorPersona: [],
    leadsSinTratar: [],
    aviso,
  };
}


/**
 * Dashboard global: encuestasMuestra + historial (cacheados) → métricas por período.
 * @param {string} periodo
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function fetchAdminDashboard(periodo = 'mes', opts = {}) {
  let raw;
  try {
    raw = await getAdminDashboardRawData({ forceRefresh: Boolean(opts.forceRefresh) });
  } catch (error) {
    const proc = process.env.SP_ENCUESTAS_ADMIN || 'encuestasMuestra';
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[admin] ${proc}:`, msg);
    return dashboardVacio(
      `No se pudo ejecutar ${proc}. Verificá GRANT EXECUTE en STRSYSTEM (sql/grants-mpcsp-leads.sql). Detalle: ${msg}`,
      periodo,
    );
  }

  const { leads, leadsConSupervisor, historialRows, source, cacheHit } = raw;

  if (!leads.length) {
    return dashboardVacio(`El SP ${source} no devolvió encuestas.`, periodo);
  }

  const t0 = Date.now();
  const dashboard = buildAdminDashboard(leadsConSupervisor, historialRows, new Date(), periodo);
  const buildMs = Date.now() - t0;

  const supervisorIds = new Set(leadsConSupervisor.map((item) => item.supervisorId));

  if (buildMs > 200) {
    console.log(`[admin-cache] buildAdminDashboard(${periodo}) en ${buildMs} ms (cache ${cacheHit ? 'HIT' : 'MISS'})`);
  }

  return {
    ...dashboard,
    totalLeads: leads.length,
    totalSupervisores: supervisorIds.size,
    source,
    cacheHit: Boolean(cacheHit),
    datosCacheadosEn: raw.fetchedAt ? new Date(raw.fetchedAt).toISOString() : undefined,
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
