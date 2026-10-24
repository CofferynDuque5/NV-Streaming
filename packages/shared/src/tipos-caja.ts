import type { Moneda } from './monedas.js';
import type { Referencia } from './tipos-negocio.js';

/** De dónde sale cada movimiento de la caja (todo lo registra NV Streaming). */
export const TIPOS_MOVIMIENTO_CAJA = [
  'pago',
  'recarga_billetera',
  'recarga_revendedor',
  'reembolso',
] as const;
export type TipoMovimientoCaja = (typeof TIPOS_MOVIMIENTO_CAJA)[number];

export const ETIQUETA_MOVIMIENTO_CAJA: Record<TipoMovimientoCaja, string> = {
  pago: 'Pago de factura',
  recarga_billetera: 'Recarga de billetera',
  recarga_revendedor: 'Recarga de revendedor',
  reembolso: 'Reembolso',
};

export interface MovimientoCaja {
  /** «tipo:id» del registro de origen; estable entre recargas de la página. */
  id: string;
  tipo: TipoMovimientoCaja;
  /** Referencia del pago, recarga o reembolso. */
  referencia: string;
  /** Cliente o revendedor. */
  quien: string;
  /** Método de cobro o pasarela; null si no se registró. */
  metodo: string | null;
  moneda: Moneda;
  /** Con signo: los reembolsos restan. */
  monto: string;
  /** Cuándo entró (o salió) el dinero: la confirmación o el reembolso completado. */
  en: string;
  /** Quién lo confirmó; null si fue automático. */
  por: Referencia | null;
}

export interface TotalCaja {
  moneda: Moneda;
  metodo: string | null;
  monto: string;
  cantidad: number;
}

export interface CierreCajaPublico {
  id: string;
  dia: string;
  /** 1 el primer cierre del día; 2 si se volvió a cerrar con lo que entró después. */
  secuencia: number;
  /** Instante del cierre: incluye lo confirmado hasta aquí. */
  hasta: string;
  totales: TotalCaja[];
  movimientos: number;
  notas: string | null;
  cerradoPor: Referencia;
}

export interface CajaDia {
  dia: string;
  /** Es el día de hoy en Venezuela (se puede seguir moviendo). */
  hoy: boolean;
  movimientos: MovimientoCaja[];
  totales: TotalCaja[];
  cierres: CierreCajaPublico[];
  /** Lo que entró después del último cierre del día (vacío si no hay cierre). */
  despuesDelCierre: TotalCaja[];
  movimientosDespuesDelCierre: number;
}
