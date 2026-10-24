import { z } from 'zod';

/** Día de la caja, «AAAA-MM-DD» en hora de Venezuela. */
export const diaCajaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.')
  .refine((d) => {
    const f = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(f.getTime()) && f.toISOString().startsWith(d);
  }, 'La fecha no existe.');

export const consultarCajaSchema = z.object({ dia: diaCajaSchema.optional() });
export type ConsultarCajaEntrada = z.infer<typeof consultarCajaSchema>;

export const cerrarCajaSchema = z.object({
  dia: diaCajaSchema,
  notas: z.string().trim().max(500, 'Máximo 500 caracteres.').optional(),
});
export type CerrarCajaEntrada = z.infer<typeof cerrarCajaSchema>;
