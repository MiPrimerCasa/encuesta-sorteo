import { useCallback, useState } from 'react';
import { fetchHistorialSeguimiento } from '../api/client';
import type { SeguimientoHistorialEntry } from '../types';

export function useHistorialLeads() {
  const [historialPorLead, setHistorialPorLead] = useState<
    Record<string, SeguimientoHistorialEntry[]>
  >({});

  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});

  const fetchHistorial = useCallback(async (leadId: string) => {
    if (!leadId) return;
    // Evitar peticiones redundantes si ya existe en caché o se está cargando
    if (historialPorLead[leadId] !== undefined || loadingIds[leadId]) {
      return;
    }

    setLoadingIds((prev) => ({ ...prev, [leadId]: true }));
    try {
      const historial = await fetchHistorialSeguimiento(leadId);
      setHistorialPorLead((prev) => ({ ...prev, [leadId]: historial }));
    } catch {
      setHistorialPorLead((prev) => ({ ...prev, [leadId]: [] }));
    } finally {
      setLoadingIds((prev) => ({ ...prev, [leadId]: false }));
    }
  }, [historialPorLead, loadingIds]);

  const refrescarHistorial = useCallback(
    async (leadId: string) => {
      if (!leadId) return;
      try {
        const historial = await fetchHistorialSeguimiento(leadId);
        setHistorialPorLead((prev) => ({ ...prev, [leadId]: historial }));
      } catch {
        setHistorialPorLead((prev) => ({ ...prev, [leadId]: [] }));
      }
    },
    [],
  );

  return { historialPorLead, fetchHistorial, refrescarHistorial };
}
