/**
 * Publica un cierre del CRM en MySQL nube según contrato SistemaCajaPIJ:
 *   - crm_venta_pendiente.payload_json (JSON §5)
 *   - caja_cierre + caja_cierre_imagen (metadatos; bytes en data/cierres-pij/)
 *
 * Orden de persistencia:
 *   1) SP_RegistrarSeguimientoLead → SQL Server STRSYSTEM (ya ocurrió)
 *   2) Este módulo → MySQL VPS (best-effort)
 */
import { randomUUID } from 'node:crypto';
import {
  isCajaMysqlEnabled,
  normalizarSucursalCodigoErp,
} from '../config/caja-mysql-config.js';
import { getCajaMysqlPool } from '../db/caja-mysql.js';
import {
  buildCrmIngestPayload,
  sha256DeStoragePath,
  urlDescargaImagenCaja,
} from './caja-payload.js';
import { equipoDesdeCodigo, upsertOperadoresCaja } from './caja-operadores.js';

const PRODUCTOS_CAJA = new Set(['prod-pij', 'prod-terreno']);
const RESULTADOS_CAJA = new Set(['compro', 'derivar_terreno']);

/**
 * Resuelve código ERP de sucursal (`01`/`02`/`03`).
 * No usa el texto libre de domicilio/nombre de sucursal del header `x-usuario-sucursal`
 * (ej. "SALTA E M.MORENO…"): ese valor no es el código que filtra el pull de la caja.
 * @param {object} usuario
 * @param {object} [lead]
 */
export function resolveSucursalParaCaja(usuario, lead) {
  const esCodigoErpOEquipo = (raw) => {
    const s = String(raw ?? '').trim();
    return /^\d{1,2}$/.test(s) || /^S\d{1,2}$/i.test(s);
  };

  // 1) Código ERP explícito (01) o equipo S##
  for (const cand of [usuario?.sucursalCodigo, usuario?.sucursal]) {
    if (esCodigoErpOEquipo(cand)) {
      return normalizarSucursalCodigoErp(cand).slice(0, 40);
    }
  }

  // 2) Extraer S## del código promotor/supervisor (SORTEO01S21P01 → S21 → 01)
  const candidatos = [
    usuario?.codigoPromotor,
    usuario?.codigoCarga,
    usuario?.codigoSupervisor,
    lead?.codigoPromotorCarga,
    lead?.encuestaUsuario,
  ];
  for (const c of candidatos) {
    const equipo = equipoDesdeCodigo(c);
    if (equipo) return normalizarSucursalCodigoErp(equipo).slice(0, 40);
  }

  // 3) Default de entorno
  const def = String(process.env.CAJA_DEFAULT_SUCURSAL ?? '').trim();
  return def ? normalizarSucursalCodigoErp(def).slice(0, 40) : null;
}

export function debePublicarCierreACaja(seguimiento) {
  if (!isCajaMysqlEnabled()) return false;
  if (!seguimiento) return false;
  return (
    RESULTADOS_CAJA.has(String(seguimiento.resultadoEntrevista ?? '')) &&
    PRODUCTOS_CAJA.has(String(seguimiento.idProducto ?? ''))
  );
}

function parseIdOrNull(val) {
  const n = Number.parseInt(String(val ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

function datosEquipoDesdeLead(lead, usuario) {
  const promotorCodigo =
    String(lead?.codigoPromotorCarga ?? lead?.encuestaUsuario ?? '').trim() ||
    (usuario?.rol === 'promotor'
      ? String(usuario.codigoPromotor || usuario.codigoCarga || '').trim()
      : '') ||
    null;
  const supervisorCodigo =
    String(usuario?.codigoSupervisor ?? '').trim() ||
    (usuario?.rol === 'supervisor'
      ? String(usuario.codigoCarga || usuario.codigoSupervisor || '').trim()
      : '') ||
    null;

  return {
    promotorId: parseIdOrNull(lead?.promotorId ?? lead?.idVendedor),
    promotorNombre: String(lead?.promotorNombre ?? '').trim().slice(0, 200) || null,
    promotorCodigo: promotorCodigo ? promotorCodigo.slice(0, 64) : null,
    supervisorId: parseIdOrNull(lead?.idSupervisor),
    supervisorNombre: String(lead?.supervisorNombre ?? '').trim().slice(0, 200) || null,
    supervisorCodigo: supervisorCodigo ? supervisorCodigo.slice(0, 64) : null,
  };
}

async function upsertCajaCierreConImagenes({
  pool,
  leadId,
  sucursalCodigo,
  origenRegistroId,
  payload,
  seguimiento,
  usuario,
  basePath,
}) {
  const ventaKey = 'principal';
  const cierreUuid = randomUUID();
  const crmVentaExt = origenRegistroId != null ? String(origenRegistroId) : null;

  await pool.query(
    `INSERT INTO caja_cierre (
       uuid, lead_id, venta_key, sucursal_codigo, crm_venta_external_id, payload_json, estado
     ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 'PENDIENTE')
     ON DUPLICATE KEY UPDATE
       sucursal_codigo = VALUES(sucursal_codigo),
       crm_venta_external_id = COALESCE(VALUES(crm_venta_external_id), crm_venta_external_id),
       payload_json = VALUES(payload_json),
       estado = IF(estado IN ('CONFIRMADA', 'RECHAZADA', 'ANULADA'), estado, 'PENDIENTE'),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      cierreUuid,
      leadId,
      ventaKey,
      sucursalCodigo,
      crmVentaExt,
      JSON.stringify(payload),
    ],
  );

  const [found] = await pool.query(
    `SELECT id, uuid FROM caja_cierre WHERE lead_id = ? AND venta_key = ? LIMIT 1`,
    [leadId, ventaKey],
  );
  const cierreRow = found?.[0];
  if (!cierreRow?.id) return { cierreId: null, imagenes: 0 };

  const cierreId = Number(cierreRow.id);
  const list = Array.isArray(seguimiento?.imagenesCierre) ? seguimiento.imagenesCierre : [];
  const imgs = list.filter(
    (i) => i && i.id && i.tipo && (i.ventaKey === ventaKey || !i.ventaKey),
  );

  const operadorId = parseIdOrNull(usuario?.id);
  let count = 0;

  for (const img of imgs) {
    const idImagen = String(img.id).slice(0, 36);
    const tipoImagen = String(img.tipo).slice(0, 16);
    const storagePath = img.storagePath ? String(img.storagePath).slice(0, 500) : null;
    const downloadUrl = urlDescargaImagenCaja(idImagen, basePath).slice(0, 500);
    const sha256 = storagePath ? await sha256DeStoragePath(storagePath) : null;

    await pool.query(
      `INSERT INTO caja_cierre_imagen (
         cierre_id, lead_id, venta_key, id_imagen, tipo_imagen,
         mime_type, nombre_original, tamano_bytes, storage_path, download_url, sha256,
         operador_id, subido_en, estado_descarga
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), 'pendiente')
       ON DUPLICATE KEY UPDATE
         mime_type = VALUES(mime_type),
         nombre_original = VALUES(nombre_original),
         tamano_bytes = VALUES(tamano_bytes),
         storage_path = VALUES(storage_path),
         download_url = VALUES(download_url),
         sha256 = COALESCE(VALUES(sha256), sha256),
         operador_id = VALUES(operador_id),
         estado_descarga = IF(estado_descarga = 'descargada', estado_descarga, 'pendiente')`,
      [
        cierreId,
        leadId,
        ventaKey,
        idImagen,
        tipoImagen,
        String(img.mimeType || 'image/jpeg').slice(0, 32),
        img.nombreOriginal ? String(img.nombreOriginal).slice(0, 260) : null,
        Number(img.tamanoBytes) || null,
        storagePath,
        downloadUrl,
        sha256,
        operadorId,
      ],
    );
    count += 1;
  }

  return { cierreId, uuid: cierreRow.uuid, imagenes: count };
}

/**
 * Upsert en crm_venta_pendiente (+ caja_cierre / imágenes).
 * Idempotente por crm_venta_external_id (= origen_registro_id del SP).
 *
 * @returns {{ skipped: boolean, reason?: string, pendienteId?: number|null, pendienteUuid?: string|null, cierreId?: number|null, error?: string|null }}
 */
export async function publicarCierreACajaMysql({
  lead,
  seguimiento,
  usuario,
  origenRegistroId,
  basePath,
}) {
  if (!debePublicarCierreACaja(seguimiento)) {
    return {
      skipped: true,
      reason: isCajaMysqlEnabled() ? 'no_aplica' : 'disabled',
      pendienteId: null,
      pendienteUuid: null,
      cierreId: null,
      error: null,
    };
  }

  const origenId = Number(origenRegistroId);
  if (!Number.isFinite(origenId) || origenId <= 0) {
    return {
      skipped: true,
      reason: 'sin_origen_registro',
      pendienteId: null,
      pendienteUuid: null,
      cierreId: null,
      error: 'Falta origenRegistroId (id del SP_RegistrarSeguimientoLead).',
    };
  }

  const sucursalCodigo = resolveSucursalParaCaja(usuario, lead);
  if (!sucursalCodigo) {
    return {
      skipped: false,
      reason: null,
      pendienteId: null,
      pendienteUuid: null,
      cierreId: null,
      error:
        'No se pudo resolver sucursalCodigo (header, código S## o CAJA_DEFAULT_SUCURSAL / CAJA_ERP_SUCURSAL_MAP).',
    };
  }

  const payload = buildCrmIngestPayload({
    lead,
    seguimiento,
    usuario,
    sucursalCodigo,
    basePath,
  });
  if (!payload) {
    return {
      skipped: false,
      reason: null,
      pendienteId: null,
      pendienteUuid: null,
      cierreId: null,
      error: 'lead_id inválido para publicar en caja.',
    };
  }

  const crmVentaExt = String(origenId);
  const equipo = datosEquipoDesdeLead(lead, usuario);

  try {
    const pool = getCajaMysqlPool();

    // Idempotencia: si ya hay fila con este origen, actualizar payload (salvo cerrada).
    const [existentes] = await pool.query(
      `SELECT id, uuid, estado FROM crm_venta_pendiente
       WHERE crm_venta_external_id = ?
       LIMIT 1`,
      [crmVentaExt],
    );
    let pendienteUuid = existentes?.[0]?.uuid || randomUUID();
    let pendienteId = existentes?.[0]?.id != null ? Number(existentes[0].id) : null;
    const estadoActual = existentes?.[0]?.estado;

    if (estadoActual === 'CONFIRMADA' || estadoActual === 'RECHAZADA' || estadoActual === 'ANULADA') {
      console.info(
        '[caja-mysql] skip re-publicar lead=%s origen=%s estado=%s',
        payload.leadId,
        origenId,
        estadoActual,
      );
      return {
        skipped: true,
        reason: `ya_${String(estadoActual).toLowerCase()}`,
        pendienteId,
        pendienteUuid,
        cierreId: null,
        error: null,
      };
    }

    if (pendienteId) {
      await pool.query(
        `UPDATE crm_venta_pendiente
         SET sucursal_codigo = ?,
             payload_json = CAST(? AS JSON),
             estado = 'PENDIENTE',
             updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [sucursalCodigo, JSON.stringify(payload), pendienteId],
      );
    } else {
      // También idempotente por lead abierto: reutilizar pendiente abierto del mismo lead.
      const [abiertos] = await pool.query(
        `SELECT id, uuid FROM crm_venta_pendiente
         WHERE crm_lead_external_id = ?
           AND estado IN ('PENDIENTE', 'DESCARGADA')
         ORDER BY id DESC
         LIMIT 1`,
        [String(payload.leadId)],
      );
      if (abiertos?.[0]?.id) {
        pendienteId = Number(abiertos[0].id);
        pendienteUuid = abiertos[0].uuid;
        await pool.query(
          `UPDATE crm_venta_pendiente
           SET crm_venta_external_id = ?,
               sucursal_codigo = ?,
               payload_json = CAST(? AS JSON),
               estado = 'PENDIENTE',
               updated_at = CURRENT_TIMESTAMP(3)
           WHERE id = ?`,
          [crmVentaExt, sucursalCodigo, JSON.stringify(payload), pendienteId],
        );
      } else {
        pendienteUuid = randomUUID();
        const [ins] = await pool.query(
          `INSERT INTO crm_venta_pendiente (
             uuid, crm_lead_external_id, crm_venta_external_id,
             sucursal_codigo, payload_json, estado
           ) VALUES (?, ?, ?, ?, CAST(? AS JSON), 'PENDIENTE')`,
          [
            pendienteUuid,
            String(payload.leadId),
            crmVentaExt,
            sucursalCodigo,
            JSON.stringify(payload),
          ],
        );
        pendienteId = Number(ins.insertId) || null;
      }
    }

    const imgResult = await upsertCajaCierreConImagenes({
      pool,
      leadId: payload.leadId,
      sucursalCodigo,
      origenRegistroId: origenId,
      payload,
      seguimiento,
      usuario,
      basePath,
    });

    try {
      await pool.query(
        `INSERT INTO sync_event_log (direccion, entidad, entidad_uuid, sucursal_codigo, detalle)
         VALUES ('CRM_A_CAJA', 'crm_venta_pendiente', ?, ?, ?)`,
        [
          pendienteUuid,
          sucursalCodigo,
          `lead=${payload.leadId} origen=${origenId} imgs=${imgResult.imagenes}`,
        ],
      );
    } catch {
      /* log best-effort */
    }

    const ops = [];
    if (equipo.promotorCodigo) {
      ops.push({
        codigo: equipo.promotorCodigo,
        nombre: equipo.promotorNombre || payload.lead.promotorNombre,
        rol: 'promotor',
        idSql: equipo.promotorId,
      });
    }
    if (equipo.supervisorCodigo) {
      ops.push({
        codigo: equipo.supervisorCodigo,
        nombre: equipo.supervisorNombre || payload.lead.supervisorNombre,
        rol: 'supervisor',
        idSql: equipo.supervisorId,
      });
    } else if (equipo.supervisorNombre && equipo.supervisorId) {
      ops.push({
        codigo: `SUP-${equipo.supervisorId}`,
        nombre: equipo.supervisorNombre,
        rol: 'supervisor',
        idSql: equipo.supervisorId,
      });
    }
    try {
      await upsertOperadoresCaja(ops);
    } catch (catErr) {
      console.warn(
        '[caja-mysql] no se pudo upsert operadores del cierre:',
        catErr instanceof Error ? catErr.message : catErr,
      );
    }

    console.info(
      '[caja-mysql] publicado lead=%s origen=%s pendiente=%s uuid=%s sucursal=%s promotor=%s supervisor=%s imgs=%s',
      payload.leadId,
      origenId,
      pendienteId,
      pendienteUuid,
      sucursalCodigo,
      equipo.promotorCodigo || equipo.promotorNombre,
      equipo.supervisorCodigo || equipo.supervisorNombre,
      imgResult.imagenes,
    );

    return {
      skipped: false,
      reason: null,
      pendienteId,
      pendienteUuid,
      cierreId: imgResult.cierreId,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al publicar en MySQL caja';
    console.error('[caja-mysql] error publicando lead=%s origen=%s:', lead?.id, origenId, message);
    return {
      skipped: false,
      reason: null,
      pendienteId: null,
      pendienteUuid: null,
      cierreId: null,
      error: message,
    };
  }
}
