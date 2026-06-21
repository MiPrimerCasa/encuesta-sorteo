import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAllLeadsFromEncuestas } from '../db/encuestas.js';
import { getSchedulerMeta, setSchedulerMeta } from '../db/links-acortados-store.js';
import { isSqlServerConfigured } from '../db/mssql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const backupsDir = path.join(dataDir, 'backups');

const META_LAST_BACKUP = 'leads_backup_last_run';
const MAX_BACKUP_FILES = 30;
const LIMIT_LEADS = 1000;

let backupTimer = null;
let isRunning = false;

/**
 * Obtener la fecha actual en formato AAAA-MM-DD local
 */
function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Ejecutar la tarea de backup de leads
 */
export async function ejecutarLeadsBackup() {
  if (isRunning) {
    console.warn('[backup-job] Tarea omitida: ya hay un backup ejecutándose.');
    return null;
  }

  isRunning = true;
  console.log('[backup-job] Iniciando backup diario de leads...');

  try {
    // 1. Obtener todos los leads vía SP global encuestasMuestra + enriquecimientos
    const allLeads = await listAllLeadsFromEncuestas();
    console.log(`[backup-job] Leads obtenidos de base de datos central: ${allLeads.length}`);

    // 2. Ordenar por ID numérico descendente (los más recientes primero)
    // El id puede ser numérico o string, lo parseamos a entero para la comparación.
    const sortedLeads = [...allLeads].sort((a, b) => {
      const idA = parseInt(String(a.id), 10) || 0;
      const idB = parseInt(String(b.id), 10) || 0;
      return idB - idA;
    });

    // 3. Quedarse con los últimos 1000 leads
    const targetLeads = sortedLeads.slice(0, LIMIT_LEADS);
    console.log(`[backup-job] Filtrados los últimos ${targetLeads.length} leads más recientes.`);

    // 4. Crear carpeta de backups si no existe
    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
    }

    // 5. Escribir el archivo JSON
    const today = getLocalDateString();
    const fileName = `leads-backup-${today}.json`;
    const filePath = path.join(backupsDir, fileName);

    writeFileSync(filePath, JSON.stringify(targetLeads, null, 2), 'utf-8');
    console.log(`[backup-job] Backup guardado con éxito en: ${filePath}`);

    // 6. Rotación de archivos antiguos (mantener un máximo de MAX_BACKUP_FILES)
    rotarBackupsAntiguos();

    // 7. Guardar metadatos en SQLite local indicando fecha de última ejecución
    setSchedulerMeta(META_LAST_BACKUP, today);

    return { ok: true, file: fileName, count: targetLeads.length };
  } catch (error) {
    console.error(
      '[backup-job] Error durante el backup:',
      error instanceof Error ? error.message : error
    );
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    isRunning = false;
  }
}

/**
 * Elimina los archivos de backup más antiguos para mantener sólo el límite configurado
 */
function rotarBackupsAntiguos() {
  try {
    if (!existsSync(backupsDir)) return;

    const files = readdirSync(backupsDir)
      .filter(f => f.startsWith('leads-backup-') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupsDir, f);
        return {
          name: f,
          path: filePath,
          time: statSync(filePath).mtimeMs
        };
      });

    // Ordenar de más reciente a más antiguo
    files.sort((a, b) => b.time - a.time);

    if (files.length > MAX_BACKUP_FILES) {
      const toDelete = files.slice(MAX_BACKUP_FILES);
      console.log(`[backup-job] Rotación: eliminando ${toDelete.length} backups antiguos.`);
      toDelete.forEach(f => {
        try {
          unlinkSync(f.path);
          console.log(`[backup-job] Rotado (eliminado): ${f.name}`);
        } catch (e) {
          console.error(`[backup-job] Error al borrar backup antiguo ${f.name}:`, e.message);
        }
      });
    }
  } catch (e) {
    console.error('[backup-job] Error durante la rotación de backups:', e.message);
  }
}

/**
 * Inicializar el programador del backup
 */
export function startLeadsBackupScheduler() {
  if (!isSqlServerConfigured()) {
    console.log('[backup-job] Deshabilitado: sin configuración de SQL Server.');
    return;
  }

  const startupDelay = 20_000; // Retraso de 20s en el arranque
  const intervalCheck = 60 * 60 * 1000; // Verificar cada 1 hora si cambió el día

  console.log(`[backup-job] Scheduler activo — Primera verificación en 20 segundos.`);

  setTimeout(async () => {
    await verificarYEjecutarBackup();
    
    // Configurar temporizador periódico
    if (backupTimer) clearInterval(backupTimer);
    backupTimer = setInterval(async () => {
      await verificarYEjecutarBackup();
    }, intervalCheck);
  }, startupDelay);
}

/**
 * Detener el programador
 */
export function stopLeadsBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = null;
}

/**
 * Verifica si es un nuevo día y ejecuta el backup si es necesario
 */
async function verificarYEjecutarBackup() {
  try {
    const today = getLocalDateString();
    const lastRun = getSchedulerMeta(META_LAST_BACKUP);

    if (lastRun !== today) {
      console.log(`[backup-job] Nueva fecha detectada (${today}). Ejecutando backup diario.`);
      await ejecutarLeadsBackup();
    } else {
      console.log(`[backup-job] El backup del día de hoy (${today}) ya fue realizado.`);
    }
  } catch (e) {
    console.error('[backup-job] Error al verificar estado del backup:', e.message);
  }
}
