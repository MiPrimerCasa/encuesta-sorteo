import { loadOperadoresCatalog, invalidateOperadoresCatalogCache } from './operadores-catalog.js';
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
      url_largo TEXT NOT NULL,
      url_corto TEXT,
      servicio TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      verificado_en TEXT,
      notificacion_activa INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (codigo, red)
    );
    CREATE INDEX IF NOT EXISTS idx_links_acortados_notif
      ON links_acortados (notificacion_activa, verificado_en);
  `);
}

function rowFromDb(row) {
  if (!row) return null;
  return {
    codigo: row.codigo,
    red: row.red,
    vendedor: row.vendedor,
    urlLargo: row.url_largo,
    urlCorto: row.url_corto,
    servicio: row.servicio,
    estado: row.estado,
    verificadoEn: row.verificado_en,
    notificacionActiva: Boolean(row.notificacion_activa),
    ultimoError: row.ultimo_error,
    actualizadoEn: row.actualizado_en,
  };
}

/** Sincroniza filas desde links-redes.json (url larga); no borra acortados existentes. */
export function sincronizarCatalogoEnDb() {
  initLinksAcortadosSchema();
  const { byCodigo } = loadOperadoresCatalog();
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO links_acortados (codigo, red, vendedor, url_largo, estado)
    VALUES (@codigo, @red, @vendedor, @url_largo, 'pendiente')
    ON CONFLICT(codigo, red) DO UPDATE SET
      vendedor = excluded.vendedor,
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
        url_largo: urlLargo,
      });
      n += 1;
    }
  }
  return n;
}

export function listarNotificacionesActivas() {
  initLinksAcortadosSchema();
  const rows = getDb()
    .prepare(
      `SELECT * FROM links_acortados
       WHERE notificacion_activa = 1
       ORDER BY verificado_en ASC, codigo, red`,
    )
    .all();
  return rows.map((r) => {
    const item = rowFromDb(r);
    const redLabel = 'Instagram';
    return {
      id: `${r.codigo}-${r.red}`,
      codigo: r.codigo,
      vendedor: r.vendedor ?? r.codigo,
      red: r.red,
      redLabel,
      mensaje: `Actualizá el link de ${redLabel} de ${r.vendedor ?? r.codigo} en la bio / planilla.`,
      urlLargo: r.url_largo,
      urlCorto: r.url_corto,
      ultimoError: r.ultimo_error,
      verificadoEn: r.verificado_en,
    };
  });
}

export function contarNotificacionesActivas() {
  initLinksAcortadosSchema();
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM links_acortados WHERE notificacion_activa = 1`)
    .get();
  return row?.n ?? 0;
}

/** Links con verificación vencida (más de N días). */
function listarPendientesVerificacion(diasIntervalo = 7, limite = 1) {
  initLinksAcortadosSchema();
  sincronizarCatalogoEnDb();
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
        notificacion_activa = @notificacion_activa,
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
      notificacion_activa: datos.notificacionActiva ? 1 : 0,
      ultimo_error: datos.ultimoError ?? null,
    });
}

/**
 * Acorta un registro si falta url corta o se fuerza regeneración.
 */
export async function acortarRegistro(item, { forzar = false } = {}) {
  if (!forzar && item.urlCorto && item.estado === 'ok') {
    return { ...item, regenerado: false };
  }

  const idx = indiceAcortadorDesdeCodigo(item.codigo, item.red);
  const res = await acortarEnlace(item.urlLargo, idx);
  if (!res) {
    guardarAcortado(item.codigo, item.red, {
      urlCorto: item.urlCorto,
      servicio: item.servicio,
      estado: 'error_acortar',
      notificacionActiva: true,
      ultimoError: 'No se pudo acortar con ningún servicio',
    });
    return {
      ...item,
      estado: 'error_acortar',
      notificacionActiva: true,
      regenerado: false,
    };
  }

  guardarAcortado(item.codigo, item.red, {
    urlCorto: res.corto,
    servicio: res.servicio,
    estado: 'ok',
    notificacionActiva: false,
    ultimoError: null,
  });

  return {
    ...item,
    urlCorto: res.corto,
    servicio: res.servicio,
    estado: 'ok',
    notificacionActiva: false,
    regenerado: true,
  };
}

/**
 * Verifica un link; si falla intenta regenerar. Devuelve resumen.
 */
export async function verificarYRegenerarRegistro(item) {
  if (!item.urlCorto) {
    const acortado = await acortarRegistro(item, { forzar: true });
    return {
      codigo: item.codigo,
      red: item.red,
      accion: 'acortado',
      ok: acortado.estado === 'ok',
      urlCorto: acortado.urlCorto,
      notificacion: acortado.notificacionActiva,
    };
  }

  const check = await verificarUrl(item.urlCorto);
  if (check.ok) {
    guardarAcortado(item.codigo, item.red, {
      urlCorto: item.urlCorto,
      servicio: item.servicio,
      estado: 'ok',
      notificacionActiva: false,
      ultimoError: null,
    });
    return {
      codigo: item.codigo,
      red: item.red,
      accion: 'ok',
      ok: true,
      urlCorto: item.urlCorto,
      notificacion: false,
    };
  }

  const regenerado = await acortarRegistro(item, { forzar: true });
  const check2 = regenerado.urlCorto ? await verificarUrl(regenerado.urlCorto) : { ok: false };

  if (check2.ok) {
    return {
      codigo: item.codigo,
      red: item.red,
      accion: 'regenerado',
      ok: true,
      urlCorto: regenerado.urlCorto,
      notificacion: false,
    };
  }

  guardarAcortado(item.codigo, item.red, {
    urlCorto: regenerado.urlCorto,
    servicio: regenerado.servicio,
    estado: 'roto',
    notificacionActiva: true,
    ultimoError: check.error ?? check2.error ?? 'Link caído tras regenerar',
  });

  return {
    codigo: item.codigo,
    red: item.red,
    accion: 'notificar',
    ok: false,
    urlCorto: regenerado.urlCorto,
    notificacion: true,
    error: check.error ?? check2.error,
  };
}

/**
 * Proceso batch: verifica hasta `limite` links vencidos (intervalo en días).
 */
export async function ejecutarVerificacionProgramada({
  diasIntervalo = Number(process.env.LINKS_VERIFY_INTERVAL_DAYS || 7),
  limite = Number(process.env.LINKS_VERIFY_MAX_PER_RUN || 1),
} = {}) {
  sincronizarCatalogoEnDb();
  const pendientes = listarPendientesVerificacion(diasIntervalo, limite);
  const resultados = [];
  for (const item of pendientes) {
    resultados.push(await verificarYRegenerarRegistro(item));
  }
  return {
    revisados: resultados.length,
    notificacionesActivas: contarNotificacionesActivas(),
    resultados,
  };
}

/** Acorta todos los que no tienen url_corto. */
export async function acortarTodosPendientes() {
  initLinksAcortadosSchema();
  sincronizarCatalogoEnDb();
  const rows = getDb()
    .prepare(
      `SELECT * FROM links_acortados
       WHERE url_corto IS NULL OR estado IN ('pendiente', 'error_acortar')
       ORDER BY codigo, red`,
    )
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
  return resultados;
}

export function marcarNotificacionAtendida(codigo, red) {
  initLinksAcortadosSchema();
  getDb()
    .prepare(
      `UPDATE links_acortados SET
        notificacion_activa = 0,
        actualizado_en = datetime('now')
       WHERE codigo = ? AND red = ?`,
    )
    .run(codigo, red);
}

export function getAcortadoParaCodigo(codigo, red) {
  initLinksAcortadosSchema();
  const row = getDb()
    .prepare(`SELECT * FROM links_acortados WHERE codigo = ? AND red = ?`)
    .get(codigo, red);
  return rowFromDb(row);
}
