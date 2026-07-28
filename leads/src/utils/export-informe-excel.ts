import * as XLSX from 'xlsx';
import type { PijCierreDetalle, TerrenoCierreDetalle } from '../types';

export type PijExportRow = PijCierreDetalle & {
  promotorNombre?: string;
  supervisorNombre?: string;
  operadorNombre?: string;
};

export type TerrenoExportRow = TerrenoCierreDetalle & {
  promotorNombre?: string;
  supervisorNombre?: string;
  operadorNombre?: string;
  barrioNombre?: string;
};

function operadorLabel(row: { promotorNombre?: string; operadorNombre?: string }) {
  return row.promotorNombre || row.operadorNombre || '';
}

function splitFechaHorario(fechaCierre: string) {
  if (!fechaCierre?.trim()) return { fecha: '', horario: '' };
  const normalized = fechaCierre.includes('T') ? fechaCierre : fechaCierre.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return { fecha: fechaCierre, horario: '' };
  return {
    fecha: d.toLocaleDateString('es-AR'),
    horario: d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

function slugArchivo(texto: string) {
  return texto.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

export function downloadInformeVentasExcel(opts: {
  pij: PijExportRow[];
  terreno100: TerrenoExportRow[];
  terrenoSena: TerrenoExportRow[];
  rangoLabel: string;
  prefijoArchivo?: string;
}): boolean {
  const total = opts.pij.length + opts.terreno100.length + opts.terrenoSena.length;
  if (total === 0) return false;

  const wb = XLSX.utils.book_new();

  if (opts.pij.length > 0) {
    const rows = opts.pij.map((c) => {
      const { fecha, horario } = splitFechaHorario(c.fechaCierre);
      return {
        Promotor: operadorLabel(c),
        Supervisor: c.supervisorNombre ?? '',
        'Lead ID': c.leadId,
        Cliente: c.leadNombre,
        Teléfono: c.leadTelefono,
        Anexo: c.numeroAnexo,
        Fecha: fecha,
        Horario: horario,
        'Estado pago': c.estadoPago ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'PIJ');
  }

  if (opts.terreno100.length > 0) {
    const rows = opts.terreno100.map((r) => {
      const { fecha, horario } = splitFechaHorario(r.fechaCierre);
      return {
        Promotor: operadorLabel(r),
        Supervisor: r.supervisorNombre ?? '',
        'Lead ID': r.leadId,
        Cliente: r.leadNombre,
        Teléfono: r.leadTelefono,
        Recibo: r.numeroRecibo,
        Barrio: r.barrioNombre ?? r.idBarrio ?? '',
        Fecha: fecha,
        Horario: horario,
        'Estado pago': r.estadoPago ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Terrenos 100%');
  }

  if (opts.terrenoSena.length > 0) {
    const rows = opts.terrenoSena.map((r) => {
      const { fecha, horario } = splitFechaHorario(r.fechaCierre);
      return {
        Promotor: operadorLabel(r),
        Supervisor: r.supervisorNombre ?? '',
        'Lead ID': r.leadId,
        Cliente: r.leadNombre,
        Teléfono: r.leadTelefono,
        Recibo: r.numeroRecibo,
        Barrio: r.barrioNombre ?? r.idBarrio ?? '',
        Fecha: fecha,
        Horario: horario,
        'Estado pago': r.estadoPago ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Terrenos Seña');
  }

  const resumen = [
    { Concepto: 'Período', Valor: opts.rangoLabel },
    { Concepto: 'Ventas PIJ', Valor: opts.pij.length },
    { Concepto: 'Terrenos 100%', Valor: opts.terreno100.length },
    { Concepto: 'Terrenos Seña', Valor: opts.terrenoSena.length },
    { Concepto: 'Total registros', Valor: total },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

  const prefijo = slugArchivo(opts.prefijoArchivo ?? 'informe-operaciones');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${prefijo}-${fecha}.xlsx`);
  return true;
}
