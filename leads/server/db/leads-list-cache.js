/**
 * Caché corto del listado de leads por operador (alivia picos en SQL/VPS).
 * TTL por defecto 30s; forceRefresh o invalidación tras guardar.
 */
const TTL_MS = Math.max(
  10_000,
  Number.parseInt(process.env.LEADS_LIST_CACHE_TTL_MS || '30000', 10) || 30_000,
);

/** @type {Map<string, { payload: object, fetchedAt: number }>} */
const cache = new Map();
/** @type {Map<string, Promise<object>>} */
const inflight = new Map();

function cacheKey(usuario) {
  const id = String(usuario?.id ?? usuario?.idOperador ?? usuario?.loginId ?? '').trim();
  const rol = String(usuario?.rol ?? '');
  return `${rol}:${id || 'anon'}`;
}

export function invalidateLeadsListCache(usuario = null) {
  if (!usuario) {
    cache.clear();
    inflight.clear();
    return;
  }
  const key = cacheKey(usuario);
  cache.delete(key);
  inflight.delete(key);
}

/**
 * @param {object} usuario
 * @param {() => Promise<object>} loader
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getLeadsListCached(usuario, loader, opts = {}) {
  const key = cacheKey(usuario);
  const force = Boolean(opts.forceRefresh);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.fetchedAt < TTL_MS) {
    return { ...hit.payload, meta: { ...(hit.payload.meta || {}), cacheHit: true } };
  }
  if (!force && inflight.has(key)) {
    const pending = await inflight.get(key);
    return { ...pending, meta: { ...(pending.meta || {}), cacheHit: true } };
  }

  const promise = Promise.resolve()
    .then(() => loader())
    .then((payload) => {
      cache.set(key, { payload, fetchedAt: Date.now() });
      return payload;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  const payload = await promise;
  return { ...payload, meta: { ...(payload.meta || {}), cacheHit: false } };
}

export function leadsListCacheTtlMs() {
  return TTL_MS;
}
