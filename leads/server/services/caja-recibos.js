/**
 * Recepción de PDF de recibo desde la caja (POST /api/caja/recibos).
 * Contrato: CRM_FLUJO_ENVIO_VPS_CAJA.md §11.1
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCajaMysqlEnabled } from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import { persistirSeguimientoLead, getLatestSeguimientoSql } from '../db/seguimiento-sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function recibosDir() {
  const raw = String(process.env.CAJA_RECIBOS_DIR ?? '').trim();
  return raw || path.join(ROOT, 'data', 'recibos-caja');
}

/**
 * Asegura tabla caja_recibo (idempotente).
 * @param {import('mysql2/promise').Pool} pool
 */
async function ensureCajaReciboTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS caja_recibo (
      id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      uuid              CHAR(36)        NOT NULL,
      pendiente_uuid    CHAR(36)        NULL,
      cliente_documento VARCHAR(20)     NOT NULL,
      nro_recibo        VARCHAR(40)     NOT NULL,
      mime_type         VARCHAR(64)     NOT NULL,
      nombre_archivo    VARCHAR(260)    NULL,
      monto_total       DECIMAL(14,2)   NULL,
      sucursal_codigo   VARCHAR(40)     NOT NULL,
      storage_path      VARCHAR(500)    NOT NULL,
      lead_id           INT             NULL,
      created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uk_caja_recibo_uuid (uuid),
      KEY idx_caja_recibo_pendiente (pendiente_uuid),
      KEY idx_caja_recibo_dni (cliente_documento),
      KEY idx_caja_recibo_nro (sucursal_codigo, nro_recibo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * @param {{
 *   pendienteUuid?: string|null,
 *   clienteDocumento: string,
 *   clienteIdLocal?: number|null,
 *   nroRecibo: string,
 *   mimeType: string,
 *   pdfBase64: string,
 *   nombreArchivo?: string|null,
 *   montoTotal?: number|null,
 *   sucursalCodigo?: string|null,
 * }} body
 * @param {string} sucursal
 */
export async function recibirReciboCaja(body, sucursal) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const clienteDocumento = String(body?.clienteDocumento ?? '')
    .replace(/\D/g, '')
    .slice(0, 20);
  if (!clienteDocumento) {
    const err = new Error('clienteDocumento es obligatorio.');
    err.code = 'VALIDATION';
    throw err;
  }

  const nroRecibo = String(body?.nroRecibo ?? '')
    .trim()
    .slice(0, 40);
  if (!nroRecibo) {
    const err = new Error('nroRecibo es obligatorio.');
    err.code = 'VALIDATION';
    throw err;
  }

  const mimeType = String(body?.mimeType ?? 'application/pdf')
    .trim()
    .slice(0, 64);
  if (!mimeType.includes('pdf') && mimeType !== 'application/pdf') {
    const err = new Error('mimeType debe ser application/pdf.');
    err.code = 'VALIDATION';
    throw err;
  }

  const pdfBase64 = String(body?.pdfBase64 ?? '').trim();
  if (!pdfBase64 || pdfBase64.length < 32) {
    const err = new Error('pdfBase64 es obligatorio.');
    err.code = 'VALIDATION';
    throw err;
  }

  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
  } catch {
    const err = new Error('pdfBase64 inválido.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!pdfBuffer.length) {
    const err = new Error('pdfBase64 vacío tras decodificar.');
    err.code = 'VALIDATION';
    throw err;
  }

  const sucursalCodigo = String(body?.sucursalCodigo || sucursal)
    .trim()
    .slice(0, 40);
  const pendienteUuid = body?.pendienteUuid
    ? String(body.pendienteUuid).trim().slice(0, 36)
    : null;
  const nombreArchivo = String(body?.nombreArchivo || `recibo-${nroRecibo}.pdf`)
    .trim()
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 260);
  const montoTotal =
    body?.montoTotal != null && Number.isFinite(Number(body.montoTotal))
      ? Number(body.montoTotal)
      : null;

  const pool = getCajaMysqlPool();
  await ensureCajaReciboTable(pool);

  let leadId = null;
  let pendiente = null;
  if (pendienteUuid) {
    const [rows] = await pool.query(
      `SELECT * FROM crm_venta_pendiente WHERE uuid = ? LIMIT 1`,
      [pendienteUuid],
    );
    pendiente = rows?.[0] ?? null;
    if (!pendiente) {
      const err = new Error('pendienteUuid no encontrado en cola de caja.');
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (pendiente.sucursal_codigo && String(pendiente.sucursal_codigo) !== String(sucursal)) {
      const err = new Error(
        `El pendiente pertenece a sucursal "${pendiente.sucursal_codigo}", no a "${sucursal}".`,
      );
      err.code = 'FORBIDDEN';
      throw err;
    }
    leadId = Number(pendiente.crm_lead_external_id) || null;
  }

  const reciboUuid = randomUUID();
  const relDir = path.join(
    String(sucursalCodigo || 'xx'),
    new Date().toISOString().slice(0, 10),
  );
  const absDir = path.join(recibosDir(), relDir);
  await mkdir(absDir, { recursive: true });
  const fileName = `${reciboUuid}__${nombreArchivo}`.slice(0, 240);
  const absPath = path.join(absDir, fileName);
  await writeFile(absPath, pdfBuffer);

  const storagePath = path.join(relDir, fileName).replace(/\\/g, '/');

  const [ins] = await pool.query(
    `INSERT INTO caja_recibo (
       uuid, pendiente_uuid, cliente_documento, nro_recibo, mime_type,
       nombre_archivo, monto_total, sucursal_codigo, storage_path, lead_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reciboUuid,
      pendienteUuid,
      clienteDocumento,
      nroRecibo,
      mimeType,
      nombreArchivo,
      montoTotal,
      sucursalCodigo,
      storagePath.slice(0, 500),
      leadId,
    ],
  );

  try {
    await pool.query(
      `INSERT INTO sync_event_log (direccion, entidad, entidad_uuid, sucursal_codigo, detalle)
       VALUES ('CAJA_A_CRM', 'caja_recibo', ?, ?, ?)`,
      [reciboUuid, sucursalCodigo, `recibo=${nroRecibo} dni=${clienteDocumento}`],
    );
  } catch {
    /* ignore */
  }

  let saved = false;
  if (leadId) {
    const leadIdStr = String(leadId);
    const patch = {
      cajaComprobanteId: nroRecibo,
      cajaSucursal: sucursalCodigo.slice(0, 32),
    };
    const usuarioSistema = {
      id: '0',
      rol: 'promotor',
      nombre: `Caja ${sucursalCodigo}`,
    };
    try {
      const leadContext = {
        id: leadIdStr,
        telefono: '',
        nombre: '',
        seguimiento: (await getLatestSeguimientoSql(leadIdStr, null)) || {},
      };
      const res = await persistirSeguimientoLead(leadIdStr, patch, usuarioSistema, leadContext);
      saved = Boolean(res?.saved);
    } catch (err) {
      console.warn(
        '[caja-recibos] PDF guardado pero falló patch CRM lead=%s:',
        leadIdStr,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    ok: true,
    reciboId: Number(ins.insertId) || null,
    reciboUuid,
    pendienteUuid,
    leadId,
    nroRecibo,
    clienteDocumento,
    storagePath,
    saved,
  };
}

export function absolutePathReciboCaja(storagePath) {
  if (!storagePath) return null;
  const abs = path.resolve(recibosDir(), String(storagePath));
  if (!abs.startsWith(path.resolve(recibosDir()))) return null;
  return abs;
}
