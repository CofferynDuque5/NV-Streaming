import { z } from 'zod';
import { paisSchema } from './clientes.js';
import { paginacionSchema, uuidSchema } from './comunes.js';
import { montoOCeroSchema } from './dinero.js';

export const ESTADOS_CUENTA_SERVICIO = ['activa', 'caida', 'retirada'] as const;
export type EstadoCuentaServicio = (typeof ESTADOS_CUENTA_SERVICIO)[number];

export const ETIQUETA_ESTADO_CUENTA: Record<EstadoCuentaServicio, string> = {
  activa: 'Activa',
  caida: 'Caída',
  retirada: 'Retirada',
};

/** «perfiles»: se vende por perfil; «completa»: la cuenta entera es de un cliente. */
export const MODOS_CUENTA = ['perfiles', 'completa'] as const;
export type ModoCuenta = (typeof MODOS_CUENTA)[number];

export const ESTADOS_PERFIL = ['libre', 'asignado', 'bloqueado'] as const;
export type EstadoPerfil = (typeof ESTADOS_PERFIL)[number];

export const MAX_PERFILES_CUENTA = 20;

/** Usuario o correo de la cuenta (algunos servicios usan usuario, no correo). */
export const usuarioCuentaSchema = z
  .string({ error: 'Escribe el correo o usuario de la cuenta.' })
  .trim()
  .min(3, 'Escribe el correo o usuario de la cuenta.')
  .max(254, 'Es demasiado largo.')
  .refine((v) => !/\s/.test(v), 'No puede tener espacios.');

export const claveCuentaSchema = z
  .string({ error: 'Escribe la clave de la cuenta.' })
  .min(1, 'Escribe la clave de la cuenta.')
  .max(200, 'La clave es demasiado larga.');

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'El PIN son de 4 a 8 dígitos.');

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.')
  .refine((d) => {
    const f = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(f.getTime()) && f.toISOString().startsWith(d);
  }, 'La fecha no existe.');

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => v || null)
    .nullable()
    .optional();

const camposCuenta = {
  plan: textoOpcional(60),
  pais: paisSchema.nullable().optional(),
  /** Lo que te cuesta la cuenta al mes, en USD. */
  costoUsd: montoOCeroSchema.optional(),
  /** Próximo cobro del proveedor de la cuenta. */
  facturaEn: fechaSchema.nullable().optional(),
  /** Cómo la pagas («Tarjeta ···· 1234», «Binance»…). Nunca el número completo. */
  metodoPago: textoOpcional(60).refine(
    (v) => !v || !/\d{9,}/.test(v.replace(/[\s-]/g, '')),
    'No guardes números de tarjeta: solo los últimos 4 dígitos.',
  ),
  proveedor: textoOpcional(120),
  notas: textoOpcional(1000),
};

export const crearCuentaSchema = z.object({
  servicioId: uuidSchema,
  usuario: usuarioCuentaSchema,
  clave: claveCuentaSchema,
  modo: z.enum(MODOS_CUENTA).default('perfiles'),
  perfiles: z.coerce
    .number({ error: 'Indica cuántos perfiles tiene.' })
    .int()
    .min(1, 'Al menos 1 perfil.')
    .max(MAX_PERFILES_CUENTA, `Máximo ${MAX_PERFILES_CUENTA} perfiles.`),
  ...camposCuenta,
});
export type CrearCuentaEntrada = z.infer<typeof crearCuentaSchema>;

export const editarCuentaSchema = z
  .object({
    usuario: usuarioCuentaSchema.optional(),
    /** Vacío o ausente: se conserva la clave actual. */
    clave: claveCuentaSchema.optional(),
    estado: z.enum(ESTADOS_CUENTA_SERVICIO).optional(),
    perfiles: z.coerce.number().int().min(1).max(MAX_PERFILES_CUENTA).optional(),
    ...camposCuenta,
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'No hay cambios.');
export type EditarCuentaEntrada = z.infer<typeof editarCuentaSchema>;

export const editarPerfilSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(1, 'Escribe un nombre.')
      .max(40, 'Máximo 40 caracteres.')
      .optional(),
    /** null quita el PIN. */
    pin: pinSchema.nullable().optional(),
    bloqueado: z.boolean().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'No hay cambios.');
export type EditarPerfilEntrada = z.infer<typeof editarPerfilSchema>;

export const asignarPerfilSchema = z.object({ suscripcionId: uuidSchema });

export const listarCuentasSchema = paginacionSchema.extend({
  servicioId: uuidSchema.optional(),
  estado: z.enum(ESTADOS_CUENTA_SERVICIO).optional(),
  /** Correo o usuario exacto, o parte de su pista visible. */
  busqueda: z.string().trim().max(254).optional(),
  /** Solo las que tienen perfiles libres. */
  conLibres: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListarCuentasEntrada = z.infer<typeof listarCuentasSchema>;
