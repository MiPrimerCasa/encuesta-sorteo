import { useMemo } from 'react';
import {
  leadCompro,
  leadReagendaEntrevista,
  sortLeadsContactados,
  sortLeadsPorVentaReciente,
} from '../domain/leads';
import {
  fueContactadoLead,
  ordenarPorPrioridadTabInicial,
  perteneceTabInicial,
  prioridadTabInicial,
} from '../domain/prioridad-leads';
import type { Lead } from '../types';

function fifoSort(leads: Lead[]) {
  return [...leads].sort((a, b) => {
    const fa = a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
    const fb = b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
    return fa.localeCompare(fb);
  });
}

/** En seguimiento: orden por próxima fecha de reagenda (más cercana primero). */
function sortSeguimientoPorFechaReagenda(leads: Lead[]) {
  return [...leads].sort((a, b) => {
    const fa = a.seguimiento?.fechaReagenda ?? a.fechaAlta ?? `${a.fechaObtencion}T00:00:00`;
    const fb = b.seguimiento?.fechaReagenda ?? b.fechaAlta ?? `${b.fechaObtencion}T00:00:00`;
    return fa.localeCompare(fb);
  });
}

function esCerradoNegativo(l: Lead) {
  return (
    l.seguimiento?.resultadoEntrevista === 'no_compro' ||
    l.seguimiento?.resultadoEntrevista === 'sin_interes'
  );
}

/**
 * Listas excluyentes. La pestaña inicial agrupa por prioridad de negocio
 * (terreno derivado → entrevista pendiente → encuesta sin contactar), no por sorteo.
 */
export function useLeadsFilter(leads: Lead[]) {
  return useMemo(() => {
    // Solo las compras cierran el lead; los negativos pasan a Contactado.
    const compraron = sortLeadsPorVentaReciente(leads.filter(leadCompro));
    const noCompraron = fifoSort(leads.filter(esCerradoNegativo));
    const cerrados = new Set(compraron.map((l) => l.id));

    const seguimiento = sortSeguimientoPorFechaReagenda(
      leads.filter((l) => !cerrados.has(l.id) && leadReagendaEntrevista(l)),
    );
    const activos = leads.filter((l) => !cerrados.has(l.id) && !leadReagendaEntrevista(l));

    const entrevistaPendiente = ordenarPorPrioridadTabInicial(
      activos.filter((l) => perteneceTabInicial(l)),
    );

    // Contactado: post-entrevista sin compra arriba; luego el resto de contactados.
    const paraContactar = sortLeadsContactados(
      activos.filter(
        (l) => (fueContactadoLead(l) || esCerradoNegativo(l)) && !perteneceTabInicial(l),
      ),
    );

    /** Solo prioridad 2 — encuesta sin agenda ni derivación (alertas +2 días). */
    const encuestaSinContactar = entrevistaPendiente.filter(
      (l) => prioridadTabInicial(l) === 2,
    );

    return {
      entrevistaPendiente,
      paraContactar,
      seguimiento,
      compraron,
      noCompraron,
      encuestaSinContactar,
    };
  }, [leads]);
}
