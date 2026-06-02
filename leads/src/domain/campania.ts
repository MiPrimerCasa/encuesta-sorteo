/** Código campaña tal como viene del SP (`sorteo01`, `SORTEO02`, …). */
export function normalizarCodigoCampania(raw?: string | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const m = s.match(/^SORTEO(\d+)$/i);
  if (m) return `sorteo${m[1]}`.toLowerCase();
  return s.toLowerCase();
}

/** Etiqueta legible para UI (ej. sorteo02 → «Sorteo 02»). */
export function etiquetaCampania(raw?: string | null): string | null {
  const n = normalizarCodigoCampania(raw);
  if (!n) return null;
  const m = n.match(/^sorteo(\d+)$/i);
  if (m) return `Sorteo ${m[1]}`;
  return n.charAt(0).toUpperCase() + n.slice(1);
}
