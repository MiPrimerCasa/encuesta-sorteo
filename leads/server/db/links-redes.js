import { codigoSorteoLinksDesdeSesion } from './codigo-promotor.js';
import { loadOperadoresCatalogAsync, normalizeCodigoCatalog } from './operadores-catalog.js';
import { isLinksAcortadorEnabled } from './links-acortador.js';
import { getAcortadoParaCodigo } from './links-acortados-store.js';
import { buildWaMeUrl } from './whatsapp-link-text.js';

export { normalizeCodigoCatalog as normalizeCodigoLinks };

const WA_PHONE_DEFAULT = '5493705229067';

function waPhoneFromUrl(url) {
  const m = String(url ?? '').match(/wa\.me\/(\d+)/i);
  return m?.[1] ?? null;
}

function waPhoneFromEntry(entry) {
  return (
    waPhoneFromUrl(entry?.instagram) ??
    waPhoneFromUrl(entry?.facebook) ??
    waPhoneFromUrl(entry?.whatsapp) ??
    waPhoneFromUrl(entry?.tiktok) ??
    process.env.WA_PHONE ??
    WA_PHONE_DEFAULT
  );
}

function resolveWhatsappLink(entry) {
  if (entry?.whatsapp?.startsWith('http')) return entry.whatsapp;
  if (!entry?.codigo) return null;
  return buildWaMeUrl(waPhoneFromEntry(entry), entry.codigo, 'whatsapp');
}

function resolveTiktokLink(entry) {
  if (entry?.tiktok?.startsWith('http')) return entry.tiktok;
  if (!entry?.codigo) return null;
  return buildWaMeUrl(waPhoneFromEntry(entry), entry.codigo, 'tiktok');
}

/**
 * Resuelve links WhatsApp (Instagram / Facebook) por código SORTEO del operador.
 */
export async function resolveLinksRedesPorCodigo(codigoRaw) {
  const codigo = normalizeCodigoCatalog(codigoRaw);
  if (!codigo) return null;
  const { byCodigo } = await loadOperadoresCatalogAsync();
  return byCodigo[codigo] ?? null;
}

/**
 * Código para links: sesión (operadorAccesoCategoria) cruzado con catálogo SP (byCodigo).
 * No usa nombre ni filas de encuesta.
 */
export async function resolveCodigoParaLinksRedes(usuarioSesion) {
  const codigoSesion = codigoSorteoLinksDesdeSesion(usuarioSesion);
  if (!codigoSesion) return null;

  const { byCodigo } = await loadOperadoresCatalogAsync();
  if (byCodigo[codigoSesion]) return codigoSesion;

  // Código válido en login pero sin fila en rptLinkQRenRedesSociales
  return codigoSesion;
}

export async function resolveLinksRedesParaUsuario(usuarioSesion, _encuestaRows = []) {
  const codigo = await resolveCodigoParaLinksRedes(usuarioSesion);
  if (!codigo) {
    return {
      codigo: null,
      vendedor: usuarioSesion?.nombre ?? null,
      instagram: null,
      facebook: null,
      whatsapp: null,
      tiktok: null,
      mensaje:
        'No se encontró tu código SORTEO en la sesión. Cerrá sesión, recargá la página (Ctrl+F5) y volvé a entrar.',
    };
  }

  const entry = await resolveLinksRedesPorCodigo(codigo);
  if (!entry) {
    return {
      codigo,
      vendedor: usuarioSesion?.nombre ?? null,
      instagram: null,
      facebook: null,
      whatsapp: null,
      tiktok: null,
      mensaje: `No hay links de redes cargados para el código ${codigo}. Pedí a administración que actualice el SP de links.`,
    };
  }

  const acortado =
    isLinksAcortadorEnabled() ? getAcortadoParaCodigo(entry.codigo, 'instagram') : null;
  return {
    codigo: entry.codigo,
    vendedor: entry.vendedor ?? usuarioSesion?.nombre ?? null,
    instagram: entry.instagram,
    facebook: entry.facebook,
    whatsapp: resolveWhatsappLink(entry),
    tiktok: resolveTiktokLink(entry),
    instagramAcortado: acortado?.urlCorto ?? null,
    mensaje: null,
  };
}
