import { z } from 'zod';
import { correoSchema, paginacionSchema, parcialSinDefectos, uuidSchema } from './comunes.js';
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

/** Lo llena el equipo, no el cliente: el mensaje habla del cliente. */
const nombreClienteSchema = z
  .string({ error: 'Escribe el nombre del cliente.' })
  .trim()
  .min(1, 'Escribe el nombre del cliente.')
  .min(2, 'El nombre debe tener al menos 2 caracteres.')
  .max(120, 'El nombre es demasiado largo.');

export const clienteSchema = z.object({
  nombre: nombreClienteSchema,
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

const textoNotaSchema = z
  .string()
  .trim()
  .min(2, 'Escribe la nota.')
  .max(2000, 'La nota es demasiado larga.');

export const notaSchema = z.object({ texto: textoNotaSchema });

/** Qué pide la nota (como en el Gestor). */
export const TIPOS_NOTA = [
  'entregar',
  'renovar',
  'pendiente',
  'fiado',
  'paga_dia',
  'no_cortar',
  'otro',
] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];

export const ETIQUETA_TIPO_NOTA: Record<TipoNota, string> = {
  entregar: 'Entregar',
  renovar: 'Renovar',
  pendiente: 'Pendiente',
  fiado: 'Fiado',
  paga_dia: 'Paga el día',
  no_cortar: 'No cortar',
  otro: 'Otro',
};

const avisarEnSchema = z.iso
  .datetime({ offset: true, error: 'Indica la fecha y la hora del aviso.' })
  .nullable()
  .optional();
const diaPagoSchema = z.coerce
  .number({ error: 'Indica el día de pago (1 a 31).' })
  .int('Indica el día de pago (1 a 31).')
  .min(1, 'Indica el día de pago (1 a 31).')
  .max(31, 'Indica el día de pago (1 a 31).')
  .nullable()
  .optional();

const pideDiaPago = (o: { tipo?: TipoNota; diaPago?: number | null }) =>
  o.tipo !== 'paga_dia' || !!o.diaPago;
const MENSAJE_DIA_PAGO = { message: 'Indica el día de pago (1 a 31).', path: ['diaPago'] };

/** Nota o pendiente del equipo, de un cliente o general. */
export const crearNotaSchema = z
  .object({
    texto: textoNotaSchema,
    tipo: z.enum(TIPOS_NOTA).default('otro'),
    clienteId: uuidSchema.nullable().optional(),
    /** Tarea delegada: quién del equipo la hace (vacío = de todos). */
    asignadaAId: uuidSchema.nullable().optional(),
    avisarEn: avisarEnSchema,
    diaPago: diaPagoSchema,
  })
  .refine(pideDiaPago, MENSAJE_DIA_PAGO);
export type CrearNotaEntrada = z.infer<typeof crearNotaSchema>;

export const editarNotaSchema = z
  .object({
    texto: textoNotaSchema.optional(),
    tipo: z.enum(TIPOS_NOTA).optional(),
    asignadaAId: uuidSchema.nullable().optional(),
    avisarEn: avisarEnSchema,
    diaPago: diaPagoSchema,
    /** true la marca hecha; false la vuelve a pendiente. */
    hecha: z.boolean().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'No hay cambios.');
export type EditarNotaEntrada = z.infer<typeof editarNotaSchema>;

export const listarNotasSchema = z.object({
  estado: z.enum(['pendientes', 'hechas']).default('pendientes'),
  clienteId: uuidSchema.optional(),
  /** mias: asignadas a quien consulta; delegadas: las que asignó a otros. */
  vista: z.enum(['todas', 'mias', 'delegadas']).default('todas'),
});
export type ListarNotasEntrada = z.infer<typeof listarNotasSchema>;

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
