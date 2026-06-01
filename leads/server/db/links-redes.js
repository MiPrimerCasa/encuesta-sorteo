import {
  loadOperadoresCatalog,
  normalizeCodigoCatalog,
  resolveCodigoCargaOperador,
} from './operadores-catalog.js';

export { normalizeCodigoCatalog as normalizeCodigoLinks };

/**
 * Resuelve links WhatsApp (Instagram / Facebook) por código SORTEO del operador.
 */
export function resolveLinksRedesPorCodigo(codigoRaw) {
  const codigo = normalizeCodigoCatalog(codigoRaw);
  if (!codigo) return null;
  const { byCodigo } = loadOperadoresCatalog();
  return byCodigo[codigo] ?? null;
}

export function resolveCodigoCargaUsuario(usuarioSesion, encuestaRows = []) {
  return resolveCodigoCargaOperador(usuarioSesion, encuestaRows);
}

export function resolveLinksRedesParaUsuario(usuarioSesion, encuestaRows = []) {
  const codigo = resolveCodigoCargaOperador(usuarioSesion, encuestaRows);
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
