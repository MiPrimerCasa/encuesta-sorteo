/**
 * Bloqueo PIJ directo en STRSYSTEM vía dbo.loteVentaBloqueoVendedorPIJ
 * (sin pasar por el ASMX SOAP).
 */
import sql from 'mssql';
import { getSqlPool } from './mssql.js';

function getProcedureName() {
  const raw = String(process.env.PIJ_BLOQUEO_SP || 'dbo.loteVentaBloqueoVendedorPIJ').trim();
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '') || 'loteVentaBloqueoVendedorPIJ';
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value == null || value === '') return new Date();
  // Solo fecha YYYY-MM-DD → mediodía local para evitar -1 día por UTC
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pickIdVenta(row) {
  if (!row || typeof row !== 'object') return 0;
  const keys = Object.keys(row);
  for (const name of ['idVenta', 'idLoteVenta', 'IdVenta', 'IdLoteVenta']) {
    const key = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') {
      const n = Number(row[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

/**
 * @param {object} payload
 * @param {{ paso?: string, leadId?: string|number }} [meta]
 * @returns {Promise<{ idVenta: number, record: object|null, summary: object }>}
 */
export async function ejecutarBloqueoPijSp(payload, meta = {}) {
  const summary = {
    idVenta: Number(payload.idVenta) || 0,
    idVendedor: Number(payload.idVendedor) || 0,
    solicitud: String(payload.solicitud ?? ''),
    anexo: Number(payload.anexo) || 0,
    montoEfectivo: Number(payload.montoEfectivo) || 0,
    montoTransferencia: Number(payload.montoTransferencia) || 0,
    fechaAnexo: payload.fechaAnexo ?? null,
    nombreCliente: String(payload.nombreCliente ?? ''),
    numeroDocumentoCliente: String(payload.numeroDocumentoCliente ?? ''),
    domicilioCliente: String(payload.domicilioCliente ?? ''),
    numeroTelefonoCliente: String(payload.numeroTelefonoCliente ?? ''),
    via: 'sp',
    procedure: getProcedureName(),
  };

  const paso = meta.paso || 'bloqueo';
  const leadId = meta.leadId;
  console.info('[pij-bloqueo] → %s lead=%s via=sp %s', paso, leadId ?? '-', JSON.stringify(summary));

  const pool = await getSqlPool();
  const request = pool.request();
  request.timeout = Number(process.env.PIJ_BLOQUEO_SP_TIMEOUT_MS || 60_000) || 60_000;

  request.input('idVenta', sql.Int, Number(payload.idVenta) || 0);
  request.input('idVendedor', sql.Int, Number(payload.idVendedor) || 0);
  request.input('solicitud', sql.NVarChar(100), String(payload.solicitud ?? '').slice(0, 100));
  request.input('anexo', sql.Int, Number(payload.anexo) || 0);
  request.input('montoEfectivo', sql.Decimal(18, 2), Number(payload.montoEfectivo) || 0);
  request.input('montoTransferencia', sql.Decimal(18, 2), Number(payload.montoTransferencia) || 0);
  request.input('fechaAnexo', sql.DateTime, toDate(payload.fechaAnexo));
  request.input('nombreCliente', sql.NVarChar(100), String(payload.nombreCliente ?? '').slice(0, 100));
  request.input(
    'numeroDocumentoCliente',
    sql.NVarChar(20),
    String(payload.numeroDocumentoCliente ?? '').slice(0, 20),
  );
  request.input('domicilioCliente', sql.NVarChar(100), String(payload.domicilioCliente ?? '').slice(0, 100));
  request.input(
    'numeroTelefonoCliente',
    sql.NVarChar(100),
    String(payload.numeroTelefonoCliente ?? '').slice(0, 100),
  );

  const result = await request.execute(getProcedureName());
  const record = result.recordset?.[0] ?? null;
  const idVenta = pickIdVenta(record);

  if (!(idVenta > 0)) {
    const err = new Error(
      'SP loteVentaBloqueoVendedorPIJ no devolvió idVenta/idLoteVenta > 0. Revisá parcela (solicitud), anexo y result set del SP.',
    );
    err.paso = paso;
    err.resultCode = idVenta;
    err.payloadResumen = { ...summary, record };
    throw err;
  }

  console.info('[pij-bloqueo] ✓ %s lead=%s idVenta=%s via=sp', paso, leadId ?? '-', idVenta);
  return { idVenta, record, summary: { ...summary, idVentaResult: idVenta } };
}
