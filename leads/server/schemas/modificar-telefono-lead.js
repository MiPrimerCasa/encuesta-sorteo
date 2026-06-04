import { z } from 'zod';

export const modificarTelefonoLeadSchema = z.object({
  telefono: z.string().trim().min(6).max(50),
});
