import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  filasDescargaVendedor,
  formatearFechaDescarga,
  type FilaDescargaVendedor,
  type GrupoDescargaVendedor,
} from '../domain/leads-descarga-vendedor';
import type { Lead } from '../types';

function slugArchivo(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

function nombreArchivo(prefijo: string, vendedor: string, ext: string) {
  const fecha = new Date().toISOString().slice(0, 10);
  const quien = slugArchivo(vendedor) || 'vendedor';
  return `${prefijo}-${quien}-${fecha}.${ext}`;
}

function contarPorGrupo(filas: FilaDescargaVendedor[]) {
  const counts = { manual: 0, redes: 0, qr: 0 } as Record<GrupoDescargaVendedor, number>;
  for (const fila of filas) counts[fila.grupo] += 1;
  return counts;
}

export function downloadLeadsVendedorExcel(opts: {
  leads: Lead[];
  vendedorNombre: string;
  /** Solo contactos posteriores a esta fecha (última descarga guardada). */
  desdeIso?: string | null;
  fechaDescargaIso?: string | null;
  ultimaFechaDescargaIso?: string | null;
}): boolean {
  const filas = filasDescargaVendedor(opts.leads, opts.desdeIso);
  if (!filas.length) return false;

  const rows = filas.map((f) => ({
    Canal: f.canal,
    'Fecha de ingreso': f.fecha,
    Hora: f.hora,
    Nombre: f.nombre,
    Teléfono: f.telefono,
    Domicilio: f.domicilio,
  }));

  const hoja = XLSX.utils.json_to_sheet(rows);
  hoja['!cols'] = [
    { wch: 14 },
    { wch: 18 },
    { wch: 8 },
    { wch: 32 },
    { wch: 16 },
    { wch: 42 },
  ];
  hoja['!views'] = [{ state: 'frozen', ySplit: 1, activePane: 'bottomLeft' }];
  hoja['!pageSetup'] = {
    orientation: 'landscape',
    paperSize: 9,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  hoja['!sheetFormat'] = { baseColWidth: 12 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, 'Cargas');

  const counts = contarPorGrupo(filas);
  const resumen = [
    { Concepto: 'Vendedor', Valor: opts.vendedorNombre },
    { Concepto: 'Alcance', Valor: 'Solo contactados nuevos' },
    { Concepto: 'Fecha de descarga', Valor: formatearFechaDescarga(opts.fechaDescargaIso) || '—' },
    {
      Concepto: 'Última fecha de descarga',
      Valor: formatearFechaDescarga(opts.ultimaFechaDescargaIso) || 'Sin descarga anterior',
    },
    { Concepto: 'Carga manual', Valor: counts.manual },
    { Concepto: 'Redes sociales', Valor: counts.redes },
    { Concepto: 'QR', Valor: counts.qr },
    { Concepto: 'Total', Valor: filas.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

  XLSX.writeFile(wb, nombreArchivo('cargas', opts.vendedorNombre, 'xlsx'));
  return true;
}

const COLUMNAS_PLANILLA = [
  { label: 'Canal', w: 28, valor: (f: FilaDescargaVendedor) => f.canal },
  { label: 'Fecha', w: 26, valor: (f: FilaDescargaVendedor) => f.fecha },
  { label: 'Hora', w: 16, valor: (f: FilaDescargaVendedor) => f.hora },
  { label: 'Nombre', w: 72, valor: (f: FilaDescargaVendedor) => f.nombre },
  { label: 'Teléfono', w: 36, valor: (f: FilaDescargaVendedor) => f.telefono },
  { label: 'Domicilio', w: 99, valor: (f: FilaDescargaVendedor) => f.domicilio },
] as const;

function textoCelda(doc: jsPDF, texto: string, ancho: number) {
  const linea = doc.splitTextToSize(texto || '', Math.max(ancho - 2, 4))[0];
  return typeof linea === 'string' ? linea : '';
}

export function downloadLeadsVendedorPdf(opts: {
  leads: Lead[];
  vendedorNombre: string;
  desdeIso?: string | null;
  fechaDescargaIso?: string | null;
  ultimaFechaDescargaIso?: string | null;
}): boolean {
  const filas = filasDescargaVendedor(opts.leads, opts.desdeIso);
  if (!filas.length) return false;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margen = 10;
  const altoFila = 7;
  const altoEncabezado = 8;
  const limite = doc.internal.pageSize.getHeight() - 10;
  let y = 14;

  const dibujarTitulo = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Leads contactados', margen, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70);
    doc.text(
      `${opts.vendedorNombre || 'Vendedor'}   ·   ${
        opts.ultimaFechaDescargaIso
          ? `Nuevos desde ${formatearFechaDescarga(opts.ultimaFechaDescargaIso)}`
          : 'Primera descarga'
      }   ·   ${filas.length}`,
      margen + 52,
      y,
    );
    doc.setTextColor(0);
    y += 6;
  };

  const dibujarEncabezado = () => {
    let x = margen;
    doc.setFillColor(230, 232, 235);
    doc.rect(margen, y, COLUMNAS_PLANILLA.reduce((n, c) => n + c.w, 0), altoEncabezado, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    for (const col of COLUMNAS_PLANILLA) {
      doc.rect(x, y, col.w, altoEncabezado);
      doc.text(col.label, x + 1.5, y + 5.2);
      x += col.w;
    }
    y += altoEncabezado;
  };

  dibujarTitulo();
  dibujarEncabezado();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  filas.forEach((fila, indice) => {
    if (y + altoFila > limite) {
      doc.addPage();
      y = 12;
      dibujarEncabezado();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    if (indice % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margen, y, COLUMNAS_PLANILLA.reduce((n, c) => n + c.w, 0), altoFila, 'F');
    }
    let x = margen;
    for (const col of COLUMNAS_PLANILLA) {
      doc.setDrawColor(210);
      doc.rect(x, y, col.w, altoFila);
      doc.setTextColor(20);
      doc.text(textoCelda(doc, col.valor(fila), col.w), x + 1.5, y + 4.6);
      x += col.w;
    }
    y += altoFila;
  });

  doc.save(nombreArchivo('cargas', opts.vendedorNombre, 'pdf'));
  return true;
}
