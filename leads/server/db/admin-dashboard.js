import sql from 'mssql';
import { buildAdminDashboard, rangoSemanaMovil, startOfDay } from '../domain/admin-metrics.js';
import {
  listLeadsFromEncuestas,
  normalizeNombre,
} from './encuestas.js';
import { getSqlPoolEncuestas, isSqlServerConfigured } from './mssql.js';
import { useSeguimientoSql } from './seguimiento-sql.js';

function parseSupervisorIdsEnv() {
  const raw = String(process.env.ADMIN_SUPERVISOR_IDS ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => {
      const [id, ...nombreParts] = part.split(':');
      const idTrim = String(id ?? '').trim();
      const nombre = nombreParts.join(':').trim();
      if (!idTrim) return null;
      return { id: idTrim, nombre: nombre || `Supervisor ${idTrim}` };
    })
    .filter(Boolean);
}

async function discoverSupervisoresFromEncuesta() {
  if (!isSqlServerConfigured()) return [];
  try {
    const pool = await getSqlPoolEncuestas();
    const result = await pool.request().query(`
      SELECT DISTINCT
        CAST(idSupervisor AS INT) AS idSupervisor,
        LTRIM(RTRIM(supervisor)) AS supervisor
      FROM encuesta
      WHERE idSupervisor IS NOT NULL
        AND supervisor IS NOT NULL
        AND LTRIM(RTRIM(supervisor)) <> ''
      ORDER BY supervisor
    `);
    return (result.recordset ?? []).map((row) => ({
      id: String(row.idSupervisor),
      nombre: String(row.supervisor).trim(),
    }));
  } catch (error) {
    console.warn(
      '[admin] No se pudo listar supervisores desde encuesta:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function resolveSupervisores() {
  const fromEnv = parseSupervisorIdsEnv();
  if (fromEnv.length) return fromEnv;
  const fromDb = await discoverSupervisoresFromEncuesta();
  if (fromDb.length) return fromDb;
  return [];
}

async function fetchHistorialDesde(desde) {
  if (!useSeguimientoSql()) return [];

  const table = String(process.env.SEGUIMIENTO_TABLE || 'registrarSeguimientoLead').replace(
    /[\[\]]/g,
    '',
  );

  try {
    const pool = await getSqlPoolEncuestas();
    const result = await pool
      .request()
      .input('desde', sql.DateTime2, desde)
      .query(`
        SELECT *
        FROM ${table}
        WHERE COALESCE(creado_en, fecha_registro, registrado_en) >= @desde
      `);
    return result.recordset ?? [];
  } catch (error) {
    console.warn(
      '[admin] Historial no disponible:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Historial extendido (~13 meses) para gráficos semana/mes/año. */
function rangoHistorialGraficos(hoy = new Date()) {
  const desde = startOfDay(hoy);
  desde.setDate(desde.getDate() - 400);
  return desde;
}

/**
 * Dashboard global: supervisores → promotores → métricas semana + hoy + rankings.
 */
export async function fetchAdminDashboard() {
  const supervisores = await resolveSupervisores();
  if (!supervisores.length) {
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
      aviso:
        'Configurá ADMIN_SUPERVISOR_IDS en .env (ej. 132:Norma M,145:Adela) o permiso SELECT DISTINCT en encuesta.',
    };
  }

  const leadsConSupervisor = [];

  for (const sup of supervisores) {
    const usuario = {
      id: sup.id,
      idOperador: sup.id,
      idVendedor: sup.id,
      nombre: sup.nombre,
      rol: 'supervisor',
    };

    let leads = [];
    try {
      leads = await listLeadsFromEncuestas(usuario);
    } catch (error) {
      console.warn(
        `[admin] Leads supervisor ${sup.id} (${sup.nombre}):`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    let nombreSup = sup.nombre;
    if (leads[0]?.supervisorNombre) {
      nombreSup = leads[0].supervisorNombre;
    }

    for (const lead of leads) {
      leadsConSupervisor.push({
        lead,
        supervisorId: sup.id,
        supervisorNombre: lead.supervisorNombre ?? nombreSup,
      });
    }
  }

  const historialDesde = rangoHistorialGraficos();
  const historialRows = await fetchHistorialDesde(historialDesde);
  const dashboard = buildAdminDashboard(leadsConSupervisor, historialRows);

  return {
    ...dashboard,
    totalLeads: leadsConSupervisor.length,
    totalSupervisores: supervisores.length,
  };
}

/** Agrupa leads demo por supervisorNombre para buildAdminDashboard. */
export function buildAdminDashboardFromLeads(leads, historialRows = []) {
  const supMap = new Map();
  for (const lead of leads) {
    const key = normalizeNombre(lead.supervisorNombre ?? 'Sin supervisor') || 'sin-supervisor';
    if (!supMap.has(key)) {
      supMap.set(key, {
        id: key,
        nombre: lead.supervisorNombre ?? 'Sin supervisor',
      });
    }
  }

  const leadsConSupervisor = leads.map((lead) => ({
    lead,
    supervisorId: normalizeNombre(lead.supervisorNombre ?? 'Sin supervisor') || 'sin-supervisor',
    supervisorNombre: lead.supervisorNombre ?? 'Sin supervisor',
  }));

  return buildAdminDashboard(leadsConSupervisor, historialRows);
}
