import { useMemo } from 'react';
import { leadCompro } from '../domain/leads';
import type { Lead, Promotor } from '../types';

export function usePromotoresMetrics(leads: Lead[], promotores: Promotor[]) {
  return useMemo(() => {
    const counts = Object.fromEntries(
      promotores.map((p) => [
        p.id,
        { total: 0, compro: 0, distinctDates: new Set<string>(), hoy: 0 },
      ]),
    );

    const hoyStr = new Date().toISOString().slice(0, 10);

    for (const lead of leads) {
      const bucket = counts[lead.promotorId];
      if (!bucket) continue;
      bucket.total += 1;
      if (leadCompro(lead)) bucket.compro += 1;

      const fStr = (lead.fechaAlta || lead.fechaObtencion || '').slice(0, 10);
      if (fStr) {
        bucket.distinctDates.add(fStr);
        if (fStr === hoyStr) {
          bucket.hoy += 1;
        }
      }
    }

    return promotores.map((p) => {
      const b = counts[p.id];
      const totalLeads = b?.total ?? 0;
      const leadsCompro = b?.compro ?? 0;
      const leadsHoy = b?.hoy ?? 0;
      const daysCount = b?.distinctDates.size ?? 1;
      const promedioDiario = totalLeads / (daysCount || 1);

      return {
        ...p,
        totalLeads,
        leadsCompro,
        leadsHoy,
        promedioDiario,
      };
    });
  }, [leads, promotores]);
}
