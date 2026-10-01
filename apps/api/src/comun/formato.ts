import { Prisma } from '@nv/db';

/** Fecha a ISO, o null. */
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Decimal de Prisma a texto con 2 decimales, o null. */
export const dec = (v: Prisma.Decimal | null | undefined, decimales = 2): string | null =>
  v === null || v === undefined ? null : v.toFixed(decimales);

/** Igual que `dec`, para valores que nunca son nulos. */
export const dec2 = (v: Prisma.Decimal, decimales = 2): string => v.toFixed(decimales);

export const numeroFactura = (n: number): string => `NV-${String(n).padStart(6, '0')}`;

/** Detecta la violación de un índice único de Postgres (P2002). */
export function esUnicoDuplicado(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
