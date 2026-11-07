import { z } from 'zod';
import { diaCajaSchema } from './caja.js';

export const balanceSchema = z
  .object({
    /** Primer día incluido (hora de Venezuela). Vacío: el 1 del mes. */
    desde: diaCajaSchema.optional(),
    /** Último día incluido. Vacío: hoy. */
    hasta: diaCajaSchema.optional(),
  })
  .refine((o) => !o.desde || !o.hasta || o.desde <= o.hasta, {
    message: 'La fecha inicial va antes que la final.',
    path: ['hasta'],
  });
export type BalanceEntrada = z.infer<typeof balanceSchema>;
