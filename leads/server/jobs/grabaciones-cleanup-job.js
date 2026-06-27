import { isGrabacionesEnabled, getGrabacionesRetentionDays } from '../config/grabaciones-config.js';
import { ejecutarLimpiezaGrabaciones } from '../db/grabaciones-store.js';
import { getSchedulerMeta, setSchedulerMeta } from '../db/links-acortados-store.js';

const META_LAST_CLEANUP = 'grabaciones_cleanup_last_run';

let cleanupTimer = null;
let isRunning = false;

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startupDelayMs() {
  return Math.max(30_000, Number(process.env.GRABACIONES_CLEANUP_STARTUP_DELAY_MS || 120_000));
}

function intervalCheckMs() {
  return Math.max(60 * 60 * 1000, Number(process.env.GRABACIONES_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000));
}

export async function ejecutarGrabacionesCleanup() {
  if (!isGrabacionesEnabled()) {
    return { ok: false, skipped: true, reason: 'modulo_deshabilitado' };
  }

  if (isRunning) {
    console.warn('[grabaciones-cleanup] Tarea omitida: ya hay una limpieza en curso.');
    return { ok: false, skipped: true, reason: 'en_curso' };
  }

  isRunning = true;
  const retentionDays = getGrabacionesRetentionDays();

  try {
    console.log(`[grabaciones-cleanup] Iniciando limpieza (retención ${retentionDays} días)…`);
    const result = ejecutarLimpiezaGrabaciones(retentionDays);
    setSchedulerMeta(META_LAST_CLEANUP, getLocalDateString());

    if (result.candidatas === 0) {
      console.log('[grabaciones-cleanup] Nada que eliminar.');
    } else {
      const mb = (result.bytesLiberados / (1024 * 1024)).toFixed(2);
      console.log(
        `[grabaciones-cleanup] Eliminados ${result.registrosEliminados} registro(s), ~${mb} MB liberados.`,
      );
    }

    return { ok: true, ...result };
  } catch (error) {
    console.error(
      '[grabaciones-cleanup] Error:',
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    isRunning = false;
  }
}

async function verificarYEjecutarCleanup() {
  if (!isGrabacionesEnabled()) return;

  try {
    const today = getLocalDateString();
    const lastRun = getSchedulerMeta(META_LAST_CLEANUP);

    if (lastRun !== today) {
      console.log(`[grabaciones-cleanup] Ejecutando limpieza diaria (${today}).`);
      await ejecutarGrabacionesCleanup();
    }
  } catch (e) {
    console.error(
      '[grabaciones-cleanup] Error al verificar estado:',
      e instanceof Error ? e.message : e,
    );
  }
}

export function startGrabacionesCleanupScheduler() {
  if (!isGrabacionesEnabled()) {
    console.log('[grabaciones-cleanup] Deshabilitado (GRABACIONES_ENABLED=false).');
    return;
  }

  const delay = startupDelayMs();
  const interval = intervalCheckMs();
  console.log(
    `[grabaciones-cleanup] Scheduler activo — retención ${getGrabacionesRetentionDays()} días, primera verificación en ${Math.round(delay / 1000)}s.`,
  );

  setTimeout(async () => {
    await verificarYEjecutarCleanup();
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = setInterval(async () => {
      await verificarYEjecutarCleanup();
    }, interval);
  }, delay);
}

export function stopGrabacionesCleanupScheduler() {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}
