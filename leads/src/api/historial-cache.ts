import type { SeguimientoHistorialEntry } from '../types';

const STORAGE_KEY = 'mpc-seguimiento-historial';

type HistorialCache = Record<string, SeguimientoHistorialEntry[]>;

function readCache(): HistorialCache {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistorialCache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: HistorialCache) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function appendHistorialCache(leadId: string, entries: SeguimientoHistorialEntry[]) {
  if (!entries.length) return;
  const cache = readCache();
  const prev = cache[leadId] ?? [];
  const byId = new Map<number, SeguimientoHistorialEntry>();
  for (const e of [...entries, ...prev]) {
    byId.set(e.id, e);
  }
  cache[leadId] = [...byId.values()].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  writeCache(cache);
}

export function mergeHistorialConCache(
  leadId: string,
  fromApi: SeguimientoHistorialEntry[],
): SeguimientoHistorialEntry[] {
  const cached = readCache()[leadId] ?? [];
  const byId = new Map<number, SeguimientoHistorialEntry>();
  for (const e of [...fromApi, ...cached]) {
    byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export function clearHistorialCacheLead(leadId: string) {
  const cache = readCache();
  delete cache[leadId];
  writeCache(cache);
}
