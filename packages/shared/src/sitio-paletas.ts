/**
 * Paletas del sitio público dentro de los límites de la marca NV. El sitio es
 * oscuro («cosmos»); cada paleta define la marca (textos y enlaces sobre el
 * fondo), el acento y el degradado del botón principal. Todo cumple WCAG AA:
 * el texto sobre la marca y sobre el centro del botón tiene contraste ≥ 4,5:1.
 */

export interface DefinicionPaleta {
  nombre: string;
  descripcion: string;
  marca: string;
  marcaFuerte: string;
  /** Texto sobre un relleno de color de marca. */
  marcaTinta: string;
  acento: string;
  /** Degradado vertical del botón principal (arriba, abajo). */
  boton: readonly [string, string];
  /** Texto del botón principal. */
  botonTinta: string;
}

export const PALETAS_SITIO = {
  nv: {
    nombre: 'NV',
    descripcion: 'Azul NV con acentos cian y violeta: el aspecto del multiverso NV.',
    marca: '#5b98ff',
    marcaFuerte: '#8fb6ff',
    marcaTinta: '#04050d',
    acento: '#22d3ee',
    boton: ['#4d8dfb', '#1d4ed8'],
    botonTinta: '#ffffff',
  },
  esmeralda: {
    nombre: 'Esmeralda',
    descripcion: 'Verde esmeralda con acento azul cielo.',
    marca: '#34d399',
    marcaFuerte: '#6ee7b7',
    marcaTinta: '#03140d',
    acento: '#38bdf8',
    boton: ['#6ee7b7', '#34d399'],
    botonTinta: '#03140d',
  },
  atardecer: {
    nombre: 'Atardecer',
    descripcion: 'Naranja cálido con acento rosa.',
    marca: '#fb923c',
    marcaFuerte: '#fdba74',
    marcaTinta: '#1a0a02',
    acento: '#f472b6',
    boton: ['#fdba74', '#fb923c'],
    botonTinta: '#1a0a02',
  },
  violeta: {
    nombre: 'Violeta',
    descripcion: 'Violeta intenso con acento turquesa.',
    marca: '#a78bfa',
    marcaFuerte: '#c4b5fd',
    marcaTinta: '#12072e',
    acento: '#22d3ee',
    boton: ['#8b5cf6', '#6d28d9'],
    botonTinta: '#ffffff',
  },
  dorado: {
    nombre: 'Dorado',
    descripcion: 'Ámbar dorado con acento coral.',
    marca: '#fbbf24',
    marcaFuerte: '#fcd34d',
    marcaTinta: '#1a1002',
    acento: '#fb7185',
    boton: ['#fcd34d', '#f59e0b'],
    botonTinta: '#1a1002',
  },
} as const satisfies Record<string, DefinicionPaleta>;

export type PaletaSitio = keyof typeof PALETAS_SITIO;
export const IDS_PALETAS = Object.keys(PALETAS_SITIO) as [PaletaSitio, ...PaletaSitio[]];
export const PALETA_PREDETERMINADA: PaletaSitio = 'nv';

export function esPaletaSitio(v: unknown): v is PaletaSitio {
  return typeof v === 'string' && Object.hasOwn(PALETAS_SITIO, v);
}

/** Fondos del sistema de diseño (globals.css), para comprobar el contraste. */
export const FONDOS_SITIO = { fondo: '#04050d', superficie: '#0a0e20' } as const;

/** Color intermedio de dos colores hexadecimales: donde se lee la etiqueta del botón. */
export function mezcla(a: string, b: string): string {
  const [ca, cb] = [canales(a), canales(b)];
  return `#${ca
    .map((v, i) =>
      Math.round((v + (cb[i] ?? v)) / 2)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

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

function variables(p: DefinicionPaleta): string {
  return [
    `--nv-marca:${p.marca}`,
    `--nv-marca-fuerte:${p.marcaFuerte}`,
    `--nv-marca-tinta:${p.marcaTinta}`,
    `--nv-marca-suave:${rgba(p.marca, 0.12)}`,
    `--nv-acento:${p.acento}`,
    `--nv-acento-suave:${rgba(p.acento, 0.14)}`,
    `--nv-boton-desde:${p.boton[0]}`,
    `--nv-boton-hasta:${p.boton[1]}`,
    `--nv-boton-tinta:${p.botonTinta}`,
    `--nv-boton-brillo:${rgba(p.boton[0], 0.7)}`,
    `--nv-foco:${p.marcaFuerte}`,
  ].join(';');
}

/**
 * Hoja de estilo con las variables de la paleta para `selector`. Solo usa los
 * valores fijos de `PALETAS_SITIO`: nunca texto que venga del usuario.
 */
export function cssPaleta(paleta: PaletaSitio, selector: string): string {
  const p: DefinicionPaleta = PALETAS_SITIO[paleta] ?? PALETAS_SITIO.nv;
  return `${selector}{${variables(p)}}`;
}
