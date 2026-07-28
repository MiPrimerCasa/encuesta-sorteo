import { tabIdListaLead } from './leads';
import { esPlanInversion, esTerreno, etiquetaMedioPagoPij } from './venta';
import type { Lead, RolUsuario, SeguimientoLead } from '../types';

const RESULTADO_LABEL: Record<string, string> = {
  sin_interes: 'Sin interés',
  reagenda: 'Reagenda',
  no_compro: 'No compró',
  compro: 'Compró',
  derivar_terreno: 'Derivó interés terreno',
};

const PESTANA_LABEL = {
  entrevista: 'Prioridad',
  contacto: 'Contactado',
  seguimiento: 'En seguimiento',
  compro: 'Cierres',
} as const;

export function etiquetaEstadoHistorial(seguimiento: SeguimientoLead, lead: Lead): string {
  const partes: string[] = [];
  const r = seguimiento.resultadoEntrevista;

  if (r) {
    let texto = RESULTADO_LABEL[r] ?? r;
    if (r === 'reagenda' && seguimiento.seguimientoPijPromotor) {
      texto = 'Reagenda PIJ (tras no compró)';
    } else if (r === 'reagenda' && seguimiento.seguimientoAgendaOperadorRol) {
      texto = `Reagenda (${seguimiento.seguimientoAgendaOperadorRol})`;
    }
    partes.push(texto);
  } else if (seguimiento.huboEntrevista === true) {
    partes.push('Entrevista registrada');
  } else if (seguimiento.huboEntrevista === false) {
    partes.push('Sin entrevista');
  } else if (seguimiento.canal) {
    partes.push(`Contacto por ${seguimiento.canal}`);
  } else {
    partes.push('Actualización');
  }

  if (seguimiento.fechaReagenda) {
    partes.push(`próx. ${seguimiento.fechaReagenda.replace('T', ' ')}`);
  }

  if (r === 'compro' && seguimiento.idProducto) {
    const prod = esPlanInversion(seguimiento.idProducto)
      ? 'PIJ'
      : esTerreno(seguimiento.idProducto)
        ? 'Terreno'
        : seguimiento.idProducto;
    partes.push(prod);
    const medioPago = etiquetaMedioPagoPij(
      seguimiento.formaPago,
      seguimiento.montoCierre,
      seguimiento.montoEfectivo,
      seguimiento.montoTransferencia,
    );
    if (medioPago) partes.push(medioPago);
  }

  const pestana = tabIdListaLead({ ...lead, seguimiento });
  partes.push(`→ ${PESTANA_LABEL[pestana]}`);

  return partes.join(' · ');
}

export function parseIsoLocal(isoStr: string): Date | null {
  if (!isoStr?.trim()) return null;
  const m = isoStr.trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(isoStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
    0,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatHistorialFecha(creadoEn: string) {
  const d = parseIsoLocal(creadoEn);
  if (!d || Number.isNaN(d.getTime())) return creadoEn;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function etiquetaRolHistorial(rol?: RolUsuario | null) {
  if (rol === 'supervisor') return 'Supervisor';
  if (rol === 'promotor') return 'Promotor';
  return 'Operador';
}
