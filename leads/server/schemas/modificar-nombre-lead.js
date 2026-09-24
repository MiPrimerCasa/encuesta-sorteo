import { z } from 'zod';
import { textoCargaMayusculas } from '../domain/texto-carga.js';

export const modificarNombreLeadSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .transform((value) => textoCargaMayusculas(value)),
});
