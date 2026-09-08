/** Series A/B: tipeo libre. C en adelante: adhesión desde stock Caja (anexo siempre manual). */

const SERIES_LIBRES = new Set(['A', 'B']);

export function normalizarGrupoSerie(grupo) {
  return String(grupo ?? '')
    .trim()
    .toUpperCase();
}

/** true si la adhesión debe usar stock asignado (C, D, E…). El anexo no se valida contra stock. */
export function serieUsaStockCaja(serie) {
  const g = normalizarGrupoSerie(serie);
  if (!g || g.length > 4) return false;
  return !SERIES_LIBRES.has(g);
}

export function esSerieLibreHistorica(serie) {
  return SERIES_LIBRES.has(normalizarGrupoSerie(serie));
}
