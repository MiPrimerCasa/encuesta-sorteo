import fs from 'fs/promises';
import path from 'path';
import { parsePijRecibo } from '../domain/pij-recibo.js';
import {
  buildOperadorHistoryMap,
  resolveOperadorCanonico,
} from '../domain/operador-canonical.js';

const CAJA_SPREADSHEET_ID = '1jOxw0FXv_HDNkkh9vwQR9T5PoAPk5rcErUJEVjvayBA';

/** Pestañas conocidas del registro PIJ mensual en Google Sheets. */
export const CAJA_SHEETS = {
  junio: { gid: '288750825', label: 'Junio 2026', mes: '06' },
  julio: { gid: '95957770', label: 'Julio 2026', mes: '07' },
  agosto: { gid: '1105569788', label: 'Agosto 2026', mes: '08' },
};

/** Pestañas mensuales del registro PIJ. Override: CAJA_SHEET_GIDS=gid1,gid2,... */
const CAJA_SHEET_GIDS = (
  process.env.CAJA_SHEET_GIDS || Object.values(CAJA_SHEETS).map((s) => s.gid).join(',')
)
  .split(',')
  .map((g) => g.trim())
  .filter(Boolean);

/** @param {string | null | undefined} mesNombre junio|julio|agosto */
export function cajaSheetPorNombreMes(mesNombre) {
  const key = String(mesNombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!key) return null;
  if (CAJA_SHEETS[key]) return CAJA_SHEETS[key];
  for (const [k, sheet] of Object.entries(CAJA_SHEETS)) {
    if (key.includes(k)) return sheet;
  }
  return null;
}

/** Hoja Caja conocida para un YYYY-MM (null si no hay). */
export function cajaSheetParaYyyyMm(yyyyMm) {
  const m = String(yyyyMm || '').match(/^\d{4}-(\d{2})$/);
  if (!m) return null;
  return Object.values(CAJA_SHEETS).find((s) => s.mes === m[1]) || null;
}

/** Resuelve hoja desde texto de período (código/descripción SP). */
export function cajaSheetDesdeTextoPeriodo(texto) {
  return cajaSheetPorNombreMes(texto);
}

/** Etiqueta legible a partir de gids. */
export function cajaFuenteDesdeGids(gids) {
  const list = Array.isArray(gids) ? gids.filter(Boolean) : [];
  if (list.length === 1) {
    const sheet = Object.values(CAJA_SHEETS).find((s) => s.gid === list[0]);
    if (sheet) return sheet.label;
  }
  if (!list.length) return null;
  return `Pestañas: ${list.join(', ')}`;
}

function cajaCsvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${CAJA_SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parsea el CSV exportado de una pestaña del registro PIJ.
 * Detecta la fila de cabecera buscando FECHA + ORDEN ANEXO (Junio fila 9, Julio fila 1, etc.).
 */
export function parseCajaCsvText(csvText, sheetGid = '') {
  const lines = csvText.split(/\r?\n/);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('FECHA') && lines[i].includes('ORDEN ANEXO')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error(
      sheetGid
        ? `Formato de CSV inválido (gid ${sheetGid}): no se encontró la fila de cabecera`
        : 'Formato de CSV inválido: no se encontró la fila de cabecera',
    );
  }

  const keys = parseCSVLine(lines[headerIndex]).map((h) => h.toUpperCase().trim());

  const fechaIdx = keys.indexOf('FECHA');
  const serieIdx = keys.indexOf('SERIE');
  const adhIdx = keys.indexOf('ORDEN ADH');
  const anexoIdx = keys.indexOf('ORDEN ANEXO');
  const nombreIdx = keys.indexOf('NOMBRE CLIENTE');
  const vendedorIdx = keys.indexOf('NOMBRE DEL VENDEDOR');
  const conceptoIdx = keys.indexOf('CONCEPTO');

  if (fechaIdx === -1 || anexoIdx === -1) {
    throw new Error(
      sheetGid
        ? `Formato de CSV inválido (gid ${sheetGid}): faltan columnas FECHA u ORDEN ANEXO`
        : 'Formato de CSV inválido: faltan columnas FECHA u ORDEN ANEXO',
    );
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseCSVLine(line);

    const anexo = values[anexoIdx] || '';
    const adh = values[adhIdx] || '';
    if (!anexo && !adh) continue;

    rows.push({
      fecha: values[fechaIdx] || '',
      serie: values[serieIdx] || '',
      ordenAdh: adh,
      ordenAnexo: anexo,
      nombreCliente: values[nombreIdx] || '',
      nombreVendedor: vendedorIdx !== -1 ? (values[vendedorIdx] || '') : '',
      concepto: conceptoIdx !== -1 ? (values[conceptoIdx] || '') : '',
      sheetGid: sheetGid || undefined,
    });
  }

  return rows;
}

async function fetchCajaSheetRows(gid) {
  const response = await fetch(cajaCsvUrl(gid));
  if (!response.ok) {
    throw new Error(`Error fetching Google Sheets CSV (gid ${gid}): ${response.statusText}`);
  }
  const csvText = await response.text();
  return parseCajaCsvText(csvText, gid);
}

/**
 * @param {{ sheetGids?: string[] }} [options]
 * @returns {Promise<Array<ReturnType<typeof parseCajaCsvText>[number]>>}
 */
export async function fetchCajaData(options = {}) {
  const gids = options.sheetGids?.length ? options.sheetGids : CAJA_SHEET_GIDS;
  if (gids.length === 0) {
    throw new Error('No hay pestañas de Caja configuradas (CAJA_SHEET_GIDS vacío)');
  }

  const results = await Promise.all(gids.map((gid) => fetchCajaSheetRows(gid)));
  return results.flat();
}

function normalizar(texto) {
  if (!texto) return '';
  return texto.toString().trim().toUpperCase().replace(/[\s\-]/g, '');
}

/**
 * Genera posibles variantes de cómo un recibo pudo ser ingresado en el CRM.
 */
export function generarVariantesRecibo(row) {
  const variantes = new Set();
  const serie = normalizar(row.serie);
  const adh = normalizar(row.ordenAdh);
  const anexo = normalizar(row.ordenAnexo);

  // Si hay anexo, el usuario pudo cargar el número de anexo solo
  if (anexo && anexo !== '-') variantes.add(anexo);
  
  // Si hay ADH
  if (adh && adh !== '-') {
    variantes.add(adh); // ej: "231"
    if (serie) {
      variantes.add(`${serie}${adh}`); // ej: "A231"
    }
  }

  // Combinaciones
  if (adh && anexo && adh !== '-' && anexo !== '-') {
    variantes.add(`${adh}/${anexo}`);
    if (serie) {
      variantes.add(`${serie}${adh}/${anexo}`);
    }
  }

  return Array.from(variantes);
}

export function extractNumbersFromCrmRecibo(recibo) {
  if (!recibo) return [];
  const clean = recibo.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '/');
  
  const matches = new Set();
  
  // 1. Patrón completo: A23/300ANEXO171/300
  const m = clean.match(/^([A-Z]*\d+)(?:\/\d+)?ANEXO(\d+)(?:\/\d+)?$/);
  if (m) {
    matches.add(m[1]); // "A23"
    matches.add(m[2]); // "171"
    
    const seriesMatch = m[1].match(/^[A-Z]+(\d+)$/);
    if (seriesMatch) {
      matches.add(seriesMatch[1]); // "23"
    }
  }

  // 2. Patrón simple con serie: A23/300
  const m2 = clean.match(/^([A-Z]+)(\d+)(?:\/\d+)?$/);
  if (m2) {
    matches.add(m2[1] + m2[2]); // "A23"
    matches.add(m2[2]); // "23"
  }

  // 3. Patrón sólo anexo: ANEXO171/300 o 171/300
  const m3 = clean.match(/^(?:ANEXO)?(\d+)(?:\/\d+)?$/);
  if (m3) {
    matches.add(m3[1]); // "171"
  }
  
  // Agregar el recibo original normalizado
  matches.add(clean.replace(/[^A-Z0-9\/]/g, ''));
  
  return Array.from(matches);
}

function normalizarNumeroCaja(val) {
  const s = String(val ?? '').trim();
  if (!s || s === '-') return '';
  return s.replace(/\D/g, '');
}

/**
 * Normaliza a YYYY-MM-DD (día calendario local si viene con hora).
 */
export function normalizarDiaComparacion(val) {
  if (!val) return '';
  const str = String(val).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Solo proponer corrección de fecha si la Caja tiene una fecha anterior a la del CRM.
 * Ej.: CRM 29/06 y Caja 27/06 → sí. CRM 28/06 y Caja 29/06 → no.
 */
export function necesitaActualizarFechaDesdeCaja(fechaCrmStr, fechaCajaStr) {
  const crm = normalizarDiaComparacion(fechaCrmStr);
  const caja = normalizarDiaComparacion(fechaCajaStr);
  if (!caja || !crm) return false;
  return caja < crm;
}

function mesCalendarioDeIso(isoStr) {
  const d = normalizarDiaComparacion(isoStr);
  return d ? d.slice(5, 7) : '';
}

/**
 * Modo corrección: ventas de junio mal cargadas en el CRM con fecha de julio.
 * Usa solo la pestaña Junio de Caja como fuente y propone la fecha de junio si difiere.
 */
export function necesitaCorreccionJulioConJunio(fechaCrmStr, fechaCajaStr) {
  const crm = normalizarDiaComparacion(fechaCrmStr);
  const caja = normalizarDiaComparacion(fechaCajaStr);
  if (!caja) return false;
  if (!crm) return true;
  if (crm === caja) return false;

  const mesCrm = mesCalendarioDeIso(crm);
  const mesCaja = mesCalendarioDeIso(caja);
  if (mesCrm === '07' && mesCaja === '06') return true;

  return necesitaActualizarFechaDesdeCaja(fechaCrmStr, fechaCajaStr);
}

/** Compara adhesión/anexo del CRM con la fila de Caja. */
export function evaluarDiferenciasReciboPij(numeroRecibo, matchedRow) {
  const parsed = parsePijRecibo(numeroRecibo);
  const serieExcel = String(matchedRow?.serie || 'A').trim().toUpperCase() || 'A';
  const adhExcel = normalizarNumeroCaja(matchedRow?.ordenAdh);
  const anexoExcel = normalizarNumeroCaja(matchedRow?.ordenAnexo);

  const adhesionDiff = Boolean(adhExcel && parsed.adhesion !== adhExcel);
  const anexoDiff = Boolean(anexoExcel && parsed.anexo !== anexoExcel);
  const serieDiff = Boolean(adhExcel && parsed.serie !== serieExcel);

  return {
    necesitaRecibo: adhesionDiff || anexoDiff || serieDiff,
    adhesionActual: parsed.adhesion || '—',
    anexoActual: parsed.anexo || '—',
    adhesionExcel: adhExcel || '—',
    anexoExcel: anexoExcel || '—',
    serieActual: parsed.serie || 'A',
    serieExcel,
  };
}

export function formatReciboCaja(serie, ordenAdh, ordenAnexo) {
  const parts = [];
  const s = String(serie || '').trim().toUpperCase();
  const adh = String(ordenAdh || '').trim().toUpperCase();
  const anexo = String(ordenAnexo || '').trim().toUpperCase();

  if (adh && adh !== '-') {
    parts.push(`${s}${adh}/300`);
  }
  if (anexo && anexo !== '-') {
    parts.push(`ANEXO ${anexo}`);
  }

  return parts.join(' ');
}


/**
 * Parsea "DD/MM" o "DD/MM/YY" a un string YYYY-MM-DD
 */
export function parseFechaCaja(fechaStr) {
  if (!fechaStr) return null;
  const parts = fechaStr.trim().split('/');
  if (parts.length < 2) return null;
  
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  
  let year = new Date().getFullYear();
  if (parts.length === 3) {
    if (parts[2].length === 2) {
      year = 2000 + parseInt(parts[2], 10);
    } else if (parts[2].length === 4) {
      year = parseInt(parts[2], 10);
    }
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * Normaliza textos para comparación segura.
 */
function normalizeName(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function nombresCoinciden(nombreCrm, nombreExcel) {
  if (!nombreCrm || !nombreExcel) return false;
  const n1 = normalizeName(nombreCrm).split(/\s+/).filter(p => p.length > 2);
  const n2 = normalizeName(nombreExcel).split(/\s+/).filter(p => p.length > 2);
  
  if (n1.length === 0 || n2.length === 0) return false;
  
  const set2 = new Set(n2);
  let matchCount = 0;
  for (const word of n1) {
    if (set2.has(word)) {
      matchCount++;
    }
  }
  
  const requiredMatches = Math.min(2, n1.length);
  return matchCount >= requiredMatches;
}

/**
 * Compara dos nombres de vendedores a ver si coinciden parcialmente
 */
function vendedoresCoinciden(vendedorCrm, vendedorExcel) {
  if (!vendedorCrm || !vendedorExcel) return false;
  const vc = normalizeName(vendedorCrm);
  const ve = normalizeName(vendedorExcel);
  if (vc === ve || vc.includes(ve) || ve.includes(vc)) return true;
  const w1 = vc.split(/\s+/).filter(w => w.length > 2);
  const w2 = ve.split(/\s+/).filter(w => w.length > 2);
  for (const w of w1) {
    if (w2.includes(w)) return true;
  }
  return false;
}

/**
 * @param {unknown[]} leadsDB
 * @param {{ sheetGids?: string[], corregirJulioConJunio?: boolean }} [options]
 */
export async function buildSyncPreview(leadsDB, options = {}) {
  const { sheetGids, corregirJulioConJunio = false } = options;
  const excelRows = await fetchCajaData({ sheetGids });
  
  // Mapear cada variante generada a las filas de excel que son ADHESION (cierres/ventas nuevas).
  // Una fila es adhesión si:
  //   a) el concepto contiene 'ADHESION', o
  //   b) el concepto está vacío Y la fila tiene ORDEN ANEXO (columna que solo aparece en adhesiones).
  // Las cuotas de planes ya existentes tienen concepto 'CUOTA X' y solo tienen ORDEN ADH, sin ANEXO.
  const esFilaAdhesion = (row) => {
    const concepto = String(row.concepto ?? '').trim().toUpperCase();
    if (concepto.includes('ADHESION')) return true;
    if (!concepto && row.ordenAnexo && String(row.ordenAnexo).trim() && String(row.ordenAnexo).trim() !== '-') return true;
    return false;
  };

  const variantesMap = new Map();
  for (const row of excelRows) {
    if (!esFilaAdhesion(row)) continue; // SOLO ADHESIONES (CIERRES)

    const variantes = generarVariantesRecibo(row);
    for (const v of variantes) {
      if (!variantesMap.has(v)) variantesMap.set(v, []);
      variantesMap.get(v).push(row);
    }
  }

  const cambiosPropuestos = [];
  
  const procesarRegistro = (leadId, idProducto, estadoPago, numeroRecibo, fechaCierre, fechaCreado, nombreCliente, promotorNombre, isCompraAdicional, compraId = null) => {
    if (idProducto !== 'prod-pij') return; // SOLO PIJ
    if (!numeroRecibo || numeroRecibo === '-') return;

    // Extraer variantes del recibo actual en el CRM (tolerante a formato concatenado)
    const variantesCrm = extractNumbersFromCrmRecibo(numeroRecibo);
    const matchedRows = [];
    for (const v of variantesCrm) {
      if (variantesMap.has(v)) {
        matchedRows.push(...variantesMap.get(v));
      }
    }

    let matchedRow = null;
    let esAmbiguo = false;

    if (matchedRows.length === 0) {
      // Fallback por coincidencia de nombre de cliente (solo adhesiones)
      const matchesNombre = excelRows.filter(row => {
        if (!esFilaAdhesion(row)) return false;
        return nombresCoinciden(nombreCliente, row.nombreCliente);
      });
      if (matchesNombre.length === 1) {
        matchedRow = matchesNombre[0];
      } else {
        return; // No hay coincidencia única
      }
    } else {
      // Eliminar filas duplicadas que hayan coincidido con múltiples variantes
      const uniqueMatches = Array.from(new Set(matchedRows));
      if (uniqueMatches.length === 1) {
        const candidate = uniqueMatches[0];
        if (nombresCoinciden(nombreCliente, candidate.nombreCliente) || vendedoresCoinciden(promotorNombre, candidate.nombreVendedor)) {
          matchedRow = candidate;
        }
      } else {
        // Colisión. Desempatamos por nombre de cliente
        const matchesPorNombre = uniqueMatches.filter(r => nombresCoinciden(nombreCliente, r.nombreCliente));
        if (matchesPorNombre.length === 1) {
          matchedRow = matchesPorNombre[0];
        } else {
          // Desempatamos por vendedor
          const matchesPorVendedor = uniqueMatches.filter(r => vendedoresCoinciden(promotorNombre, r.nombreVendedor));
          if (matchesPorVendedor.length === 1) {
            matchedRow = matchesPorVendedor[0];
          } else {
            esAmbiguo = true; // No pudimos desempatar, lo saltamos
          }
        }
      }
    }

    if (esAmbiguo || !matchedRow) return;

    const nuevaFecha = parseFechaCaja(matchedRow.fecha);
    const fechaCierreStr = fechaCierre ? fechaCierre.slice(0, 10) : '';
    const fechaCreadoStr = fechaCreado ? fechaCreado.slice(0, 10) : '';
    const fechaEffectiveStr = fechaCierreStr || fechaCreadoStr;

    if (corregirJulioConJunio) {
      const refCrm = fechaCierreStr || fechaCreadoStr;
      if (mesCalendarioDeIso(refCrm) !== '07') return;
      if (mesCalendarioDeIso(nuevaFecha) !== '06') return;
    }

    const reciboDiff = evaluarDiferenciasReciboPij(numeroRecibo, matchedRow);
    const reciboPropuesto = formatReciboCaja(
      matchedRow.serie || 'A',
      matchedRow.ordenAdh,
      matchedRow.ordenAnexo,
    );

    const necesitaFecha = corregirJulioConJunio
      ? necesitaCorreccionJulioConJunio(fechaCierreStr || fechaCreadoStr, nuevaFecha)
      : necesitaActualizarFechaDesdeCaja(fechaCierreStr, nuevaFecha);

    if (!necesitaFecha && !reciboDiff.necesitaRecibo) return;

    cambiosPropuestos.push({
      idUnico: isCompraAdicional ? `${leadId}_compra_${compraId}` : `${leadId}_principal`,
      leadId,
      isCompraAdicional,
      compraId,
      nombreCliente,
      promotorNombre: promotorNombre || '',
      numeroRecibo,
      fechaActual: fechaCierreStr || fechaEffectiveStr,
      nuevaFecha: nuevaFecha || fechaEffectiveStr,
      necesitaFecha,
      necesitaRecibo: reciboDiff.necesitaRecibo,
      reciboPropuesto,
      adhesionActual: reciboDiff.adhesionActual,
      anexoActual: reciboDiff.anexoActual,
      adhesionExcel: reciboDiff.adhesionExcel,
      anexoExcel: reciboDiff.anexoExcel,
      excelRow: {
        fecha: matchedRow.fecha,
        serie: matchedRow.serie,
        ordenAdh: matchedRow.ordenAdh,
        ordenAnexo: matchedRow.ordenAnexo,
        nombreCliente: matchedRow.nombreCliente,
        nombreVendedor: matchedRow.nombreVendedor,
        concepto: matchedRow.concepto,
      },
    });
  };

  // Procesar Leads principales
  for (const lead of leadsDB) {
    procesarRegistro(
      String(lead.id), 
      lead.seguimiento?.idProducto, 
      lead.seguimiento?.estadoPago, 
      lead.seguimiento?.numeroRecibo, 
      lead.seguimiento?.fechaCierre, 
      lead.seguimiento?.creadoEn || lead.seguimiento?.creado_en, 
      lead.nombre, 
      lead.promotorNombre,
      false
    );
    
    // Compras Adicionales
    const adicionales = lead.seguimiento?.comprasAdicionales || [];
    for (const compra of adicionales) {
      procesarRegistro(
        String(lead.id), 
        compra.idProducto, 
        compra.estadoPago, 
        compra.numeroRecibo, 
        compra.fechaCierre, 
        compra.creadoEn || compra.creado_en, 
        `${lead.nombre} (Adic.)`, 
        lead.promotorNombre,
        true, 
        compra.id
      );
    }
  }

  return cambiosPropuestos;
}

export async function executeSyncCommit(cambiosAprobados, usuario, tipoAplicar = 'fecha') {
  if (!cambiosAprobados || cambiosAprobados.length === 0) return { actualizados: 0, tipo: tipoAplicar };
  if (tipoAplicar !== 'fecha' && tipoAplicar !== 'recibo') {
    throw new Error('tipoAplicar inválido: debe ser "fecha" o "recibo"');
  }
  
  const { listAllLeadsFromEncuestas } = await import('../db/encuestas.js');
  const { persistirSeguimientoLead } = await import('../db/seguimiento-sql.js');
  
  const allLeads = await listAllLeadsFromEncuestas();
  const leadsMap = new Map(allLeads.map(l => [String(l.id), l]));

  const conservarHoraOriginal = (nuevaFechaStr, fechaOriginalStr) => {
    if (!nuevaFechaStr) return null;
    if (!fechaOriginalStr) return `${nuevaFechaStr}T12:00:00`;
    const matchHora = fechaOriginalStr.trim().match(/(?:T|\s+)(\d{2}:\d{2}(?::\d{2})?)/);
    if (matchHora) {
      return `${nuevaFechaStr}T${matchHora[1]}`;
    }
    return `${nuevaFechaStr}T12:00:00`;
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'server', 'backups', 'sync_caja');
  await fs.mkdir(backupDir, { recursive: true });

  // Pre-procesar todos los cambios para calcular el backup final exacto
  const listaCambiosProcesados = [];
  
  for (const cambio of cambiosAprobados) {
    const lead = leadsMap.get(String(cambio.leadId));
    if (!lead) continue;

    let fechaOriginal = null;
    let reciboOriginal = null;
    if (cambio.isCompraAdicional) {
      const compra = (lead.seguimiento?.comprasAdicionales || []).find(c => String(c.id) === String(cambio.compraId));
      fechaOriginal = compra?.fechaCierre;
      reciboOriginal = compra?.numeroRecibo;
    } else {
      fechaOriginal = lead.seguimiento?.fechaCierre;
      reciboOriginal = lead.seguimiento?.numeroRecibo;
    }

    if (tipoAplicar === 'fecha') {
      if (!cambio.necesitaFecha || !cambio.nuevaFecha) continue;
      const nuevaFechaConHora = conservarHoraOriginal(cambio.nuevaFecha, fechaOriginal);
      listaCambiosProcesados.push({
        leadId: lead.id,
        nombreCliente: lead.nombre,
        promotorNombreCRM: lead.promotorNombre || 'Sin Vendedor',
        isCompraAdicional: cambio.isCompraAdicional,
        compraId: cambio.compraId,
        reciboActual: reciboOriginal || '',
        fechaCierreAnterior: fechaOriginal || '',
        fechaCierreNueva: nuevaFechaConHora,
        tipoAplicado: 'fecha',
        excelRow: cambio.excelRow,
      });
      continue;
    }

    if (!cambio.necesitaRecibo || !cambio.reciboPropuesto) continue;
    listaCambiosProcesados.push({
      leadId: lead.id,
      nombreCliente: lead.nombre,
      promotorNombreCRM: lead.promotorNombre || 'Sin Vendedor',
      isCompraAdicional: cambio.isCompraAdicional,
      compraId: cambio.compraId,
      reciboAnterior: reciboOriginal || '',
      reciboNuevo: cambio.reciboPropuesto,
      fechaCierreActual: fechaOriginal || '',
      tipoAplicado: 'recibo',
      excelRow: cambio.excelRow,
    });
  }

  // Guardar backup rico y estructurado
  const backupPath = path.join(backupDir, `pij_sync_${tipoAplicar}_${timestamp}.json`);
  const backupPayload = {
    fechaEjecucion: new Date().toISOString(),
    operadorQueSincroniza: usuario?.nombre || 'Sistema',
    tipoAplicado: tipoAplicar,
    totalRegistros: listaCambiosProcesados.length,
    cambios: listaCambiosProcesados,
  };
  await fs.writeFile(backupPath, JSON.stringify(backupPayload, null, 2), 'utf-8');
  console.log(`[SyncCaja] Backup rico guardado en ${backupPath}`);

  let actualizados = 0;

  // Aplicar cambios en la Base de Datos según el tipo elegido
  for (const item of listaCambiosProcesados) {
    const lead = leadsMap.get(String(item.leadId));
    if (!lead) continue;

    const operadorPersist = {
      id: String(lead.seguimiento?.operadorId ?? lead.promotorId ?? '1'),
      nombre: lead.seguimiento?.operadorNombre || lead.promotorNombre || 'Operador',
      rol: lead.seguimiento?.operadorRol || 'promotor',
    };

    let patch = {};
    if (item.tipoAplicado === 'recibo') {
      if (item.isCompraAdicional) {
        const compras = lead.seguimiento?.comprasAdicionales || [];
        const updatedCompras = compras.map(c => {
          if (String(c.id) === String(item.compraId)) {
            return { ...c, numeroRecibo: item.reciboNuevo };
          }
          return c;
        });
        patch = { comprasAdicionales: updatedCompras };
      } else {
        patch = { numeroRecibo: item.reciboNuevo };
      }
    } else if (item.isCompraAdicional) {
      const compras = lead.seguimiento?.comprasAdicionales || [];
      const updatedCompras = compras.map(c => {
        if (String(c.id) === String(item.compraId)) {
          return { ...c, fechaCierre: item.fechaCierreNueva };
        }
        return c;
      });
      patch = { comprasAdicionales: updatedCompras };
    } else {
      patch = { fechaCierre: item.fechaCierreNueva };
    }

    try {
      const res = await persistirSeguimientoLead(lead.id, patch, operadorPersist, lead);
      if (res && res.saved) {
        actualizados++;
      }
    } catch (err) {
      console.error(`[SyncCaja] Error al actualizar lead ${lead.id}:`, err);
    }
  }

  return { actualizados, tipo: tipoAplicar };
}

function normalizarFuzzy(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\s]/g, '')     // Quitar caracteres especiales
    .trim();
}

function nombresCoincidenFuzzy(a, b) {
  const normA = normalizarFuzzy(a);
  const normB = normalizarFuzzy(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  
  const tokensA = normA.split(/\s+/).filter(Boolean);
  const tokensB = normB.split(/\s+/).filter(Boolean);
  
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  
  let intersectCount = 0;
  for (const token of tokensA) {
    if (setB.has(token)) intersectCount++;
  }
  
  const minLength = Math.min(tokensA.length, tokensB.length);
  if (intersectCount >= 2) return true;
  if (intersectCount >= 1 && minLength === 1) return true;
  
  if (normA.includes('rocdan') && normB.includes('rocdan')) return true;
  if (normA.includes('gamarra') && normB.includes('gamarra')) {
    const isEstefaniaA = normA.includes('estefania');
    const isEstefaniaB = normB.includes('estefania');
    const isEzequielA = normA.includes('ezequiel');
    const isEzequielB = normB.includes('ezequiel');
    if ((isEstefaniaA && isEzequielB) || (isEstefaniaB && isEzequielA)) return false;
    return true;
  }
  
  return false;
}

async function resolverUsuarioDeSincronizacion(cambio, lead, pool, catalog) {
  const vendedorExcel = String(cambio.excelRow?.nombreVendedor ?? '').trim().toUpperCase();
  let targetOperator = null;
  let history = [];
  
  if (vendedorExcel && pool) {
    try {
      // Buscar en el historial de seguimiento por nombre flexible
      const histRes = await pool.query(`
        EXEC SP_HistorialSeguimientoAdmin @desde = '2026-01-01 00:00:00'
      `);
      history = histRes.recordset || [];
      
      const opMap = new Map(); // operador_nombre -> { id, nombre, rol }
      for (const r of history) {
        if (r.operador_nombre) {
          opMap.set(r.operador_nombre.toUpperCase(), {
            id: String(r.operador_id),
            nombre: r.operador_nombre,
            rol: r.operador_rol
          });
        }
      }
      
      // Intentar coincidencia explícita en nuestro mapa
      const MAPA_VENDEDORES_EXPLICITO = {
        'ROCDAN CRISTIAN': 'ROCDAN CRISTIAN GABRIEL',
        'LUCILA': 'NOGUERA LUCIA ESTHER',
        'ESTEFANIA': 'GAMARRA ESTEFANIA LIA',
        'ESTEFANIA GAMARRA': 'GAMARRA ESTEFANIA LIA',
        'MARINA': 'LEIVA MARINA SOLEDAD',
        'EZEQUIEL GAMARRA': 'GAMARRA EZEQUIEL',
        'GAMARRA EZEQUIEL': 'GAMARRA EZEQUIEL',
        'VELAZCO GERALDINE': 'VELAZCO GERALDINE',
        'NAARA PONA': 'PONA NAARA',
        'BELEN ALLENDRE': 'ALLENDRE BELÉN ELIZABETH',
        'ALLENDRE BELEN': 'ALLENDRE BELÉN ELIZABETH',
        'AGUIRRE CAROLINA': 'AGUIRRE CAROLINA',
        'DAHIANA CERRIZUELA': 'CERRIZUELA DAHIANA  AYLEN',
        'CATHERINE CONTRERAS': 'CONTRERAS CATHERINE  GERALDINE',
      };
      
      const mappedName = MAPA_VENDEDORES_EXPLICITO[vendedorExcel];
      if (mappedName && opMap.has(mappedName.toUpperCase())) {
        targetOperator = opMap.get(mappedName.toUpperCase());
      } else {
        // Buscar por coincidencia fuzzy en el historial
        for (const [opName, opData] of opMap.entries()) {
          if (nombresCoincidenFuzzy(vendedorExcel, opName)) {
            targetOperator = opData;
            break;
          }
        }
      }
      
      // Si no se encontró en el historial, buscar en catálogo estático
      if (!targetOperator && catalog) {
        const allOperators = Object.values(catalog.byCodigo ?? {});
        let catalogMatch = null;
        
        const MAPA_CATALOGO_EXPLICITO = {
          'ROCDAN CRISTIAN': 'Christian R',
          'LUCILA': 'Lucia N',
          'ESTEFANIA': 'Estefania G',
          'ESTEFANIA GAMARRA': 'Estefania G',
          'MARINA': 'Marina L',
          'EZEQUIEL GAMARRA': 'Gamarra E ',
          'GAMARRA EZEQUIEL': 'Gamarra E ',
          'VELAZCO GERALDINE': 'Velazco G',
          'NAARA PONA': 'Naara Pona',
        };
        
        const catMappedName = MAPA_CATALOGO_EXPLICITO[vendedorExcel];
        if (catMappedName) {
          catalogMatch = allOperators.find(o => o.vendedor === catMappedName);
        } else {
          catalogMatch = allOperators.find(o => o.vendedor && nombresCoincidenFuzzy(vendedorExcel, o.vendedor));
        }
        
        if (catalogMatch) {
          const idOpEntry = Object.entries(catalog.byIdOperador ?? {}).find(([id, meta]) => {
            return meta.codigo === catalogMatch.codigo;
          });
          
          const operatorId = idOpEntry ? idOpEntry[0] : null;
          let resolvedId = operatorId;
          
          if (!resolvedId) {
            const teamCode = catalogMatch.codigo ? catalogMatch.codigo.match(/S\d{2}/)?.[0] : null;
            if (teamCode) {
              const PROMOTOR_EQUIPO_SUPERVISOR_IDS = {
                "S01":"23","S02":"45","S03":"72","S04":"121","S05":"123","S06":"130","S07":"101","S08":"122",
                "S09":"126","S10":"110","S11":"37","S12":"113","S14":"78","S15":"87","S16":"15","S18":"39",
                "S19":"42","S20":"47","S21":"132","S22":"2"
              };
              resolvedId = PROMOTOR_EQUIPO_SUPERVISOR_IDS[teamCode];
            }
          }
          
          targetOperator = {
            id: resolvedId ? String(resolvedId) : '1',
            nombre: catalogMatch.vendedor,
            rol: catalogMatch.rol
          };
        }
      }
    } catch (err) {
      console.error('[SyncCaja] Error al resolver operador de sincronización:', err);
    }
  }
  
  // Fallback 1: Si no se pudo resolver, o si la celda estaba vacía, usar el operador original del lead
  if (!targetOperator && lead?.seguimiento?.operadorId) {
    targetOperator = {
      id: String(lead.seguimiento.operadorId),
      nombre: lead.seguimiento.operadorNombre || 'Operador Original',
      rol: lead.seguimiento.operadorRol || 'promotor'
    };
  }
  
  // Fallback 2: El promotor/vendedor de la encuesta
  if (!targetOperator && lead?.promotorNombre) {
    targetOperator = {
      id: '1',
      nombre: lead.promotorNombre,
      rol: 'promotor'
    };
  }

  if (!history.length && pool) {
    try {
      const histRes = await pool.query(`
        EXEC SP_HistorialSeguimientoAdmin @desde = '2026-01-01 00:00:00'
      `);
      history = histRes.recordset || [];
    } catch {
      // ignorar — se resuelve con mapa estático
    }
  }

  const historyMap = buildOperadorHistoryMap(history);
  const canonico = resolveOperadorCanonico({
    operadorId: targetOperator?.id,
    operadorNombre: targetOperator?.nombre || vendedorExcel,
    promotorNombre: lead?.promotorNombre,
    historyMap,
  });

  if (canonico?.nombre) {
    return {
      id: canonico.id ? String(canonico.id) : (targetOperator?.id ? String(targetOperator.id) : '1'),
      nombre: canonico.nombre,
      rol: canonico.rol || targetOperator?.rol || 'promotor',
    };
  }
  
  return targetOperator || {
    id: '1',
    nombre: 'Soporte Técnico (Sync Caja)',
    rol: 'superadmin'
  };
}

/** Fila de adhesión (cierre nuevo), no cuota de plan existente. */
export function esFilaAdhesionCaja(row) {
  const concepto = String(row?.concepto ?? '').trim().toUpperCase();
  if (concepto.includes('ADHESION')) return true;
  if (
    !concepto &&
    row?.ordenAnexo &&
    String(row.ordenAnexo).trim() &&
    String(row.ordenAnexo).trim() !== '-'
  ) {
    return true;
  }
  return false;
}

/**
 * Índice CRM: variante de recibo → cierres PIJ (principal + adicionales).
 * @param {unknown[]} leadsDB
 */
function construirIndiceCierresPijCrm(leadsDB) {
  /** @type {Map<string, Array<{ leadId: string, nombreCliente: string, promotorNombre: string, operadorNombre: string, numeroRecibo: string, fechaCierre: string|null, isCompraAdicional: boolean }>>} */
  const byVariant = new Map();

  const push = (variantes, meta) => {
    for (const v of variantes) {
      if (!v) continue;
      if (!byVariant.has(v)) byVariant.set(v, []);
      byVariant.get(v).push(meta);
    }
  };

  for (const lead of leadsDB || []) {
    const seg = lead?.seguimiento;
    if (!seg) continue;
    const baseMeta = {
      leadId: String(lead.id),
      nombreCliente: String(lead.nombre || ''),
      promotorNombre: String(lead.promotorNombre || ''),
      operadorNombre: String(seg.operadorNombre || ''),
    };

    if (
      seg.resultadoEntrevista === 'compro' &&
      seg.idProducto === 'prod-pij' &&
      seg.numeroRecibo &&
      String(seg.numeroRecibo).trim() !== '-'
    ) {
      push(extractNumbersFromCrmRecibo(seg.numeroRecibo), {
        ...baseMeta,
        numeroRecibo: String(seg.numeroRecibo),
        fechaCierre: seg.fechaCierre || null,
        isCompraAdicional: false,
      });
    }

    const adicionales = Array.isArray(seg.comprasAdicionales) ? seg.comprasAdicionales : [];
    for (const compra of adicionales) {
      if (String(compra?.idProducto) !== 'prod-pij') continue;
      if (!compra?.numeroRecibo || String(compra.numeroRecibo).trim() === '-') continue;
      push(extractNumbersFromCrmRecibo(compra.numeroRecibo), {
        ...baseMeta,
        numeroRecibo: String(compra.numeroRecibo),
        fechaCierre: compra.fechaCierre || seg.fechaCierre || null,
        isCompraAdicional: true,
      });
    }
  }

  return byVariant;
}

/**
 * Variantes estrictas para cruce del informe (evita falsos positivos por nº corto).
 * Solo serie+ADH y anexo (≥3 dígitos).
 */
export function generarVariantesReciboEstrictas(row) {
  const variantes = new Set();
  const serie = normalizar(row.serie);
  const adh = normalizar(row.ordenAdh);
  const anexo = normalizar(row.ordenAnexo);

  if (adh && adh !== '-') {
    if (serie) {
      variantes.add(`${serie}${adh}`);
      if (anexo && anexo !== '-') {
        variantes.add(`${serie}${adh}/${anexo}`);
        variantes.add(`${serie}${adh}ANEXO${anexo}`);
      }
    }
  }
  if (anexo && anexo !== '-' && anexo.length >= 3) {
    variantes.add(anexo);
    variantes.add(`ANEXO${anexo}`);
  }
  return Array.from(variantes);
}

/**
 * Claves estrictas de un recibo CRM PIJ (sin nº sueltos de 1–2 dígitos).
 */
export function extractNumbersFromCrmReciboEstrictos(recibo) {
  if (!recibo) return [];
  const clean = recibo.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '/');
  const matches = new Set();

  const m = clean.match(/^([A-Z]*\d+)(?:\/\d+)?ANEXO(\d+)(?:\/\d+)?$/);
  if (m) {
    matches.add(m[1]); // A23 o 23
    if (m[2].length >= 3) {
      matches.add(m[2]);
      matches.add(`ANEXO${m[2]}`);
    }
    matches.add(`${m[1]}ANEXO${m[2]}`);
    matches.add(`${m[1]}/${m[2]}`);
  }

  const m2 = clean.match(/^([A-Z]+)(\d+)(?:\/\d+)?$/);
  if (m2) {
    matches.add(m2[1] + m2[2]);
  }

  const m3 = clean.match(/^ANEXO(\d+)(?:\/\d+)?$/);
  if (m3 && m3[1].length >= 3) {
    matches.add(m3[1]);
    matches.add(`ANEXO${m3[1]}`);
  }

  matches.add(clean.replace(/[^A-Z0-9\/]/g, ''));
  return Array.from(matches).filter(Boolean);
}

/**
 * ¿La fecha de cierre cae en YYYY-MM? (calendario local; respeta Z/offset).
 * @param {string|null|undefined} fecha
 * @param {string} yyyyMm
 */
export function fechaCierreEnYyyyMm(fecha, yyyyMm) {
  if (!fecha || !yyyyMm) return false;
  const iso = fechaEventoYyyyMm(fecha);
  return iso === yyyyMm;
}

function fechaEventoYyyyMm(fecha) {
  const s = String(fecha || '').trim();
  if (!s) return null;
  // Instantáneo con zona → día calendario local (AR).
  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const parsed = parseFechaCaja(s);
  if (parsed) {
    const m2 = String(parsed).match(/^(\d{4})-(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Índice CRM PIJ del mes con claves estrictas (para enriquecer informe).
 * @param {unknown[]} leadsDB
 * @param {string} yyyyMm
 */
export function construirIndiceCierresPijCrmEnPeriodo(leadsDB, yyyyMm) {
  /** @type {Map<string, Array<object>>} */
  const byVariant = new Map();
  const push = (variantes, meta) => {
    for (const v of variantes) {
      if (!v) continue;
      if (!byVariant.has(v)) byVariant.set(v, []);
      byVariant.get(v).push(meta);
    }
  };

  for (const lead of leadsDB || []) {
    const seg = lead?.seguimiento;
    if (!seg) continue;
    const baseMeta = {
      leadId: String(lead.id),
      nombreCliente: String(lead.nombre || ''),
      promotorNombre: String(lead.promotorNombre || ''),
      operadorNombre: String(seg.operadorNombre || ''),
    };

    if (
      seg.resultadoEntrevista === 'compro' &&
      seg.idProducto === 'prod-pij' &&
      seg.numeroRecibo &&
      String(seg.numeroRecibo).trim() !== '-' &&
      fechaCierreEnYyyyMm(seg.fechaCierre || seg.creadoEn, yyyyMm)
    ) {
      push(extractNumbersFromCrmReciboEstrictos(seg.numeroRecibo), {
        ...baseMeta,
        numeroRecibo: String(seg.numeroRecibo),
        fechaCierre: seg.fechaCierre || null,
        isCompraAdicional: false,
      });
    }

    const adicionales = Array.isArray(seg.comprasAdicionales) ? seg.comprasAdicionales : [];
    for (const compra of adicionales) {
      if (String(compra?.idProducto) !== 'prod-pij') continue;
      if (!compra?.numeroRecibo || String(compra.numeroRecibo).trim() === '-') continue;
      const fecha = compra.fechaCierre || compra.creadoEn || seg.fechaCierre;
      if (!fechaCierreEnYyyyMm(fecha, yyyyMm)) continue;
      push(extractNumbersFromCrmReciboEstrictos(compra.numeroRecibo), {
        ...baseMeta,
        numeroRecibo: String(compra.numeroRecibo),
        fechaCierre: compra.fechaCierre || null,
        isCompraAdicional: true,
      });
    }
  }

  return byVariant;
}

/**
 * Todas las adhesiones Excel del mes (para total oficial del informe = cantidad Excel).
 * @param {{ yyyyMm: string, sheetGids?: string[], mes?: string }} options
 */
export async function buildExcelAdhesionesDelMes(options = {}) {
  const yyyyMm = options.yyyyMm;
  if (!yyyyMm) {
    return { adhesiones: [], porVendedor: [], cantidad: 0, excelError: 'Falta yyyyMm', fuente: null };
  }

  let sheet = cajaSheetParaYyyyMm(yyyyMm);
  let gids = Array.isArray(options.sheetGids) ? options.sheetGids.filter(Boolean) : [];
  if (!gids.length && sheet) gids = [sheet.gid];
  if (!gids.length && options.mes) {
    sheet = cajaSheetPorNombreMes(options.mes);
    if (sheet) gids = [sheet.gid];
  }
  if (!gids.length) {
    return {
      adhesiones: [],
      porVendedor: [],
      cantidad: 0,
      excelError: `No hay hoja Excel de Caja configurada para ${yyyyMm}.`,
      fuente: null,
    };
  }

  const excelRows = await fetchCajaData({ sheetGids: gids });
  const rows = excelRows.filter(esFilaAdhesionCaja);
  const seenKeys = new Set();
  const adhesiones = [];

  for (const row of rows) {
    const key = [
      String(row.serie || '').trim().toUpperCase(),
      String(row.ordenAdh || '').trim(),
      String(row.ordenAnexo || '').trim(),
      String(row.nombreCliente || '').trim().toLowerCase(),
    ].join('|');
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const serie = String(row.serie || '').trim().toUpperCase() || 'A';
    const ordenAdh = String(row.ordenAdh || '').trim();
    adhesiones.push({
      idUnico: key,
      fechaExcel: row.fecha || '',
      fechaIso: parseFechaCaja(row.fecha) || null,
      serie,
      ordenAdh,
      ordenAnexo: String(row.ordenAnexo || '').trim(),
      reciboSugerido: formatReciboCaja(serie, ordenAdh, row.ordenAnexo),
      nombreClienteExcel: String(row.nombreCliente || '').trim(),
      vendedorExcel: String(row.nombreVendedor || '').trim(),
      concepto: String(row.concepto || '').trim(),
    });
  }

  const porVendedorMap = new Map();
  for (const f of adhesiones) {
    const v = f.vendedorExcel || 'Sin vendedor';
    if (!porVendedorMap.has(v)) {
      porVendedorMap.set(v, { vendedor: v, cantidad: 0, clientes: [] });
    }
    const g = porVendedorMap.get(v);
    g.cantidad += 1;
    g.clientes.push({
      nombre: f.nombreClienteExcel,
      recibo: f.reciboSugerido,
      fecha: f.fechaExcel,
    });
  }
  const porVendedor = Array.from(porVendedorMap.values()).sort(
    (a, b) => b.cantidad - a.cantidad || a.vendedor.localeCompare(b.vendedor, 'es'),
  );

  return {
    adhesiones,
    porVendedor,
    cantidad: adhesiones.length,
    excelError: null,
    fuente: sheet?.label || `Pestañas: ${gids.join(', ')}`,
  };
}

/**
 * Adhesiones Excel del mes que NO están en cierres PIJ del CRM en ese mismo mes.
 * Match estricto (serie+ADH / anexo) para no ocultar faltantes reales del informe.
 *
 * @param {unknown[]} leadsDB
 * @param {{ yyyyMm: string, sheetGids?: string[], mes?: string }} options
 */
export async function buildFaltantesExcelVsCrmEnPeriodo(leadsDB, options = {}) {
  const yyyyMm = options.yyyyMm;
  if (!yyyyMm) {
    return {
      faltantes: [],
      porVendedor: [],
      adhesionesExcel: 0,
      matchedEnPeriodo: 0,
      excelError: 'Falta yyyyMm',
      fuente: null,
    };
  }

  let sheet = cajaSheetParaYyyyMm(yyyyMm);
  let gids = Array.isArray(options.sheetGids) ? options.sheetGids.filter(Boolean) : [];
  if (!gids.length && sheet) gids = [sheet.gid];
  if (!gids.length && options.mes) {
    sheet = cajaSheetPorNombreMes(options.mes);
    if (sheet) gids = [sheet.gid];
  }

  if (!gids.length) {
    return {
      faltantes: [],
      porVendedor: [],
      adhesionesExcel: 0,
      matchedEnPeriodo: 0,
      excelError: `No hay hoja Excel de Caja configurada para ${yyyyMm}.`,
      fuente: null,
    };
  }

  const excelRows = await fetchCajaData({ sheetGids: gids });
  const adhesiones = excelRows.filter(esFilaAdhesionCaja);
  const indicePeriodo = construirIndiceCierresPijCrmEnPeriodo(leadsDB, yyyyMm);

  const faltantes = [];
  let matchedEnPeriodo = 0;
  const seenKeys = new Set();

  for (const row of adhesiones) {
    const key = [
      String(row.serie || '').trim().toUpperCase(),
      String(row.ordenAdh || '').trim(),
      String(row.ordenAnexo || '').trim(),
      String(row.nombreCliente || '').trim().toLowerCase(),
    ].join('|');
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const variantes = generarVariantesReciboEstrictas(row);
    let hitEnPeriodo = false;
    for (const v of variantes) {
      if (indicePeriodo.get(v)?.length) {
        hitEnPeriodo = true;
        break;
      }
    }

    if (hitEnPeriodo) {
      matchedEnPeriodo += 1;
      continue;
    }

    const serie = String(row.serie || '').trim().toUpperCase() || 'A';
    const ordenAdh = String(row.ordenAdh || '').trim();
    faltantes.push({
      idUnico: key,
      estado: 'sin_match_periodo',
      fechaExcel: row.fecha || '',
      fechaIso: parseFechaCaja(row.fecha) || null,
      serie,
      ordenAdh,
      ordenAnexo: String(row.ordenAnexo || '').trim(),
      reciboSugerido: formatReciboCaja(serie, ordenAdh, row.ordenAnexo),
      nombreClienteExcel: String(row.nombreCliente || '').trim(),
      vendedorExcel: String(row.nombreVendedor || '').trim(),
      concepto: String(row.concepto || '').trim(),
      matchCrm: null,
    });
  }

  const porVendedorMap = new Map();
  for (const f of faltantes) {
    const v = f.vendedorExcel || 'Sin vendedor';
    if (!porVendedorMap.has(v)) {
      porVendedorMap.set(v, { vendedor: v, cantidad: 0, clientes: [] });
    }
    const g = porVendedorMap.get(v);
    g.cantidad += 1;
    g.clientes.push({
      nombre: f.nombreClienteExcel,
      recibo: f.reciboSugerido,
      fecha: f.fechaExcel,
    });
  }
  const porVendedor = Array.from(porVendedorMap.values()).sort(
    (a, b) => b.cantidad - a.cantidad || a.vendedor.localeCompare(b.vendedor, 'es'),
  );

  return {
    faltantes,
    porVendedor,
    adhesionesExcel: adhesiones.length,
    matchedEnPeriodo,
    excelError: null,
    fuente: sheet?.label || `Pestañas: ${gids.join(', ')}`,
  };
}

/**
 * Parsea adhesión PIJ del informe integral (PC tipo "B223/300", MZ = serie).
 * @param {string} pc
 * @param {string} mz
 */
export function parseAdhesionDesdeIntegral(pc, mz) {
  const rawPc = String(pc || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  const mzSerie = String(mz || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 1);

  const m = rawPc.match(/^([A-Z]+)?(\d+)(?:\/\d+)?$/);
  if (!m) {
    return {
      serie: mzSerie || 'A',
      ordenAdh: '',
      display: rawPc || '',
    };
  }
  const serieFromPc = String(m[1] || '')
    .replace(/[^A-Z]/g, '')
    .slice(0, 1);
  const serie = serieFromPc || mzSerie || 'A';
  const ordenAdh = String(m[2] || '').replace(/^0+/, '') || String(m[2] || '');
  return {
    serie,
    ordenAdh,
    display: ordenAdh ? `${serie}${ordenAdh}/300` : rawPc,
  };
}

function claveAdhesionNormalizada(serie, ordenAdh) {
  const s = normalizar(serie).replace(/[^A-Z]/g, '').slice(0, 1);
  const n = normalizar(ordenAdh).replace(/^0+/, '');
  if (!n) return '';
  return `${s || 'A'}${n}`;
}

/**
 * Resuelve idEjercicioDetalle del SP_periodo_selecciona.
 * Acepta id explícito, mes nombre (junio/julio/…) o YYYY-MM.
 * @param {string} [mes]
 * @param {number} [idEjercicioDetalle]
 * @param {string} [yyyyMm]
 */
async function resolverPeriodoInforme(mes, idEjercicioDetalle, yyyyMm) {
  if (Number.isFinite(Number(idEjercicioDetalle)) && Number(idEjercicioDetalle) > 0) {
    const { fetchPeriodosInformeCierres } = await import('../db/informe-cierres.js');
    const data = await fetchPeriodosInformeCierres();
    const found = (data.periodos || []).find(
      (p) => Number(p.idEjercicioDetalle) === Number(idEjercicioDetalle),
    );
    return {
      idEjercicioDetalle: Number(idEjercicioDetalle),
      codigo: found
        ? found.descripcion || found.codigo || String(idEjercicioDetalle)
        : `idEjercicioDetalle=${idEjercicioDetalle}`,
      yyyyMm: found?.fechaDesde
        ? `${new Date(found.fechaDesde).getUTCFullYear()}-${String(new Date(found.fechaDesde).getUTCMonth() + 1).padStart(2, '0')}`
        : yyyyMm || null,
    };
  }

  const { resolverPeriodoPorYyyyMm, fetchPeriodosInformeCierres } = await import(
    '../db/informe-cierres.js'
  );

  let targetYyyyMm = yyyyMm || null;
  if (!targetYyyyMm && mes) {
    const needle = String(mes).trim().toLowerCase();
    const data = await fetchPeriodosInformeCierres();
    const found = (data.periodos || []).find((p) =>
      String(p.codigo || p.descripcion || '')
        .toLowerCase()
        .includes(needle),
    );
    if (found) {
      return {
        idEjercicioDetalle: found.idEjercicioDetalle,
        codigo: found.descripcion || found.codigo || String(found.idEjercicioDetalle),
        yyyyMm: found.fechaDesde
          ? `${new Date(found.fechaDesde).getUTCFullYear()}-${String(new Date(found.fechaDesde).getUTCMonth() + 1).padStart(2, '0')}`
          : null,
      };
    }
    // Fallback: mes nombre → YYYY-MM del año del primer período que matchee el mes
    const yearHint = (data.periodos || [])
      .map((p) => (p.fechaDesde ? new Date(p.fechaDesde).getUTCFullYear() : null))
      .find((y) => y);
    const idx = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ].indexOf(needle);
    if (idx >= 0 && yearHint) {
      targetYyyyMm = `${yearHint}-${String(idx + 1).padStart(2, '0')}`;
    }
  }

  if (targetYyyyMm) {
    const resolved = await resolverPeriodoPorYyyyMm(targetYyyyMm);
    if (resolved) return resolved;
  }

  throw new Error(
    `No se encontró período en SP_periodo_selecciona${mes ? ` para «${mes}»` : ''}${yyyyMm ? ` (${yyyyMm})` : ''}. Pasá idEjercicioDetalle.`,
  );
}

/**
 * Carga solo Plan Joven del SP_Informe_Cierre_Operadores y arma índice por adhesión.
 * @param {{ idOperador?: number, idEjercicioDetalle: number, idVendedor?: number }} params
 */
async function cargarPijIntegral(params) {
  const { fetchInformeCierresOperadores } = await import('../db/informe-cierres.js');
  const informe = await fetchInformeCierresOperadores({
    idOperador: params.idOperador ?? Number(process.env.INFORME_CIERRE_ID_OPERADOR || 1),
    idEjercicioDetalle: params.idEjercicioDetalle,
    idVendedor: params.idVendedor ?? 0,
  });
  const filas = (informe.pij?.filas?.length ? informe.pij.filas : informe.filas || []).filter(
    (f) => f.tipo === 'pij' || String(f.barrio || '').trim().toUpperCase() === 'PLAN JOVEN',
  );

  /** @type {Map<string, object[]>} */
  const byClave = new Map();
  const items = [];

  for (const f of filas) {
    const parsed = parseAdhesionDesdeIntegral(f.pc, f.mz);
    const clave = claveAdhesionNormalizada(parsed.serie, parsed.ordenAdh);
    const item = {
      idUnico: `integral:${f.idLoteVenta || `${clave}:${f.fechaInicioCobranza}`}`,
      idLoteVenta: f.idLoteVenta,
      serie: parsed.serie,
      ordenAdh: parsed.ordenAdh,
      adhesionDisplay: parsed.display || formatReciboCaja(parsed.serie, parsed.ordenAdh, ''),
      vendedor: String(f.vendedor || '').trim(),
      nombreCliente: String(f.nombreCliente || '').trim(),
      fechaIso: f.fechaInicioCobranza || null,
      montoCobrado: Number(f.totalCobradoPeriodo) || 0,
      montoPactado: Number(f.montoPactadoAdhesion) || 0,
      clave,
      idOperador: f.idOperador,
      reciboOperadorAsignado: f.reciboOperadorAsignado,
    };
    items.push(item);
    if (!clave) continue;
    if (!byClave.has(clave)) byClave.set(clave, []);
    byClave.get(clave).push(item);
    // También índice numérico solo (sin serie) para matches flojos
    const soloNum = normalizar(parsed.ordenAdh).replace(/^0+/, '');
    if (soloNum && soloNum !== clave) {
      if (!byClave.has(soloNum)) byClave.set(soloNum, []);
      byClave.get(soloNum).push(item);
    }
  }

  return { items, byClave, source: informe.source, params: informe.params };
}

function filaCajaKey(row) {
  return [
    normalizar(row.serie),
    normalizar(row.ordenAdh),
    normalizar(row.ordenAnexo),
    normalizeName(row.nombreCliente),
    normalizarDiaComparacion(parseFechaCaja(row.fecha) || row.fecha),
  ].join('|');
}

/**
 * Cruza adhesiones del Excel/Sheets de Caja vs cierres PIJ del CRM,
 * y además Plan Joven del sistema integral (SP_Informe_Cierre_Operadores).
 *
 * @param {unknown[]} leadsDB
 * @param {{ sheetGids?: string[], mes?: string, yyyyMm?: string, csvText?: string, idEjercicioDetalle?: number, idOperador?: number }} [options]
 */
export async function buildFaltantesDesdeCaja(leadsDB, options = {}) {
  const { sheetGids, mes, yyyyMm, csvText, idEjercicioDetalle, idOperador } = options;

  let excelRows = [];
  let fuente = null;
  let excelError = null;
  if (csvText && String(csvText).trim()) {
    excelRows = parseCajaCsvText(String(csvText), 'upload');
    fuente = 'Archivo CSV subido';
  } else {
    let gids = Array.isArray(sheetGids) ? sheetGids.filter(Boolean) : [];
    if (!gids.length) {
      let sheet = null;
      if (mes) sheet = cajaSheetPorNombreMes(mes);
      else if (yyyyMm) sheet = cajaSheetParaYyyyMm(yyyyMm);
      else if (mes) {
        // Resolver mes nombre → yyyyMm vía SP y luego hoja
        try {
          const periodoTmp = await resolverPeriodoInforme(mes, idEjercicioDetalle, yyyyMm);
          if (periodoTmp.yyyyMm) sheet = cajaSheetParaYyyyMm(periodoTmp.yyyyMm);
        } catch {
          /* sin hoja */
        }
      }
      if (sheet) gids = [sheet.gid];
    }
    if (!gids.length) {
      excelError = 'No hay hoja Excel de Caja configurada para el período seleccionado.';
      excelRows = [];
      fuente = null;
    } else {
      excelRows = await fetchCajaData({ sheetGids: gids });
      fuente = cajaFuenteDesdeGids(gids);
    }
  }

  const adhesiones = excelRows.filter(esFilaAdhesionCaja);
  const indiceCrm = construirIndiceCierresPijCrm(leadsDB);

  const faltantes = [];
  const matched = [];
  const ambiguos = [];
  const seenKeys = new Set();

  /** Índice Excel por clave de adhesión (serie+nro) para cruce con integral. */
  const excelByClave = new Map();

  for (const row of adhesiones) {
    const key = filaCajaKey(row);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const serie = String(row.serie || '').trim().toUpperCase() || 'A';
    const ordenAdh = String(row.ordenAdh || '').trim();
    const clave = claveAdhesionNormalizada(serie, ordenAdh);
    if (clave) {
      if (!excelByClave.has(clave)) excelByClave.set(clave, []);
      excelByClave.get(clave).push(row);
    }

    const variantes = generarVariantesRecibo(row);
    const hits = [];
    for (const v of variantes) {
      const found = indiceCrm.get(v);
      if (found?.length) hits.push(...found);
    }

    // Deduplicar por leadId+recibo
    const uniqueHits = [];
    const hitKeys = new Set();
    for (const h of hits) {
      const hk = `${h.leadId}|${h.numeroRecibo}|${h.isCompraAdicional}`;
      if (hitKeys.has(hk)) continue;
      hitKeys.add(hk);
      uniqueHits.push(h);
    }

    let match = null;
    let estado = 'sin_match';

    if (uniqueHits.length === 1) {
      match = uniqueHits[0];
      estado = 'match';
    } else if (uniqueHits.length > 1) {
      const porVendedor = uniqueHits.filter(
        (h) =>
          vendedoresCoinciden(h.promotorNombre, row.nombreVendedor) ||
          vendedoresCoinciden(h.operadorNombre, row.nombreVendedor),
      );
      if (porVendedor.length === 1) {
        match = porVendedor[0];
        estado = 'match';
      } else {
        const porNombre = uniqueHits.filter((h) =>
          nombresCoinciden(h.nombreCliente, row.nombreCliente),
        );
        if (porNombre.length === 1) {
          match = porNombre[0];
          estado = 'match';
        } else {
          estado = 'ambiguo';
        }
      }
    } else {
      // Fallback: solo nombre de cliente (único)
      const porNombre = [];
      for (const lead of leadsDB || []) {
        const seg = lead?.seguimiento;
        if (seg?.resultadoEntrevista !== 'compro' || seg?.idProducto !== 'prod-pij') continue;
        if (!nombresCoinciden(lead.nombre, row.nombreCliente)) continue;
        porNombre.push({
          leadId: String(lead.id),
          nombreCliente: String(lead.nombre || ''),
          promotorNombre: String(lead.promotorNombre || ''),
          operadorNombre: String(seg.operadorNombre || ''),
          numeroRecibo: String(seg.numeroRecibo || ''),
          fechaCierre: seg.fechaCierre || null,
          isCompraAdicional: false,
        });
      }
      if (porNombre.length === 1) {
        match = porNombre[0];
        estado = 'match_nombre';
      }
    }

    const item = {
      idUnico: key,
      estado,
      fechaExcel: row.fecha || '',
      fechaIso: parseFechaCaja(row.fecha) || null,
      serie,
      ordenAdh,
      ordenAnexo: String(row.ordenAnexo || '').trim(),
      reciboSugerido: formatReciboCaja(serie, ordenAdh, row.ordenAnexo),
      nombreClienteExcel: String(row.nombreCliente || '').trim(),
      vendedorExcel: String(row.nombreVendedor || '').trim(),
      concepto: String(row.concepto || '').trim(),
      matchCrm: match
        ? {
            leadId: match.leadId,
            nombreCliente: match.nombreCliente,
            promotorNombre: match.promotorNombre,
            operadorNombre: match.operadorNombre,
            numeroRecibo: match.numeroRecibo,
            fechaCierre: match.fechaCierre,
          }
        : null,
    };

    if (estado === 'sin_match') faltantes.push(item);
    else if (estado === 'ambiguo') ambiguos.push(item);
    else matched.push(item);
  }

  /** Agrupa faltantes por vendedor del Excel (quién no cargó). */
  const porVendedorMap = new Map();
  for (const f of faltantes) {
    const v = f.vendedorExcel || 'Sin vendedor';
    if (!porVendedorMap.has(v)) {
      porVendedorMap.set(v, { vendedor: v, cantidad: 0, clientes: [] });
    }
    const g = porVendedorMap.get(v);
    g.cantidad += 1;
    g.clientes.push({
      nombre: f.nombreClienteExcel,
      recibo: f.reciboSugerido,
      fecha: f.fechaExcel,
    });
  }
  const porVendedor = Array.from(porVendedorMap.values()).sort(
    (a, b) => b.cantidad - a.cantidad || a.vendedor.localeCompare(b.vendedor, 'es'),
  );

  // —— Sistema integral (solo PLAN JOVEN) vs Excel y CRM ——
  let integral = {
    periodo: null,
    source: null,
    items: [],
    sinCrm: [],
    sinExcel: [],
    excelSinIntegral: [],
  };

  try {
    const periodo = await resolverPeriodoInforme(mes, idEjercicioDetalle, yyyyMm);
    console.log(
      '[faltantes-pij] consultando integral período=%s (%s) operador=%s',
      periodo.idEjercicioDetalle,
      periodo.codigo,
      idOperador ?? 1,
    );
    const cargado = await cargarPijIntegral({
      idEjercicioDetalle: periodo.idEjercicioDetalle,
      idOperador: idOperador ?? 1,
    });
    console.log('[faltantes-pij] integral Plan Joven filas=%s', cargado.items.length);
    integral.periodo = {
      idEjercicioDetalle: periodo.idEjercicioDetalle,
      codigo: periodo.codigo,
    };
    integral.source = cargado.source;

    const clavesIntegralUsadas = new Set();
    const nombresIntegralUsados = new Set();
    const itemsEnriquecidos = [];

    for (const row of cargado.items) {
      const clave = row.clave;
      let enExcel = false;
      let matchExcel = null;
      if (clave && excelByClave.has(clave)) {
        enExcel = true;
        const er = excelByClave.get(clave)[0];
        matchExcel = {
          nombreCliente: String(er.nombreCliente || '').trim(),
          vendedor: String(er.nombreVendedor || '').trim(),
          recibo: formatReciboCaja(er.serie, er.ordenAdh, er.ordenAnexo),
          fecha: er.fecha || '',
        };
        clavesIntegralUsadas.add(clave);
        const nk = normalizeName(er.nombreCliente);
        if (nk) nombresIntegralUsados.add(nk);
      } else if (row.nombreCliente) {
        // Fallback: mismo cliente en Excel (CLIENTE del SP).
        const candidatos = [];
        for (const [, rows] of excelByClave.entries()) {
          const er = rows[0];
          if (nombresCoinciden(row.nombreCliente, er.nombreCliente)) candidatos.push(er);
        }
        if (candidatos.length === 1) {
          enExcel = true;
          const er = candidatos[0];
          matchExcel = {
            nombreCliente: String(er.nombreCliente || '').trim(),
            vendedor: String(er.nombreVendedor || '').trim(),
            recibo: formatReciboCaja(er.serie, er.ordenAdh, er.ordenAnexo),
            fecha: er.fecha || '',
          };
          const claveExcel = claveAdhesionNormalizada(er.serie, er.ordenAdh);
          if (claveExcel) clavesIntegralUsadas.add(claveExcel);
          const nk = normalizeName(er.nombreCliente);
          if (nk) nombresIntegralUsados.add(nk);
        }
      }

      let enCrm = false;
      let matchCrm = null;
      if (clave) {
        const variantes = generarVariantesRecibo({
          serie: row.serie,
          ordenAdh: row.ordenAdh,
          ordenAnexo: '',
        });
        const hits = [];
        for (const v of variantes) {
          const found = indiceCrm.get(v);
          if (found?.length) hits.push(...found);
        }
        const uniqueHits = [];
        const hitKeys = new Set();
        for (const h of hits) {
          const hk = `${h.leadId}|${h.numeroRecibo}|${h.isCompraAdicional}`;
          if (hitKeys.has(hk)) continue;
          hitKeys.add(hk);
          uniqueHits.push(h);
        }
        if (uniqueHits.length >= 1) {
          enCrm = true;
          const h = uniqueHits[0];
          matchCrm = {
            leadId: h.leadId,
            nombreCliente: h.nombreCliente,
            promotorNombre: h.promotorNombre,
            numeroRecibo: h.numeroRecibo,
            fechaCierre: h.fechaCierre,
          };
        }
      }
      // Fallback CRM por nombre del SP (CLIENTE)
      if (!enCrm && row.nombreCliente) {
        const porNombre = [];
        for (const lead of leadsDB || []) {
          const seg = lead?.seguimiento;
          if (seg?.resultadoEntrevista !== 'compro' || seg?.idProducto !== 'prod-pij') continue;
          if (!nombresCoinciden(lead.nombre, row.nombreCliente)) continue;
          porNombre.push({
            leadId: String(lead.id),
            nombreCliente: String(lead.nombre || ''),
            promotorNombre: String(lead.promotorNombre || ''),
            numeroRecibo: String(seg.numeroRecibo || ''),
            fechaCierre: seg.fechaCierre || null,
          });
        }
        if (porNombre.length === 1) {
          enCrm = true;
          matchCrm = porNombre[0];
        }
      }

      const item = {
        ...row,
        enExcel,
        enCrm,
        matchExcel,
        matchCrm,
      };
      itemsEnriquecidos.push(item);
      if (!enCrm) integral.sinCrm.push(item);
      if (!enExcel) integral.sinExcel.push(item);
    }

    integral.items = itemsEnriquecidos;

    for (const [clave, rows] of excelByClave.entries()) {
      if (clavesIntegralUsadas.has(clave)) continue;
      const soloNum = clave.replace(/^[A-Z]/, '');
      if (cargado.byClave.has(clave) || (soloNum && cargado.byClave.has(soloNum))) continue;
      const er = rows[0];
      const nk = normalizeName(er.nombreCliente);
      if (nk && nombresIntegralUsados.has(nk)) continue;
      // ¿Algún Plan Joven del SP tiene el mismo cliente?
      const matchNombreIntegral = cargado.items.some((i) =>
        nombresCoinciden(i.nombreCliente, er.nombreCliente),
      );
      if (matchNombreIntegral) continue;

      integral.excelSinIntegral.push({
        idUnico: `excel-sin-int:${clave}`,
        serie: String(er.serie || '').trim().toUpperCase() || 'A',
        ordenAdh: String(er.ordenAdh || '').trim(),
        ordenAnexo: String(er.ordenAnexo || '').trim(),
        adhesionDisplay: formatReciboCaja(er.serie, er.ordenAdh, er.ordenAnexo),
        nombreClienteExcel: String(er.nombreCliente || '').trim(),
        vendedorExcel: String(er.nombreVendedor || '').trim(),
        fechaExcel: er.fecha || '',
      });
    }
  } catch (err) {
    console.error('[faltantes-pij] cruce integral:', err);
    integral.error = err instanceof Error ? err.message : 'Error al consultar sistema integral';
  }

  /** Excel presentes en Caja pero ausentes en sistema integral (Plan Joven), por vendedor. */
  const porVendedorIntegralMap = new Map();
  for (const f of integral.excelSinIntegral) {
    const v = f.vendedorExcel || 'Sin vendedor';
    if (!porVendedorIntegralMap.has(v)) {
      porVendedorIntegralMap.set(v, { vendedor: v, cantidad: 0, clientes: [] });
    }
    const g = porVendedorIntegralMap.get(v);
    g.cantidad += 1;
    g.clientes.push({
      nombre: f.nombreClienteExcel,
      recibo: f.adhesionDisplay,
      fecha: f.fechaExcel,
    });
  }
  const porVendedorIntegral = Array.from(porVendedorIntegralMap.values()).sort(
    (a, b) => b.cantidad - a.cantidad || a.vendedor.localeCompare(b.vendedor, 'es'),
  );

  return {
    fuente,
    excelError,
    resumen: {
      adhesionesExcel: adhesiones.length,
      matched: matched.length,
      ambiguos: ambiguos.length,
      /** Excel sin match en CRM */
      faltantes: faltantes.length,
      faltantesEnCrm: faltantes.length,
      vendedoresConFaltantes: porVendedor.length,
      adhesionesIntegral: integral.items.length,
      integralEnCrm: integral.items.filter((i) => i.enCrm).length,
      integralEnExcel: integral.items.filter((i) => i.enExcel).length,
      integralSinCrm: integral.sinCrm.length,
      integralSinExcel: integral.sinExcel.length,
      /** Excel sin match en sistema integral (Plan Joven) */
      excelSinIntegral: integral.excelSinIntegral.length,
      faltantesEnIntegral: integral.excelSinIntegral.length,
      vendedoresFaltanIntegral: porVendedorIntegral.length,
    },
    faltantes,
    ambiguos,
    /** Agrupa faltantes Excel→CRM por vendedor */
    porVendedor,
    /** Agrupa faltantes Excel→Integral por vendedor */
    porVendedorIntegral,
    integral,
  };
}

