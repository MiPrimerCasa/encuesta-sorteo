import * as XLSX from 'xlsx';
import type { LeadTratadoSinCierreDetalle } from '../types';

function splitFechaHorario(iso: string) {
  if (!iso?.trim()) return { fecha: '', horario: '' };
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return { fecha: iso, horario: '' };
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

export function downloadLeadsRecontactoExcel(opts: {
  leads: LeadTratadoSinCierreDetalle[];
  rangoLabel: string;
  prefijoArchivo?: string;
}): boolean {
  if (!opts.leads.length) return false;

  const rows = opts.leads.map((l) => {
    const { fecha, horario } = splitFechaHorario(l.ultimoContacto);
    return {
      Promotor: l.promotorNombre,
      Supervisor: l.supervisorNombre,
      'Lead ID': l.id,
      Cliente: l.nombre,
      Teléfono: l.telefono,
      Origen: l.origen,
      'Fecha alta': l.fechaAlta ? new Date(l.fechaAlta).toLocaleDateString('es-AR') : '',
      'Último contacto': fecha,
      Horario: horario,
      Resultado: l.resultadoEntrevista,
      Canal: l.canal,
      Observaciones: l.observaciones,
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Recontacto');

  const resumen = [
    { Concepto: 'Período', Valor: opts.rangoLabel },
    { Concepto: 'Leads tratados sin cierre', Valor: opts.leads.length },
    {
      Concepto: 'No compró',
      Valor: opts.leads.filter((l) => l.resultadoEntrevista === 'No compró').length,
    },
    {
      Concepto: 'Reagenda',
      Valor: opts.leads.filter((l) => l.resultadoEntrevista === 'Reagenda').length,
    },
    {
      Concepto: 'Pendiente / otro',
      Valor: opts.leads.filter(
        (l) => !['No compró', 'Reagenda'].includes(l.resultadoEntrevista),
      ).length,
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');

  const prefijo = slugArchivo(opts.prefijoArchivo ?? 'leads-recontacto');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${prefijo}-${fecha}.xlsx`);
  return true;
}
