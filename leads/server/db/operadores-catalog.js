import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esCodigoUsuarioCargaValido } from './codigo-promotor.js';
import {
  buildCodigoPromotorIndex,
  normalizeNombre,
  promotorTieneFilasEnMuestra,
  resolveCodigoCargaPorPromotor,
} from './encuestas.js';
import { fetchLinksRedesCatalogFromSp } from './links-redes-sp.js';
import { isSqlServerConfigured } from './mssql.js';
import { compactarCodigoSorteo } from './whatsapp-link-text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let catalogCache = null;
let catalogLoadPromise = null;

export function normalizeLoginId(valor) {
  return String(valor ?? '').trim().toLowerCase();
}

export function normalizeCodigoCatalog(valor) {
  return compactarCodigoSorteo(valor);
}

function primerNombreEquivalente(a, b) {
  if (a === b) return true;
  return (
    (a === 'cristian' && b === 'christian') || (a === 'christian' && b === 'cristian')
  );
}

function apellidosCoinciden(apellidoLogin, apellidoPlanilla) {
  if (!apellidoLogin || !apellidoPlanilla) return false;
  if (apellidoLogin === apellidoPlanilla) return true;
  if (apellidoPlanilla.length === 1) return apellidoLogin.startsWith(apellidoPlanilla);
  if (apellidoLogin.length === 1) return apellidoPlanilla.startsWith(apellidoLogin);
  if (apellidoLogin[0] !== apellidoPlanilla[0]) return false;
  let diff = Math.abs(apellidoLogin.length - apellidoPlanilla.length);
  const len = Math.min(apellidoLogin.length, apellidoPlanilla.length);
  for (let i = 0; i < len; i += 1) {
    if (apellidoLogin[i] !== apellidoPlanilla[i]) diff += 1;
  }
  return diff <= 2;
}

/** Coincidencia flexible: planilla «Leonel C» ↔ login «LEONEL CAJAL»; «Christian R» ↔ «Cristian Rocdan». */
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
    if (tokensA.includes(primeroB) || primerNombreEquivalente(tokensA[0], primeroB)) return true;
  }

  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const apA = tokensA.slice(1).join(' ');
    const apB = tokensB.slice(1).join(' ');
    if (primerNombreEquivalente(tokensA[0], tokensB[0]) && apellidosCoinciden(apA, apB)) {
      return true;
    }
  }

  return false;
}

function loadOperadoresCatalogFromJson() {
  const path = join(__dirname, '..', 'data', 'links-redes.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.catalogSource = 'json';
  return data;
}

export function useLinksRedesFromSql() {
  const source = String(process.env.LINKS_REDES_SOURCE || 'sql').trim().toLowerCase();
  if (source === 'json' || source === 'file') return false;
  return isSqlServerConfigured();
}

function mergeCatalogIndexes(fromSp, fromJson) {
  return {
    ...fromSp,
    catalogSource: 'sql',
    byCodigo: fromSp.byCodigo,
    byLoginId: { ...fromJson.byLoginId, ...fromSp.byLoginId },
    byIdOperador: { ...fromJson.byIdOperador, ...fromSp.byIdOperador },
    byNombre: { ...fromJson.byNombre, ...fromSp.byNombre },
  };
}

/** Catálogo en memoria (JSON de respaldo si el SP aún no cargó). */
export function loadOperadoresCatalog() {
  if (catalogCache) return catalogCache;
  catalogCache = loadOperadoresCatalogFromJson();
  return catalogCache;
}

/**
 * Catálogo desde STRSYSTEM ([dbo].[rptLinkQRenRedesSociales]) con respaldo en links-redes.json.
 */
export async function loadOperadoresCatalogAsync() {
  if (catalogCache?.catalogSource === 'sql') return catalogCache;
  if (catalogLoadPromise) return catalogLoadPromise;

  catalogLoadPromise = (async () => {
    if (useLinksRedesFromSql()) {
      try {
        const fromSp = await fetchLinksRedesCatalogFromSp();
        if (Object.keys(fromSp.byCodigo ?? {}).length > 0) {
          const fromJson = loadOperadoresCatalogFromJson();
          catalogCache = mergeCatalogIndexes(fromSp, fromJson);
          return catalogCache;
        }
        console.warn(
          '[links-redes] El SP no devolvió códigos; se usa links-redes.json.',
        );
      } catch (error) {
        console.warn(
          '[links-redes] SP falló, se usa links-redes.json:',
          error instanceof Error ? error.message : error,
        );
      }
    }
    catalogCache = loadOperadoresCatalogFromJson();
    return catalogCache;
  })();

  try {
    return await catalogLoadPromise;
  } finally {
    catalogLoadPromise = null;
  }
}

/** Precarga al arrancar la API (no bloquea el listen). */
export function warmOperadoresCatalog() {
  return loadOperadoresCatalogAsync();
}

export function invalidateOperadoresCatalogCache() {
  catalogCache = null;
  catalogLoadPromise = null;
}

function codigoDesdeEntrada(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry.codigo ?? null;
}

export function idVendedorOperador(usuarioSesion) {
  return usuarioSesion?.idVendedor ?? usuarioSesion?.idOperador ?? usuarioSesion?.id ?? null;
}

/** El código de filas propias coincide con el vendedor de la planilla o con el login. */
function codigoCoherenteConFilasPropias(codigo, nombreOperador, encuestaRows, idVendedor, catalog) {
  if (codigoPerteneceAVendedor(codigo, nombreOperador, catalog)) return true;
  const entry = catalog.byCodigo?.[normalizeCodigoCatalog(codigo)];
  if (!entry?.vendedor) return true;
  const prefix = `${idVendedor}|`;
  const index = buildCodigoPromotorIndex(encuestaRows);
  for (const [key, v] of index) {
    if (!key.startsWith(prefix) || v.codigoCarga !== codigo) continue;
    if (nombresCoinciden(v.nombre, entry.vendedor)) return true;
  }
  return false;
}

/** El @usuario del SP pertenece a este operador según catálogo links-redes (vendedor en planilla). */
export function codigoPerteneceAVendedor(codigo, nombreOperador, catalog = loadOperadoresCatalog()) {
  if (!esCodigoUsuarioCargaValido(codigo)) return false;
  const entry = catalog.byCodigo?.[normalizeCodigoCatalog(codigo)];
  if (!entry?.vendedor) return true;
  if (entry.rol === 'supervisor') return false;
  return nombresCoinciden(nombreOperador, entry.vendedor);
}

/** El código @usuario pertenece a filas previas de este idVendedor (o no hay filas para comparar). */
export function codigoEnFilasDelPromotor(codigo, encuestaRows, idVendedor) {
  if (!esCodigoUsuarioCargaValido(codigo)) return false;
  if (!encuestaRows?.length) return true;
  const index = buildCodigoPromotorIndex(encuestaRows);
  const prefix = `${idVendedor}|`;
  for (const [key, v] of index) {
    if (key.startsWith(prefix) && v.codigoCarga === codigo) return true;
  }
  return false;
}

/**
 * Promotor: solo código ligado a su idVendedor en encuestas o catálogo exacto (sin fuzzy).
 * Evita asignar código de supervisor u otro promotor por coincidencia parcial de nombre.
 */
export function resolveCodigoCargaPromotorStrict(usuarioSesion, encuestaRows = []) {
  if (!usuarioSesion || usuarioSesion.rol !== 'promotor') return null;
  const idV = idVendedorOperador(usuarioSesion);
  const catalog = loadOperadoresCatalog();
  const nombre = String(usuarioSesion.nombre ?? '').trim();

  const idOp = String(idV ?? '').trim();
  if (idOp && catalog.byIdOperador?.[idOp]) {
    const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(catalog.byIdOperador[idOp]));
    if (esCodigoUsuarioCargaValido(codigo)) return codigo;
  }

  const login = normalizeLoginId(usuarioSesion.loginId);
  if (login && catalog.byLoginId?.[login]) {
    const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(catalog.byLoginId[login]));
    if (esCodigoUsuarioCargaValido(codigo)) return codigo;
  }

  const norm = normalizeNombre(nombre);
  if (norm && catalog.byNombre?.[norm]) {
    const entry = catalog.byNombre[norm];
    if (entry?.rol !== 'supervisor') {
      const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(entry));
      if (esCodigoUsuarioCargaValido(codigo)) return codigo;
    }
  }

  if (nombre) {
    for (const [key, entry] of Object.entries(catalog.byNombre ?? {})) {
      if (entry?.rol === 'supervisor') continue;
      if (nombresCoinciden(nombre, key)) {
        const codigo = normalizeCodigoCatalog(codigoDesdeEntrada(entry));
        if (esCodigoUsuarioCargaValido(codigo)) return codigo;
      }
    }
    for (const entry of Object.values(catalog.byCodigo ?? {})) {
      if (entry?.rol === 'supervisor') continue;
      if (entry?.vendedor && nombresCoinciden(nombre, entry.vendedor)) {
        const codigo = normalizeCodigoCatalog(entry.codigo);
        if (esCodigoUsuarioCargaValido(codigo)) return codigo;
      }
    }
  }

  const desdeFilas = resolveCodigoCargaPorPromotor(encuestaRows, nombre, idV);
  if (esCodigoUsuarioCargaValido(desdeFilas)) {
    if (codigoPerteneceAVendedor(desdeFilas, nombre, catalog)) return desdeFilas;
    if (
      promotorTieneFilasEnMuestra(encuestaRows, idV) &&
      codigoCoherenteConFilasPropias(desdeFilas, nombre, encuestaRows, idV, catalog)
    ) {
      return desdeFilas;
    }
  }

  const sesion = String(usuarioSesion.codigoCarga ?? '').trim();
  if (
    esCodigoUsuarioCargaValido(sesion) &&
    codigoPerteneceAVendedor(sesion, nombre, catalog) &&
    codigoEnFilasDelPromotor(sesion, encuestaRows, idV)
  ) {
    return sesion;
  }

  return null;
}

/**
 * Resuelve código SORTEO (@usuario) desde sesión, planilla JSON o filas encuesta.
 */
export function resolveCodigoCargaOperador(usuarioSesion, encuestaRows = []) {
  if (usuarioSesion?.rol === 'promotor') {
    return resolveCodigoCargaPromotorStrict(usuarioSesion, encuestaRows);
  }
  if (!usuarioSesion) return null;

  const catalog = loadOperadoresCatalog();

  const candidatosDirectos = [usuarioSesion.codigoCarga, usuarioSesion.loginId];
  for (const c of candidatosDirectos) {
    const codigo = normalizeCodigoCatalog(c);
    if (esCodigoUsuarioCargaValido(codigo) && catalog.byCodigo?.[codigo]) {
      return codigo;
    }
  }
  for (const c of candidatosDirectos) {
    const t = String(c ?? '').trim();
    if (esCodigoUsuarioCargaValido(t)) return t;
  }

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
  if (usuario.rol === 'promotor') {
    const idV = idVendedorOperador(usuario);
    const rowsEfectivas = promotorTieneFilasEnMuestra(encuestaRows, idV) ? encuestaRows : [];
    const codigo = resolveCodigoCargaPromotorStrict(usuario, rowsEfectivas);
    if (codigo) return { ...usuario, codigoCarga: codigo };
    if (
      esCodigoUsuarioCargaValido(usuario.codigoCarga) &&
      codigoEnFilasDelPromotor(usuario.codigoCarga, rowsEfectivas, idV)
    ) {
      return usuario;
    }
    const { codigoCarga: _omit, ...sinCodigo } = usuario;
    return sinCodigo;
  }
  if (esCodigoUsuarioCargaValido(usuario.codigoCarga)) return usuario;
  const codigo = resolveCodigoCargaOperador(usuario, encuestaRows);
  if (!codigo) return usuario;
  return { ...usuario, codigoCarga: codigo };
}
