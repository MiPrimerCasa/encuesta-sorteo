/**
 * Borradores locales (modal lead / carga manual) para no perder lo tipeado
 * si cierran el sheet sin guardar.
 */

const PREFIX = 'seguimiento-leads:draft:v1:';

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function leadFormDraftKey(leadId: string) {
  return `${PREFIX}lead:${leadId}`;
}

export function nuevoLeadDraftKey(userKey: string) {
  return `${PREFIX}nuevo:${userKey || 'anon'}`;
}

export function saveJsonDraft(key: string, data: unknown) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadJsonDraft<T>(key: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): T | null {
  try {
    const parsed = safeParse(localStorage.getItem(key)) as {
      savedAt?: number;
      data?: T;
    } | null;
    if (!parsed?.data || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function clearJsonDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
