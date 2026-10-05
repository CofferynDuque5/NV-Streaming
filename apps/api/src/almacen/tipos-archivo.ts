/** Tipos de comprobante admitidos, detectados por su contenido (nunca por la extensión). */
export const TIPOS_COMPROBANTE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;
export type TipoComprobante = keyof typeof TIPOS_COMPROBANTE;

const empiezaCon = (b: Buffer, firma: number[], desde = 0) =>
  b.length >= desde + firma.length && firma.every((x, i) => b[desde + i] === x);

/** Devuelve el tipo real del archivo según sus primeros bytes, o null si no se admite. */
export function detectarTipo(b: Buffer): TipoComprobante | null {
  if (empiezaCon(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (empiezaCon(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (empiezaCon(b, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(b, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  if (empiezaCon(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** Nombre seguro para mostrar y descargar: sin rutas ni caracteres de control. */
export function nombreSeguro(
  nombre: string | undefined,
  tipo: TipoComprobante,
  porDefecto = 'comprobante',
): string {
  const base = (nombre ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 80);
  return `${base || porDefecto}.${TIPOS_COMPROBANTE[tipo]}`;
}
