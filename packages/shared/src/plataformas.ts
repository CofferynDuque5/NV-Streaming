/**
 * Cómo se reparte una cuenta según la plataforma (igual que en el Gestor):
 * - `perfiles`: perfiles numerados con PIN (Netflix, Disney+, HBO Max…).
 * - `familiar`: plan familiar con cupos y sin PIN; el cupo 1 es el titular y
 *   los demás entran con su propio correo (Spotify, YouTube, Google One…).
 * - `correo`: se entra con el correo y un código de un solo uso, sin PIN (Canva).
 * Se decide por el nombre del servicio, sin guardar nada nuevo.
 */
export type TipoPlataforma = 'perfiles' | 'familiar' | 'correo';

const FAMILIAR = [
  'spotify',
  'youtube',
  'google one',
  'gemini',
  'office',
  'microsoft 365',
  'deezer',
  'tidal',
];
const CORREO = ['canva'];

const normalizar = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function tipoPlataforma(nombreServicio: string): TipoPlataforma {
  const n = normalizar(nombreServicio);
  if (FAMILIAR.some((p) => n.includes(p))) return 'familiar';
  if (CORREO.some((p) => n.includes(p))) return 'correo';
  return 'perfiles';
}

export interface TextosPlataforma {
  /** «Perfil» o «Cupo». */
  lugar: string;
  lugares: string;
  usaPin: boolean;
  /** Una línea para el panel de la cuenta. */
  descripcion: string;
}

export const TEXTOS_PLATAFORMA: Record<TipoPlataforma, TextosPlataforma> = {
  perfiles: {
    lugar: 'Perfil',
    lugares: 'Perfiles',
    usaPin: true,
    descripcion:
      'Plataforma por perfiles: el cliente entra con el correo y la clave de la cuenta, a su perfil y con su PIN.',
  },
  familiar: {
    lugar: 'Cupo',
    lugares: 'Cupos',
    usaPin: false,
    descripcion:
      'Plan familiar, sin PIN: el cupo 1 es el titular (alquiler, entra con los datos de la cuenta) y en los demás cupos cada miembro entra con su propio correo.',
  },
  correo: {
    lugar: 'Cupo',
    lugares: 'Cupos',
    usaPin: false,
    descripcion:
      'Se entra con el correo de la cuenta y un código de un solo uso que llega a ese correo. Sin PIN.',
  },
};

/** El cupo 1 de un plan familiar es el titular (usa el correo de la cuenta). */
export const esTitular = (tipo: TipoPlataforma, numero: number) =>
  tipo === 'familiar' && numero === 1;

function aleatorios(n: number): Uint32Array {
  const a = new Uint32Array(n);
  // Web Crypto existe en el navegador y en Node 20+ (el paquete no carga los tipos del DOM).
  (
    globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }
  ).crypto.getRandomValues(a);
  return a;
}

/** Clave nueva para una cuenta: sin letras que se confunden (l, 1, O, 0). */
export function generarClave(largo = 12): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(aleatorios(largo), (x) => letras[x % letras.length]).join('');
}

/** PIN de 4 cifras. */
export function generarPin(): string {
  return Array.from(aleatorios(4), (x) => String(x % 10)).join('');
}
