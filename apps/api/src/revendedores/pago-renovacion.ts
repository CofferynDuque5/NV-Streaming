import type { Factura, Prisma } from '@nv/db';
import { encolarTrabajo } from '../automatizaciones/trabajos.js';
import { esUnicoDuplicado, numeroFactura } from '../comun/formato.js';
import { bloquearRevendedor, moverSaldo } from './libro-mayor.js';
import { nuevaReferenciaRecarga } from './saldo.service.js';

type Tx = Prisma.TransactionClient;

/** Trabajo que renueva los servicios de un pago en línea ya acreditado. Carga: { recargaId }. */
export const TRABAJO_RENOVAR_PAGO_EN_LINEA = 'revendedor.renovar_pago_en_linea';

/**
 * Si la factura pagada es la de una renovación que un revendedor pagó en línea
 * (Binance Pay, PayPal…), deja el dinero en su saldo como una recarga ya
 * confirmada y encola la renovación de los servicios. Va dentro de la misma
 * transacción que confirma el pago, así que nunca se acredita dos veces.
 * El dinero entra a Caja por el pago de la factura, no por esta recarga.
 */
export async function acreditarPagoRenovacion(
  tx: Tx,
  factura: Pick<Factura, 'id' | 'numero' | 'moneda' | 'total' | 'tasa'>,
  pagoId: string,
  actorId: string | null,
): Promise<void> {
  const p = await tx.pagoRenovacionRevendedor.findUnique({ where: { facturaId: factura.id } });
  if (!p || p.recargaId) return;
  const pago = await tx.pago.findUniqueOrThrow({
    where: { id: pagoId },
    select: { id: true, metodoCobroId: true },
  });
  const metodoCobroId =
    pago.metodoCobroId ??
    (
      await tx.intentoPago.findFirst({
        where: { facturaId: factura.id, pagoId: pago.id },
        select: { metodoCobroId: true },
      })
    )?.metodoCobroId;
  if (!metodoCobroId) {
    throw new Error(`El pago ${pago.id} de una renovación en línea no tiene método de cobro.`);
  }
  const r = await bloquearRevendedor(tx, p.revendedorId);
  const ahora = new Date();
  const n = p.renovarIds.length;
  const datos = {
    revendedorId: r.id,
    metodoCobroId,
    moneda: factura.moneda,
    montoDeclarado: factura.total,
    montoRecibido: factura.total,
    tasa: factura.tasa,
    montoUsd: p.totalUsd,
    fechaPago: ahora,
    estado: 'confirmada' as const,
    notas: `Pago en línea de la factura ${numeroFactura(factura.numero)}.`,
    revisadoPorId: actorId,
    revisadoEn: ahora,
    renovarIds: p.renovarIds,
  };
  let recargaId: string | null = null;
  for (let i = 0; i < 5 && !recargaId; i += 1) {
    try {
      recargaId = (
        await tx.recargaSaldo.create({ data: { ...datos, referencia: nuevaReferenciaRecarga() } })
      ).id;
    } catch (e) {
      if (!esUnicoDuplicado(e)) throw e;
    }
  }
  if (!recargaId) throw new Error('No se pudo generar una referencia de recarga única.');
  await moverSaldo(tx, r, {
    tipo: 'recarga',
    montoUsd: p.totalUsd,
    recargaId,
    motivo: `Para renovar ${n} ${n === 1 ? 'servicio' : 'servicios'}.`,
    autorId: actorId,
  });
  await tx.pagoRenovacionRevendedor.update({ where: { id: p.id }, data: { recargaId } });
  await encolarTrabajo(tx, {
    tipo: TRABAJO_RENOVAR_PAGO_EN_LINEA,
    carga: { recargaId },
    claveUnica: `renovar-pago-en-linea:${recargaId}`,
  });
}
