/**
 * Config del ingest HTTP de caja / erp-sync-api.
 * Prod VPS: ERP_CAJA_INGEST_URL=https://…/api/erp-sync
 * Piloto local: CRM → Electron :3847
 */
export function isCajaIngestHttpEnabled() {
  return Boolean(String(process.env.ERP_CAJA_INGEST_URL ?? '').trim());
}

export function getCajaIngestHttpConfig() {
  const baseUrl = String(process.env.ERP_CAJA_INGEST_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const apiKey = String(process.env.ERP_CAJA_API_KEY ?? '').trim();
  const timeoutMs = Number(process.env.ERP_CAJA_INGEST_TIMEOUT_MS ?? 90000) || 90000;
  const preferBase64 = !['0', 'false', 'no', 'off'].includes(
    String(process.env.ERP_CAJA_ADJUNTOS_BASE64 ?? 'true')
      .trim()
      .toLowerCase(),
  );
  const allowRutaLocal = !['0', 'false', 'no', 'off'].includes(
    String(process.env.ERP_CAJA_ADJUNTOS_RUTA_LOCAL ?? 'true')
      .trim()
      .toLowerCase(),
  );
  const maxBase64Bytes =
    Number(process.env.ERP_CAJA_ADJUNTOS_BASE64_MAX_BYTES ?? 1_500_000) || 1_500_000;
  const publicBase = String(
    process.env.CRM_PUBLIC_BASE_URL ||
      process.env.LEADS_PUBLIC_HOST ||
      `http://127.0.0.1:${process.env.PORT || process.env.API_PORT || 3001}`,
  )
    .trim()
    .replace(/\/+$/, '');

  return {
    baseUrl,
    apiKey,
    timeoutMs,
    preferBase64,
    allowRutaLocal,
    maxBase64Bytes,
    publicBase,
  };
}
