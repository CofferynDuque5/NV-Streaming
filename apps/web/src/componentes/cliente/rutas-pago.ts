/** Panel desde el que se paga en línea: el del cliente o el del revendedor. */
export type PanelPago = 'cliente' | 'revendedor';

interface RutasPago {
  /** Prefijo de la API de pagos en línea. */
  api: string;
  /** Página de lo pagado (la factura, o Renovaciones para el revendedor). */
  factura: (facturaId: string) => string;
  verFactura: string;
  volverFactura: string;
  facturas: { href: string; etiqueta: string };
  inicio: { href: string; etiqueta: string };
  soporte: string;
  /** Qué pasa ahora que el pago se confirmó. */
  listo: string;
}

/** Las pantallas de pago son las mismas; cambian a dónde llevan y qué dicen al terminar. */
export const RUTAS_PAGO: Record<PanelPago, RutasPago> = {
  cliente: {
    api: '/mi/pagos-en-linea',
    factura: (id) => `/cuenta/facturas/${id}`,
    verFactura: 'Ver la factura',
    volverFactura: 'Volver a la factura',
    facturas: { href: '/cuenta/facturas', etiqueta: 'Facturas y pagos' },
    inicio: { href: '/cuenta', etiqueta: 'Mis servicios' },
    soporte: '/cuenta/soporte/nueva',
    listo: 'Tu servicio se activa al momento: lo verás en «Mis accesos».',
  },
  revendedor: {
    api: '/revendedor/pagos-en-linea',
    factura: () => '/revendedor/renovaciones',
    verFactura: 'Ver Renovaciones',
    volverFactura: 'Volver a Renovaciones',
    facturas: { href: '/revendedor/saldo', etiqueta: 'Saldo y recargas' },
    inicio: { href: '/revendedor/saldo', etiqueta: 'Mi saldo' },
    soporte: '/revendedor/soporte',
    listo: 'El pago entró a tu saldo y tus servicios se renuevan solos: lo verás en Renovaciones.',
  },
};
