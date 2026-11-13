import { z } from 'zod';
import { CATEGORIAS_SERVICIO } from '../categorias.js';
import { parcialSinDefectos, textoOpcional, uuidSchema } from './comunes.js';
import { monedaConTasaSchema, montoOCeroSchema, montoSchema } from './dinero.js';
import {
  ENTREGAS_PLAN,
  MAX_DATOS_REQUERIDOS,
  MAX_OPCIONES_DATO,
  TIPOS_DATO,
  TIPOS_PLAN,
  TIPOS_PROVEEDOR,
  UNIDADES_DURACION,
} from '../tipos-plan.js';

/** Dato que el cliente escribe al comprar (p. ej. «ID de jugador»). */
export const datoRequeridoSchema = z
  .object({
    /** Identificador estable del dato (se deriva de la etiqueta). */
    clave: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Clave no válida.')
      .max(40),
    etiqueta: z
      .string()
      .trim()
      .min(2, 'Escribe el nombre del dato.')
      .max(40, 'Máximo 40 caracteres.'),
    ayuda: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().max(120, 'Máximo 120 caracteres.').nullable().optional(),
    ),
    obligatorio: z.boolean().default(true),
    /** Cómo se escribe: texto libre, solo números, correo, contraseña o una lista. */
    tipo: z.enum(TIPOS_DATO).default('texto'),
    /** Opciones de la lista (p. ej. «Activision», «Facebook»). */
    opciones: z
      .array(z.string().trim().min(1).max(40, 'Máximo 40 caracteres por opción.'))
      .max(MAX_OPCIONES_DATO, `Máximo ${MAX_OPCIONES_DATO} opciones.`)
      .default([]),
    /** Largo máximo (p. ej. 13 cifras en un ID); vacío sin límite propio. */
    largo: z.preprocess(
      (v) => (v === '' || v === undefined ? null : v),
      z.coerce.number().int().min(1).max(120).nullable(),
    ),
  })
  .refine((d) => d.tipo !== 'lista' || d.opciones.length >= 2, {
    message: 'Una lista necesita al menos dos opciones.',
    path: ['opciones'],
  });
export type DatoRequerido = z.infer<typeof datoRequeridoSchema>;

export const datosRequeridosSchema = z
  .array(datoRequeridoSchema)
  .max(MAX_DATOS_REQUERIDOS, `Máximo ${MAX_DATOS_REQUERIDOS} datos.`)
  .refine(
    (l) => new Set(l.map((d) => d.clave)).size === l.length,
    'Hay dos datos con el mismo nombre.',
  )
  .default([]);

/** Valores que escribió el cliente: {clave: valor}. */
export const valoresDatosSchema = z.record(
  z.string().max(40),
  z.string().trim().max(120, 'Máximo 120 caracteres.'),
);
export type ValoresDatos = z.infer<typeof valoresDatosSchema>;

export const proveedorSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre.').max(80),
  tipo: z.enum(TIPOS_PROVEEDOR, { error: 'Elige el tipo de proveedor.' }),
  permiteReventa: z.boolean().default(false),
  notasAcuerdo: textoOpcional(2000),
  activo: z.boolean().default(true),
});
export type ProveedorEntrada = z.infer<typeof proveedorSchema>;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones (ej. nv-cine).')
  .max(80);

export const servicioSchema = z.object({
  proveedorId: uuidSchema,
  nombre: z.string().trim().min(2, 'Escribe el nombre.').max(80),
  slug: slugSchema,
  descripcion: textoOpcional(1000),
  /** Universo de la tienda; vacío = sin categoría. */
  categoria: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .enum(CATEGORIAS_SERVICIO, { error: 'Elige una categoría de la lista.' })
      .nullable()
      .optional(),
  ),
  /** Logo o imagen de la biblioteca del sitio; null la quita. */
  imagenId: z.preprocess((v) => (v === '' ? null : v), uuidSchema.nullable().optional()),
  /** Datos que el cliente escribe al comprar (ID de jugador, servidor…). */
  datosRequeridos: datosRequeridosSchema,
  activo: z.boolean().default(true),
});
export type ServicioEntrada = z.infer<typeof servicioSchema>;

export const planSchema = z.object({
  servicioId: uuidSchema,
  nombre: z.string().trim().min(2, 'Escribe el nombre.').max(80),
  descripcion: textoOpcional(1000),
  precioUsd: montoOCeroSchema,
  tipo: z.enum(TIPOS_PLAN, { error: 'Elige qué se vende.' }).default('suscripcion'),
  /** Solo suscripciones: alquiler de cuenta del inventario o activación en el correo del cliente. */
  entrega: z.enum(ENTREGAS_PLAN, { error: 'Elige cómo se entrega.' }).default('alquiler'),
  duracionCantidad: z.coerce.number().int().min(1, 'Mínimo 1.').max(365, 'Máximo 365.'),
  duracionUnidad: z.enum(UNIDADES_DURACION, { error: 'Elige días o meses.' }),
  beneficios: z
    .array(z.string().trim().min(1).max(120))
    .max(12, 'Máximo 12 beneficios.')
    .default([]),
  activo: z.boolean().default(true),
  visible: z.boolean().default(true),
  renovable: z.boolean().default(true),
  revendible: z.boolean().default(false),
  /** Costo para NV en USD: ningún precio mayorista puede quedar por debajo. Vacío lo quita. */
  costoUsd: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    montoOCeroSchema.nullable().optional(),
  ),
  /** Referencia del plan en el sistema del proveedor (se envía en el webhook de entrega). Vacío la quita. */
  skuProveedor: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .max(80, 'Máximo 80 caracteres.')
      .regex(/^[\w.:/-]+$/, 'Usa letras, números, guiones, puntos o barras (sin espacios).')
      .nullable()
      .optional(),
  ),
  orden: z.coerce.number().int().min(0).max(999).default(0),
  /**
   * Precio para revendedores en USD: se aplica a todos los niveles y marca el
   * plan como revendible. Vacío no cambia los precios mayoristas; null los quita.
   */
  precioRevendedorUsd: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    montoSchema.nullable().optional(),
  ),
});
export type PlanEntrada = z.infer<typeof planSchema>;
export const actualizarPlanSchema = parcialSinDefectos(planSchema.omit({ servicioId: true }));
export type ActualizarPlanEntrada = z.infer<typeof actualizarPlanSchema>;

/** Precio fijo en una moneda; `null` lo quita y el plan vuelve a seguir la tasa. */
export const precioFijoSchema = z.object({
  moneda: monedaConTasaSchema,
  precio: montoSchema.nullable(),
});
export type PrecioFijoEntrada = z.infer<typeof precioFijoSchema>;

/** Oferta HOT de un plan: porcentaje y fin. `porcentaje: null` la quita. */
export const ofertaPlanSchema = z
  .object({
    porcentaje: z.preprocess(
      (v) => (v === '' ? null : v),
      z.coerce
        .number({ error: 'Escribe el porcentaje.' })
        .int('Usa un número entero.')
        .min(1, 'Mínimo 1 %.')
        .max(90, 'Máximo 90 %.')
        .nullable(),
    ),
    hasta: z.preprocess(
      (v) => (v === '' ? null : v),
      z.coerce.date({ error: 'Elige hasta cuándo dura.' }).nullable().optional(),
    ),
  })
  .superRefine((o, ctx) => {
    if (o.porcentaje === null) return;
    if (!o.hasta) {
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'Elige hasta cuándo dura.' });
    } else if (o.hasta.getTime() <= Date.now()) {
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha de fin ya pasó.' });
    } else if (o.hasta.getTime() > Date.now() + 366 * 24 * 3600_000) {
      ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'Máximo un año de oferta.' });
    }
  });
export type OfertaPlanEntrada = z.infer<typeof ofertaPlanSchema>;

export const idOpcionalSchema = uuidSchema.optional();

export const actualizarProveedorSchema = parcialSinDefectos(proveedorSchema);
export const actualizarServicioSchema = parcialSinDefectos(
  servicioSchema.omit({ proveedorId: true }),
);

// ---------------------------------------------------------------------------
// Combos: varios planes juntos a un precio especial

export const MIN_PLANES_COMBO = 2;
export const MAX_PLANES_COMBO = 4;

export const comboSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre.').max(80, 'Máximo 80 caracteres.'),
  descripcion: textoOpcional(200),
  /** Precio del combo completo en USD; tiene que ser menor que la suma de sus planes. */
  precioUsd: montoSchema,
  planes: z
    .array(uuidSchema, { error: 'Elige los planes del combo.' })
    .min(MIN_PLANES_COMBO, `Elige al menos ${MIN_PLANES_COMBO} planes.`)
    .max(MAX_PLANES_COMBO, `Máximo ${MAX_PLANES_COMBO} planes.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Un plan está repetido.'),
  activo: z.boolean().default(true),
  orden: z.coerce.number().int().min(0).max(999).default(0),
});
export type ComboEntrada = z.infer<typeof comboSchema>;
export const actualizarComboSchema = parcialSinDefectos(comboSchema);
export type ActualizarComboEntrada = z.infer<typeof actualizarComboSchema>;
