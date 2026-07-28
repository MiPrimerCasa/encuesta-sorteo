/**
 * Pull / ack / descarga de imágenes para la caja de sucursal (HTTPS + token).
 * Lee crm_venta_pendiente + caja_cierre_imagen (contrato SistemaCajaPIJ).
 */
import { isCajaMysqlEnabled } from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import { resolveCierrePijPath } from '../domain/cierres-pij-storage.js';
import { urlDescargaImagenCaja } from './caja-payload.js';

function parseJsonField(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function mapPendienteRow(row, { basePath = '' } = {}) {
  const payload = parseJsonField(row.payload_json) || {};
  return {
    id: Number(row.id),
    uuid: row.uuid,
    leadId: Number(row.crm_lead_external_id) || row.crm_lead_external_id,
    crmVentaExternalId: row.crm_venta_external_id ?? null,
    sucursalCodigo: row.sucursal_codigo,
    estado: row.estado,
    creadoEn: row.created_at,
    actualizadoEn: row.updated_at,
    /** JSON completo del contrato §5 (lead + seguimiento + operador + adjuntos). */
    payload,
    // Atajos frecuentes para UI / sync legacy
    idProducto: payload?.seguimiento?.idProducto ?? null,
    clienteNombre: payload?.lead?.nombre ?? null,
    dniCliente: payload?.lead?.documentoNumero ?? null,
    telefono: payload?.lead?.telefono ?? null,
    domicilio: payload?.lead?.domicilio ?? null,
    numeroRecibo: payload?.seguimiento?.numeroRecibo ?? null,
    estadoPago: payload?.seguimiento?.estadoPago ?? null,
    fechaCierre: payload?.seguimiento?.fechaCierre ?? null,
    promotorId: payload?.lead?.promotorId ?? null,
    promotorNombre: payload?.lead?.promotorNombre ?? null,
    supervisorNombre: payload?.lead?.supervisorNombre ?? null,
    operadorNombre: payload?.operador?.nombre ?? null,
    operadorRol: payload?.operador?.rol ?? null,
    imagenes: Array.isArray(payload?.seguimiento?.adjuntos)
      ? payload.seguimiento.adjuntos.map((a) => ({
          id: a.idImagen || null,
          tipo: a.tipoImagen || a.tipo,
          tipoAdjunto: a.tipo,
          mimeType: a.mimeType ?? null,
          nombreOriginal: a.nombreOriginal ?? null,
          url: a.urlDescarga || (a.idImagen ? urlDescargaImagenCaja(a.idImagen, basePath) : null),
          sha256: a.sha256 ?? null,
        }))
      : [],
  };
}

/**
 * Pull incremental de pendientes para la sucursal del token.
 * Incluye filas nuevas (`id > desde`) y re-publicaciones (`estado=PENDIENTE` con
 * `updated_at > updatedSince`) aunque el id ya haya pasado el cursor.
 *
 * @param {string} sucursalCodigo
 * @param {{ desde?: number, limit?: number, basePath?: string, updatedSince?: string|Date|null }} opts
 */
export async function listarCierresParaCaja(sucursalCodigo, opts = {}) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const desde = Number(opts.desde);
  const desdeSafe = Number.isFinite(desde) && desde >= 0 ? Math.floor(desde) : 0;
  let limit = Number(opts.limit);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  const updatedSinceRaw = opts.updatedSince;
  let updatedSince = null;
  if (updatedSinceRaw != null && String(updatedSinceRaw).trim()) {
    const d = new Date(updatedSinceRaw);
    if (!Number.isNaN(d.getTime())) updatedSince = d;
  }

  const pool = getCajaMysqlPool();
  const suc = String(sucursalCodigo);

  /** @type {any[]} */
  let rows;
  if (updatedSince) {
    const [r] = await pool.query(
      `SELECT *
       FROM crm_venta_pendiente
       WHERE sucursal_codigo = ?
         AND (
           (id > ? AND estado IN ('PENDIENTE', 'DESCARGADA'))
           OR (estado = 'PENDIENTE' AND updated_at > ? AND id <= ?)
         )
       ORDER BY id ASC
       LIMIT ?`,
      [suc, desdeSafe, updatedSince, desdeSafe, limit],
    );
    rows = r;
  } else {
    const [r] = await pool.query(
      `SELECT *
       FROM crm_venta_pendiente
       WHERE id > ?
         AND sucursal_codigo = ?
         AND estado IN ('PENDIENTE', 'DESCARGADA')
       ORDER BY id ASC
       LIMIT ?`,
      [desdeSafe, suc, limit],
    );
    rows = r;
  }

  const cierres = (rows || []).map((r) => mapPendienteRow(r, { basePath: opts.basePath || '' }));
  const maxId = cierres.reduce((m, c) => Math.max(m, Number(c.id) || 0), desdeSafe);
  const ultimoId = maxId;

  return {
    sucursal: suc,
    sucursalCodigo: suc,
    /** Alias contrato: pendientes */
    pendientes: cierres,
    /** Compat con clientes que leían `cierres` */
    cierres,
    ultimoId,
    count: cierres.length,
  };
}

/**
 * Resuelve imagen por id de pendiente CRM + id_imagen (ruta legacy).
 */
export async function resolverImagenCierreCaja(cierreId, imgId, sucursal) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const id = Number(cierreId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('cierreId inválido.');
    err.code = 'VALIDATION';
    throw err;
  }

  const pool = getCajaMysqlPool();
  const [pendRows] = await pool.query(
    `SELECT id, uuid, crm_lead_external_id, sucursal_codigo
     FROM crm_venta_pendiente WHERE id = ? LIMIT 1`,
    [id],
  );
  const pend = pendRows?.[0];
  if (!pend) {
    const err = new Error(`Pendiente ${id} no encontrado.`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (pend.sucursal_codigo && String(pend.sucursal_codigo) !== String(sucursal)) {
    const err = new Error(
      `El pendiente pertenece a sucursal "${pend.sucursal_codigo}", no a "${sucursal}".`,
    );
    err.code = 'FORBIDDEN';
    throw err;
  }

  const leadId = Number(pend.crm_lead_external_id);
  const [imgRows] = await pool.query(
    `SELECT * FROM caja_cierre_imagen
     WHERE id_imagen = ? AND lead_id = ?
     LIMIT 1`,
    [String(imgId), leadId],
  );
  let img = imgRows?.[0];
  if (!img) {
    // Fallback: buscar solo por id_imagen
    const [byId] = await pool.query(
      `SELECT * FROM caja_cierre_imagen WHERE id_imagen = ? LIMIT 1`,
      [String(imgId)],
    );
    img = byId?.[0];
  }
  if (!img?.storage_path) {
    const err = new Error('Imagen no encontrada en el cierre.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const filePath = resolveCierrePijPath(img.storage_path);
  if (!filePath) {
    const err = new Error('Archivo de imagen no disponible en el VPS.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return {
    filePath,
    mimeType: img.mime_type || 'image/jpeg',
    nombreOriginal: img.nombre_original || null,
    sha256: img.sha256 || null,
  };
}

/**
 * Descarga por id_imagen (contrato: GET /api/caja/imagenes/:idImagen).
 */
export async function resolverImagenPorIdImagen(imgId, sucursal) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const idImagen = String(imgId ?? '').trim();
  if (!idImagen) {
    const err = new Error('id_imagen inválido.');
    err.code = 'VALIDATION';
    throw err;
  }

  const pool = getCajaMysqlPool();
  const [imgRows] = await pool.query(
    `SELECT i.*, c.sucursal_codigo
     FROM caja_cierre_imagen i
     INNER JOIN caja_cierre c ON c.id = i.cierre_id
     WHERE i.id_imagen = ?
     LIMIT 1`,
    [idImagen],
  );
  const img = imgRows?.[0];
  if (!img) {
    const err = new Error('Imagen no encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (img.sucursal_codigo && String(img.sucursal_codigo) !== String(sucursal)) {
    const err = new Error(
      `La imagen pertenece a sucursal "${img.sucursal_codigo}", no a "${sucursal}".`,
    );
    err.code = 'FORBIDDEN';
    throw err;
  }

  const filePath = resolveCierrePijPath(img.storage_path);
  if (!filePath) {
    const err = new Error('Archivo de imagen no disponible en el VPS.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return {
    filePath,
    mimeType: img.mime_type || 'image/jpeg',
    nombreOriginal: img.nombre_original || null,
    sha256: img.sha256 || null,
  };
}

/**
 * Avanza el cursor de pull y marca pendientes como DESCARGADA.
 * @param {string} sucursal
 * @param {number|{ ultimoId: number, idsProcesados?: number[] }} ultimoIdOrOpts
 *   - number (legacy): marca todos `id <= ultimoId` en PENDIENTE
 *   - objeto: marca rango nuevo + `idsProcesados` (re-publicaciones ya bajadas)
 */
export async function ackPullCaja(sucursal, ultimoIdOrOpts) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const opts =
    typeof ultimoIdOrOpts === 'object' && ultimoIdOrOpts != null
      ? ultimoIdOrOpts
      : { ultimoId: ultimoIdOrOpts };
  const id = Number(opts.ultimoId);
  if (!Number.isFinite(id) || id < 0) {
    const err = new Error('ultimoId inválido.');
    err.code = 'VALIDATION';
    throw err;
  }
  const idsProcesados = Array.isArray(opts.idsProcesados)
    ? [...new Set(opts.idsProcesados.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))]
    : [];

  const pool = getCajaMysqlPool();
  const suc = String(sucursal).slice(0, 64);

  const [curRows] = await pool.query(
    `SELECT ultimo_id FROM sync_cursor WHERE cliente = ? LIMIT 1`,
    [suc],
  );
  const oldCursor = Number(curRows?.[0]?.ultimo_id ?? 0) || 0;
  const nuevoCursor = Math.max(oldCursor, Math.floor(id));

  await pool.query(
    `INSERT INTO sync_cursor (cliente, ultimo_id, ultimo_pull)
     VALUES (?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       ultimo_id = GREATEST(ultimo_id, VALUES(ultimo_id)),
       ultimo_pull = UTC_TIMESTAMP()`,
    [suc, nuevoCursor],
  );

  // Rango nuevo (ids que avanzan el cursor)
  if (nuevoCursor > oldCursor) {
    await pool.query(
      `UPDATE crm_venta_pendiente
       SET estado = 'DESCARGADA',
           pulled_at = COALESCE(pulled_at, CURRENT_TIMESTAMP(3)),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id > ? AND id <= ?
         AND sucursal_codigo = ?
         AND estado = 'PENDIENTE'`,
      [oldCursor, nuevoCursor, suc],
    );
  }

  // Re-publicaciones ya conocidas (mismo id, payload nuevo)
  if (idsProcesados.length) {
    await pool.query(
      `UPDATE crm_venta_pendiente
       SET estado = 'DESCARGADA',
           pulled_at = COALESCE(pulled_at, CURRENT_TIMESTAMP(3)),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id IN (?)
         AND sucursal_codigo = ?
         AND estado = 'PENDIENTE'`,
      [idsProcesados, suc],
    );
  } else if (!opts.idsProcesados && Number.isFinite(id)) {
    // Compat clientes viejos: marca amplio id <= ultimoId
    await pool.query(
      `UPDATE crm_venta_pendiente
       SET estado = 'DESCARGADA',
           pulled_at = COALESCE(pulled_at, CURRENT_TIMESTAMP(3)),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id <= ?
         AND sucursal_codigo = ?
         AND estado = 'PENDIENTE'`,
      [Math.floor(id), suc],
    );
  }

  await pool.query(
    `UPDATE caja_cierre c
     INNER JOIN crm_venta_pendiente p
       ON CAST(p.crm_lead_external_id AS UNSIGNED) = c.lead_id
      AND p.sucursal_codigo = c.sucursal_codigo
     SET c.estado = 'DESCARGADA',
         c.pulled_at = COALESCE(c.pulled_at, CURRENT_TIMESTAMP(3)),
         c.updated_at = CURRENT_TIMESTAMP(3)
     WHERE p.sucursal_codigo = ?
       AND c.estado = 'PENDIENTE'
       AND c.venta_key = 'principal'
       AND p.id > ? AND p.id <= ?`,
    [suc, oldCursor, nuevoCursor],
  );

  if (idsProcesados.length) {
    await pool.query(
      `UPDATE caja_cierre c
       INNER JOIN crm_venta_pendiente p
         ON CAST(p.crm_lead_external_id AS UNSIGNED) = c.lead_id
        AND p.sucursal_codigo = c.sucursal_codigo
       SET c.estado = 'DESCARGADA',
           c.pulled_at = COALESCE(c.pulled_at, CURRENT_TIMESTAMP(3)),
           c.updated_at = CURRENT_TIMESTAMP(3)
       WHERE p.sucursal_codigo = ?
         AND c.estado = 'PENDIENTE'
         AND c.venta_key = 'principal'
         AND p.id IN (?)`,
      [suc, idsProcesados],
    );
  }

  return { sucursal: suc, ultimoId: nuevoCursor, ok: true };
}
