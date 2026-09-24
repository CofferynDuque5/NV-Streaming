import { z } from 'zod';
import { MONEDAS, MONEDAS_CON_TASA } from '../monedas.js';
import { parcialSinDefectos } from './comunes.js';

export const monedaSchema = z.enum(MONEDAS, { error: 'Moneda no válida.' });
export const monedaConTasaSchema = z.enum(MONEDAS_CON_TASA, {
  error: 'Elige una moneda distinta del dólar.',
});

/**
 * Número decimal como texto normalizado ("1234.50"). Acepta coma decimal y
 * números; nunca se convierte a coma flotante en la API.
 */
const decimal = (maxEnteros: number, maxDecimales: number, mensaje: string) =>
  z
    .union([z.string(), z.number()], { error: mensaje })
    .transform((v) => String(v).trim().replace(/\s/g, '').replace(',', '.'))
    .pipe(
      z
        .string()
        .regex(new RegExp(`^\\d{1,${maxEnteros}}(\\.\\d{1,${maxDecimales}})?$`), mensaje)
        .refine((v) => Number(v) > 0, 'Debe ser mayor que cero.'),
    );

/** Importe positivo con hasta 2 decimales. */
export const montoSchema = decimal(12, 2, 'Escribe un importe válido (hasta 2 decimales).');

/** Importe que puede ser cero (precios gratuitos, montos recibidos). */
export const montoOCeroSchema = z
  .union([z.string(), z.number()], { error: 'Escribe un importe válido.' })
  .transform((v) => String(v).trim().replace(/\s/g, '').replace(',', '.'))
  .pipe(
    z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Escribe un importe válido (hasta 2 decimales).'),
  );

/** Tasa de cambio: unidades de la moneda por 1 USD, hasta 6 decimales. */
export const tasaSchema = decimal(12, 6, 'Escribe una tasa válida (hasta 6 decimales).');

export const registrarTasaSchema = z.object({
  moneda: monedaConTasaSchema,
  valor: tasaSchema,
});
export type RegistrarTasaEntrada = z.infer<typeof registrarTasaSchema>;

export const metodoCobroSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe un nombre.').max(80),
  moneda: monedaSchema,
  instrucciones: z
    .string()
    .trim()
    .min(5, 'Explica al cliente cómo pagar.')
    .max(2000, 'Las instrucciones son demasiado largas.'),
  requiereReferencia: z.boolean().default(true),
  activo: z.boolean().default(true),
  orden: z.coerce.number().int().min(0).max(999).default(0),
});
export type MetodoCobroEntrada = z.infer<typeof metodoCobroSchema>;
export const actualizarMetodoCobroSchema = parcialSinDefectos(metodoCobroSchema);
