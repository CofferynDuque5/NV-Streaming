/**
 * Contratos del receptor de pasarelas de pago (PSP).
 * Cada proveedor (Binance Pay, Pago Móvil) implementa un adaptador que:
 *   1. verifica la autenticidad de la notificación (firma/HMAC),
 *   2. la normaliza a `NotificacionPSP`.
 * La lógica de negocio (localizar el pago, validar monto, confirmar) es común.
 */

export type ProveedorPSP = 'binance' | 'pago_movil';

/** Notificación normalizada, independiente del proveedor. */
export interface NotificacionPSP {
  proveedor: ProveedorPSP;
  id_externo: string;   // id único de la transacción en el PSP (anti-duplicado)
  referencia: string;   // referencia que mapea con pagos.referencia
  monto: number;
  moneda: string;
  exitoso: boolean;     // true solo si el PSP confirma el pago
}

export interface HeadersLike {
  get(name: string): string | undefined;
}

export interface PSPAdapter {
  proveedor: ProveedorPSP;
  /** Verifica la firma/HMAC usando el cuerpo CRUDO (Buffer). */
  verificarFirma(rawBody: Buffer, headers: HeadersLike): boolean;
  /** Normaliza el cuerpo. Devuelve null si el evento no es relevante. */
  parsear(body: unknown): NotificacionPSP | null;
}
