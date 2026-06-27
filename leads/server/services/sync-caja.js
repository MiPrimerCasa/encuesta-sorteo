import fs from 'fs/promises';
import path from 'path';

const CAJA_URL = 'https://docs.google.com/spreadsheets/d/1jOxw0FXv_HDNkkh9vwQR9T5PoAPk5rcErUJEVjvayBA/export?format=csv&gid=288750825';

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

export async function fetchCajaData() {
  const response = await fetch(CAJA_URL);
  if (!response.ok) {
    throw new Error(`Error fetching Google Sheets CSV: ${response.statusText}`);
  }
  const csvText = await response.text();
  const lines = csvText.split(/\r?\n/);
  
  // Primera fila como cabeceras
  const headers = parseCSVLine(lines[8] || '').map(h => h.toUpperCase().trim());
  // El CSV mostrado tenía las cabeceras en la línea 9 (index 8), vemos que hay metadatos antes o está vacío?
  // Espera, el CSV que vi tenía las cabeceras en la línea 9 del log, pero en el archivo real:
  // línea 1 es: ,FECHA,SERIE,ORDEN ADH,ORDEN ANEXO,NOMBRE CLIENTE...
  // Vamos a buscar la línea que contenga "FECHA" y "ORDEN ANEXO" para usarla como header
  
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('FECHA') && lines[i].includes('ORDEN ANEXO')) {
      headerIndex = i;
      break;
    }
  }

  const keys = parseCSVLine(lines[headerIndex]).map(h => h.toUpperCase().trim());
  
  const fechaIdx = keys.indexOf('FECHA');
  const serieIdx = keys.indexOf('SERIE');
  const adhIdx = keys.indexOf('ORDEN ADH');
  const anexoIdx = keys.indexOf('ORDEN ANEXO');
  const nombreIdx = keys.indexOf('NOMBRE CLIENTE');
  const vendedorIdx = keys.indexOf('NOMBRE DEL VENDEDOR');
  const conceptoIdx = keys.indexOf('CONCEPTO');

  if (fechaIdx === -1 || anexoIdx === -1) {
    throw new Error('Formato de CSV inválido: No se encontraron las columnas FECHA o ORDEN ANEXO');
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseCSVLine(line);
    
    // Ignorar filas sin número de anexo ni adh
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
    });
  }

  return rows;
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

export function formatReciboCaja(serie, ordenAdh, ordenAnexo) {
  const parts = [];
  const s = String(serie || '').trim().toUpperCase();
  const adh = String(ordenAdh || '').trim().toUpperCase();
  const anexo = String(ordenAnexo || '').trim().toUpperCase();

  if (adh && adh !== '-') {
    parts.push(`${s}${adh}/300`);
  }
  if (anexo && anexo !== '-') {
    parts.push(`ANEXO ${anexo}/300`);
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

export async function buildSyncPreview(leadsDB, comprasAdicionalesDB) {
  const excelRows = await fetchCajaData();
  
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

    // Queremos sincronizar si la fechaCierre no está explícitamente guardada en la base de datos,
    // o si el valor guardado es distinto de la fecha del Excel.
    const necesitaActualizacion = !fechaCierreStr || (fechaCierreStr !== nuevaFecha);

    if (nuevaFecha && necesitaActualizacion) {
      cambiosPropuestos.push({
        idUnico: isCompraAdicional ? `${leadId}_compra_${compraId}` : `${leadId}_principal`,
        leadId: leadId,
        isCompraAdicional: isCompraAdicional,
        compraId: compraId,
        nombreCliente: nombreCliente,
        numeroRecibo: numeroRecibo,
        fechaActual: fechaEffectiveStr,
        nuevaFecha: nuevaFecha,
        excelRow: {
          fecha: matchedRow.fecha,
          ordenAdh: matchedRow.ordenAdh,
          ordenAnexo: matchedRow.ordenAnexo,
          nombreCliente: matchedRow.nombreCliente,
          nombreVendedor: matchedRow.nombreVendedor,
          concepto: matchedRow.concepto
        }
      });
    }
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

export async function executeSyncCommit(cambiosAprobados, usuario) {
  if (!cambiosAprobados || cambiosAprobados.length === 0) return { actualizados: 0 };
  
  const { listAllLeadsFromEncuestas } = await import('../db/encuestas.js');
  const { persistirSeguimientoLead } = await import('../db/seguimiento-sql.js');
  const { getSqlPool } = await import('../db/mssql.js');
  const { loadOperadoresCatalogAsync } = await import('../db/operadores-catalog.js');
  
  const allLeads = await listAllLeadsFromEncuestas();
  const leadsMap = new Map(allLeads.map(l => [String(l.id), l]));
  
  let pool = null;
  let catalog = null;
  try {
    pool = await getSqlPool();
    catalog = await loadOperadoresCatalogAsync();
  } catch (err) {
    console.error('[SyncCaja] Error al conectar a la base de datos o cargar catálogo:', err);
  }

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
    if (!cambio.nuevaFecha) continue;
    const lead = leadsMap.get(String(cambio.leadId));
    if (!lead) continue;

    const targetOperator = await resolverUsuarioDeSincronizacion(cambio, lead, pool, catalog);
    const formattedRecibo = formatReciboCaja(
      cambio.excelRow?.ordenAdh ? (cambio.excelRow.serie || 'A') : '',
      cambio.excelRow?.ordenAdh,
      cambio.excelRow?.ordenAnexo
    );

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

    const nuevaFechaConHora = conservarHoraOriginal(cambio.nuevaFecha, fechaOriginal);

    listaCambiosProcesados.push({
      leadId: lead.id,
      nombreCliente: lead.nombre,
      promotorNombreCRM: lead.promotorNombre || 'Sin Vendedor',
      isCompraAdicional: cambio.isCompraAdicional,
      compraId: cambio.compraId,
      reciboAnterior: reciboOriginal || '',
      reciboNuevo: formattedRecibo,
      fechaCierreAnterior: fechaOriginal || '',
      fechaCierreNueva: nuevaFechaConHora,
      operadorAnterior: lead.seguimiento?.operadorNombre || 'Sin Operador',
      operadorNuevo: {
        id: targetOperator.id,
        nombre: targetOperator.nombre,
        rol: targetOperator.rol
      },
      excelRow: cambio.excelRow
    });
  }

  // Guardar backup rico y estructurado
  const backupPath = path.join(backupDir, `pij_sync_${timestamp}.json`);
  const backupPayload = {
    fechaEjecucion: new Date().toISOString(),
    operadorQueSincroniza: usuario?.nombre || 'Sistema',
    totalRegistros: listaCambiosProcesados.length,
    cambios: listaCambiosProcesados
  };
  await fs.writeFile(backupPath, JSON.stringify(backupPayload, null, 2), 'utf-8');
  console.log(`[SyncCaja] Backup rico guardado en ${backupPath}`);

  let actualizados = 0;

  // Aplicar cambios en la Base de Datos
  for (const item of listaCambiosProcesados) {
    const lead = leadsMap.get(String(item.leadId));
    if (!lead) continue;

    let patch = {};
    if (item.isCompraAdicional) {
      const compras = lead.seguimiento?.comprasAdicionales || [];
      const updatedCompras = compras.map(c => {
        if (String(c.id) === String(item.compraId)) {
          return { ...c, fechaCierre: item.fechaCierreNueva, numeroRecibo: item.reciboNuevo };
        }
        return c;
      });
      patch = {
        comprasAdicionales: updatedCompras,
        operadorId: item.operadorNuevo.id,
        operadorNombre: item.operadorNuevo.nombre,
        operadorRol: item.operadorNuevo.rol
      };
    } else {
      patch = {
        fechaCierre: item.fechaCierreNueva,
        numeroRecibo: item.reciboNuevo,
        operadorId: item.operadorNuevo.id,
        operadorNombre: item.operadorNuevo.nombre,
        operadorRol: item.operadorNuevo.rol
      };
    }

    try {
      const res = await persistirSeguimientoLead(lead.id, patch, item.operadorNuevo, lead);
      if (res && res.saved) {
        actualizados++;
      }
    } catch (err) {
      console.error(`[SyncCaja] Error al actualizar lead ${lead.id}:`, err);
    }
  }

  return { actualizados };
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
  
  if (vendedorExcel && pool) {
    try {
      // Buscar en el historial de seguimiento por nombre flexible
      const histRes = await pool.query(`
        EXEC SP_HistorialSeguimientoAdmin @desde = '2026-01-01 00:00:00'
      `);
      const history = histRes.recordset || [];
      
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
        'MARINA': 'LEIVA MARINA SOLEDAD'
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
          'MARINA': 'Marina L'
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
  
  return targetOperator || {
    id: '1',
    nombre: 'Soporte Técnico (Sync Caja)',
    rol: 'superadmin'
  };
}

