import { z } from 'zod';
import { parcialSinDefectos, textoOpcional, uuidSchema } from './comunes.js';
import { monedaConTasaSchema, montoOCeroSchema, montoSchema } from './dinero.js';

export const TIPOS_PROVEEDOR = ['propio', 'distribuidor'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];
export const UNIDADES_DURACION = ['dia', 'mes'] as const;
export type UnidadDuracion = (typeof UNIDADES_DURACION)[number];

/**
 * Universos de la tienda. Cada servicio pertenece a uno (o a ninguno: entonces
 * solo aparece en «Todo»). El orden es el de la franja de categorías.
 */
export const CATEGORIAS_SERVICIO = [
  'streaming',
  'musica',
  'ia',
  'juegos',
  'software',
  'nube',
] as const;
export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO)[number];

export const INFO_CATEGORIA: Record<CategoriaServicio, { nombre: string; descripcion: string }> = {
  streaming: { nombre: 'Streaming', descripcion: 'Películas, series y TV' },
  musica: { nombre: 'Música', descripcion: 'Música y podcasts sin anuncios' },
  ia: { nombre: 'IA', descripcion: 'Asistentes para crear y estudiar' },
  juegos: { nombre: 'Juegos', descripcion: 'Tarjetas, pases y más' },
  software: { nombre: 'Software', descripcion: 'Oficina y productividad' },
  nube: { nombre: 'Nube', descripcion: 'Espacio para tus archivos' },
};

export function esCategoriaServicio(v: unknown): v is CategoriaServicio {
  return typeof v === 'string' && (CATEGORIAS_SERVICIO as readonly string[]).includes(v);
}

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
  activo: z.boolean().default(true),
});
export type ServicioEntrada = z.infer<typeof servicioSchema>;

export const planSchema = z.object({
  servicioId: uuidSchema,
  nombre: z.string().trim().min(2, 'Escribe el nombre.').max(80),
  descripcion: textoOpcional(1000),
  precioUsd: montoOCeroSchema,
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

export const idOpcionalSchema = uuidSchema.optional();

export const actualizarProveedorSchema = parcialSinDefectos(proveedorSchema);
export const actualizarServicioSchema = parcialSinDefectos(
  servicioSchema.omit({ proveedorId: true }),
);
