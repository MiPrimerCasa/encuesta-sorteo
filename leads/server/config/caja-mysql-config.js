/** Configuración de la MySQL "nube" de caja (integración con la caja de sucursal). */

export function isCajaMysqlEnabled() {
  const raw = String(process.env.CAJA_MYSQL_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function getCajaMysqlConfig() {
  return {
    host: String(process.env.CAJA_MYSQL_HOST ?? 'mysql-caja').trim(),
    port: Number(process.env.CAJA_MYSQL_PORT ?? 3306) || 3306,
    database: String(process.env.CAJA_MYSQL_DB ?? 'caja_pij').trim(),
    user: String(process.env.CAJA_MYSQL_USER ?? 'crm_caja').trim(),
    password: String(process.env.CAJA_MYSQL_PASSWORD ?? ''),
  };
}

/**
 * Tokens de sync por sucursal.
 * Formato env (JSON): {"01":"token-largo","02":"otro"} (códigos ERP)
 * o legacy {"S21":"token"} — se normaliza con CAJA_ERP_SUCURSAL_MAP.
 * @returns {Map<string, string>} token -> sucursalCodigo
 */
export function getCajaSyncTokenMap() {
  const raw = String(process.env.CAJA_SYNC_TOKENS ?? '').trim();
  const map = new Map();
  if (!raw) return map;
  try {
    const obj = JSON.parse(raw);
    for (const [sucursal, token] of Object.entries(obj)) {
      const t = String(token ?? '').trim();
      if (t) map.set(t, normalizarSucursalCodigoErp(String(sucursal).trim()));
    }
  } catch (err) {
    console.warn(
      '[caja-sync] CAJA_SYNC_TOKENS inválido (se esperaba JSON sucursal→token):',
      err instanceof Error ? err.message : err,
    );
  }
  return map;
}

/**
 * Mapa equipo CRM → código sucursal ERP.
 * Env JSON: {"S21":"01","S07":"02"} (opcional).
 */
export function getCajaErpSucursalMap() {
  const raw = String(process.env.CAJA_ERP_SUCURSAL_MAP ?? '').trim();
  const map = new Map();
  if (!raw) return map;
  try {
    const obj = JSON.parse(raw);
    for (const [from, to] of Object.entries(obj)) {
      const k = String(from ?? '').trim().toUpperCase();
      const v = String(to ?? '').trim();
      if (k && v) map.set(k, v);
    }
  } catch (err) {
    console.warn(
      '[caja-sync] CAJA_ERP_SUCURSAL_MAP inválido:',
      err instanceof Error ? err.message : err,
    );
  }
  return map;
}

/**
 * Normaliza a código ERP (`01`/`02`/`03`) cuando hay mapa o ya viene en ese formato.
 * Si es `S21` sin mapa, se deja tal cual (compat).
 * @param {string|null|undefined} raw
 */
export function normalizarSucursalCodigoErp(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  if (/^\d{1,2}$/.test(s)) return s.padStart(2, '0');
  const mapped = getCajaErpSucursalMap().get(s.toUpperCase());
  if (mapped) return /^\d{1,2}$/.test(mapped) ? mapped.padStart(2, '0') : mapped;
  return s;
}

/** Resuelve la sucursal a partir del token bearer. null si no coincide. */
export function resolveSucursalDesdeToken(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  return getCajaSyncTokenMap().get(t) ?? null;
}
