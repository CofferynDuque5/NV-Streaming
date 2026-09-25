/**
 * Monedas de cobro de NV Streaming, con la principal primero. Los precios del
 * catálogo se fijan en USD y se convierten con la tasa del día.
 */
export const MONEDAS = ['VES', 'USD', 'ARS', 'COP', 'PEN', 'EUR'] as const;
export type Moneda = (typeof MONEDAS)[number];

/** Mercado principal: Venezuela, cobrando en bolívares. */
export const PAIS_PRINCIPAL = 'VE';
export const MONEDA_PRINCIPAL = 'VES' satisfies Moneda;

/** Monedas que se convierten desde USD con una tasa de cambio. */
export const MONEDAS_CON_TASA = [
  'VES',
  'ARS',
  'COP',
  'PEN',
  'EUR',
] as const satisfies readonly Moneda[];
export type MonedaConTasa = (typeof MONEDAS_CON_TASA)[number];

export interface InfoMoneda {
  nombre: string;
  /** Decimales con los que se redondea al convertir desde USD. */
  decimales: number;
  /** Configuración regional para mostrar importes. */
  region: string;
}

export const INFO_MONEDA: Record<Moneda, InfoMoneda> = {
  USD: { nombre: 'Dólar estadounidense', decimales: 2, region: 'es-US' },
  VES: { nombre: 'Bolívar', decimales: 2, region: 'es-VE' },
  ARS: { nombre: 'Peso argentino', decimales: 0, region: 'es-AR' },
  COP: { nombre: 'Peso colombiano', decimales: 0, region: 'es-CO' },
  PEN: { nombre: 'Sol', decimales: 2, region: 'es-PE' },
  EUR: { nombre: 'Euro', decimales: 2, region: 'es-ES' },
};

/**
 * Muestra un importe con el formato de su moneda. Solo para mostrar: los
 * cálculos se hacen en la API con decimales exactos, nunca con este número.
 */
export function formatearMonto(valor: string | number, moneda: Moneda): string {
  const info = INFO_MONEDA[moneda];
  return new Intl.NumberFormat(info.region, {
    style: 'currency',
    currency: moneda,
    currencyDisplay: moneda === 'USD' ? 'narrowSymbol' : 'symbol',
    minimumFractionDigits: info.decimales,
    maximumFractionDigits: 2,
  }).format(Number(valor));
}

/** Plazos de cobro (fase 1). Las automatizaciones de la fase 3 los harán configurables. */
export const REGLAS_COBRO = {
  /** Días que tiene el cliente para pagar una factura emitida. */
  diasParaPagar: 3,
  /** Días de gracia tras el vencimiento antes de suspender. */
  diasGracia: 5,
  /** Días suspendida antes de darla por vencida. */
  diasSuspension: 30,
  /** Suscripciones pendientes de pago que un cliente puede tener a la vez. */
  pendientesPorCliente: 3,
} as const;
