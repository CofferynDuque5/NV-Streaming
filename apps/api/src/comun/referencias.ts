import type { Prisma } from '@nv/db';
import { ErrorApp } from './errores.js';

/**
 * La misma referencia bancaria no puede usarse dos veces en el mismo método:
 * ni en otra recarga (de billetera o de revendedor) ni en el pago de una factura.
 */
export async function exigirReferenciaNueva(
  tx: Prisma.TransactionClient,
  metodoCobroId: string,
  referencia: string,
): Promise<void> {
  const filtro = {
    metodoCobroId,
    referenciaExterna: { equals: referencia, mode: 'insensitive' as const },
  };
  // En serie: una transacción usa una sola conexión.
  const billetera = await tx.recargaBilletera.findFirst({
    where: { ...filtro, estado: { in: ['en_revision', 'confirmada'] } },
    select: { id: true },
  });
  const revendedor = await tx.recargaSaldo.findFirst({
    where: { ...filtro, estado: { in: ['en_revision', 'confirmada'] } },
    select: { id: true },
  });
  const pago = await tx.pago.findFirst({
    where: { ...filtro, estado: { in: ['en_revision', 'confirmado'] } },
    select: { id: true },
  });
  if (billetera || revendedor || pago) {
    throw new ErrorApp(409, 'REFERENCIA_REPETIDA', 'Esa referencia ya se reportó en otro pago.', {
      referenciaExterna: ['Esa referencia ya se reportó en otro pago.'],
    });
  }
}
