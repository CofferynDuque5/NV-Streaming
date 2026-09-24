import { z } from 'zod';
import { paginacionSchema, uuidSchema } from './comunes.js';
import { monedaSchema } from './dinero.js';

export const ESTADOS_SUSCRIPCION = [
  'pendiente_pago',
  'activa',
  'en_gracia',
  'pausada',
  'suspendida',
  'vencida',
  'cancelada',
] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

export const codigoCuponSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,40}$/, 'El cupón usa letras, números, guiones (3 a 40).');

const cuponOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  codigoCuponSchema.optional(),
);

/** Alta desde el panel del cliente. */
export const contratarSchema = z.object({
  planId: uuidSchema,
  moneda: monedaSchema,
  cupon: cuponOpcional,
});
export type ContratarEntrada = z.infer<typeof contratarSchema>;

/** Alta hecha por el equipo para un cliente. */
export const crearSuscripcionSchema = contratarSchema.extend({ clienteId: uuidSchema });
export type CrearSuscripcionEntrada = z.infer<typeof crearSuscripcionSchema>;

export const listarSuscripcionesSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_SUSCRIPCION).optional(),
  clienteId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  /** Solo las que vencen en los próximos N días. */
  vencenEnDias: z.coerce.number().int().min(1).max(90).optional(),
});
export type ListarSuscripcionesEntrada = z.infer<typeof listarSuscripcionesSchema>;

export const cancelarSuscripcionSchema = z.object({
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(500),
  /** El equipo puede cancelar en el acto; si no, sigue activa hasta el vencimiento. */
  inmediata: z.boolean().default(false),
});
export type CancelarSuscripcionEntrada = z.infer<typeof cancelarSuscripcionSchema>;

export const renovarSchema = z.object({ moneda: monedaSchema.optional() });
