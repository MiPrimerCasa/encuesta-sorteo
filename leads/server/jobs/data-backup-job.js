import { execFile } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/sqlite.js';
import { getSchedulerMeta, setSchedulerMeta } from '../db/links-acortados-store.js';
import { isSqlServerConfigured } from '../db/mssql.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const backupsDir = path.join(dataDir, 'backups');

const META_LAST_DATA_BACKUP = 'data_local_backup_last_run';

let backupTimer = null;
let isRunning = false;

function isDataBackupEnabled() {
  const raw = String(process.env.DATA_BACKUP_ENABLED ?? 'true').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
}

function maxBackupFiles() {
  const n = Number.parseInt(process.env.DATA_BACKUP_MAX_FILES || '14', 10);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function getLocalDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function backupSqliteConsistente(destPath) {
  const db = getDb();
  // better-sqlite3 v12+: backup() devuelve Promise (copia consistente incl. WAL)
  await db.backup(destPath);
}

function rotarBackupsData() {
  if (!existsSync(backupsDir)) return;

  const files = readdirSync(backupsDir)
    .filter((f) => f.startsWith('data-local-') && f.endsWith('.tar.gz'))
    .map((f) => ({
      name: f,
      path: path.join(backupsDir, f),
      time: statSync(path.join(backupsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  const limit = maxBackupFiles();
  if (files.length <= limit) return;

  const toDelete = files.slice(limit);
  console.log(`[data-backup] Rotación: eliminando ${toDelete.length} backup(s) antiguo(s).`);
  for (const f of toDelete) {
    try {
      unlinkSync(f.path);
      console.log(`[data-backup] Eliminado: ${f.name}`);
    } catch (e) {
      console.error(`[data-backup] No se pudo borrar ${f.name}:`, e.message);
    }
  }
}

export async function ejecutarDataBackup() {
  if (!isDataBackupEnabled()) {
    return { ok: false, skipped: true, reason: 'deshabilitado' };
  }

  if (isRunning) {
    console.warn('[data-backup] Tarea omitida: ya hay un backup en curso.');
    return { ok: false, skipped: true, reason: 'en_curso' };
  }

  isRunning = true;
  const today = getLocalDateString();
  const fileName = `data-local-${today}.tar.gz`;
  const archivePath = path.join(backupsDir, fileName);
  const stagingDir = path.join(backupsDir, `.staging-${today}-${Date.now()}`);

  console.log('[data-backup] Iniciando backup de data/ (SQLite + grabaciones)...');

  try {
    mkdirSync(backupsDir, { recursive: true });

    if (existsSync(archivePath)) {
      console.log(`[data-backup] Ya existe ${fileName} — omitiendo.`);
      setSchedulerMeta(META_LAST_DATA_BACKUP, today);
      return { ok: true, skipped: true, file: fileName };
    }

    mkdirSync(stagingDir, { recursive: true });

    const dbDest = path.join(stagingDir, 'app-cache.db');
    await backupSqliteConsistente(dbDest);
    console.log('[data-backup] SQLite respaldado de forma consistente.');

    const grabSrc = path.join(dataDir, 'grabaciones');
    if (existsSync(grabSrc)) {
      cpSync(grabSrc, path.join(stagingDir, 'grabaciones'), { recursive: true });
      console.log('[data-backup] Carpeta grabaciones/ incluida.');
    }

    await execFileAsync('tar', ['-czf', archivePath, '-C', stagingDir, '.'], {
      maxBuffer: 64 * 1024 * 1024,
    });

    const sizeMb = (statSync(archivePath).size / (1024 * 1024)).toFixed(2);
    console.log(`[data-backup] Archivo creado: ${archivePath} (${sizeMb} MB)`);

    setSchedulerMeta(META_LAST_DATA_BACKUP, today);
    rotarBackupsData();

    return { ok: true, file: fileName, sizeMb: Number(sizeMb) };
  } catch (error) {
    console.error(
      '[data-backup] Error:',
      error instanceof Error ? error.message : error,
    );
    if (existsSync(archivePath)) {
      try {
        unlinkSync(archivePath);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (existsSync(stagingDir)) {
      try {
        rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    isRunning = false;
  }
}

async function verificarYEjecutarBackup() {
  if (!isDataBackupEnabled()) return;

  try {
    const today = getLocalDateString();
    const lastRun = getSchedulerMeta(META_LAST_DATA_BACKUP);

    if (lastRun !== today) {
      console.log(`[data-backup] Ejecutando backup diario (${today}).`);
      await ejecutarDataBackup();
    }
  } catch (e) {
    console.error(
      '[data-backup] Error al verificar estado:',
      e instanceof Error ? e.message : e,
    );
  }
}

export function startDataBackupScheduler() {
  if (!isSqlServerConfigured()) {
    console.log('[data-backup] Deshabilitado: sin SQL Server.');
    return;
  }

  if (!isDataBackupEnabled()) {
    console.log('[data-backup] Deshabilitado (DATA_BACKUP_ENABLED=false).');
    return;
  }

  const startupDelay = Math.max(
    45_000,
    Number(process.env.DATA_BACKUP_STARTUP_DELAY_MS || 180_000),
  );
  const intervalCheck = Math.max(
    60 * 60 * 1000,
    Number(process.env.DATA_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000),
  );

  console.log(
    `[data-backup] Scheduler activo — retención ${maxBackupFiles()} archivos, primera verificación en ${Math.round(startupDelay / 1000)}s.`,
  );

  setTimeout(async () => {
    await verificarYEjecutarBackup();
    if (backupTimer) clearInterval(backupTimer);
    backupTimer = setInterval(async () => {
      await verificarYEjecutarBackup();
    }, intervalCheck);
  }, startupDelay);
}

export function stopDataBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
}
