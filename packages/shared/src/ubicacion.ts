import { MONEDA_PRINCIPAL, MONEDAS, type Moneda } from './monedas.js';

/** Cookie con la moneda que eligió quien visita (se guarda al usar el selector de moneda). */
export const COOKIE_MONEDA = 'nv_moneda';

/**
 * Cabeceras con el país de la conexión que añaden los proxies y CDN gratuitos
 * más comunes. Solo traen el país (código ISO de 2 letras), nunca la ubicación exacta.
 */
export const CABECERAS_PAIS = [
  'cf-ipcountry', // Cloudflare
  'x-vercel-ip-country', // Vercel
  'cloudfront-viewer-country', // Amazon CloudFront
  'x-country-code', // Nginx con GeoIP u otros proxies
] as const;

const MONEDA_POR_PAIS: Record<string, Moneda> = {
  VE: 'VES',
  AR: 'ARS',
  CO: 'COP',
  PE: 'PEN',
};

/** Países cuya moneda oficial es el euro. */
const PAISES_EURO = new Set([
  'AD',
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MC',
  'ME',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
  'SM',
  'VA',
  'XK',
]);

/**
 * Moneda con la que cobra NV en ese país. Si no se sabe el país, la del mercado
 * principal (bolívares); en otros países, dólares.
 */
export function monedaDePais(pais: string | null | undefined): Moneda {
  if (!pais) return MONEDA_PRINCIPAL;
  const codigo = pais.toUpperCase();
  return MONEDA_POR_PAIS[codigo] ?? (PAISES_EURO.has(codigo) ? 'EUR' : 'USD');
}

/** Código de país válido; descarta los comodines de las CDN (XX desconocido, T1 Tor). */
export function paisValido(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const codigo = valor.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(codigo) && codigo !== 'XX' && codigo !== 'T1' ? codigo : null;
}

/** País del primer idioma con región del navegador ("es-VE,es;q=0.9" → "VE"). */
export function paisDeIdioma(acceptLanguage: string | null | undefined): string | null {
  for (const parte of (acceptLanguage ?? '').split(',')) {
    const region = /^[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(parte.trim())?.[1];
    const pais = paisValido(region);
    if (pais) return pais;
  }
  return null;
}

export function esMoneda(valor: unknown): valor is Moneda {
  return typeof valor === 'string' && (MONEDAS as readonly string[]).includes(valor);
}

export interface Ubicacion {
  /** País detectado, o null si no se pudo saber. */
  pais: string | null;
  moneda: Moneda;
  /** De dónde sale la moneda: la eligió la persona, el país de su conexión o el idioma del navegador. */
  origen: 'eleccion' | 'conexion' | 'idioma' | 'predeterminada';
}

type Cabeceras =
  Record<string, string | string[] | undefined> | { get(nombre: string): string | null };

function leer(cabeceras: Cabeceras, nombre: string): string | null {
  if (typeof (cabeceras as { get?: unknown }).get === 'function') {
    return (cabeceras as { get(n: string): string | null }).get(nombre);
  }
  const valor = (cabeceras as Record<string, string | string[] | undefined>)[nombre];
  return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
}

/**
 * Moneda sugerida para quien visita: primero la que eligió (cookie), luego la
 * del país de su conexión y por último la de la región del idioma del navegador.
 */
export function detectarUbicacion(cabeceras: Cabeceras, monedaElegida?: string | null): Ubicacion {
  let pais: string | null = null;
  let origen: Ubicacion['origen'] = 'predeterminada';
  for (const nombre of CABECERAS_PAIS) {
    pais = paisValido(leer(cabeceras, nombre));
    if (pais) {
      origen = 'conexion';
      break;
    }
  }
  if (!pais) {
    pais = paisDeIdioma(leer(cabeceras, 'accept-language'));
    if (pais) origen = 'idioma';
  }
  if (esMoneda(monedaElegida)) return { pais, moneda: monedaElegida, origen: 'eleccion' };
  return { pais, moneda: monedaDePais(pais), origen };
}
