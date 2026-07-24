import { z } from 'zod';

export const nuevoLeadSchema = z
  .object({
    nombre: z.string().trim().min(1).max(100),
    telefono: z.string().trim().min(6).max(50),
    promotorId: z.string().trim().min(1).max(80),
    /** Código SP @usuario (SORTEO01_V1). Obligatorio si el supervisor carga por un promotor. */
    promotorCodigo: z.string().trim().max(100).optional(),
    promotorNombre: z.string().trim().max(120).optional(),
    domicilio: z.string().trim().max(200).optional(),
    lista: z.enum(['entrevista', 'contacto']).optional(),
    quiereEntrevista: z.boolean().optional(),
    agendarEntrevista: z.boolean().optional(),
    horarioEntrevista: z.string().trim().max(40).optional(),
    lugarEntrevista: z.enum(['sucursal', 'domicilio']).optional(),
    domicilioEntrevista: z.string().trim().max(200).optional(),
    origen: z.string().trim().max(32).optional(),
    /** Encuesta carga: campo3 / conoceMpc — obligatorio */
    conoceMpc: z.boolean(),
    /** Encuesta carga: campo4 / sabiaPlanInversionJoven — obligatorio */
    sabiaPlanInversionJoven: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const agendar = Boolean(data.agendarEntrevista);
    if (!agendar) return;
    if (!data.horarioEntrevista?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta fecha y hora de entrevista.',
        path: ['horarioEntrevista'],
      });
    }
    if (!data.lugarEntrevista) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta lugar de entrevista.',
        path: ['lugarEntrevista'],
      });
    }
  });
