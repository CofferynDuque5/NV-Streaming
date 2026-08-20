/**
 * psp.service.ts — Núcleo del cobro automático.
 *
 * Recibe una notificación de un PSP (Binance Pay / Pago Móvil), la verifica y,
 * si el pago es exitoso y coincide con un pago pendiente, llama a `confirmarPago`
 * → renovación atómica de la suscripción + aviso por WhatsApp, SIN intervención
 * manual.
 *
 * Capas de seguridad:
 *   1. Firma/HMAC por proveedor (rechaza si no valida → 401).
 *   2. Idempotencia por `id_externo` (una transacción no se procesa dos veces).
 *   3. Coincidencia por `referencia` con un pago PENDIENTE.
 *   4. Validación de monto/moneda (no confirma montos menores ni divisas no
 *      comparables si `PSP_STRICT_AMOUNT=on`).
 *   5. Solo estados de éxito disparan la confirmación.
 */
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';
import { PaymentsRepository } from '../../../db/repositories/payments.repo.js';
import { confirmarPago } from '../payments.service.js';
import { binanceAdapter } from './binance.adapter.js';
import { pagoMovilAdapter } from './pagomovil.adapter.js';
import type { PSPAdapter, HeadersLike, ProveedorPSP } from './types.js';
import type { Pago } from '../../../db/models.js';

const ADAPTERS: Record<string, PSPAdapter> = {
  binance: binanceAdapter,
  pago_movil: pagoMovilAdapter,
};

export interface PSPDeps {
  payments: {
    externalAlreadyProcessed(idExterno: string): Promise<boolean>;
    findPendingByReferencia(referencia: string): Promise<Pago | null>;
    markExternalSeen(pagoId: string, proveedor: string, idExterno: string): Promise<void>;
  };
  confirmar: (pagoId: string, actor: string) => Promise<{ ok: boolean; motivo?: string }>;
  strictAmount?: boolean;
}

export const defaultPSPDeps: PSPDeps = {
  payments: PaymentsRepository,
  confirmar: (pagoId, actor) => confirmarPago(pagoId, actor),
  strictAmount: env.PSP_STRICT_AMOUNT === 'on',
};

export interface PSPResultado {
  status: number;   // código HTTP a devolver al PSP
  ok: boolean;
  motivo: string;
  pago_id?: string;
}

// USD y stablecoins 1:1 se consideran equivalentes para comparar el monto.
const EQUIV = new Set(['USD', 'USDT', 'BUSD', 'USDC']);
function monedasComparables(a: string, b: string): boolean {
  const A = a.toUpperCase(), B = b.toUpperCase();
  return A === B || (EQUIV.has(A) && EQUIV.has(B));
}
function montoValido(pago: Pago, montoRecibido: number, moneda: string, strict: boolean): boolean {
  const esperado = Number(pago.monto);
  if (monedasComparables(pago.moneda, moneda)) return montoRecibido + 0.01 >= esperado;
  // Divisa distinta (p. ej. plan en USD vs Pago Móvil en VES): sin tasa no se
  // puede comparar. En modo estricto se rechaza; si no, se acepta por referencia.
  return !strict;
}

/** Procesa la notificación de un proveedor. Nunca lanza. */
export async function procesarNotificacionPSP(
  proveedor: string,
  rawBody: Buffer,
  headers: HeadersLike,
  body: unknown,
  deps: PSPDeps = defaultPSPDeps,
): Promise<PSPResultado> {
  const adapter = ADAPTERS[proveedor];
  if (!adapter) return { status: 404, ok: false, motivo: 'proveedor_desconocido' };

  // 1. Autenticidad.
  if (!adapter.verificarFirma(rawBody, headers)) {
    logger.warn({ proveedor }, 'PSP: firma inválida — notificación descartada');
    return { status: 401, ok: false, motivo: 'firma_invalida' };
  }

  // 2. Normalización.
  const noti = adapter.parsear(body);
  if (!noti) return { status: 200, ok: true, motivo: 'evento_ignorado' };
  if (!noti.exitoso) { logger.info({ proveedor, ref: noti.referencia }, 'PSP: pago no exitoso'); return { status: 200, ok: true, motivo: 'pago_no_exitoso' }; }

  // 3. Idempotencia.
  if (await deps.payments.externalAlreadyProcessed(noti.id_externo)) {
    return { status: 200, ok: true, motivo: 'duplicado' };
  }

  // 4. Localizar el pago pendiente.
  const pago = await deps.payments.findPendingByReferencia(noti.referencia);
  if (!pago) {
    logger.warn({ proveedor, ref: noti.referencia, id: noti.id_externo }, 'PSP: sin pago pendiente para esa referencia (revisión manual)');
    return { status: 200, ok: false, motivo: 'pago_no_encontrado' };
  }

  // 5. Validación de monto/moneda.
  const strict = deps.strictAmount ?? (env.PSP_STRICT_AMOUNT === 'on');
  if (!montoValido(pago, noti.monto, noti.moneda, strict)) {
    logger.warn({ pagoId: pago.id, esperado: pago.monto, recibido: noti.monto, moneda: noti.moneda }, 'PSP: monto no coincide — NO se confirma');
    return { status: 200, ok: false, motivo: 'monto_no_coincide', pago_id: pago.id };
  }

  // 6. Confirmar automáticamente (renueva + notifica por WhatsApp).
  await deps.payments.markExternalSeen(pago.id, proveedor, noti.id_externo);
  const r = await deps.confirmar(pago.id, `psp:${proveedor}`);
  logger.info({ pagoId: pago.id, proveedor, ok: r.ok }, 'PSP: cobro automático procesado');
  return { status: 200, ok: r.ok, motivo: r.ok ? 'confirmado' : (r.motivo ?? 'no_confirmado'), pago_id: pago.id };
}

export const PROVEEDORES: ProveedorPSP[] = ['binance', 'pago_movil'];
