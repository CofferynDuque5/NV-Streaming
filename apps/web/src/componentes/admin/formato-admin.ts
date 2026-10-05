import { type CuponPublico, INFO_MONEDA, type Moneda, type TasaVigente } from '@nv/shared';

/**
 * Valor de una tasa ("1 USD = X") con el formato de su moneda. Conserva hasta
 * 6 decimales porque así se registran. Solo para mostrar.
 */
export function formatearTasa(valor: string, moneda: Moneda): string {
  return new Intl.NumberFormat(INFO_MONEDA[moneda].region, {
    style: 'currency',
    currency: moneda,
    currencyDisplay: 'symbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number(valor));
}

const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

/** "10 %" o "5 USD". */
export function formatearDescuento(c: Pick<CuponPublico, 'tipo' | 'valor'>): string {
  return c.tipo === 'porcentaje'
    ? `${numero.format(Number(c.valor))} %`
    : `${numero.format(Number(c.valor))} USD`;
}

/** Importe normalizado para comparar dos textos decimales ("12.5" y "12.50"). */
export function mismoImporte(a: string, b: string): boolean {
  const n = (v: string) => {
    const [entero = '0', decimales = ''] = v.trim().split('.');
    return `${entero.replace(/^0+(?=\d)/, '')}.${decimales.padEnd(2, '0').replace(/0+$/, '')}`;
  };
  return n(a) === n(b);
}

/** ¿La fecha ISO es de hoy (hora local del servidor)? */
export function esDeHoy(iso: string, ahora = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ahora.getFullYear() &&
    d.getMonth() === ahora.getMonth() &&
    d.getDate() === ahora.getDate()
  );
}

/** "Automática (BCV)" si la registró la automatización de tasa; si no, null. */
export function origenAutomatico(t: Pick<TasaVigente, 'origen' | 'fuente'>): string | null {
  if (t.origen !== 'automatica') return null;
  const fuente = t.fuente === 'bcv' ? 'BCV' : t.fuente === 'json' ? 'fuente externa' : t.fuente;
  return fuente ? `Automática (${fuente})` : 'Automática';
}
