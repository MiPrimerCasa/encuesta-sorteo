/**
 * Parser del Excel oficial "MPC - BLOQUEOS POR PIJ EN SISTEMA INTEGRAL".
 * Columnas: idLoteVenta, cliente01Nombre, idVendedor, Vendedor, serie (B126/300), recibos (anexo).
 */

function normalizarHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function parseSerieRecibo(serieRaw) {
  const s = String(serieRaw || '').trim().toUpperCase();
  const m = s.match(/^([AB])\s*(\d+)\s*\/\s*300$/i) || s.match(/^([AB])\s*(\d+)$/i);
  if (m) {
    return { serie: m[1].toUpperCase(), ordenAdh: m[2], display: `${m[1].toUpperCase()}${m[2]}/300` };
  }
  const solo = s.match(/^(\d+)\s*\/\s*300$/);
  if (solo) {
    return { serie: 'A', ordenAdh: solo[1], display: `A${solo[1]}/300` };
  }
  return { serie: 'A', ordenAdh: '', display: s };
}

function claveAdhesion(serie, ordenAdh) {
  const adh = String(ordenAdh || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!adh) return '';
  const s = String(serie || 'A').trim().toUpperCase() || 'A';
  return `${s}${adh}`;
}

/**
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {Promise<{ items: object[], byClave: Map<string, object[]>, source: string, cantidad: number }>}
 */
export async function parseBloqueosIntegralXlsx(buffer) {
  const xlsx = await import('xlsx');
  const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { items: [], byClave: new Map(), source: 'xlsx-vacio', cantidad: 0 };
  }
  const sh = wb.Sheets[sheetName];
  const matrix = xlsx.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });

  let headerIdx = -1;
  /** @type {Record<string, number>} */
  let col = {};
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] || [];
    const map = {};
    for (let c = 0; c < row.length; c++) {
      const key = normalizarHeader(row[c]);
      if (key) map[key] = c;
    }
    if (map.idloteventa != null && (map.serie != null || map.recibos != null)) {
      headerIdx = i;
      col = map;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error(
      'No se encontró la cabecera del Excel de bloqueos (idLoteVenta / serie / recibos).',
    );
  }

  const idx = (names) => {
    for (const n of names) {
      if (col[n] != null) return col[n];
    }
    return -1;
  };
  const iId = idx(['idloteventa']);
  const iFecha = idx(['loteventafechavisita', 'fechavisita']);
  const iCliente = idx(['cliente01nombre', 'cliente']);
  const iVendedorId = idx(['idvendedor']);
  const iVendedor = idx(['vendedor']);
  const iAlta = idx(['loteventaaltaprimera', 'altaprimera']);
  const iSerie = idx(['serie']);
  const iRecibos = idx(['recibos', 'anexo', 'recibo']);

  /** @type {object[]} */
  const items = [];
  /** @type {Map<string, object[]>} */
  const byClave = new Map();

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const idLote = String(iId >= 0 ? row[iId] : '').trim();
    const serieRaw = String(iSerie >= 0 ? row[iSerie] : '').trim();
    if (!idLote && !serieRaw) continue;
    if (/^idloteventa$/i.test(idLote)) continue;

    const parsed = parseSerieRecibo(serieRaw);
    const anexo = String(iRecibos >= 0 ? row[iRecibos] : '')
      .trim()
      .replace(/\D/g, '');
    const clave = claveAdhesion(parsed.serie, parsed.ordenAdh);
    const nombreCliente = String(iCliente >= 0 ? row[iCliente] : '').trim();
    const vendedor = String(iVendedor >= 0 ? row[iVendedor] : '').trim();
    const fechaVisita = String(iFecha >= 0 ? row[iFecha] : '').trim();
    const fechaAlta = String(iAlta >= 0 ? row[iAlta] : '').trim();
    const fechaIso = (fechaAlta || fechaVisita || '').slice(0, 10) || null;

    let adhesionDisplay = parsed.display || '';
    if (parsed.ordenAdh) {
      adhesionDisplay = `${parsed.serie}${parsed.ordenAdh}/300`;
      if (anexo) adhesionDisplay += ` ANEXO ${anexo}`;
    }

    const item = {
      idUnico: `integral-xlsx:${idLote || `${clave}:${r}`}`,
      idLoteVenta: idLote || null,
      serie: parsed.serie || 'A',
      ordenAdh: parsed.ordenAdh || '',
      ordenAnexo: anexo || '',
      adhesionDisplay,
      vendedor,
      idVendedor: String(iVendedorId >= 0 ? row[iVendedorId] : '').trim() || null,
      nombreCliente,
      fechaIso,
      montoCobrado: 0,
      montoPactado: 0,
      clave,
      fuente: 'xlsx-bloqueos-integral',
    };
    items.push(item);
    if (!clave) continue;
    if (!byClave.has(clave)) byClave.set(clave, []);
    byClave.get(clave).push(item);
    const soloNum = String(parsed.ordenAdh || '').replace(/\D/g, '').replace(/^0+/, '');
    if (soloNum && soloNum !== clave) {
      if (!byClave.has(soloNum)) byClave.set(soloNum, []);
      byClave.get(soloNum).push(item);
    }
  }

  return {
    items,
    byClave,
    source: 'xlsx-bloqueos-integral',
    cantidad: items.length,
  };
}

/**
 * @param {string} base64
 */
export async function parseBloqueosIntegralXlsxBase64(base64) {
  const raw = String(base64 || '').trim();
  const b64 = raw.includes(',') ? raw.split(',').pop() : raw;
  const buffer = Buffer.from(b64 || '', 'base64');
  if (!buffer.length) {
    throw new Error('Archivo de bloqueos integral vacío o inválido.');
  }
  return parseBloqueosIntegralXlsx(buffer);
}
