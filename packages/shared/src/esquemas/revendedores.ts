/** Esquemas de entrada del programa de revendedores (fase 2). */
import { z } from 'zod';
import { PAIS_PRINCIPAL } from '../monedas.js';
import {
  correoSchema,
  nombreSchema,
  paginacionSchema,
  parcialSinDefectos,
  textoOpcional,
  uuidSchema,
} from './comunes.js';
import { paisSchema, telefonoSchema } from './clientes.js';
import { reportarPagoSchema } from './cobros.js';
import { monedaSchema, montoSchema } from './dinero.js';

export const ESTADOS_REVENDEDOR = ['solicitud', 'aprobado', 'rechazado', 'suspendido'] as const;
export type EstadoRevendedor = (typeof ESTADOS_REVENDEDOR)[number];
export const ESTADOS_RECARGA = ['en_revision', 'confirmada', 'rechazada'] as const;
export type EstadoRecarga = (typeof ESTADOS_RECARGA)[number];
export const TIPOS_MOVIMIENTO_SALDO = ['recarga', 'compra', 'reembolso', 'ajuste'] as const;
export type TipoMovimientoSaldo = (typeof TIPOS_MOVIMIENTO_SALDO)[number];
export const TIPOS_COMPRA = ['alta', 'renovacion'] as const;
export type TipoCompra = (typeof TIPOS_COMPRA)[number];
export const ESTADOS_COMPRA = ['completada', 'reembolsada'] as const;
export type EstadoCompra = (typeof ESTADOS_COMPRA)[number];

/** Vacío o ausente → `undefined` (campo opcional al crear). */
const opcional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), s.optional());

const motivo = z
  .string({ error: 'Indica el motivo.' })
  .trim()
  .min(3, 'Indica el motivo.')
  .max(500, 'El motivo es demasiado largo.');

// ── Solicitud ────────────────────────────────────────────────────────────────

/** Lo que escribe un cliente al pedir ser revendedor. */
export const solicitudRevendedorSchema = z.object({
  nombreComercial: z
    .string({ error: 'Escribe el nombre de tu negocio.' })
    .trim()
    .min(2, 'Escribe el nombre de tu negocio.')
    .max(120, 'El nombre es demasiado largo.'),
  documento: opcional(z.string().trim().max(40, 'El documento es demasiado largo.')),
  telefono: opcional(telefonoSchema),
  pais: paisSchema.default(PAIS_PRINCIPAL),
  mensaje: textoOpcional(1000),
});
export type SolicitudRevendedorEntrada = z.infer<typeof solicitudRevendedorSchema>;

// ── Gestión (administración) ─────────────────────────────────────────────────

/** Compras por día; vacío o `null` quita el límite. */
const limiteDiarioSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z.coerce
    .number({ error: 'Escribe un número entero.' })
    .int('Escribe un número entero.')
    .min(1, 'Mínimo 1 compra por día.')
    .max(10_000, 'Máximo 10 000 compras por día.')
    .nullable(),
);

export const aprobarRevendedorSchema = z.object({
  nivelId: uuidSchema,
  limiteDiarioCompras: limiteDiarioSchema.optional(),
});
export type AprobarRevendedorEntrada = z.infer<typeof aprobarRevendedorSchema>;

export const actualizarRevendedorSchema = z
  .object({
    nivelId: uuidSchema.optional(),
    limiteDiarioCompras: limiteDiarioSchema.optional(),
  })
  .refine((v) => v.nivelId !== undefined || v.limiteDiarioCompras !== undefined, {
    error: 'Indica el nivel o el límite diario.',
  });
export type ActualizarRevendedorEntrada = z.infer<typeof actualizarRevendedorSchema>;

export const motivoRevendedorSchema = z.object({ motivo });

export const listarRevendedoresSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_REVENDEDOR).optional(),
  busqueda: z.string().trim().max(120).optional(),
});
export type ListarRevendedoresEntrada = z.infer<typeof listarRevendedoresSchema>;

// ── Niveles y precios mayoristas ─────────────────────────────────────────────

export const nivelRevendedorSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre del nivel.').max(60),
  descripcion: textoOpcional(300),
  orden: z.coerce.number().int().min(0).max(999).default(0),
  activo: z.boolean().default(true),
});
export type NivelRevendedorEntrada = z.infer<typeof nivelRevendedorSchema>;
export const actualizarNivelRevendedorSchema = parcialSinDefectos(nivelRevendedorSchema);
export type ActualizarNivelRevendedorEntrada = z.infer<typeof actualizarNivelRevendedorSchema>;

/** Precio de un plan para un nivel. `null` lo quita (el plan deja de venderse a ese nivel). */
export const precioMayoristaSchema = z.object({
  planId: uuidSchema,
  nivelId: uuidSchema,
  precioUsd: montoSchema.nullable(),
});
export type PrecioMayoristaEntrada = z.infer<typeof precioMayoristaSchema>;

// ── Saldo ────────────────────────────────────────────────────────────────────

/** Recarga que reporta el revendedor (el comprobante llega aparte, en el mismo formulario). */
export const reportarRecargaSchema = reportarPagoSchema.extend({ moneda: monedaSchema });
export type ReportarRecargaEntrada = z.infer<typeof reportarRecargaSchema>;

export const confirmarRecargaSchema = z.object({
  montoRecibido: montoSchema,
  notas: z.string().trim().max(500).optional(),
});
export type ConfirmarRecargaEntrada = z.infer<typeof confirmarRecargaSchema>;

export const rechazarRecargaSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, 'Explica al revendedor por qué se rechaza.')
    .max(500, 'El motivo es demasiado largo.'),
});

export const listarRecargasSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_RECARGA).optional(),
  revendedorId: uuidSchema.optional(),
});
export type ListarRecargasEntrada = z.infer<typeof listarRecargasSchema>;

/** Importe en USD con signo (positivo suma, negativo resta), distinto de cero. */
export const montoConSignoSchema = z
  .union([z.string(), z.number()], { error: 'Escribe un importe válido.' })
  .transform((v) => String(v).trim().replace(/\s/g, '').replace(',', '.'))
  .pipe(
    z
      .string()
      .regex(/^[+-]?\d{1,12}(\.\d{1,2})?$/, 'Escribe un importe válido (hasta 2 decimales).')
      .refine((v) => Number(v) !== 0, 'El ajuste no puede ser cero.')
      .transform((v) => v.replace(/^\+/, '')),
  );

export const ajusteSaldoSchema = z.object({ montoUsd: montoConSignoSchema, motivo });
export type AjusteSaldoEntrada = z.infer<typeof ajusteSaldoSchema>;

export const listarMovimientosSchema = paginacionSchema;

// ── Compras ──────────────────────────────────────────────────────────────────

/** La genera el panel por cada intento de compra: repetirla no vuelve a cobrar. */
export const claveIdempotenciaSchema = z
  .string({ error: 'Falta la clave de la compra.' })
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'La clave de la compra no es válida.');

/** Cliente final nuevo de la cartera del revendedor. */
export const clienteCarteraSchema = z.object({
  nombre: nombreSchema,
  correo: opcional(correoSchema),
  whatsapp: opcional(telefonoSchema),
  documento: opcional(z.string().trim().max(40, 'El documento es demasiado largo.')),
  pais: paisSchema.default(PAIS_PRINCIPAL),
});
export type ClienteCarteraEntrada = z.infer<typeof clienteCarteraSchema>;

const compraAltaSchema = z.object({
  tipo: z.literal('alta'),
  planId: uuidSchema,
  /** Cliente que ya está en la cartera... */
  clienteId: opcional(uuidSchema),
  /** ...o uno nuevo. Exactamente uno de los dos. */
  cliente: clienteCarteraSchema.optional(),
  claveIdempotencia: claveIdempotenciaSchema,
});

const compraRenovacionSchema = z.object({
  tipo: z.literal('renovacion'),
  suscripcionId: uuidSchema,
  claveIdempotencia: claveIdempotenciaSchema,
});

export const comprarSchema = z
  .discriminatedUnion('tipo', [compraAltaSchema, compraRenovacionSchema], {
    error: 'Elige si es un alta o una renovación.',
  })
  .superRefine((v, ctx) => {
    if (v.tipo !== 'alta') return;
    const cuantos = (v.clienteId ? 1 : 0) + (v.cliente ? 1 : 0);
    if (cuantos !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['clienteId'],
        message: 'Elige un cliente de tu cartera o registra uno nuevo.',
      });
    }
  });
export type ComprarEntrada = z.infer<typeof comprarSchema>;

export const listarComprasSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_COMPRA).optional(),
  clienteId: uuidSchema.optional(),
});
export type ListarComprasEntrada = z.infer<typeof listarComprasSchema>;

export const listarCarteraSchema = paginacionSchema.extend({
  busqueda: z.string().trim().max(120).optional(),
});
export type ListarCarteraEntrada = z.infer<typeof listarCarteraSchema>;

export const reembolsarCompraSchema = z.object({ motivo });

/**
 * Inicio del día en Venezuela (UTC−4, sin horario de verano), que es cuando se
 * reinicia el límite diario de compras.
 */
export function inicioDiaVenezuela(ahora = new Date()): Date {
  const desfase = 4 * 3600_000;
  const local = new Date(ahora.getTime() - desfase);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + desfase,
  );
}
