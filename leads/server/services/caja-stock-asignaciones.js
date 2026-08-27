/**
 * Stock PIJ del vendedor vía pull a erp-sync / caja
 * (GET {ERP_CAJA_INGEST_URL}/api/v1/crm/stock-vendedor).
 * Serie A/B: tipeo libre. Serie C+: selectores.
 */
import {
  getCajaIngestHttpConfig,
  isCajaIngestHttpEnabled,
} from '../config/caja-ingest-config.js';
import {
  normalizarGrupoSerie,
  serieUsaStockCaja,
} from '../domain/pij-stock-serie.js';

function authHeaders(apiKey) {
  const h = { Accept: 'application/json' };
  if (apiKey) {
    h.Authorization = `Bearer ${apiKey}`;
    h['X-CRM-Api-Key'] = apiKey;
  }
  return h;
}

/**
 * Llama a la API de caja (crm-ingest embebido o remoto).
 * @returns {Promise<object|null>} data del contrato o null si no configurado
 */
export async function fetchStockVendedorDesdeCaja({
  crmPromotorCodigo,
  promotorId,
  sucursalCodigo,
} = {}) {
  if (!isCajaIngestHttpEnabled()) {
    return null;
  }
  const { baseUrl, apiKey, timeoutMs } = getCajaIngestHttpConfig();
  const qs = new URLSearchParams();
  if (crmPromotorCodigo) qs.set('crmPromotorCodigo', String(crmPromotorCodigo).trim());
  if (promotorId != null && String(promotorId).trim() !== '') {
    qs.set('promotorId', String(promotorId).trim());
  }
  if (sucursalCodigo) qs.set('sucursalCodigo', String(sucursalCodigo).trim());

  if (!qs.has('crmPromotorCodigo') && !qs.has('promotorId')) {
    throw Object.assign(new Error('Indicá crmPromotorCodigo o promotorId'), { status: 400 });
  }

  const url = `${baseUrl}/api/v1/crm/stock-vendedor?${qs.toString()}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders(apiKey),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error || body?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return body?.data ?? body;
  } finally {
    clearTimeout(t);
  }
}

function filtrarRangosCPlus(rangos) {
  if (!Array.isArray(rangos)) return [];
  return rangos.filter((r) => {
    const g = normalizarGrupoSerie(r?.grupo);
    // Adhesiones: solo C+. Anexos sin grupo (null/'') se incluyen para usar con C+.
    if (!g) return true;
    return serieUsaStockCaja(g);
  });
}

function aplanarNumeros(rangos, { soloCPlusAdhesion = false } = {}) {
  const out = [];
  for (const r of rangos) {
    const g = normalizarGrupoSerie(r?.grupo);
    if (soloCPlusAdhesion && !serieUsaStockCaja(g)) continue;
    const nums = Array.isArray(r.numeros) ? r.numeros : [];
    const nots = Array.isArray(r.notaciones) ? r.notaciones : [];
    nums.forEach((n, i) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return;
      out.push({
        grupo: g || null,
        numero: num,
        notacion: nots[i] || (g ? `${g}${num}` : String(num)),
        stockRangoId: r.stockRangoId,
        sucursalCodigo: r.sucursalCodigo,
        campanaNombre: r.campanaNombre,
      });
    });
  }
  return out;
}

/**
 * Stock listo para el modal CRM: solo C+ en adhesiones; anexos asociados.
 */
export async function listarStockPijParaCrm({
  crmPromotorCodigo,
  idVendedor,
  sucursalCodigo,
} = {}) {
  if (!isCajaIngestHttpEnabled()) {
    return {
      adhesiones: [],
      anexos: [],
      opcionesAdhesion: [],
      opcionesAnexo: [],
      gruposDisponibles: [],
      resumen: { cantidadAdhesiones: 0, cantidadAnexos: 0 },
      aviso:
        'ERP_CAJA_INGEST_URL no configurada — el CRM no puede consultar stock. En prod: https://…/api/erp-sync (erp-sync-api).',
      configurado: false,
    };
  }

  const raw = await fetchStockVendedorDesdeCaja({
    crmPromotorCodigo,
    promotorId: idVendedor,
    sucursalCodigo,
  });

  const adhesionesRaw = filtrarRangosCPlus(raw?.adhesiones ?? []).filter((r) =>
    serieUsaStockCaja(r?.grupo),
  );
  // Anexos: todos los del vendedor (suelen ir sin letra A/B; si tienen grupo libre A/B se excluyen)
  const anexosRaw = (raw?.anexos ?? []).filter((r) => {
    const g = normalizarGrupoSerie(r?.grupo);
    if (!g) return true;
    return serieUsaStockCaja(g);
  });

  const opcionesAdhesion = aplanarNumeros(adhesionesRaw, { soloCPlusAdhesion: true });
  const opcionesAnexo = aplanarNumeros(anexosRaw);
  const gruposDisponibles = [
    ...new Set(opcionesAdhesion.map((o) => o.grupo).filter(Boolean)),
  ].sort();

  return {
    vendedor: raw?.vendedor ?? null,
    adhesiones: adhesionesRaw,
    anexos: anexosRaw,
    opcionesAdhesion,
    opcionesAnexo,
    gruposDisponibles,
    resumen: {
      cantidadAdhesiones: opcionesAdhesion.length,
      cantidadAnexos: opcionesAnexo.length,
      rangosAdhesion: adhesionesRaw.length,
      rangosAnexo: anexosRaw.length,
    },
    configurado: true,
  };
}

/** Valida que adhesión (y anexo si viene) estén en el stock C+ del vendedor. */
export async function validarNumerosEnStockCaja({
  serie,
  nroAdhesion,
  nroAnexo,
  crmPromotorCodigo,
  idVendedor,
  sucursalCodigo,
  permitirSinStock = false,
}) {
  const g = normalizarGrupoSerie(serie);
  if (!serieUsaStockCaja(g)) return { ok: true, motivo: 'serie_libre' };

  const stock = await listarStockPijParaCrm({
    crmPromotorCodigo,
    idVendedor,
    sucursalCodigo,
  });

  if (!stock.configurado) {
    if (permitirSinStock) return { ok: true, motivo: 'ingest_no_configurado' };
    const err = new Error(
      stock.aviso ||
        'No se puede validar stock PIJ: falta ERP_CAJA_INGEST_URL hacia la caja de sucursal.',
    );
    err.code = 'STOCK_PIJ_INGEST_NO_CONFIG';
    err.status = 503;
    throw err;
  }

  const adh = Number.parseInt(String(nroAdhesion ?? '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(adh)) {
    const err = new Error('Falta el número de adhesión del stock C+.');
    err.code = 'STOCK_PIJ_ADHESION_REQUERIDA';
    err.status = 400;
    throw err;
  }
  const hitAdh = stock.opcionesAdhesion.some(
    (o) => normalizarGrupoSerie(o.grupo) === g && o.numero === adh,
  );
  if (!hitAdh) {
    const err = new Error(
      `La adhesión ${g}${adh} no está en tu stock asignado (serie C+). Pedí acta en caja o elegí otro número.`,
    );
    err.code = 'STOCK_PIJ_NO_ASIGNADO';
    err.status = 400;
    throw err;
  }

  const anxRaw = String(nroAnexo ?? '').replace(/\D/g, '');
  if (anxRaw) {
    const anx = Number.parseInt(anxRaw, 10);
    const hitAnx = stock.opcionesAnexo.some((o) => o.numero === anx);
    if (!hitAnx) {
      const err = new Error(
        `El anexo ${anx} no está en tu stock asignado. Revisá el acta de entrega en caja.`,
      );
      err.code = 'STOCK_PIJ_ANEXO_NO_ASIGNADO';
      err.status = 400;
      throw err;
    }
  }

  return { ok: true };
}
