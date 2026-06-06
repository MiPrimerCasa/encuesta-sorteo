import { useMemo } from 'react';
import { buildEfectividadEntrevistasEquipo } from '../domain/efectividad-entrevistas';
import type { Lead, Promotor } from '../types';

export function useEfectividadEntrevistas(leads: Lead[], promotores: Promotor[]) {
  return useMemo(
    () => buildEfectividadEntrevistasEquipo(leads, promotores),
    [leads, promotores],
  );
}
