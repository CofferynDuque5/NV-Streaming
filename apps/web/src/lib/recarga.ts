// Sin 'use client': la página de la billetera (servidor) lee el mismo parámetro.

const RUTA_BILLETERA = '/cuenta/billetera';
/** Ancla del formulario «Recargar saldo» de la billetera. */
const ANCLA_RECARGA = '#recargar';
/** Dólares con hasta 2 decimales, como los que devuelve la API. */
const PATRON_FALTA = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * Enlace para recargar la billetera desde un pago que el saldo no cubre: ligado
 * al pedido que espera pago (la billetera ya sabe cuánto le falta) o con lo que
 * falta, tal como lo mostró la página, elegido como monto de la recarga.
 */
export function enlaceRecarga(destino: { pedidoId: string } | { faltaUsd: string }): string {
  const consulta =
    'pedidoId' in destino
      ? `pedido=${encodeURIComponent(destino.pedidoId)}`
      : `falta=${encodeURIComponent(destino.faltaUsd)}`;
  return `${RUTA_BILLETERA}?${consulta}${ANCLA_RECARGA}`;
}

/**
 * Lo que falta que trae el enlace (`?falta=`), en dólares con 2 decimales, o
 * null si no es un monto válido. Solo sugiere el monto: la API valida la recarga.
 */
export function faltaDelEnlace(valor: unknown): string | null {
  if (typeof valor !== 'string' || !PATRON_FALTA.test(valor)) return null;
  const n = Number(valor);
  return n > 0 ? n.toFixed(2) : null;
}
