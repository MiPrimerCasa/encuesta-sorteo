/** Bloqueo Plan Inversión Joven en sistema integral (SP directo o SOAP). */

function envFlagTrue(name) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Quién ejecuta el bloqueo PIJ (loteVentaBloqueoVendedorPIJ):
 * - caja (default): la caja valida, genera comprobante, bloquea e informa idVenta al CRM
 * - crm: el CRM llama el SP al cerrar (solo pruebas / legacy)
 */
export function getPijBloqueoOwner() {
  const raw = String(process.env.PIJ_BLOQUEO_OWNER ?? 'caja').trim().toLowerCase();
  return raw === 'crm' ? 'crm' : 'caja';
}

/**
 * Master switch. Acepta PIJ_BLOQUEO_ENABLED o el legacy PIJ_SOAP_ENABLED.
 * Si el owner es caja, el CRM no dispara bloqueo al cerrar (salvo PIJ_BLOQUEO_OWNER=crm).
 */
export function isPijBloqueoEnabled() {
  if (getPijBloqueoOwner() !== 'crm') return false;
  if (String(process.env.PIJ_BLOQUEO_ENABLED ?? '').trim() !== '') {
    return envFlagTrue('PIJ_BLOQUEO_ENABLED');
  }
  return envFlagTrue('PIJ_SOAP_ENABLED');
}

/** @deprecated usar isPijBloqueoEnabled */
export function isPijSoapEnabled() {
  return isPijBloqueoEnabled();
}

/**
 * Cómo obtener idVenta:
 * - sp (default): dbo.loteVentaBloqueoVendedorPIJ en STRSYSTEM
 * - soap: ASMX altaModificaPlanJoven
 */
export function getPijBloqueoMode() {
  const raw = String(process.env.PIJ_BLOQUEO_MODE ?? 'sp').trim().toLowerCase();
  return raw === 'soap' ? 'soap' : 'sp';
}

export function getPijSoapUrl() {
  return (
    String(process.env.PIJ_SOAP_URL ?? '').trim() ||
    'https://www.miprimercasa.ar/pij/pij.asmx'
  );
}

export function getPijSoapNamespace() {
  return (
    String(process.env.PIJ_SOAP_NAMESPACE ?? '').trim() ||
    'http://190.106.131.63/MPC/PIJ'
  );
}

export function getPijSoapTimeoutMs() {
  const n = Number(process.env.PIJ_SOAP_TIMEOUT_MS ?? 60_000);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60_000;
}
