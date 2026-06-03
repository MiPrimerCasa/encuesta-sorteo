import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string().trim().min(2).max(80),
  password: z.string().min(1).max(120),
});

const referidoSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
  telefono: z.string().trim().min(6).max(50),
});

const ID_PIJ = 'prod-pij';
const ID_TERRENO = 'prod-terreno';

export const seguimientoSchema = z
  .object({
    confirmoEntrevista: z.boolean().nullable().optional(),
    fuente: z.enum(['qr', 'app', 'facebook', 'instagram']).nullable().optional(),
    canal: z.enum(['llamada', 'mensaje']).nullable().optional(),
    huboEntrevista: z.boolean().nullable().optional(),
    resultadoEntrevista: z
      .enum(['sin_interes', 'reagenda', 'no_compro', 'compro', 'derivar_terreno'])
      .nullable()
      .optional(),
    horarioEntrevistaPropuesto: z.string().nullable().optional(),
    fechaReagenda: z.string().nullable().optional(),
    seguimientoPijPromotor: z.boolean().nullable().optional(),
    idProducto: z.string().nullable().optional(),
    estadoPago: z.enum(['sena', 'cien', 'entrega_33', 'entrega_55']).nullable().optional(),
    idBarrio: z.string().nullable().optional(),
    numeroRecibo: z.string().trim().max(80).nullable().optional(),
    brindoReferidos: z.boolean().nullable().optional(),
    referidos: z.array(referidoSchema).optional(),
    observaciones: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.resultadoEntrevista === 'reagenda' && !data.fechaReagenda) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta fecha de reagenda.',
        path: ['fechaReagenda'],
      });
    }

    if (data.resultadoEntrevista === 'derivar_terreno') return;

    if (data.resultadoEntrevista !== 'compro') return;

    if (!data.idProducto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta producto.',
        path: ['idProducto'],
      });
      return;
    }

    if (!data.estadoPago) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta estado de pago.',
        path: ['estadoPago'],
      });
      return;
    }

    if (data.idProducto === ID_PIJ) {
      const validos = ['sena', 'entrega_33', 'entrega_55'];
      if (!validos.includes(data.estadoPago)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Estado de pago inválido para Plan Inversión Joven.',
          path: ['estadoPago'],
        });
      }
      if (
        (data.estadoPago === 'entrega_33' || data.estadoPago === 'entrega_55') &&
        !data.numeroRecibo?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ingresá el número de recibo.',
          path: ['numeroRecibo'],
        });
      }
    }

    if (data.idProducto === ID_TERRENO) {
      if (!data.idBarrio?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Seleccioná el barrio.',
          path: ['idBarrio'],
        });
      }
      if (!['sena', 'cien'].includes(data.estadoPago)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Estado de pago inválido para terreno.',
          path: ['estadoPago'],
        });
      }
      if (
        (data.estadoPago === 'sena' || data.estadoPago === 'cien') &&
        !data.numeroRecibo?.trim()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ingresá el número de recibo.',
          path: ['numeroRecibo'],
        });
      }
    }
  });
