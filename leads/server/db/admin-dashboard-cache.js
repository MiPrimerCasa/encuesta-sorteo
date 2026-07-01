import { startOfDay } from '../domain/admin-metrics.js';
import { listAllLeadsFromEncuestas, normalizeNombre } from './encuestas.js';
import {
  fetchHistorialAdminDesde,
  fetchUltimosSeguimientoPorOperadores,
  useSeguimientoSql,
} from './seguimiento-sql.js';
import { adminSupervisorOperadorIds } from './superadmin-auth.js';
import { isSqlServerConfigured } from './mssql.js';

const TTL_MS = Math.max(
  15_000,
  Number.parseInt(process.env.ADMIN_DASHBOARD_CACHE_TTL_MS || '120000', 10) || 120_000,
);

/** @type {{ leads: object[], leadsConSupervisor: object[], historialRows: object[], fetchedAt: number, source: string } | null} */
let cache = null;
/** @type {Promise<NonNullable<typeof cache>> | null} */
let loadPromise = null;

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

function isFresh(entry) {
  return Boolean(entry && Date.now() - entry.fetchedAt < TTL_MS);
}

function getEncuestasAdminProcedureName() {
  const raw = process.env.SP_ENCUESTAS_ADMIN || 'encuestasMuestra';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

async function loadRawData() {
  const t0 = Date.now();
  const historialDesde = rangoHistorialGraficos();
  const proc = getEncuestasAdminProcedureName();

  const [leads, historialRows] = await Promise.all([
    listAllLeadsFromEncuestas({ incluirReferidos: false }),
    fetchHistorialDesde(historialDesde),
  ]);

  const leadsConSupervisor = leads.map((lead) => ({
    lead,
    supervisorId: supervisorIdDesdeLead(lead),
    supervisorNombre: lead.supervisorNombre ?? 'Sin supervisor',
  }));

  const entry = {
    leads,
    leadsConSupervisor,
    historialRows,
    fetchedAt: Date.now(),
    source: proc,
  };

  console.log(
    `[admin-cache] Cargado en ${Date.now() - t0} ms — ${leads.length} leads, ${historialRows.length} filas historial (TTL ${TTL_MS / 1000}s)`,
  );

  return entry;
}

export function invalidateAdminDashboardCache() {
  cache = null;
  loadPromise = null;
}

/**
 * Datos crudos del panel admin (leads + historial). Se reutilizan para distintos períodos.
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getAdminDashboardRawData(opts = {}) {
  const forceRefresh = Boolean(opts.forceRefresh);

  if (!forceRefresh && isFresh(cache)) {
    return { ...cache, cacheHit: true };
  }

  if (!forceRefresh && loadPromise) {
    const pending = await loadPromise;
    return { ...pending, cacheHit: true };
  }

  loadPromise = loadRawData()
    .then((entry) => {
      cache = entry;
      return entry;
    })
    .finally(() => {
      loadPromise = null;
    });

  const entry = await loadPromise;
  return { ...entry, cacheHit: false };
}

/** Precarga en background al arrancar la API (no bloquea el listen). */
export function warmAdminDashboardCache() {
  if (!isSqlServerConfigured()) return Promise.resolve(null);
  return getAdminDashboardRawData().catch((err) => {
    console.warn(
      '[admin-cache] Precarga fallida:',
      err instanceof Error ? err.message : err,
    );
    return null;
  });
}
