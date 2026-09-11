import { z } from 'zod';

export const modificarNombreLeadSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
});
