import { isLinksAcortadorEnabled } from '../db/links-acortador.js';
import { isSqlServerConfigured } from '../db/mssql.js';
import {
  ejecutarBootstrapLinksInstagram,
  ejecutarVerificacionSemanalCompleta,
  getSchedulerMeta,
  setSchedulerMeta,
} from '../db/links-acortados-store.js';

const META_LAST_WEEKLY = 'links_instagram_weekly_last_run';
const META_LAST_BOOTSTRAP = 'links_instagram_bootstrap_last_run';

let weeklyTimer = null;
let jobRunning = false;

function isJobEnabled() {
  if (!isLinksAcortadorEnabled()) return false;
  const flag = String(process.env.LINKS_JOB_ENABLED ?? 'false').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  return isSqlServerConfigured();
}

function intervalDays() {
  return Math.max(1, Number(process.env.LINKS_JOB_INTERVAL_DAYS || 7));
}

function startupDelayMs() {
  return Math.max(5_000, Number(process.env.LINKS_JOB_STARTUP_DELAY_MS || 60_000));
}

function intervalMs() {
  return intervalDays() * 24 * 60 * 60 * 1000;
}

function msUntilNextWeeklyRun() {
  const last = getSchedulerMeta(META_LAST_WEEKLY);
  if (!last) return 0;

  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return 0;

  const elapsed = Date.now() - lastMs;
  return Math.max(0, intervalMs() - elapsed);
}

function formatHoras(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

async function runGuarded(nombre, fn) {
  if (jobRunning) {
    console.warn(`[links-job] ${nombre} omitido: ya hay una tarea en curso.`);
    return null;
  }

  jobRunning = true;
  try {
    console.log(`[links-job] Iniciando ${nombre}…`);
    const res = await fn();
    return res;
  } catch (error) {
    console.error(
      `[links-job] ${nombre} error:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    jobRunning = false;
  }
}

async function runBootstrap() {
  const res = await runGuarded('bootstrap (sincronizar + acortar pendientes)', async () =>
    ejecutarBootstrapLinksInstagram(),
  );
  if (res) {
    setSchedulerMeta(META_LAST_BOOTSTRAP, new Date().toISOString());
    console.log(
      `[links-job] Bootstrap: ${res.ok}/${res.procesados} acortados OK (${res.sincronizados} filas catálogo).`,
    );
  }
  return res;
}

async function runWeeklyVerification() {
  const res = await runGuarded('verificación semanal Instagram', async () =>
    ejecutarVerificacionSemanalCompleta(),
  );
  if (res) {
    setSchedulerMeta(META_LAST_WEEKLY, new Date().toISOString());
    console.log(
      `[links-job] Verificación: ${res.ok}/${res.revisados} OK, ${res.regenerados} regenerados, ${res.rotos} con error.`,
    );
  }
  return res;
}

function scheduleNextWeekly() {
  const delay = msUntilNextWeeklyRun() || intervalMs();

  if (weeklyTimer) clearTimeout(weeklyTimer);

  weeklyTimer = setTimeout(async () => {
    await runWeeklyVerification();
    scheduleNextWeekly();
  }, delay);

  console.log(
    `[links-job] Próxima verificación en ${formatHoras(delay)} (intervalo ${intervalDays()} días).`,
  );
}

/**
 * Programador automático: al arrancar sincroniza y acorta pendientes;
 * cada N días verifica todos los Instagram y regenera los caídos.
 */
export function startLinksInstagramScheduler() {
  if (!isJobEnabled()) {
    console.log('[links-job] Deshabilitado (LINKS_JOB_ENABLED o sin SQL).');
    return;
  }

  console.log(
    `[links-job] Activo — bootstrap tras ${formatHoras(startupDelayMs())}, verificación cada ${intervalDays()} días.`,
  );

  setTimeout(async () => {
    await runBootstrap();

    const lastWeekly = getSchedulerMeta(META_LAST_WEEKLY);
    if (!lastWeekly) {
      console.log('[links-job] Primera verificación completa (nunca ejecutada).');
      await runWeeklyVerification();
    }

    scheduleNextWeekly();
  }, startupDelayMs());
}

export function stopLinksInstagramScheduler() {
  if (weeklyTimer) clearTimeout(weeklyTimer);
  weeklyTimer = null;
}
