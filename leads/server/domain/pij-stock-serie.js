/** Series A/B: tipeo libre. C en adelante: stock desde acta Caja. */

const SERIES_LIBRES = new Set(['A', 'B']);

export function normalizarGrupoSerie(grupo) {
  return String(grupo ?? '')
    .trim()
    .toUpperCase();
}

/** true si la serie/grupo debe usar stock asignado (C, D, E…). */
export function serieUsaStockCaja(serie) {
  const g = normalizarGrupoSerie(serie);
  if (!g || g.length > 4) return false;
  return !SERIES_LIBRES.has(g);
}

export function esSerieLibreHistorica(serie) {
  return SERIES_LIBRES.has(normalizarGrupoSerie(serie));
}
