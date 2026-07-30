import * as XLSX from 'xlsx';
import type { FaltantesPijResponse, SyncPreviewItem } from '../types';

function slugArchivo(texto: string) {
  return texto.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

function siNo(v: boolean | null | undefined) {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  return '';
}

/**
 * Excel de verificación: diferencias detectadas entre Caja (Excel/Sheets) y CRM.
 * Hojas: Diferencias sync · Faltantes · Ambiguos · Por vendedor.
 */
export function downloadVerificacionCajaCrmExcel(opts: {
  syncItems?: SyncPreviewItem[];
  faltantes?: FaltantesPijResponse | null;
  fuenteSync?: string;
  prefijoArchivo?: string;
}): boolean {
  const syncItems = opts.syncItems ?? [];
  const faltantes = opts.faltantes?.faltantes ?? [];
  const ambiguos = opts.faltantes?.ambiguos ?? [];
  const porVendedor = opts.faltantes?.porVendedor ?? [];
  const total =
    syncItems.length + faltantes.length + ambiguos.length + porVendedor.length;
  if (total === 0) return false;

  const wb = XLSX.utils.book_new();

  if (syncItems.length > 0) {
    const rows = syncItems.map((c) => ({
      'Lead ID': c.leadId,
      Cliente: c.nombreCliente,
      'Promotor CRM': c.promotorNombre ?? '',
      'Vendedor Caja': c.excelRow.nombreVendedor ?? '',
      'Recibo CRM': c.numeroRecibo,
      'Recibo propuesto Caja': c.reciboPropuesto ?? '',
      'Fecha CRM': c.fechaActual,
      'Fecha Caja': c.nuevaFecha || c.excelRow.fecha,
      'Diff fecha': siNo(c.necesitaFecha),
      'Diff adhesión/anexo': siNo(c.necesitaRecibo),
      'Adhesión CRM': c.adhesionActual ?? '',
      'Adhesión Caja': c.adhesionExcel ?? c.excelRow.ordenAdh,
      'Anexo CRM': c.anexoActual ?? '',
      'Anexo Caja': c.anexoExcel ?? c.excelRow.ordenAnexo,
      Serie: c.excelRow.serie ?? '',
      'Es adicional': siNo(c.isCompraAdicional),
      'Compra ID': c.compraId ?? '',
      Concepto: c.excelRow.concepto ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Diferencias sync');
  }

  if (faltantes.length > 0) {
    const rows = faltantes.map((f) => ({
      Estado: f.estado,
      'Fecha Caja': f.fechaExcel,
      'Cliente Caja': f.nombreClienteExcel,
      'Vendedor Caja': f.vendedorExcel,
      Serie: f.serie,
      Adhesión: f.ordenAdh,
      Anexo: f.ordenAnexo,
      'Recibo sugerido': f.reciboSugerido,
      Concepto: f.concepto,
      'Lead CRM': f.matchCrm?.leadId ?? '',
      'Cliente CRM': f.matchCrm?.nombreCliente ?? '',
      'Promotor CRM': f.matchCrm?.promotorNombre ?? '',
      'Recibo CRM': f.matchCrm?.numeroRecibo ?? '',
      'Fecha CRM': f.matchCrm?.fechaCierre ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Faltantes en CRM');
  }

  if (ambiguos.length > 0) {
    const rows = ambiguos.map((f) => ({
      Estado: f.estado,
      'Fecha Caja': f.fechaExcel,
      'Cliente Caja': f.nombreClienteExcel,
      'Vendedor Caja': f.vendedorExcel,
      Serie: f.serie,
      Adhesión: f.ordenAdh,
      Anexo: f.ordenAnexo,
      'Recibo sugerido': f.reciboSugerido,
      'Lead CRM': f.matchCrm?.leadId ?? '',
      'Cliente CRM': f.matchCrm?.nombreCliente ?? '',
      'Recibo CRM': f.matchCrm?.numeroRecibo ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ambiguos');
  }

  if (porVendedor.length > 0) {
    const rows = porVendedor.flatMap((v) =>
      v.clientes.length
        ? v.clientes.map((c) => ({
            Vendedor: v.vendedor,
            'Cant. faltantes': v.cantidad,
            Cliente: c.nombre,
            Recibo: c.recibo,
            Fecha: c.fecha,
          }))
        : [
            {
              Vendedor: v.vendedor,
              'Cant. faltantes': v.cantidad,
              Cliente: '',
              Recibo: '',
              Fecha: '',
            },
          ],
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Por vendedor');
  }

  // Resumen
  const resumenRows = [
    { Concepto: 'Fuente sync', Valor: opts.fuenteSync ?? '' },
    { Concepto: 'Fuente faltantes', Valor: opts.faltantes?.fuente ?? '' },
    { Concepto: 'Mes faltantes', Valor: opts.faltantes?.mesConsultado ?? '' },
    { Concepto: 'Diferencias sync', Valor: syncItems.length },
    { Concepto: 'Faltantes', Valor: faltantes.length },
    { Concepto: 'Ambiguos', Valor: ambiguos.length },
    {
      Concepto: 'Adhesiones Excel (faltantes)',
      Valor: opts.faltantes?.resumen.adhesionesExcel ?? '',
    },
    { Concepto: 'Matched en CRM', Valor: opts.faltantes?.resumen.matched ?? '' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), 'Resumen');

  const fecha = new Date().toISOString().slice(0, 10);
  const prefijo = slugArchivo(opts.prefijoArchivo || 'verificacion-caja-crm');
  XLSX.writeFile(wb, `${prefijo}-${fecha}.xlsx`);
  return true;
}
