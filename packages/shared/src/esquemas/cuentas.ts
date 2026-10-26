import { z } from 'zod';
import { paisSchema } from './clientes.js';
import { paginacionSchema, uuidSchema } from './comunes.js';
import { MAX_FILAS_IMPORTAR } from '../importar-cuentas.js';
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
export const MAX_CICLO_MESES = 12;

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

/** Sin números de tarjeta completos: solo los últimos dígitos. */
const sinNumeroTarjeta = (v: string | null | undefined) =>
  !v || !/\d{9,}/.test(v.replace(/[\s-]/g, ''));
const MENSAJE_TARJETA = 'No guardes números de tarjeta: solo los últimos 4 dígitos.';

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
  /** Lo que cobra el proveedor en cada ciclo, en USD. */
  costoUsd: montoOCeroSchema.optional(),
  /** Cada cuántos meses cobra el proveedor (1 = mensual). */
  cicloMeses: z.coerce
    .number({ error: 'Indica cada cuántos meses cobra el proveedor.' })
    .int()
    .min(1, 'Mínimo 1 mes.')
    .max(MAX_CICLO_MESES, `Máximo ${MAX_CICLO_MESES} meses.`)
    .optional(),
  /** Próximo cobro del proveedor de la cuenta. */
  facturaEn: fechaSchema.nullable().optional(),
  /** Cómo la pagas («Tarjeta ···· 1234», «Binance»…). Nunca el número completo. */
  metodoPago: textoOpcional(60).refine(sinNumeroTarjeta, MENSAJE_TARJETA),
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

export const buscarAsignablesSchema = z.object({
  /** Parte del nombre del cliente. */
  busqueda: z.string().trim().max(80).optional(),
});

// ── Pagos al proveedor (cuentas por pagar) ───────────────────────────────────

export const registrarPagoCuentaSchema = z.object({
  /** Vacío: el costo de la cuenta. */
  montoUsd: montoOCeroSchema.optional(),
  /** Vacío: hoy (hora de Venezuela). */
  pagadoEl: fechaSchema.optional(),
  /** Vacío: el cobro pendiente más el ciclo de la cuenta. */
  siguienteCobro: fechaSchema.optional(),
  metodoPago: textoOpcional(60).refine(sinNumeroTarjeta, MENSAJE_TARJETA),
  nota: textoOpcional(500),
});
export type RegistrarPagoCuentaEntrada = z.infer<typeof registrarPagoCuentaSchema>;

export const anularPagoCuentaSchema = z.object({
  motivo: z
    .string({ error: 'Escribe el motivo.' })
    .trim()
    .min(3, 'Escribe el motivo.')
    .max(500, 'Máximo 500 caracteres.'),
});

export const porPagarSchema = z.object({
  /** Cobros que vencen en los próximos N días (los atrasados siempre salen). */
  dias: z.coerce.number().int().min(0).max(60).default(7),
});

export const balanceSchema = z
  .object({
    /** Primer día incluido (hora de Venezuela). Vacío: el 1 del mes. */
    desde: fechaSchema.optional(),
    /** Último día incluido. Vacío: hoy. */
    hasta: fechaSchema.optional(),
  })
  .refine((o) => !o.desde || !o.hasta || o.desde <= o.hasta, {
    message: 'La fecha inicial va antes que la final.',
    path: ['hasta'],
  });
export type BalanceEntrada = z.infer<typeof balanceSchema>;

// ── Verificar e importar la lista del proveedor (TXT o CSV) ──────────────────

const filasSchema = <T extends z.ZodTypeAny>(fila: T) =>
  z
    .array(fila)
    .min(1, 'El archivo no trae cuentas.')
    .max(MAX_FILAS_IMPORTAR, `Máximo ${MAX_FILAS_IMPORTAR} cuentas de una vez: divide el archivo.`);

/** Lo que se leyó del archivo en el navegador. */
const filaArchivoSchema = z.object({
  usuario: usuarioCuentaSchema,
  clave: claveCuentaSchema.nullable().optional(),
  fecha: fechaSchema.nullable().optional(),
});

export const revisarImportacionSchema = z.object({
  servicioId: uuidSchema,
  /** Si se indica, «No están en el archivo» mira solo las cuentas de ese proveedor. */
  proveedor: textoOpcional(120),
  filas: filasSchema(filaArchivoSchema),
});
export type RevisarImportacionEntrada = z.infer<typeof revisarImportacionSchema>;

export const importarCuentasSchema = z
  .object({
    servicioId: uuidSchema,
    modo: z.enum(MODOS_CUENTA).default('perfiles'),
    perfiles: z.coerce
      .number({ error: 'Indica cuántos perfiles tiene cada cuenta.' })
      .int()
      .min(1, 'Al menos 1 perfil.')
      .max(MAX_PERFILES_CUENTA, `Máximo ${MAX_PERFILES_CUENTA} perfiles.`),
    ...camposCuenta,
    /** Cuentas nuevas. Su fecha es el próximo cobro; sin fecha se usa `facturaEn`. */
    nuevas: filasSchema(filaArchivoSchema.extend({ clave: claveCuentaSchema })).optional(),
    /** Cuentas que ya están: próximo cobro o clave que trae el archivo. */
    actualizar: filasSchema(
      z
        .object({
          cuentaId: uuidSchema,
          facturaEn: fechaSchema.optional(),
          clave: claveCuentaSchema.optional(),
        })
        .refine((o) => o.facturaEn !== undefined || o.clave !== undefined, 'No hay cambios.'),
    ).optional(),
  })
  .refine((o) => (o.nuevas?.length ?? 0) + (o.actualizar?.length ?? 0) > 0, {
    message: 'Elige al menos una cuenta.',
    path: ['nuevas'],
  })
  .refine((o) => (o.nuevas?.length ?? 0) + (o.actualizar?.length ?? 0) <= MAX_FILAS_IMPORTAR, {
    message: `Máximo ${MAX_FILAS_IMPORTAR} cuentas de una vez: divide el archivo.`,
    path: ['nuevas'],
  });
export type ImportarCuentasEntrada = z.infer<typeof importarCuentasSchema>;
