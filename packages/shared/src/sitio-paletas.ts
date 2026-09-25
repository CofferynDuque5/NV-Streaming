/**
 * Paletas del sitio público dentro de los límites de la marca NV. Cada una
 * define los colores de marca y acento para el modo oscuro y el claro; el texto
 * sobre la marca (`marcaTinta`) cumple WCAG AA (contraste ≥ 4,5:1).
 */

export interface ColoresPaleta {
  marca: string;
  marcaFuerte: string;
  marcaTinta: string;
  acento: string;
}

export interface DefinicionPaleta {
  nombre: string;
  descripcion: string;
  oscuro: ColoresPaleta;
  claro: ColoresPaleta;
}

export const PALETAS_SITIO = {
  nv: {
    nombre: 'NV',
    descripcion: 'Cian y violeta: el aspecto original de NV Streaming.',
    oscuro: { marca: '#22c8f5', marcaFuerte: '#5cdcff', marcaTinta: '#041018', acento: '#9b6bff' },
    claro: { marca: '#0369a1', marcaFuerte: '#075985', marcaTinta: '#ffffff', acento: '#6d3fe0' },
  },
  esmeralda: {
    nombre: 'Esmeralda',
    descripcion: 'Verde esmeralda con acento azul cielo.',
    oscuro: { marca: '#34d399', marcaFuerte: '#6ee7b7', marcaTinta: '#03140d', acento: '#38bdf8' },
    claro: { marca: '#047857', marcaFuerte: '#065f46', marcaTinta: '#ffffff', acento: '#0369a1' },
  },
  atardecer: {
    nombre: 'Atardecer',
    descripcion: 'Naranja cálido con acento rosa.',
    oscuro: { marca: '#fb923c', marcaFuerte: '#fdba74', marcaTinta: '#1a0a02', acento: '#f472b6' },
    claro: { marca: '#c2410c', marcaFuerte: '#9a3412', marcaTinta: '#ffffff', acento: '#be185d' },
  },
  violeta: {
    nombre: 'Violeta',
    descripcion: 'Violeta intenso con acento turquesa.',
    oscuro: { marca: '#a78bfa', marcaFuerte: '#c4b5fd', marcaTinta: '#12072e', acento: '#22d3ee' },
    claro: { marca: '#6d28d9', marcaFuerte: '#5b21b6', marcaTinta: '#ffffff', acento: '#0e7490' },
  },
  dorado: {
    nombre: 'Dorado',
    descripcion: 'Ámbar dorado con acento coral.',
    oscuro: { marca: '#fbbf24', marcaFuerte: '#fcd34d', marcaTinta: '#1a1002', acento: '#fb7185' },
    claro: { marca: '#a16207', marcaFuerte: '#854d0e', marcaTinta: '#ffffff', acento: '#be123c' },
  },
} as const satisfies Record<string, DefinicionPaleta>;

export type PaletaSitio = keyof typeof PALETAS_SITIO;
export const IDS_PALETAS = Object.keys(PALETAS_SITIO) as [PaletaSitio, ...PaletaSitio[]];
export const PALETA_PREDETERMINADA: PaletaSitio = 'nv';

export function esPaletaSitio(v: unknown): v is PaletaSitio {
  return typeof v === 'string' && Object.hasOwn(PALETAS_SITIO, v);
}

/** Fondos del sistema de diseño (globals.css), para comprobar el contraste. */
export const FONDOS_SITIO = {
  oscuro: { fondo: '#060912', superficie: '#0b1020' },
  claro: { fondo: '#f5f7fc', superficie: '#ffffff' },
} as const;

function canales(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste WCAG 2.x entre dos colores hexadecimales (#rrggbb). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

const rgba = (hex: string, alfa: number) => `rgb(${canales(hex).join(' ')} / ${alfa})`;

function variables(c: ColoresPaleta, modo: 'oscuro' | 'claro'): string {
  const suave = modo === 'oscuro' ? 0.12 : 0.1;
  return [
    `--nv-marca:${c.marca}`,
    `--nv-marca-fuerte:${c.marcaFuerte}`,
    `--nv-marca-tinta:${c.marcaTinta}`,
    `--nv-marca-suave:${rgba(c.marca, suave)}`,
    `--nv-acento:${c.acento}`,
    `--nv-acento-suave:${rgba(c.acento, modo === 'oscuro' ? 0.14 : 0.1)}`,
    `--nv-foco:${modo === 'oscuro' ? c.marcaFuerte : c.marca}`,
  ].join(';');
}

/**
 * Hoja de estilo con las variables de la paleta para `selector`. Solo usa los
 * valores fijos de `PALETAS_SITIO`: nunca texto que venga del usuario.
 */
export function cssPaleta(paleta: PaletaSitio, selector: string): string {
  const p = PALETAS_SITIO[paleta] ?? PALETAS_SITIO.nv;
  return `${selector}{${variables(p.oscuro, 'oscuro')}}@media (prefers-color-scheme: light){${selector}{${variables(p.claro, 'claro')}}}`;
}
