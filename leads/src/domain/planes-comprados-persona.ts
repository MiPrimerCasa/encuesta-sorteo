import type { CompraAdicional, Lead } from '../types';
import { normalizarDniCliente } from './dni-cliente';
import { esPlanInversion } from './venta';
import { parsePijRecibo } from './pij-recibo';
import { telefonoParaWhatsApp } from './whatsapp';

export type PlanCompradoPersona = {
  key: string;
  leadId: string;
  leadNombre: string;
  esLeadActual: boolean;
  esPrincipal: boolean;
  serie: string;
  adhesion: string;
  anexo: string;
  /** Notación corta tipo C120 o A128 */
  adhesionDisplay: string;
  numeroRecibo: string;
  fechaCierre: string | null;
};

function telefonoClave(raw?: string | null): string | null {
  return telefonoParaWhatsApp(raw) ?? (String(raw ?? '').replace(/\D/g, '') || null);
}

function dniDeLead(lead: Lead): string {
  return normalizarDniCliente(lead.seguimiento?.dniCliente);
}

function mismaPersona(
  leadActual: Lead,
  otro: Lead,
  dniRef: string | null,
  telRef: string | null,
): boolean {
  if (String(otro.id) === String(leadActual.id)) return true;
  const dniOtro = dniDeLead(otro);
  if (dniRef && dniOtro && dniRef === dniOtro) return true;
  if (!dniRef || !dniOtro) {
    const telOtro = telefonoClave(otro.telefono);
    if (telRef && telOtro && telRef === telOtro) return true;
  }
  return false;
}

function planDesdeRecibo(args: {
  lead: Lead;
  esLeadActual: boolean;
  esPrincipal: boolean;
  compraId?: string;
  idProducto: string | null | undefined;
  numeroRecibo: string | null | undefined;
  fechaCierre: string | null | undefined;
  resultadoOk?: boolean;
}): PlanCompradoPersona | null {
  if (!esPlanInversion(args.idProducto)) return null;
  if (args.resultadoOk === false) return null;
  const recibo = String(args.numeroRecibo ?? '').trim();
  if (!recibo) return null;
  const parsed = parsePijRecibo(recibo);
  if (!parsed.adhesion) return null;
  const serie = (parsed.serie || 'A').toUpperCase();
  return {
    key: `${args.lead.id}:${args.esPrincipal ? 'principal' : args.compraId ?? 'adic'}:${serie}${parsed.adhesion}`,
    leadId: String(args.lead.id),
    leadNombre: args.lead.nombre,
    esLeadActual: args.esLeadActual,
    esPrincipal: args.esPrincipal,
    serie,
    adhesion: parsed.adhesion,
    anexo: parsed.anexo || '',
    adhesionDisplay: `${serie}${parsed.adhesion}`,
    numeroRecibo: recibo,
    fechaCierre: args.fechaCierre ? String(args.fechaCierre) : null,
  };
}

/**
 * Planes PIJ de la misma persona: lead actual + otros leads con mismo DNI
 * (o mismo teléfono si no hay DNI).
 */
export function planesPijDeLaMismaPersona(
  leadActual: Lead,
  todosLosLeads: Lead[],
  opts?: {
    dniForm?: string | null;
    numeroReciboForm?: string | null;
    comprasForm?: CompraAdicional[] | null;
    idProductoForm?: string | null;
    fechaCierreForm?: string | null;
    resultadoForm?: string | null;
  },
): PlanCompradoPersona[] {
  const dniRef =
    normalizarDniCliente(opts?.dniForm) ||
    dniDeLead(leadActual) ||
    null;
  const telRef = telefonoClave(leadActual.telefono);
  const out: PlanCompradoPersona[] = [];
  const seen = new Set<string>();

  const push = (plan: PlanCompradoPersona | null) => {
    if (!plan) return;
    const dedupe = `${plan.serie}${plan.adhesion}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push(plan);
  };

  for (const lead of todosLosLeads) {
    if (!mismaPersona(leadActual, lead, dniRef, telRef)) continue;
    const esActual = String(lead.id) === String(leadActual.id);
    const seg = lead.seguimiento;
    const esCompro = seg?.resultadoEntrevista === 'compro';

    if (esActual && opts?.resultadoForm === 'compro' && opts.numeroReciboForm) {
      push(
        planDesdeRecibo({
          lead,
          esLeadActual: true,
          esPrincipal: true,
          idProducto: opts.idProductoForm ?? seg?.idProducto,
          numeroRecibo: opts.numeroReciboForm,
          fechaCierre: opts.fechaCierreForm ?? seg?.fechaCierre,
          resultadoOk: true,
        }),
      );
    } else if (esCompro) {
      push(
        planDesdeRecibo({
          lead,
          esLeadActual: esActual,
          esPrincipal: true,
          idProducto: seg?.idProducto,
          numeroRecibo: seg?.numeroRecibo,
          fechaCierre: seg?.fechaCierre,
          resultadoOk: true,
        }),
      );
    }

    const compras =
      esActual && opts?.comprasForm
        ? opts.comprasForm
        : seg?.comprasAdicionales ?? [];
    for (const compra of compras) {
      push(
        planDesdeRecibo({
          lead,
          esLeadActual: esActual,
          esPrincipal: false,
          compraId: compra.id,
          idProducto: compra.idProducto,
          numeroRecibo: compra.numeroRecibo,
          fechaCierre: compra.fechaCierre ?? seg?.fechaCierre,
          resultadoOk: true,
        }),
      );
    }
  }

  out.sort((a, b) => {
    const fa = a.fechaCierre ?? '';
    const fb = b.fechaCierre ?? '';
    return fb.localeCompare(fa);
  });
  return out;
}
