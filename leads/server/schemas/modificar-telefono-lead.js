import { z } from 'zod';

/** Teléfono: acepta con o sin formato; exige al menos 8 dígitos. */
export const modificarTelefonoLeadSchema = z.object({
  telefono: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .refine((v) => String(v).replace(/\D/g, '').length >= 8, {
      message: 'Ingresá un teléfono válido (mínimo 8 dígitos).',
    }),
});
