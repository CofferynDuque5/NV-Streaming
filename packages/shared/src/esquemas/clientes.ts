import { z } from 'zod';
import {
  correoSchema,
  nombreSchema,
  paginacionSchema,
  parcialSinDefectos,
  uuidSchema,
} from './comunes.js';
import { MONEDA_PRINCIPAL } from '../monedas.js';
import { monedaSchema } from './dinero.js';

const opcional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), s.optional());

/** Al editar: vacío borra el dato (`null`); sin enviar, no cambia. */
const borrable = <T extends z.ZodType>(s: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    s.nullable().optional(),
  );

export const paisSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Usa el código de país de 2 letras (VE, AR, CO, PE...).');

export const telefonoSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+\d{7,15}$/, 'Escribe el número con el código de país (+58...).'));

export const ESTADOS_CLIENTE = ['activo', 'archivado'] as const;
export type EstadoCliente = (typeof ESTADOS_CLIENTE)[number];

export const clienteSchema = z.object({
  nombre: nombreSchema,
  correo: opcional(correoSchema),
  documento: opcional(z.string().trim().max(40, 'El documento es demasiado largo.')),
  pais: opcional(paisSchema),
  monedaPreferida: monedaSchema.default(MONEDA_PRINCIPAL),
  whatsapp: opcional(telefonoSchema),
  /** Consentimiento del cliente para recibir mensajes por WhatsApp. */
  aceptaWhatsapp: z.boolean().default(false),
  asignadoAId: opcional(uuidSchema),
});
export type ClienteEntrada = z.infer<typeof clienteSchema>;

export const actualizarClienteSchema = parcialSinDefectos(clienteSchema).extend({
  correo: borrable(correoSchema),
  documento: borrable(z.string().trim().max(40, 'El documento es demasiado largo.')),
  pais: borrable(paisSchema),
  whatsapp: borrable(telefonoSchema),
  asignadoAId: borrable(uuidSchema),
});
export type ActualizarClienteEntrada = z.infer<typeof actualizarClienteSchema>;

export const listarClientesSchema = paginacionSchema.extend({
  busqueda: z.string().trim().max(120).optional(),
  /** Sin estado: solo activos. "todos" incluye los archivados. */
  estado: z.enum([...ESTADOS_CLIENTE, 'todos']).optional(),
  asignadoAId: uuidSchema.optional(),
});
export type ListarClientesEntrada = z.infer<typeof listarClientesSchema>;

export const notaSchema = z.object({
  texto: z.string().trim().min(2, 'Escribe la nota.').max(2000, 'La nota es demasiado larga.'),
});

export const motivoSchema = z.object({
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(500, 'El motivo es demasiado largo.'),
});

/** Datos que el propio cliente puede cambiar desde su panel. */
export const perfilClienteSchema = z.object({
  documento: borrable(z.string().trim().max(40)),
  pais: borrable(paisSchema),
  monedaPreferida: monedaSchema.optional(),
  whatsapp: borrable(telefonoSchema),
  aceptaWhatsapp: z.boolean().optional(),
});
export type PerfilClienteEntrada = z.infer<typeof perfilClienteSchema>;
