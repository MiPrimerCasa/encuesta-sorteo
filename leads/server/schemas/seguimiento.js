import { z } from 'zod';
import { validarDniCliente } from '../domain/dni-cliente.js';

export const loginSchema = z.object({
  usuario: z.string().trim().min(2).max(80),
  password: z.string().trim().min(1).max(120),
});

const referidoSchema = z.object({
  nombre: z.string().trim().min(1).max(150),
  telefono: z.string().trim().min(6).max(50),
});

const ID_PIJ = 'prod-pij';
const ID_TERRENO = 'prod-terreno';

const compraAdicionalSchema = z.object({
  id: z.string(),
  idProducto: z.string(),
  estadoPago: z.enum(['sena', 'cien', 'entrega_33', 'entrega_55']),
  idBarrio: z.string().nullable().optional(),
  numeroRecibo: z.string().trim().max(80),
  fechaCierre: z.string(),
  formaPago: z.enum(['efectivo', 'transferencia', 'mixto']).nullable().optional(),
  montoCierre: z.number().nonnegative().nullable().optional(),
  montoEfectivo: z.number().nonnegative().nullable().optional(),
  montoTransferencia: z.number().nonnegative().nullable().optional(),
  titularTransferencia: z.string().trim().max(200).nullable().optional(),
  bancoTransferencia: z.string().trim().max(120).nullable().optional(),
  referenciaTransferencia: z.string().trim().max(120).nullable().optional(),
  idVentaIntegral: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.idProducto === ID_PIJ) {
    if (data.estadoPago !== 'entrega_33') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Para Plan Inversión Joven solo se registra Entrega $33.000.',
        path: ['estadoPago'],
      });
    }
    if (data.estadoPago === 'entrega_33' && !data.numeroRecibo?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ingresá el número de recibo.',
        path: ['numeroRecibo'],
      });
    }
    if (data.estadoPago === 'entrega_33' && !data.formaPago) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicá el medio de pago.',
        path: ['formaPago'],
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

const imagenCierrePijSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  ventaKey: z.string(),
  tipo: z.enum(['img1', 'img2', 'img5', 'img6', 'img7', 'recibo', 'comprobante_transferencia']),
  storagePath: z.string().min(1),
  mimeType: z.string(),
  tamanoBytes: z.number().nonnegative(),
  nombreOriginal: z.string().nullable().optional(),
  subidoEn: z.string(),
  operadorId: z.string().nullable().optional(),
});

export const seguimientoSchema = z
  .object({
    confirmoEntrevista: z.boolean().nullable().optional(),
    fuente: z.enum(['qr', 'app', 'facebook', 'instagram', 'whatsapp', 'tiktok']).nullable().optional(),
    canal: z.enum(['llamada', 'mensaje', 'en_persona']).nullable().optional(),
    huboEntrevista: z.boolean().nullable().optional(),
    resultadoEntrevista: z
      .enum(['sin_interes', 'reagenda', 'no_compro', 'compro', 'derivar_terreno'])
      .nullable()
      .optional(),
    horarioEntrevistaPropuesto: z.string().nullable().optional(),
    fechaReagenda: z.string().nullable().optional(),
    /** Fecha/hora del cierre (ISO). Obligatorio de negocio cuando resultado = compro. */
    fechaCierre: z.string().nullable().optional(),
    seguimientoPijPromotor: z.boolean().nullable().optional(),
    seguimientoAgendaOperadorRol: z.enum(['supervisor', 'promotor']).nullable().optional(),
    derivacionTerrenoActiva: z.boolean().nullable().optional(),
    idProducto: z.string().nullable().optional(),
    estadoPago: z.enum(['sena', 'cien', 'entrega_33', 'entrega_55']).nullable().optional(),
    idBarrio: z.string().nullable().optional(),
    numeroRecibo: z.string().trim().max(80).nullable().optional(),
    formaPago: z.enum(['efectivo', 'transferencia', 'mixto']).nullable().optional(),
    montoCierre: z.number().nonnegative().nullable().optional(),
    montoEfectivo: z.number().nonnegative().nullable().optional(),
    montoTransferencia: z.number().nonnegative().nullable().optional(),
    titularTransferencia: z.string().trim().max(200).nullable().optional(),
    bancoTransferencia: z.string().trim().max(120).nullable().optional(),
    referenciaTransferencia: z.string().trim().max(120).nullable().optional(),
    brindoReferidos: z.boolean().nullable().optional(),
    referidos: z.array(referidoSchema).optional(),
    referidosGenerados: z
      .array(
        z.object({
          nombre: z.string(),
          telefono: z.string(),
          leadId: z.string().optional(),
          estado: z.enum(['creado', 'duplicado', 'error']),
          mensaje: z.string().optional(),
        }),
      )
      .optional(),
    observaciones: z.string().max(500).optional(),
    dniCliente: z.string().trim().max(16).nullable().optional(),
    comprasAdicionales: z.array(compraAdicionalSchema).nullable().optional(),
    imagenesCierre: z.array(imagenCierrePijSchema).nullable().optional(),
    /** Id de venta en el sistema integral (respuesta SOAP). */
    idVentaIntegral: z.number().int().positive().nullable().optional(),
    pijIntegralEstado: z
      .enum(['pendiente', 'bloqueado', 'fotos_ok', 'error'])
      .nullable()
      .optional(),
    pijIntegralError: z.string().max(500).nullable().optional(),
    pijIntegralEnviadoEn: z.string().nullable().optional(),
    /** Verificación del cierre en el sistema de caja de sucursal (push caja → CRM). */
    cajaEstado: z.enum(['pendiente', 'verificado', 'rechazado']).nullable().optional(),
    cajaVerificadoEn: z.string().nullable().optional(),
    cajaComprobanteId: z.string().max(64).nullable().optional(),
    cajaMotivoRechazo: z.string().max(300).nullable().optional(),
    cajaSucursal: z.string().max(32).nullable().optional(),
    /** Usuario de caja que confirmó/rechazó la venta. */
    cajaConfirmadoPor: z.string().max(200).nullable().optional(),
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
      if (data.estadoPago !== 'entrega_33') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Para Plan Inversión Joven solo se registra Entrega $33.000.',
          path: ['estadoPago'],
        });
      }
      if (data.estadoPago === 'entrega_33' && !data.numeroRecibo?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ingresá el número de recibo.',
          path: ['numeroRecibo'],
        });
      }
      if (data.estadoPago === 'entrega_33' && !data.formaPago) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Indicá el medio de pago.',
          path: ['formaPago'],
        });
      }
      // Fotos PIJ: opcionales por ahora (piloto SOAP / caja).
      const errDni = validarDniCliente(data.dniCliente);
      if (errDni) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: errDni,
          path: ['dniCliente'],
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
