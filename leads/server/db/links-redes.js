import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esCodigoUsuarioCargaValido } from './codigo-promotor.js';
import { resolveCodigoCargaPorPromotor } from './encuestas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let catalogCache = null;

function loadCatalog() {
  if (catalogCache) return catalogCache;
  const path = join(__dirname, '..', 'data', 'links-redes.json');
  const raw = readFileSync(path, 'utf8');
  catalogCache = JSON.parse(raw);
  return catalogCache;
}

export function normalizeCodigoLinks(valor) {
  return String(valor ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Resuelve links WhatsApp (Instagram / Facebook) por código SORTEO del operador.
 */
export function resolveLinksRedesPorCodigo(codigoRaw) {
  const codigo = normalizeCodigoLinks(codigoRaw);
  if (!codigo) return null;
  const { byCodigo } = loadCatalog();
  return byCodigo[codigo] ?? null;
}

/**
 * Código de carga del usuario: sesión → filas encuesta → loginId.
 */
export function resolveCodigoCargaUsuario(usuarioSesion, encuestaRows = []) {
  const candidatos = [
    usuarioSesion?.codigoCarga,
    usuarioSesion?.loginId,
  ];
  for (const c of candidatos) {
    const t = String(c ?? '').trim();
    if (esCodigoUsuarioCargaValido(t)) return t;
  }
  const desdeFilas = resolveCodigoCargaPorPromotor(
    encuestaRows,
    usuarioSesion?.nombre,
    usuarioSesion?.idOperador ?? usuarioSesion?.id,
  );
  if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;
  return null;
}

export function resolveLinksRedesParaUsuario(usuarioSesion, encuestaRows = []) {
  const codigo = resolveCodigoCargaUsuario(usuarioSesion, encuestaRows);
  if (!codigo) {
    return {
      codigo: null,
      vendedor: usuarioSesion?.nombre ?? null,
      instagram: null,
      facebook: null,
      mensaje:
        'No se encontró tu código de promotor (ej. SORTEO01S21P01). Volvé a iniciar sesión o contactá soporte.',
    };
  }
  const entry = resolveLinksRedesPorCodigo(codigo);
  if (!entry) {
    return {
      codigo,
      vendedor: usuarioSesion?.nombre ?? null,
      instagram: null,
      facebook: null,
      mensaje: `No hay links de redes cargados para el código ${codigo}. Pedí a administración que actualice la planilla.`,
    };
  }
  return {
    codigo: entry.codigo,
    vendedor: entry.vendedor ?? usuarioSesion?.nombre ?? null,
    instagram: entry.instagram,
    facebook: entry.facebook,
    mensaje: null,
  };
}
