import {
  loadOperadoresCatalogAsync,
  normalizeCodigoCatalog,
  resolveCodigoCargaOperador,
} from './operadores-catalog.js';
import { getAcortadoParaCodigo } from './links-acortados-store.js';
import { buildWaMeUrl } from './whatsapp-link-text.js';

export { normalizeCodigoCatalog as normalizeCodigoLinks };

const WA_PHONE_DEFAULT = '5493705229067';

function waPhoneFromUrl(url) {
  const m = String(url ?? '').match(/wa\.me\/(\d+)/i);
  return m?.[1] ?? null;
}

function resolveWhatsappLink(entry) {
  if (entry?.whatsapp?.startsWith('http')) return entry.whatsapp;
  if (!entry?.codigo) return null;
  const phone =
    waPhoneFromUrl(entry.instagram) ??
    waPhoneFromUrl(entry.facebook) ??
    process.env.WA_PHONE ??
    WA_PHONE_DEFAULT;
  return buildWaMeUrl(phone, entry.codigo, 'whatsapp');
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

export function resolveCodigoCargaUsuario(usuarioSesion, encuestaRows = []) {
  return resolveCodigoCargaOperador(usuarioSesion, encuestaRows);
}

export async function resolveLinksRedesParaUsuario(usuarioSesion, encuestaRows = []) {
  const codigo = resolveCodigoCargaOperador(usuarioSesion, encuestaRows);
  if (!codigo) {
    return {
      codigo: null,
      vendedor: usuarioSesion?.nombre ?? null,
      instagram: null,
      facebook: null,
      whatsapp: null,
      mensaje:
        'No se encontró tu código de promotor (ej. SORTEO01S21P01). Volvé a iniciar sesión o contactá soporte.',
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
      mensaje: `No hay links de redes cargados para el código ${codigo}. Pedí a administración que actualice la planilla.`,
    };
  }
  const acortado = getAcortadoParaCodigo(entry.codigo, 'instagram');
  return {
    codigo: entry.codigo,
    vendedor: entry.vendedor ?? usuarioSesion?.nombre ?? null,
    instagram: entry.instagram,
    facebook: entry.facebook,
    whatsapp: resolveWhatsappLink(entry),
    instagramAcortado: acortado?.urlCorto ?? null,
    mensaje: null,
  };
}
