import { useMemo } from 'react';
import { leadCompro } from '../domain/leads';
import type { Lead, Promotor } from '../types';

export function usePromotoresMetrics(leads: Lead[], promotores: Promotor[]) {
  return useMemo(() => {
    const counts = Object.fromEntries(
      promotores.map((p) => [p.id, { total: 0, compro: 0 }]),
    );

    for (const lead of leads) {
      const bucket = counts[lead.promotorId];
      if (!bucket) continue;
      bucket.total += 1;
      if (leadCompro(lead)) bucket.compro += 1;
    }

    return promotores.map((p) => ({
      ...p,
      totalLeads: counts[p.id]?.total ?? 0,
      leadsCompro: counts[p.id]?.compro ?? 0,
    }));
  }, [leads, promotores]);
}
