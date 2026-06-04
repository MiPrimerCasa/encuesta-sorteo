import sql from 'mssql';
import { normalizeNombre } from './encuestas.js';
import { getSqlPool, isSqlServerConfigured } from './mssql.js';
import {
  buildWaMeUrl,
  compactarCodigoSorteo,
} from './whatsapp-link-text.js';

const WA_PHONE_DEFAULT = '5493705229067';

function pickField(row, ...candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const name of candidates.filter(Boolean)) {
    const key = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (key != null && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

export function getLinksRedesProcedureName() {
  const raw = process.env.SP_LINKS_REDES || 'dbo.rptLinkQRenRedesSociales';
  return raw.replace(/^\[?dbo\]?\./i, '').replace(/[\[\]]/g, '');
}

function inferRol(codigo, rolField) {
  const rol = String(rolField ?? '').trim().toLowerCase();
  if (rol === 'promotor' || rol === 'supervisor') return rol;
  if (/P\d{2}$/i.test(codigo)) return 'promotor';
  if (/00$/.test(codigo) || /ROTATIVO/i.test(codigo)) return 'supervisor';
  return null;
}

function extractCodigoFromWaUrl(url) {
  const m =
    String(url).match(/del:_([A-Z0-9]+)/i) ??
    String(url).match(/PARTICIPE_GRATIS_del:([A-Z0-9]+)/i);
  return m ? compactarCodigoSorteo(m[1]) : null;
}

function waPhoneFromUrl(url) {
  const m = String(url).match(/wa\.me\/(\d+)/i);
  return m?.[1] ?? null;
}

function urlRedFromRow(row, red) {
  const canal = red === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK';
  const direct = pickField(
    row,
    red,
    red.charAt(0).toUpperCase() + red.slice(1),
    `link${red}`,
    `Link${red.charAt(0).toUpperCase()}${red.slice(1)}`,
    `url${red}`,
    `URL${red.charAt(0).toUpperCase()}${red.slice(1)}`,
    `link_${red}`,
    `wa_${red}`,
    `wa${red.charAt(0).toUpperCase()}${red.slice(1)}`,
  );
  if (typeof direct === 'string' && direct.startsWith('http')) return direct.trim();

  for (const val of Object.values(row)) {
    if (typeof val !== 'string' || !val.startsWith('http')) continue;
    const upper = val.toUpperCase();
    if (upper.includes(canal)) return val.trim();
  }
  return null;
}

function mapRowToEntry(row) {
  let instagram = urlRedFromRow(row, 'instagram');
  let facebook = urlRedFromRow(row, 'facebook');

  let codigo = compactarCodigoSorteo(
    pickField(
      row,
      'codigo',
      'Codigo',
      'codigoCarga',
      'CodigoCarga',
      'usuario',
      'Usuario',
      'codigoVendedor',
      'CodigoVendedor',
      'sorteo',
      'Sorteo',
      'codigoSorteo',
      'CodigoSorteo',
    ),
  );
  if (!codigo && instagram) codigo = extractCodigoFromWaUrl(instagram);
  if (!codigo && facebook) codigo = extractCodigoFromWaUrl(facebook);
  if (!codigo) return null;

  const phone =
    waPhoneFromUrl(instagram) ??
    waPhoneFromUrl(facebook) ??
    process.env.WA_PHONE ??
    WA_PHONE_DEFAULT;

  if (!instagram) {
    instagram = buildWaMeUrl(phone, codigo, 'instagram');
  }
  if (!facebook) {
    facebook = buildWaMeUrl(phone, codigo, 'facebook');
  }

  const vendedor =
    pickField(
      row,
      'vendedor',
      'Vendedor',
      'nombre',
      'Nombre',
      'nombreOperador',
      'NombreOperador',
      'nombrePlanilla',
      'NombrePlanilla',
      'promotor',
      'Promotor',
      'operador',
      'Operador',
    ) ?? codigo;

  const rol = inferRol(
    codigo,
    pickField(row, 'rol', 'Rol', 'categoria', 'Categoria', 'tipo', 'Tipo'),
  );

  return {
    vendedor: String(vendedor).trim(),
    codigo,
    rol,
    instagram,
    facebook,
  };
}

/**
 * Ejecuta [dbo].[rptLinkQRenRedesSociales] en STRSYSTEM (pool DB_NAME).
 */
export async function fetchLinksRedesRowsFromSql({ codigo } = {}) {
  if (!isSqlServerConfigured()) {
    throw new Error('SQL Server no configurado (faltan DB_HOST, DB_USER o DB_NAME).');
  }

  const proc = getLinksRedesProcedureName();
  const pool = await getSqlPool();
  const request = pool.request();
  const paramName = process.env.SP_LINKS_REDES_PARAM_CODIGO?.trim();
  if (paramName && codigo) {
    request.input(paramName, sql.NVarChar(64), compactarCodigoSorteo(codigo));
  }

  const result = await request.execute(proc);
  return result.recordset ?? [];
}

export function buildCatalogFromSpRows(rows) {
  const byCodigo = {};
  const byLoginId = {};
  const byIdOperador = {};
  const byNombre = {};

  for (const row of rows) {
    const entry = mapRowToEntry(row);
    if (!entry?.codigo) continue;

    byCodigo[entry.codigo] = entry;

    const meta = {
      codigo: entry.codigo,
      vendedor: entry.vendedor,
      rol: entry.rol,
    };

    const login = pickField(row, 'loginId', 'LoginID', 'login_id', 'email', 'Email');
    if (login) {
      byLoginId[String(login).trim().toLowerCase()] = meta;
    }

    const idOp = pickField(
      row,
      'idOperador',
      'IdOperador',
      'id_operador',
      'idVendedor',
      'IdVendedor',
      'idVendedorOperador',
    );
    if (idOp != null && String(idOp).trim()) {
      byIdOperador[String(idOp).trim()] = meta;
    }

    for (const nombre of [
      pickField(row, 'nombrePlanilla', 'NombrePlanilla', 'vendedor', 'Vendedor'),
      pickField(row, 'nombreOperador', 'NombreOperador', 'nombre', 'Nombre'),
    ]) {
      if (!nombre) continue;
      byNombre[normalizeNombre(nombre)] = meta;
    }
  }

  return {
    version: 2,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: `STRSYSTEM.${getLinksRedesProcedureName()}`,
    byCodigo,
    byLoginId,
    byIdOperador,
    byNombre,
  };
}

export async function fetchLinksRedesCatalogFromSp(opts = {}) {
  const rows = await fetchLinksRedesRowsFromSql(opts);
  return buildCatalogFromSpRows(rows);
}
