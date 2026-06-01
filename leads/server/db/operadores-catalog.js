import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esCodigoUsuarioCargaValido } from './codigo-promotor.js';
import { normalizeNombre, resolveCodigoCargaPorPromotor } from './encuestas.js';
import { compactarCodigoSorteo } from './whatsapp-link-text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let catalogCache = null;

export function normalizeLoginId(valor) {
  return String(valor ?? '').trim().toLowerCase();
}

export function normalizeCodigoCatalog(valor) {
  return compactarCodigoSorteo(valor);
}

/** Coincidencia flexible: planilla «Leonel C» ↔ SP «LEONEL CAJAL» / «STRAUSS LEONEL». */
export function nombresCoinciden(nombreOperador, nombrePlanilla) {
  const a = normalizeNombre(nombreOperador);
  const b = normalizeNombre(nombrePlanilla);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const tokensA = a.split(/\s+/).filter(Boolean);
  const tokensB = b.split(/\s+/).filter(Boolean);
  if (!tokensA.length || !tokensB.length) return false;

  for (const tb of tokensB) {
    if (tb.length >= 3 && tokensA.includes(tb)) return true;
  }
  for (const ta of tokensA) {
    if (ta.length >= 3 && tokensB.includes(ta)) return true;
  }

  const inicialB = tokensB[tokensB.length - 1];
  if (inicialB.length === 1 && tokensA.some((t) => t.startsWith(inicialB))) {
    const primeroB = tokensB[0];
    if (tokensA.includes(primeroB)) return true;
  }

  return false;
}

export function loadOperadoresCatalog() {
  if (catalogCache) return catalogCache;
  const path = join(__dirname, '..', 'data', 'links-redes.json');
  catalogCache = JSON.parse(readFileSync(path, 'utf8'));
  return catalogCache;
}

export function invalidateOperadoresCatalogCache() {
  catalogCache = null;
}

function codigoDesdeEntrada(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry.codigo ?? null;
}

/**
 * Resuelve código SORTEO (@usuario) desde sesión, planilla JSON o filas encuesta.
 */
export function resolveCodigoCargaOperador(usuarioSesion, encuestaRows = []) {
  if (!usuarioSesion) return null;

  const candidatosDirectos = [usuarioSesion.codigoCarga, usuarioSesion.loginId];
  for (const c of candidatosDirectos) {
    const t = String(c ?? '').trim();
    if (esCodigoUsuarioCargaValido(t)) return t;
  }

  const catalog = loadOperadoresCatalog();

  const login = normalizeLoginId(usuarioSesion.loginId);
  if (login && catalog.byLoginId?.[login]) {
    const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(catalog.byLoginId[login]));
    if (esCodigoUsuarioCargaValido(codigo)) return codigo;
  }

  const idOp = String(usuarioSesion.idOperador ?? usuarioSesion.id ?? '').trim();
  if (idOp && catalog.byIdOperador?.[idOp]) {
    const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(catalog.byIdOperador[idOp]));
    if (esCodigoUsuarioCargaValido(codigo)) return codigo;
  }

  const nombre = String(usuarioSesion.nombre ?? '').trim();
  if (nombre) {
    const norm = normalizeNombre(nombre);
    if (catalog.byNombre?.[norm]) {
      const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(catalog.byNombre[norm]));
      if (esCodigoUsuarioCargaValido(codigo)) return codigo;
    }

    for (const [key, entry] of Object.entries(catalog.byNombre ?? {})) {
      if (nombresCoinciden(nombre, key)) {
        const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(entry));
        if (esCodigoUsuarioCargaValido(codigo)) return codigo;
      }
    }

    for (const entry of Object.values(catalog.byCodigo ?? {})) {
      if (entry?.vendedor && nombresCoinciden(nombre, entry.vendedor)) {
        const codigo = normalizeCodigoCatalog(entry.codigo);
        if (esCodigoUsuarioCargaValido(codigo)) return codigo;
      }
    }
  }

  const desdeFilas = resolveCodigoCargaPorPromotor(
    encuestaRows,
    usuarioSesion.nombre,
    usuarioSesion.idOperador ?? usuarioSesion.id,
  );
  if (esCodigoUsuarioCargaValido(desdeFilas)) return desdeFilas;

  return null;
}

export function enriquecerUsuarioConCodigoCarga(usuario, encuestaRows = []) {
  if (!usuario) return usuario;
  if (esCodigoUsuarioCargaValido(usuario.codigoCarga)) return usuario;
  const codigo = resolveCodigoCargaOperador(usuario, encuestaRows);
  if (!codigo) return usuario;
  return { ...usuario, codigoCarga: codigo };
}
