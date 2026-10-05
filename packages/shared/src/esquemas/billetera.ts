/** Esquemas del carrito (pedidos) y de la billetera del cliente. */
import { z } from 'zod';
import { REGLAS_COBRO } from '../monedas.js';
import { paginacionSchema, uuidSchema } from './comunes.js';
import { monedaSchema } from './dinero.js';
import { ESTADOS_RECARGA, reportarRecargaSchema } from './revendedores.js';
import { cuponOpcional } from './suscripciones.js';

/**
 * Cómo se paga un pedido: "billetera" cobra ya con el saldo; "recarga" espera
 * a que el equipo confirme una recarga y entonces paga con saldo; "facturas"
 * deja cada factura para pagarla por separado (transferencia o en línea).
 */
export const FORMAS_PAGO_PEDIDO = ['billetera', 'recarga', 'facturas'] as const;
export type FormaPagoPedido = (typeof FORMAS_PAGO_PEDIDO)[number];

export const ESTADOS_PEDIDO = ['pendiente', 'pagado', 'anulado'] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const TIPOS_MOVIMIENTO_BILLETERA = ['recarga', 'pago', 'ajuste'] as const;
export type TipoMovimientoBilletera = (typeof TIPOS_MOVIMIENTO_BILLETERA)[number];

const planesDelCarrito = z
  .array(uuidSchema, { error: 'El carrito no es válido.' })
  .min(1, 'Tu carrito está vacío.')
  .max(
    REGLAS_COBRO.articulosPorPedido,
    `Caben hasta ${REGLAS_COBRO.articulosPorPedido} planes por pedido.`,
  )
  .refine((ids) => new Set(ids).size === ids.length, 'Hay un plan repetido en el carrito.');

export const cotizarPedidoSchema = z.object({
  planes: planesDelCarrito,
  moneda: monedaSchema,
  cupon: cuponOpcional,
});
export type CotizarPedidoEntrada = z.infer<typeof cotizarPedidoSchema>;

export const crearPedidoSchema = cotizarPedidoSchema.extend({
  pago: z.enum(FORMAS_PAGO_PEDIDO, { error: 'Elige cómo vas a pagar.' }),
});
export type CrearPedidoEntrada = z.infer<typeof crearPedidoSchema>;

export const listarPedidosSchema = paginacionSchema;

/** Recarga de la billetera; con `pedidoId`, al confirmarse paga ese pedido. */
export const reportarRecargaBilleteraSchema = reportarRecargaSchema.extend({
  pedidoId: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    uuidSchema.optional(),
  ),
});
export type ReportarRecargaBilleteraEntrada = z.infer<typeof reportarRecargaBilleteraSchema>;

/** Movimientos del libro mayor del cliente, opcionalmente de un solo tipo. */
export const listarMovimientosBilleteraSchema = paginacionSchema.extend({
  tipo: z.enum(TIPOS_MOVIMIENTO_BILLETERA).optional(),
});
export type ListarMovimientosBilleteraEntrada = z.infer<typeof listarMovimientosBilleteraSchema>;

export const listarRecargasBilleteraSchema = paginacionSchema.extend({
  estado: z.enum(ESTADOS_RECARGA).optional(),
  clienteId: uuidSchema.optional(),
});
export type ListarRecargasBilleteraEntrada = z.infer<typeof listarRecargasBilleteraSchema>;
