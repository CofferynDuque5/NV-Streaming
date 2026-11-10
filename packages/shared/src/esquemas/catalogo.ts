import { z } from 'zod';
import { CATEGORIAS_SERVICIO } from '../categorias.js';
import { parcialSinDefectos, textoOpcional, uuidSchema } from './comunes.js';
import { monedaConTasaSchema, montoOCeroSchema, montoSchema } from './dinero.js';

export const TIPOS_PROVEEDOR = ['propio', 'distribuidor'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];
export const UNIDADES_DURACION = ['dia', 'mes'] as const;
export type UnidadDuracion = (typeof UNIDADES_DURACION)[number];

/**
 * Qué se vende en un plan. Solo «suscripcion» tiene duración, vence y se
 * renueva; el resto son compras únicas (monedas de un juego, paquetes, pases,
 * tarjetas o códigos).
 */
export const TIPOS_PLAN = ['suscripcion', 'recarga', 'paquete', 'pase', 'tarjeta'] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];
export const ETIQUETA_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Suscripción (con duración)',
  recarga: 'Moneda del juego o recarga',
  paquete: 'Paquete',
  pase: 'Pase',
  tarjeta: 'Tarjeta o código',
};
/** Nombre corto del tipo para la tienda (la etiqueta sobre el precio). */
export const NOMBRE_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Suscripción',
  recarga: 'Recarga',
  paquete: 'Paquete',
  pase: 'Pase',
  tarjeta: 'Tarjeta',
};
export const esCompraUnica = (tipo: TipoPlan) => tipo !== 'suscripcion';

/** Máximo de datos que un servicio puede pedir al comprar. */
export const MAX_DATOS_REQUERIDOS = 5;

/** Dato que el cliente escribe al comprar (p. ej. «ID de jugador»). */
export const datoRequeridoSchema = z.object({
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

/** Clave de un dato a partir de su etiqueta: «ID de jugador» → «id-de-jugador». */
export function claveDato(etiqueta: string): string {
  return etiqueta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Valores que escribió el cliente: {clave: valor}. */
export const valoresDatosSchema = z.record(
  z.string().max(40),
  z.string().trim().max(120, 'Máximo 120 caracteres.'),
);
export type ValoresDatos = z.infer<typeof valoresDatosSchema>;

/**
 * Comprueba los valores contra lo que pide el servicio. Devuelve los errores
 * por clave (vacío si todo está bien) y los valores limpios.
 */
export function revisarDatos(
  pedidos: DatoRequerido[],
  valores: ValoresDatos | null | undefined,
): { limpios: ValoresDatos; errores: Record<string, string> } {
  const limpios: ValoresDatos = {};
  const errores: Record<string, string> = {};
  for (const d of pedidos) {
    const v = (valores?.[d.clave] ?? '').trim();
    if (v) limpios[d.clave] = v.slice(0, 120);
    else if (d.obligatorio) errores[d.clave] = `Escribe ${d.etiqueta}.`;
  }
  return { limpios, errores };
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

export const idOpcionalSchema = uuidSchema.optional();

export const actualizarProveedorSchema = parcialSinDefectos(proveedorSchema);
export const actualizarServicioSchema = parcialSinDefectos(
  servicioSchema.omit({ proveedorId: true }),
);
