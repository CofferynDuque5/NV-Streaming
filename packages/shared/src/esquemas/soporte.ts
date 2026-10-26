import { z } from 'zod';
import { paginacionSchema, uuidSchema } from './comunes.js';

export const ESTADOS_TICKET = [
  'abierto',
  'en_progreso',
  'esperando_cliente',
  'resuelto',
  'cerrado',
] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];
export const PRIORIDADES_TICKET = ['baja', 'normal', 'alta', 'urgente'] as const;
export type PrioridadTicket = (typeof PRIORIDADES_TICKET)[number];
export const CATEGORIAS_TICKET = ['pagos', 'acceso', 'suscripcion', 'cuenta', 'otro'] as const;
export type CategoriaTicket = (typeof CATEGORIAS_TICKET)[number];

/** Horas para la primera respuesta según la prioridad. */
export const SLA_HORAS: Record<PrioridadTicket, number> = {
  urgente: 2,
  alta: 8,
  normal: 24,
  baja: 48,
};

const textoMensaje = z
  .string()
  .trim()
  .min(2, 'Escribe el mensaje.')
  .max(5000, 'El mensaje es demasiado largo (máximo 5000 caracteres).');

export const abrirTicketSchema = z.object({
  asunto: z.string().trim().min(4, 'Escribe un asunto.').max(160),
  categoria: z.enum(CATEGORIAS_TICKET, { error: 'Elige una categoría.' }),
  mensaje: textoMensaje,
  suscripcionId: z.preprocess((v) => (v === '' ? undefined : v), uuidSchema.optional()),
});
export type AbrirTicketEntrada = z.infer<typeof abrirTicketSchema>;

export const abrirTicketEquipoSchema = abrirTicketSchema.extend({
  clienteId: uuidSchema,
  prioridad: z.enum(PRIORIDADES_TICKET).default('normal'),
});
export type AbrirTicketEquipoEntrada = z.infer<typeof abrirTicketEquipoSchema>;

export const mensajeTicketSchema = z.object({
  texto: textoMensaje,
  interno: z.boolean().default(false),
});

export const actualizarTicketSchema = z
  .object({
    estado: z.enum(ESTADOS_TICKET).optional(),
    prioridad: z.enum(PRIORIDADES_TICKET).optional(),
    asignadoAId: z.preprocess((v) => (v === '' ? null : v), uuidSchema.nullable().optional()),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'No hay cambios.');
export type ActualizarTicketEntrada = z.infer<typeof actualizarTicketSchema>;

export const listarTicketsSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_TICKET).optional(),
  prioridad: z.enum(PRIORIDADES_TICKET).optional(),
  clienteId: uuidSchema.optional(),
  /** "mios": asignados a quien consulta; "sin_asignar". */
  asignacion: z.enum(['mios', 'sin_asignar']).optional(),
  /** Solo los no cerrados ni resueltos. */
  abiertos: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListarTicketsEntrada = z.infer<typeof listarTicketsSchema>;
