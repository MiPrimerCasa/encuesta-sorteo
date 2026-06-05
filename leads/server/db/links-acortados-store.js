import {
  loadOperadoresCatalogAsync,
  invalidateOperadoresCatalogCache,
  normalizeCodigoCatalog,
} from './operadores-catalog.js';
import {
  acortarEnlace,
  indiceAcortadorDesdeCodigo,
  pausaEntreAcortadosMs,
} from '../lib/url-shortener.js';
import { verificarUrl } from '../lib/link-health.js';
import { getDb } from './sqlite.js';

/** Solo Instagram usa link acortado; Facebook queda con wa.me largo en la app. */
const REDES_ACORTAR = ['instagram'];

function initLinksAcortadosSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS links_acortados (
      codigo TEXT NOT NULL,
      red TEXT NOT NULL,
      vendedor TEXT,
      rol_catalogo TEXT,
      url_largo TEXT NOT NULL,
      url_corto TEXT,
      servicio TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      verificado_en TEXT,
      ultimo_error TEXT,
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (codigo, red)
    );
    CREATE TABLE IF NOT EXISTS links_notificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL,
      red TEXT NOT NULL DEFAULT 'instagram',
      tipo TEXT NOT NULL,
      vendedor TEXT,
      rol_catalogo TEXT,
      url_corto TEXT,
      url_corto_anterior TEXT,
      mensaje TEXT NOT NULL,
      ultimo_error TEXT,
      creado_en TEXT NOT NULL DEFAULT (datetime('now')),
      activa INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS links_notificacion_vista (
      notificacion_id INTEGER NOT NULL,
      usuario_id TEXT NOT NULL,
      visto_en TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (notificacion_id, usuario_id)
    );
    CREATE INDEX IF NOT EXISTS idx_links_notif_codigo
      ON links_notificaciones (codigo, activa, creado_en DESC);
    CREATE TABLE IF NOT EXISTS app_scheduler_meta (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec(`ALTER TABLE links_acortados ADD COLUMN rol_catalogo TEXT`);
  } catch {
    /* ya existe */
  }
}

function rowFromDb(row) {
  if (!row) return null;
  return {
    codigo: row.codigo,
    red: row.red,
    vendedor: row.vendedor,
    rolCatalogo: row.rol_catalogo,
    urlLargo: row.url_largo,
    urlCorto: row.url_corto,
    servicio: row.servicio,
    estado: row.estado,
    verificadoEn: row.verificado_en,
    ultimoError: row.ultimo_error,
    actualizadoEn: row.actualizado_en,
  };
}

function mapNotificacionRow(r) {
  const esActualizado = r.tipo === 'link_actualizado';
  return {
    id: String(r.id),
    codigo: r.codigo,
    vendedor: r.vendedor ?? r.codigo,
    red: 'instagram',
    redLabel: 'Instagram',
    tipo: r.tipo,
    rolCatalogo: r.rol_catalogo,
    mensaje: r.mensaje,
    urlLargo: '',
    urlCorto: r.url_corto,
    urlCortoAnterior: r.url_corto_anterior,
    ultimoError: r.ultimo_error,
    verificadoEn: r.creado_en,
    esActualizado,
    esAtencionRequerida: r.tipo === 'link_requiere_accion',
  };
}

function codigoCoincideUsuario(usuario, codigoNotif) {
  const codigoUsuario = normalizeCodigoCatalog(usuario?.codigoCarga);
  if (!codigoUsuario) return false;
  return codigoUsuario === normalizeCodigoCatalog(codigoNotif);
}

function crearNotificacion({
  codigo,
  tipo,
  vendedor,
  rolCatalogo,
  urlCorto,
  urlCortoAnterior,
  ultimoError,
}) {
  const db = getDb();
  db.prepare(
    `UPDATE links_notificaciones SET activa = 0
     WHERE codigo = ? AND red = 'instagram' AND activa = 1`,
  ).run(codigo);

  const nombre = vendedor ?? codigo;
  const rolTxt = rolCatalogo === 'supervisor' ? 'supervisor' : 'promotor';
  let mensaje;
  if (tipo === 'link_actualizado') {
    mensaje = `Nuevo link de Instagram (${rolTxt} ${nombre}, código ${codigo}). Copiá el link corto en la bio de Instagram.`;
  } else {
    mensaje = `El link de Instagram de ${nombre} (${codigo}, ${rolTxt}) no pudo renovarse. Revisá la bio o contactá soporte.`;
  }

  const info = db
    .prepare(
      `INSERT INTO links_notificaciones (
        codigo, red, tipo, vendedor, rol_catalogo,
        url_corto, url_corto_anterior, mensaje, ultimo_error, activa
      ) VALUES (
        @codigo, 'instagram', @tipo, @vendedor, @rol_catalogo,
        @url_corto, @url_corto_anterior, @mensaje, @ultimo_error, 1
      )`,
    )
    .run({
      codigo,
      tipo,
      vendedor: vendedor ?? null,
      rol_catalogo: rolCatalogo ?? null,
      url_corto: urlCorto ?? null,
      url_corto_anterior: urlCortoAnterior ?? null,
      mensaje,
      ultimo_error: ultimoError ?? null,
    });

  return info.lastInsertRowid;
}

/** Sincroniza promotores y supervisores desde el catálogo (SP STRSYSTEM o JSON). */
export async function sincronizarCatalogoEnDb() {
  initLinksAcortadosSchema();
  const { byCodigo } = await loadOperadoresCatalogAsync();
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO links_acortados (codigo, red, vendedor, rol_catalogo, url_largo, estado)
    VALUES (@codigo, @red, @vendedor, @rol_catalogo, @url_largo, 'pendiente')
    ON CONFLICT(codigo, red) DO UPDATE SET
      vendedor = excluded.vendedor,
      rol_catalogo = excluded.rol_catalogo,
      url_largo = excluded.url_largo,
      actualizado_en = datetime('now')
  `);

  db.prepare(`DELETE FROM links_acortados WHERE red != 'instagram'`).run();

  let n = 0;
  for (const entry of Object.values(byCodigo)) {
    if (!entry?.codigo) continue;
    for (const red of REDES_ACORTAR) {
      const urlLargo = entry[red];
      if (!urlLargo?.startsWith('http')) continue;
      upsert.run({
        codigo: entry.codigo,
        red,
        vendedor: entry.vendedor ?? null,
        rol_catalogo: entry.rol ?? null,
        url_largo: urlLargo,
      });
      n += 1;
    }
  }
  return n;
}

export function listarNotificacionesParaUsuario(usuario) {
  initLinksAcortadosSchema();
  if (!usuario?.id) return [];

  const rows = getDb()
    .prepare(
      `SELECT n.* FROM links_notificaciones n
       WHERE n.activa = 1
         AND NOT EXISTS (
           SELECT 1 FROM links_notificacion_vista v
           WHERE v.notificacion_id = n.id AND v.usuario_id = @uid
         )
       ORDER BY n.creado_en DESC`,
    )
    .all({ uid: String(usuario.id) });

  return rows
    .filter((r) => {
      if (usuario.rol === 'supervisor') return true;
      return codigoCoincideUsuario(usuario, r.codigo);
    })
    .map(mapNotificacionRow);
}

export function contarNotificacionesParaUsuario(usuario) {
  return listarNotificacionesParaUsuario(usuario).length;
}

/** @deprecated usar contarNotificacionesParaUsuario */
export function contarNotificacionesActivas() {
  return getDb()
    .prepare(`SELECT COUNT(*) AS n FROM links_notificaciones WHERE activa = 1`)
    .get()?.n ?? 0;
}

/** @deprecated */
export function listarNotificacionesActivas() {
  return [];
}

async function listarPendientesVerificacion(diasIntervalo = 7, limite = 1) {
  initLinksAcortadosSchema();
  await sincronizarCatalogoEnDb();
  const rows = getDb()
    .prepare(
      `SELECT * FROM links_acortados
       WHERE url_largo IS NOT NULL
         AND (
           verificado_en IS NULL
           OR verificado_en < datetime('now', '-' || @dias || ' days')
         )
       ORDER BY
         CASE WHEN verificado_en IS NULL THEN 0 ELSE 1 END,
         verificado_en ASC,
         codigo,
         red
       LIMIT @limite`,
    )
    .all({ dias: diasIntervalo, limite });
  return rows.map(rowFromDb);
}

function guardarAcortado(codigo, red, datos) {
  getDb()
    .prepare(
      `UPDATE links_acortados SET
        url_corto = @url_corto,
        servicio = @servicio,
        estado = @estado,
        verificado_en = datetime('now'),
        ultimo_error = @ultimo_error,
        actualizado_en = datetime('now')
       WHERE codigo = @codigo AND red = @red`,
    )
    .run({
      codigo,
      red,
      url_corto: datos.urlCorto ?? null,
      servicio: datos.servicio ?? null,
      estado: datos.estado,
      ultimo_error: datos.ultimoError ?? null,
    });
}

function notificarLinkActualizado(item, urlCortoNuevo, urlCortoAnterior) {
  crearNotificacion({
    codigo: item.codigo,
    tipo: 'link_actualizado',
    vendedor: item.vendedor,
    rolCatalogo: item.rolCatalogo,
    urlCorto: urlCortoNuevo,
    urlCortoAnterior: urlCortoAnterior ?? null,
  });
}

function notificarAtencionRequerida(item, urlCorto, ultimoError) {
  crearNotificacion({
    codigo: item.codigo,
    tipo: 'link_requiere_accion',
    vendedor: item.vendedor,
    rolCatalogo: item.rolCatalogo,
    urlCorto,
    ultimoError,
  });
}

/**
 * Acorta o regenera un registro. Si cambia la URL corta, notifica a promotor (dueño) y supervisores.
 */
export async function acortarRegistro(item, { forzar = false } = {}) {
  const urlAnterior = item.urlCorto ?? null;

  if (!forzar && urlAnterior && item.estado === 'ok') {
    return { ...item, regenerado: false, notificado: false };
  }

  const idx = indiceAcortadorDesdeCodigo(item.codigo, item.red);
  const res = await acortarEnlace(item.urlLargo, idx);
  if (!res) {
    guardarAcortado(item.codigo, item.red, {
      urlCorto: urlAnterior,
      servicio: item.servicio,
      estado: 'error_acortar',
      ultimoError: 'No se pudo acortar con ningún servicio',
    });
    notificarAtencionRequerida(item, urlAnterior, 'No se pudo acortar con ningún servicio');
    return {
      ...item,
      estado: 'error_acortar',
      regenerado: false,
      notificado: true,
    };
  }

  const cambio = !urlAnterior || urlAnterior !== res.corto;
  guardarAcortado(item.codigo, item.red, {
    urlCorto: res.corto,
    servicio: res.servicio,
    estado: 'ok',
    ultimoError: null,
  });

  if (cambio || forzar) {
    notificarLinkActualizado(item, res.corto, urlAnterior);
  }

  return {
    ...item,
    urlCorto: res.corto,
    servicio: res.servicio,
    estado: 'ok',
    regenerado: true,
    notificado: cambio || forzar,
  };
}

export async function verificarYRegenerarRegistro(item) {
  if (!item.urlCorto) {
    const acortado = await acortarRegistro(item, { forzar: true });
    return {
      codigo: item.codigo,
      red: item.red,
      vendedor: item.vendedor,
      rolCatalogo: item.rolCatalogo,
      accion: 'acortado',
      ok: acortado.estado === 'ok',
      urlCorto: acortado.urlCorto,
      notificado: acortado.notificado,
    };
  }

  const check = await verificarUrl(item.urlCorto);
  if (check.ok) {
    guardarAcortado(item.codigo, item.red, {
      urlCorto: item.urlCorto,
      servicio: item.servicio,
      estado: 'ok',
      ultimoError: null,
    });
    return {
      codigo: item.codigo,
      red: item.red,
      accion: 'ok',
      ok: true,
      urlCorto: item.urlCorto,
      notificado: false,
    };
  }

  const urlAnterior = item.urlCorto;
  const regenerado = await acortarRegistro(item, { forzar: true });
  const check2 = regenerado.urlCorto ? await verificarUrl(regenerado.urlCorto) : { ok: false };

  if (check2.ok) {
    return {
      codigo: item.codigo,
      red: item.red,
      accion: 'regenerado',
      ok: true,
      urlCorto: regenerado.urlCorto,
      urlCortoAnterior: urlAnterior,
      notificado: regenerado.notificado,
    };
  }

  guardarAcortado(item.codigo, item.red, {
    urlCorto: regenerado.urlCorto,
    servicio: regenerado.servicio,
    estado: 'roto',
    ultimoError: check.error ?? check2.error ?? 'Link caído tras regenerar',
  });
  notificarAtencionRequerida(
    item,
    regenerado.urlCorto,
    check.error ?? check2.error ?? 'Link caído tras regenerar',
  );

  return {
    codigo: item.codigo,
    red: item.red,
    accion: 'notificar',
    ok: false,
    urlCorto: regenerado.urlCorto,
    notificado: true,
    error: check.error ?? check2.error,
  };
}

export async function ejecutarVerificacionProgramada({
  diasIntervalo = Number(process.env.LINKS_VERIFY_INTERVAL_DAYS || 7),
  limite = Number(process.env.LINKS_VERIFY_MAX_PER_RUN || 1),
} = {}) {
  await sincronizarCatalogoEnDb();
  const pendientes = await listarPendientesVerificacion(diasIntervalo, limite);
  const resultados = [];
  for (let i = 0; i < pendientes.length; i += 1) {
    resultados.push(await verificarYRegenerarRegistro(pendientes[i]));
    if (i < pendientes.length - 1) {
      await new Promise((r) => setTimeout(r, pausaEntreAcortadosMs()));
    }
  }
  return {
    revisados: resultados.length,
    resultados,
  };
}

function pausaEntreRegistros() {
  return new Promise((r) => setTimeout(r, pausaEntreAcortadosMs()));
}

export function getSchedulerMeta(clave) {
  initLinksAcortadosSchema();
  const row = getDb()
    .prepare(`SELECT valor FROM app_scheduler_meta WHERE clave = ?`)
    .get(clave);
  return row?.valor ?? null;
}

export function setSchedulerMeta(clave, valor) {
  initLinksAcortadosSchema();
  getDb()
    .prepare(
      `INSERT INTO app_scheduler_meta (clave, valor, actualizado_en)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(clave) DO UPDATE SET
         valor = excluded.valor,
         actualizado_en = datetime('now')`,
    )
    .run(clave, valor);
}

/** Sincroniza catálogo (SP/JSON) y acorta Instagram sin URL corta. */
export async function ejecutarBootstrapLinksInstagram() {
  initLinksAcortadosSchema();
  const sincronizados = await sincronizarCatalogoEnDb();
  const resultados = await acortarTodosPendientes();
  const ok = resultados.filter((r) => r.estado === 'ok').length;
  return {
    sincronizados,
    procesados: resultados.length,
    ok,
    resultados,
  };
}

/**
 * Verifica TODOS los Instagram acortados; regenera solo los que fallen.
 * Usado por el programador semanal del servidor.
 */
export async function ejecutarVerificacionSemanalCompleta() {
  initLinksAcortadosSchema();
  await sincronizarCatalogoEnDb();

  const sinCorto = getDb()
    .prepare(
      `SELECT * FROM links_acortados
       WHERE red = 'instagram'
         AND (url_corto IS NULL OR estado IN ('pendiente', 'error_acortar'))
       ORDER BY codigo`,
    )
    .all();

  for (let i = 0; i < sinCorto.length; i += 1) {
    await acortarRegistro(rowFromDb(sinCorto[i]), { forzar: true });
    if (i < sinCorto.length - 1) await pausaEntreRegistros();
  }

  const rows = getDb()
    .prepare(`SELECT * FROM links_acortados WHERE red = 'instagram' ORDER BY codigo`)
    .all();

  const resultados = [];
  for (let i = 0; i < rows.length; i += 1) {
    resultados.push(await verificarYRegenerarRegistro(rowFromDb(rows[i])));
    if (i < rows.length - 1) await pausaEntreRegistros();
  }

  invalidateOperadoresCatalogCache();

  const ok = resultados.filter((r) => r.ok).length;
  const regenerados = resultados.filter((r) => r.accion === 'regenerado').length;
  const acortados = resultados.filter((r) => r.accion === 'acortado').length;
  const rotos = resultados.filter((r) => !r.ok).length;

  return {
    revisados: resultados.length,
    ok,
    regenerados,
    acortados,
    rotos,
    resultados,
  };
}

/** Acorta solo los que aún no tienen URL corta. */
export async function acortarTodosPendientes() {
  initLinksAcortadosSchema();
  await sincronizarCatalogoEnDb();
  const rows = getDb()
    .prepare(
      `SELECT * FROM links_acortados
       WHERE url_corto IS NULL OR estado IN ('pendiente', 'error_acortar')
       ORDER BY codigo, red`,
    )
    .all();
  const resultados = [];
  for (let i = 0; i < rows.length; i += 1) {
    resultados.push(await acortarRegistro(rowFromDb(rows[i]), { forzar: true }));
    if (i < rows.length - 1) {
      await new Promise((r) => setTimeout(r, pausaEntreAcortadosMs()));
    }
  }
  invalidateOperadoresCatalogCache();
  return resultados;
}

/**
 * Regenera TODOS los Instagram (promotores + supervisores del catálogo) y notifica el cambio.
 */
export async function actualizarTodosLinksInstagram() {
  initLinksAcortadosSchema();
  const totalSync = await sincronizarCatalogoEnDb();
  const rows = getDb()
    .prepare(`SELECT * FROM links_acortados WHERE red = 'instagram' ORDER BY codigo`)
    .all();
  const resultados = [];
  for (let i = 0; i < rows.length; i += 1) {
    const item = rowFromDb(rows[i]);
    resultados.push(await acortarRegistro(item, { forzar: true }));
    if (i < rows.length - 1) {
      await new Promise((r) => setTimeout(r, pausaEntreAcortadosMs()));
    }
  }
  invalidateOperadoresCatalogCache();
  return { totalSync, total: resultados.length, resultados };
}

export function marcarNotificacionVista(notificacionId, usuarioId) {
  initLinksAcortadosSchema();
  const id = Number(notificacionId);
  if (!Number.isFinite(id)) return;
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO links_notificacion_vista (notificacion_id, usuario_id)
       VALUES (?, ?)`,
    )
    .run(id, String(usuarioId));
}

/** @deprecated */
export function marcarNotificacionAtendida(_codigo, _red) {}

export function getAcortadoParaCodigo(codigo, red = 'instagram') {
  initLinksAcortadosSchema();
  const row = getDb()
    .prepare(`SELECT * FROM links_acortados WHERE codigo = ? AND red = ?`)
    .get(normalizeCodigoCatalog(codigo), red);
  return rowFromDb(row);
}
