import { z } from 'zod';
import { paginacionSchema, uuidSchema } from './comunes.js';
import { monedaSchema, montoOCeroSchema, montoSchema } from './dinero.js';
import { codigoCuponSchema } from './suscripciones.js';

export const ESTADOS_FACTURA = ['emitida', 'pagada', 'anulada'] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];
export const ESTADOS_PAGO = ['en_revision', 'confirmado', 'rechazado', 'reembolsado'] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const listarFacturasSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_FACTURA).optional(),
  clienteId: uuidSchema.optional(),
  /** Emitidas cuyo vencimiento ya pasó. */
  vencidas: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListarFacturasEntrada = z.infer<typeof listarFacturasSchema>;

export const recotizarSchema = z.object({ moneda: monedaSchema });

export const listarPagosSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_PAGO).optional(),
  clienteId: uuidSchema.optional(),
});
export type ListarPagosEntrada = z.infer<typeof listarPagosSchema>;

const fechaPagoSchema = z.coerce
  .date({ error: 'Indica la fecha del pago.' })
  .refine((d) => d.getTime() <= Date.now() + 24 * 3600_000, 'La fecha no puede ser futura.')
  .refine(
    (d) => d.getTime() >= Date.now() - 90 * 24 * 3600_000,
    'La fecha tiene más de 90 días; registra el pago desde el panel del equipo.',
  );

const referenciaExternaSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z
    .string()
    .trim()
    .max(80, 'La referencia es demasiado larga.')
    .regex(/^[\w\s#./-]+$/, 'La referencia tiene caracteres no válidos.')
    .optional(),
);

/** Lo que el cliente declara al reportar un pago (el comprobante llega aparte). */
export const reportarPagoSchema = z.object({
  metodoCobroId: uuidSchema,
  monto: montoSchema,
  referenciaExterna: referenciaExternaSchema,
  fechaPago: fechaPagoSchema,
});
export type ReportarPagoEntrada = z.infer<typeof reportarPagoSchema>;

/** Pago recibido que el equipo registra directamente (queda confirmado). */
export const registrarPagoSchema = z.object({
  metodoCobroId: uuidSchema,
  monto: montoSchema,
  referenciaExterna: referenciaExternaSchema,
  fechaPago: z.coerce
    .date({ error: 'Indica la fecha del pago.' })
    .refine((d) => d.getTime() <= Date.now() + 24 * 3600_000, 'La fecha no puede ser futura.'),
  notas: z.string().trim().max(500).optional(),
});
export type RegistrarPagoEntrada = z.infer<typeof registrarPagoSchema>;

export const confirmarPagoSchema = z.object({
  montoRecibido: montoOCeroSchema,
  notas: z.string().trim().max(500).optional(),
});
export type ConfirmarPagoEntrada = z.infer<typeof confirmarPagoSchema>;

export const rechazarPagoSchema = z.object({
  motivo: z.string().trim().min(3, 'Explica al cliente por qué se rechaza.').max(500),
});

export const TIPOS_CUPON = ['porcentaje', 'monto'] as const;
export type TipoCupon = (typeof TIPOS_CUPON)[number];

export const cuponSchema = z
  .object({
    codigo: codigoCuponSchema,
    tipo: z.enum(TIPOS_CUPON, { error: 'Elige el tipo de descuento.' }),
    /** Porcentaje (1–100) o monto en USD. */
    valor: montoSchema,
    validoDesde: z.coerce.date().optional(),
    validoHasta: z.coerce.date().optional(),
    usosMaximos: z.coerce.number().int().min(1).max(100_000).optional(),
    soloAltas: z.boolean().default(true),
    planIds: z.array(uuidSchema).max(50).default([]),
  })
  .refine((c) => c.tipo !== 'porcentaje' || Number(c.valor) <= 100, {
    error: 'El porcentaje no puede superar 100.',
    path: ['valor'],
  })
  .refine((c) => !c.validoDesde || !c.validoHasta || c.validoHasta > c.validoDesde, {
    error: 'La fecha final debe ser posterior a la inicial.',
    path: ['validoHasta'],
  });
export type CuponEntrada = z.infer<typeof cuponSchema>;

export const previsualizarCuponSchema = z.object({
  codigo: codigoCuponSchema,
  planId: uuidSchema,
  moneda: monedaSchema,
});
