/** Tipos que devuelve la API del carrito (pedidos) y de la billetera del cliente. */
import type { EstadoPedido, TipoMovimientoBilletera } from './esquemas/billetera.js';
import type { EstadoRecarga } from './esquemas/revendedores.js';
import type { Moneda } from './monedas.js';
import type { EstadoFactura } from './esquemas/cobros.js';
import type { Decimal, Referencia } from './tipos-negocio.js';

export interface LineaCotizacionPedido {
  planId: string;
  plan: string;
  servicio: string;
  subtotal: Decimal;
  descuento: Decimal;
  total: Decimal;
  totalUsd: Decimal;
}

export interface CotizacionPedido {
  moneda: Moneda;
  lineas: LineaCotizacionPedido[];
  subtotal: Decimal;
  descuento: Decimal;
  total: Decimal;
  totalUsd: Decimal;
  /** Código del cupón aplicado (a una sola línea: la de mayor descuento). */
  cupon: string | null;
  saldoUsd: Decimal;
  /** Lo que falta para pagarlo todo con saldo (0 si alcanza). */
  faltanteUsd: Decimal;
}

export interface FacturaDePedido {
  id: string;
  numero: string;
  estado: EstadoFactura;
  moneda: Moneda;
  total: Decimal;
  totalUsd: Decimal;
  descripcion: string;
  suscripcionId: string | null;
}

export interface PedidoPublico {
  id: string;
  numero: string;
  estado: EstadoPedido;
  moneda: Moneda;
  total: Decimal;
  totalUsd: Decimal;
  /** Lo que aún falta pagar, en USD (facturas emitidas). */
  pendienteUsd: Decimal;
  pagarAlRecargar: boolean;
  facturas: FacturaDePedido[];
  cliente: Referencia;
  creadoEn: string;
}

export interface RecargaBilleteraPublica {
  id: string;
  referencia: string;
  cliente: Referencia;
  pedido: { id: string; numero: string } | null;
  metodo: Referencia;
  moneda: Moneda;
  montoDeclarado: Decimal;
  montoRecibido: Decimal | null;
  /** Unidades de `moneda` por 1 USD, fijada al reportar. */
  tasa: Decimal;
  /** Saldo acreditado al confirmar. */
  montoUsd: Decimal | null;
  /** Lo que se acreditaría si llega lo declarado. */
  montoUsdEstimado: Decimal;
  referenciaExterna: string | null;
  fechaPago: string;
  estado: EstadoRecarga;
  motivoRechazo: string | null;
  tieneComprobante: boolean;
  creadoEn: string;
  revisadoEn: string | null;
  /** Solo para el equipo. */
  notas?: string | null;
  revisadoPor?: Referencia | null;
}

export interface MovimientoBilleteraPublico {
  id: string;
  tipo: TipoMovimientoBilletera;
  /** Positivo suma, negativo resta. */
  montoUsd: Decimal;
  saldoResultanteUsd: Decimal;
  motivo: string | null;
  recarga: { id: string; referencia: string } | null;
  factura: { id: string; numero: string } | null;
  autor: Referencia | null;
  creadoEn: string;
}

export interface BilleteraPublica {
  saldoUsd: Decimal;
  /** Recargas reportadas que el equipo aún no revisa. */
  recargasEnRevision: number;
  /** Pedido del carrito que espera pago, si hay uno. */
  pedidoPendiente: PedidoPublico | null;
}
