/**
 * Catálogo de métodos de pago del panel NV (Pago Móvil, Binance, Zelle).
 * Los datos de recepción provienen de variables de entorno. Se usan para dar al
 * cliente las INSTRUCCIONES de pago; el monto siempre viene del plan (BD).
 */
import { env } from './env.js';
import type { MetodoPago } from '../db/models.js';

export interface MetodoPagoInfo {
  id: MetodoPago;
  nombre: string;
  instrucciones: string;
}

export const PAYMENT_METHODS: Record<MetodoPago, MetodoPagoInfo> = {
  pago_movil: {
    id: 'pago_movil',
    nombre: 'Pago Móvil',
    instrucciones:
      `Banco: ${env.PAGO_MOVIL_BANCO} · Cédula/RIF: ${env.PAGO_MOVIL_CEDULA} · ` +
      `Teléfono: ${env.PAGO_MOVIL_TELEFONO} · Titular: ${env.PAGO_MOVIL_TITULAR}. ` +
      `Envía el pago y responde con la referencia y una foto del comprobante.`,
  },
  binance: {
    id: 'binance',
    nombre: 'Binance Pay',
    instrucciones:
      `Envía USDT/BNB al Binance ID/correo: ${env.BINANCE_EMAIL}. ` +
      `Responde con el ID de la transacción y el comprobante.`,
  },
  zelle: {
    id: 'zelle',
    nombre: 'Zelle',
    instrucciones:
      `Transfiere por Zelle al correo: ${env.ZELLE_EMAIL} (Titular: ${env.ZELLE_TITULAR}). ` +
      `Responde con el número de confirmación y el comprobante.`,
  },
};

export function getMetodoInfo(metodo: string): MetodoPagoInfo | null {
  return (PAYMENT_METHODS as Record<string, MetodoPagoInfo>)[metodo] ?? null;
}

export const METODOS_VALIDOS: MetodoPago[] = ['pago_movil', 'binance', 'zelle'];

// ── Métodos válidos para RECARGA de billetera ──
// Superconjunto de los métodos PSP: la recarga la aprueba el admin manualmente,
// así que admite también PayPal y transferencia como canales de acreditación.
export const METODOS_RECARGA_VALIDOS = ['pago_movil', 'binance', 'zelle', 'paypal', 'transferencia'] as const;
export type MetodoRecarga = (typeof METODOS_RECARGA_VALIDOS)[number];

// Alias que puede mandar el frontend (o el cliente) → método canónico.
const ALIAS_METODO_RECARGA: Record<string, MetodoRecarga> = {
  binance: 'binance', binance_pay: 'binance', binancepay: 'binance',
  zelle: 'zelle',
  pago_movil: 'pago_movil', pagomovil: 'pago_movil', movil: 'pago_movil',
  paypal: 'paypal',
  transfer: 'transferencia', transferencia: 'transferencia',
};

/** Normaliza el método de recarga a su forma canónica; null si no es válido. */
export function normalizarMetodoRecarga(m: unknown): MetodoRecarga | null {
  const k = String(m ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!k) return null;
  if (ALIAS_METODO_RECARGA[k]) return ALIAS_METODO_RECARGA[k];
  return (METODOS_RECARGA_VALIDOS as readonly string[]).includes(k) ? (k as MetodoRecarga) : null;
}
