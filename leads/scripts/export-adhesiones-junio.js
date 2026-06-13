import '../server/load-env.js';
import sql from 'mssql';
import XLSX from 'xlsx';
import path from 'node:path';
import { getSqlPoolEncuestas, closeSqlPool } from '../server/db/mssql.js';
import { loadOperadoresCatalogAsync } from '../server/db/operadores-catalog.js';

async function main() {
  try {
    const pool = await getSqlPoolEncuestas();
    
    // 1. Build idVendedor -> Promotor Name map from SP/JSON Catalog
    console.log('Building vendor name map from operators catalog...');
    const vendorMap = new Map();
    try {
      const catalog = await loadOperadoresCatalogAsync();
      if (catalog && catalog.byIdOperador) {
        for (const [id, meta] of Object.entries(catalog.byIdOperador)) {
          if (meta && meta.vendedor) {
            vendorMap.set(String(id).trim(), meta.vendedor);
          }
        }
      }
      console.log(`Loaded ${vendorMap.size} vendor names from catalog (source: ${catalog?.catalogSource || 'unknown'}).`);
    } catch (err) {
      console.warn('Could not load vendor names from catalog, using IDs only.', err.message);
    }

    // Hardcode some known mappings just in case
    vendorMap.set('23', 'Norma Morzan');
    vendorMap.set('138', 'Norma Morzan'); // supervisor/team sharing ID

    // 2. Scan idVendedor from 1 to 250 and collect June 2026 records
    console.log('Scanning all active vendors for June 2026 records...');
    const juneRecords = [];
    const activeIds = [];

    // Scan to find active IDs quickly
    const promises = [];
    for (let i = 1; i <= 250; i++) {
      const runScan = async (id) => {
        try {
          const result = await pool.request()
            .input('idVendedor', sql.Int, id)
            .execute('adhesionesPorVendedorGestion');
          if (result.recordset && result.recordset.length > 0) {
            activeIds.push({ id, records: result.recordset });
          }
        } catch (err) {
          // ignore
        }
      };
      promises.push(runScan(i));
    }
    await Promise.all(promises);
    console.log(`Found ${activeIds.length} active vendors with records.`);

    // 3. Process records and filter for June 2026
    for (const { id, records } of activeIds) {
      const vName = vendorMap.get(String(id)) || `Vendedor ID ${id}`;
      for (const row of records) {
        const fechaVisitaRaw = row['Fecha Visita'];
        if (!fechaVisitaRaw) continue;

        const date = new Date(fechaVisitaRaw);
        if (isNaN(date.getTime())) continue;

        // Check if year is 2026 and month is June (5 because JavaScript months are 0-indexed)
        const isJune2026 = date.getFullYear() === 2026 && date.getMonth() === 5;
        if (!isJune2026) continue;

        // Determine Financial State
        const monto = row['Monto Adhesion'] || 0;
        const cobrado = row['Total Cobrado'] || 0;
        const saldo = row['Saldo Adhesion'] || 0;
        const estadoVenta = row['Estado Venta'] ? String(row['Estado Venta']).trim() : 'Activo';

        let estadoFinanciero = 'Impago';
        if (estadoVenta.toLowerCase().includes('liberado')) {
          estadoFinanciero = 'Anulada / Liberada';
        } else if (cobrado >= monto && monto > 0) {
          estadoFinanciero = 'Pago Completo';
        } else if (cobrado > 0 && cobrado < monto) {
          estadoFinanciero = 'Seña / Parcial';
        }

        juneRecords.push({
          'Fecha': date.toISOString().slice(0, 10),
          'ID Vendedor': id,
          'Vendedor': vName,
          'ID Lote Venta': row['idLoteVenta'] || '',
          'Cliente': row['cliente01Nombre'] ? String(row['cliente01Nombre']).trim() : '—',
          'Barrio': row['Barrio'] ? String(row['Barrio']).trim() : '—',
          'Manzana': row['Manzana'] ? String(row['Manzana']).trim() : '—',
          'Parcela': row['Parcela'] ? String(row['Parcela']).trim() : '—',
          'Medida': row['Medida'] ? String(row['Medida']).trim() : '—',
          'Superficie': row['Sup'] || 0,
          'Monto Adhesión': monto,
          'Total Cobrado': cobrado,
          'Saldo Adhesión': saldo,
          'Estado Financiero': estadoFinanciero,
          'Estado Venta': estadoVenta || 'Activo',
          'Auditado por Adm.': row['Recibos Auditados'] === 1 ? 'Sí' : 'No',
          'Fotos Comprobantes': row['Cant. Imagenes'] || 0,
          'Plan Financiación': row['cuotasCantidadDescripcion'] ? String(row['cuotasCantidadDescripcion']).trim() : '—',
          'Tipo Contrato': row['loteVentaTipoDescripcion'] ? String(row['loteVentaTipoDescripcion']).trim() : '—',
          'Monto Cuota': row['MontoCuota'] || 0
        });
      }
    }

    console.log(`Collected ${juneRecords.length} records for June 2026.`);

    if (juneRecords.length === 0) {
      console.log('No records found in June 2026.');
      return;
    }

    // 4. Sort records by Date (newest first) and Vendedor
    juneRecords.sort((a, b) => {
      const dateCompare = b['Fecha'].localeCompare(a['Fecha']);
      if (dateCompare !== 0) return dateCompare;
      return a['Vendedor'].localeCompare(b['Vendedor']);
    });

    // 5. Generate Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(juneRecords);

    // Set column widths
    const max_cols = [
      { wch: 12 }, // Fecha
      { wch: 12 }, // ID Vendedor
      { wch: 25 }, // Vendedor
      { wch: 15 }, // ID Lote Venta
      { wch: 35 }, // Cliente
      { wch: 25 }, // Barrio
      { wch: 10 }, // Manzana
      { wch: 10 }, // Parcela
      { wch: 10 }, // Medida
      { wch: 12 }, // Superficie
      { wch: 16 }, // Monto Adhesión
      { wch: 16 }, // Total Cobrado
      { wch: 16 }, // Saldo Adhesión
      { wch: 20 }, // Estado Financiero
      { wch: 18 }, // Estado Venta
      { wch: 18 }, // Auditado
      { wch: 18 }, // Fotos
      { wch: 20 }, // Plan
      { wch: 35 }, // Tipo Contrato
      { wch: 16 }  // Monto Cuota
    ];
    ws['!cols'] = max_cols;

    XLSX.utils.book_append_sheet(wb, ws, 'Adhesiones Junio 2026');
    
    const outputPath = path.resolve('data/adhesiones_junio_2026.xlsx');
    XLSX.writeFile(wb, outputPath);
    
    console.log(`Excel file successfully created at: ${outputPath}`);
    console.log(`Total rows written: ${juneRecords.length}`);
  } catch (err) {
    console.error('Error generating Excel:', err);
  } finally {
    await closeSqlPool();
  }
}
main();
