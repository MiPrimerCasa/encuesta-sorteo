import { useMemo } from 'react';
import { leadCompro, leadReagendaEntrevista } from '../domain/leads';
import type { Lead } from '../types';

function fifoSort(leads: Lead[]) {
  return [...leads].sort((a, b) => {
    const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
    const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
    return fa.localeCompare(fb);
  });
}

function esCerradoNegativo(l: Lead) {
  return (
    l.seguimiento?.resultadoEntrevista === 'no_compro' ||
    l.seguimiento?.resultadoEntrevista === 'sin_interes'
  );
}

/** Cinco listas excluyentes con orden FIFO (fecha_alta ASC). */
export function useLeadsFilter(leads: Lead[]) {
  return useMemo(() => {
    const compraron    = fifoSort(leads.filter(leadCompro));
    const noCompraron  = fifoSort(leads.filter(esCerradoNegativo));
    const cerrados     = new Set([...compraron, ...noCompraron].map((l) => l.id));

    const seguimiento = fifoSort(
      leads.filter((l) => !cerrados.has(l.id) && leadReagendaEntrevista(l)),
    );
    const activos = leads.filter((l) => !cerrados.has(l.id) && !leadReagendaEntrevista(l));

    const fueContactado = (l: Lead) =>
      Boolean(l.seguimiento?.canal || l.seguimiento?.huboEntrevista != null);
    const entrevistaPendiente = fifoSort(activos.filter((l) => !fueContactado(l)));
    const paraContactar       = fifoSort(activos.filter(fueContactado));

    return { entrevistaPendiente, paraContactar, seguimiento, compraron, noCompraron };
  }, [leads]);
}
