/**
 * Aplica confirmación / rechazo de caja sobre el seguimiento CRM (SQL Server).
 * Contrato: escribe caja_venta_cierre y actualiza crm_venta_pendiente.
 * Compat: acepta cierreId + cerrado/rechazado (API anterior).
 */
import { randomUUID } from 'node:crypto';
import { isCajaMysqlEnabled } from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import { persistirSeguimientoLead, getLatestSeguimientoSql } from '../db/seguimiento-sql.js';

/** Normaliza estado API → CONFIRMADA | RECHAZADA */
export function normalizarEstadoCierreCaja(estadoRaw) {
  const s = String(estadoRaw ?? '')
    .trim()
    .toUpperCase();
  if (s === 'CONFIRMADA' || s === 'CERRADO' || s === 'VERIFICADO') return 'CONFIRMADA';
  if (s === 'RECHAZADA' || s === 'RECHAZADO') return 'RECHAZADA';
  const low = s.toLowerCase();
  if (low === 'cerrado' || low === 'confirmada') return 'CONFIRMADA';
  if (low === 'rechazado' || low === 'rechazada') return 'RECHAZADA';
  return null;
}

/** Mapea estado caja → campo CRM cajaEstado. */
export function mapEstadoCajaACrm(estadoCaja) {
  if (estadoCaja === 'CONFIRMADA') return 'verificado';
  if (estadoCaja === 'RECHAZADA') return 'rechazado';
  return null;
}

/**
 * @param {{
 *   cierreId?: number,
 *   pendienteUuid?: string,
 *   estado: string,
 *   idCaja?: string|null,
 *   reciboNumero?: string|null,
 *   contratoUuid?: string|null,
 *   motivoRechazo?: string|null,
 *   confirmadoPor: string,
 * }} body
 * @param {string} sucursal
 */
export async function aplicarConfirmacionCaja(body, sucursal) {
  if (!isCajaMysqlEnabled()) {
    const err = new Error('MySQL de caja deshabilitada (CAJA_MYSQL_ENABLED).');
    err.code = 'CAJA_MYSQL_DISABLED';
    throw err;
  }

  const estadoCaja = normalizarEstadoCierreCaja(body?.estado);
  if (!estadoCaja) {
    const err = new Error(
      'estado debe ser CONFIRMADA/RECHAZADA (o cerrado/rechazado por compatibilidad).',
    );
    err.code = 'VALIDATION';
    throw err;
  }

  const cajaEstado = mapEstadoCajaACrm(estadoCaja);
  const confirmadoPor = String(body?.confirmadoPor ?? body?.verificadoPor ?? '')
    .trim()
    .slice(0, 200);
  if (!confirmadoPor) {
    const err = new Error('confirmadoPor es obligatorio (usuario de caja que confirmó).');
    err.code = 'VALIDATION';
    throw err;
  }

  const motivoRechazo =
    estadoCaja === 'RECHAZADA'
      ? String(body?.motivoRechazo ?? '')
          .trim()
          .slice(0, 500) || null
      : null;

  if (estadoCaja === 'RECHAZADA' && !motivoRechazo) {
    const err = new Error('motivoRechazo es obligatorio cuando estado = RECHAZADA.');
    err.code = 'VALIDATION';
    throw err;
  }

  const idCaja = String(body?.idCaja ?? body?.reciboNumero ?? '')
    .trim()
    .slice(0, 64) || null;
  const reciboNumero = String(body?.reciboNumero ?? body?.idCaja ?? '')
    .trim()
    .slice(0, 40) || null;
  const contratoUuid = body?.contratoUuid
    ? String(body.contratoUuid).trim().slice(0, 36)
    : null;

  const pool = getCajaMysqlPool();
  const conn = await pool.getConnection();
  let cierreVentaId = null;
  let pendiente = null;
  let cierreUuid = null;

  try {
    await conn.beginTransaction();

    const pendienteUuid = body?.pendienteUuid
      ? String(body.pendienteUuid).trim()
      : null;
    const cierreId = Number(body?.cierreId);

    if (pendienteUuid) {
      const [rows] = await conn.query(
        `SELECT * FROM crm_venta_pendiente WHERE uuid = ? FOR UPDATE`,
        [pendienteUuid],
      );
      pendiente = rows?.[0] ?? null;
    } else if (Number.isFinite(cierreId) && cierreId > 0) {
      const [rows] = await conn.query(
        `SELECT * FROM crm_venta_pendiente WHERE id = ? FOR UPDATE`,
        [cierreId],
      );
      pendiente = rows?.[0] ?? null;
    } else {
      const err = new Error('Indicá pendienteUuid o cierreId.');
      err.code = 'VALIDATION';
      throw err;
    }

    if (!pendiente) {
      const err = new Error('Pendiente de caja no encontrado en MySQL nube.');
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

    cierreUuid = randomUUID();
    const [ins] = await conn.query(
      `INSERT INTO caja_venta_cierre (
         uuid, crm_venta_pendiente_uuid, sucursal_codigo, estado,
         contrato_uuid, recibo_numero, verificado_por, motivo_rechazo, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      [
        cierreUuid,
        pendiente.uuid,
        String(sucursal).slice(0, 40),
        estadoCaja,
        contratoUuid,
        reciboNumero,
        confirmadoPor.slice(0, 120),
        motivoRechazo,
        JSON.stringify(body ?? {}),
      ],
    );
    cierreVentaId = Number(ins.insertId);

    await conn.query(
      `UPDATE crm_venta_pendiente
       SET estado = ?,
           closed_at = CURRENT_TIMESTAMP(3),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [estadoCaja, pendiente.id],
    );

    await conn.query(
      `UPDATE caja_cierre
       SET estado = ?,
           closed_at = CURRENT_TIMESTAMP(3),
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE lead_id = ? AND venta_key = 'principal'`,
      [estadoCaja, Number(pendiente.crm_lead_external_id)],
    );

    try {
      await conn.query(
        `INSERT INTO sync_event_log (direccion, entidad, entidad_uuid, sucursal_codigo, detalle)
         VALUES ('CAJA_A_CRM', 'caja_venta_cierre', ?, ?, ?)`,
        [cierreUuid, String(sucursal), `${estadoCaja} por ${confirmadoPor}`],
      );
    } catch {
      /* ignore */
    }

    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }

  let payload = null;
  try {
    payload =
      typeof pendiente.payload_json === 'object'
        ? pendiente.payload_json
        : JSON.parse(String(pendiente.payload_json || '{}'));
  } catch {
    payload = {};
  }

  const leadId = String(pendiente.crm_lead_external_id);
  const verificadoEn = new Date().toISOString();
  const patch = {
    cajaEstado,
    cajaVerificadoEn: verificadoEn,
    cajaComprobanteId: idCaja || reciboNumero,
    cajaMotivoRechazo: motivoRechazo,
    cajaSucursal: String(sucursal).slice(0, 32),
    cajaConfirmadoPor: confirmadoPor,
  };

  const usuarioSistema = {
    id: payload?.operador?.usuarioId != null ? String(payload.operador.usuarioId) : '0',
    rol: payload?.operador?.rol || 'promotor',
    nombre: `Caja ${sucursal}`,
  };

  const leadContext = {
    id: leadId,
    telefono: payload?.lead?.telefono || '',
    nombre: payload?.lead?.nombre || '',
    seguimiento: (await getLatestSeguimientoSql(leadId, null)) || {},
  };

  let saved = false;
  try {
    const res = await persistirSeguimientoLead(leadId, patch, usuarioSistema, leadContext);
    saved = Boolean(res?.saved);
  } catch (err) {
    console.error(
      '[caja-confirmacion] Falló persistir en SQL Server lead=%s pendiente=%s:',
      leadId,
      pendiente.id,
      err,
    );
    const wrap = new Error(
      err instanceof Error
        ? `Confirmación guardada en MySQL pero falló al actualizar el CRM: ${err.message}`
        : 'Confirmación guardada en MySQL pero falló al actualizar el CRM.',
    );
    wrap.code = 'CRM_PATCH_FAILED';
    wrap.confirmacionId = cierreVentaId;
    wrap.cierreId = Number(pendiente.id);
    wrap.pendienteUuid = pendiente.uuid;
    wrap.leadId = leadId;
    throw wrap;
  }

  if (cierreVentaId) {
    try {
      await pool.query(
        `UPDATE caja_venta_cierre SET consumido_por_crm_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [cierreVentaId],
      );
    } catch (err) {
      console.warn(
        '[caja-confirmacion] No se pudo marcar consumido_por_crm_at id=%s:',
        cierreVentaId,
        err,
      );
    }
  }

  return {
    ok: true,
    confirmacionId: cierreVentaId,
    cierreId: Number(pendiente.id),
    pendienteUuid: pendiente.uuid,
    cajaVentaCierreUuid: cierreUuid,
    leadId,
    sucursal: String(sucursal),
    estado: estadoCaja,
    cajaEstado,
    cajaVerificadoEn: verificadoEn,
    cajaComprobanteId: idCaja || reciboNumero,
    cajaConfirmadoPor: confirmadoPor,
    saved,
  };
}
