import { useCallback, useEffect, useState } from 'react';
import { fetchHistorialSeguimiento } from '../api/client';
import type { SeguimientoHistorialEntry } from '../types';

export function useHistorialLeads(leadIds: string[]) {
  const [historialPorLead, setHistorialPorLead] = useState<
    Record<string, SeguimientoHistorialEntry[]>
  >({});

  const idsKey = [...new Set(leadIds.filter(Boolean))].sort().join(',');

  const cargar = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setHistorialPorLead({});
      return;
    }
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          const historial = await fetchHistorialSeguimiento(id);
          return [id, historial] as const;
        } catch {
          return [id, []] as const;
        }
      }),
    );
    setHistorialPorLead(Object.fromEntries(pairs));
  }, []);

  useEffect(() => {
    void cargar(idsKey ? idsKey.split(',') : []);
  }, [idsKey, cargar]);

  const refrescarHistorial = useCallback(
    async (leadId: string) => {
      try {
        const historial = await fetchHistorialSeguimiento(leadId);
        setHistorialPorLead((prev) => ({ ...prev, [leadId]: historial }));
      } catch {
        setHistorialPorLead((prev) => ({ ...prev, [leadId]: [] }));
      }
    },
    [],
  );

  return { historialPorLead, refrescarHistorial };
}
