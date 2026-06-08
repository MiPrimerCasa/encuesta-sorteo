import { tabIdListaLead } from './leads';
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

  const pestana = tabIdListaLead({ ...lead, seguimiento });
  partes.push(`→ ${PESTANA_LABEL[pestana]}`);

  return partes.join(' · ');
}

export function formatHistorialFecha(creadoEn: string) {
  const d = new Date(creadoEn.includes('T') ? creadoEn : `${creadoEn.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return creadoEn;
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
