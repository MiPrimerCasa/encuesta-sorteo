/** Acortador deshabilitado mientras los links vienen listos desde STRSYSTEM. */
export function isLinksAcortadorEnabled() {
  const flag = String(process.env.LINKS_ACORTADOR_ENABLED ?? 'false').trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}
