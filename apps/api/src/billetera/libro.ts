import type { Cliente, MovimientoBilletera, Prisma, TipoMovimientoBilletera } from '@nv/db';
import { formatearMonto } from '@nv/shared';
import { ErrorApp, Errores } from '../comun/errores.js';
import type { Dec } from '../dinero/dinero.js';

export type Tx = Prisma.TransactionClient;

export const usd = (v: Dec) => formatearMonto(v.toFixed(2), 'USD');

/**
 * Bloquea la fila del cliente hasta el final de la transacción. Todo lo que
 * cambia el saldo de su billetera (recargas, pagos y ajustes) pasa por aquí,
 * así que dos operaciones simultáneas nunca leen el mismo saldo.
 */
export async function bloquearCliente(tx: Tx, id: string): Promise<Cliente> {
  await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${id}::uuid FOR UPDATE`;
  const c = await tx.cliente.findUnique({ where: { id } });
  if (!c) throw Errores.noEncontrado('El cliente');
  return c;
}

/**
 * La billetera y el carrito son para clientes directos de NV. Los clientes de
 * un revendedor los atiende su revendedor, y un cliente archivado no compra.
 */
export function exigirBilleteraDisponible(c: Cliente): void {
  if (c.revendedorId) {
    throw new ErrorApp(
      403,
      'CLIENTE_DE_REVENDEDOR',
      'Tu cuenta la gestiona tu revendedor: pídele a él tus servicios y renovaciones.',
    );
  }
  if (c.estado !== 'activo') {
    throw new ErrorApp(409, 'CLIENTE_ARCHIVADO', 'Esta cuenta está archivada. Escribe a soporte.');
  }
}

/**
 * Escribe un movimiento en el libro mayor de la billetera y actualiza el saldo
 * reflejado en la ficha. Exige la fila del cliente bloqueada con
 * `bloquearCliente` en la misma transacción. Nunca deja el saldo por debajo de
 * cero (la base de datos también lo impide).
 */
export async function moverBilletera(
  tx: Tx,
  cliente: Cliente,
  e: {
    tipo: TipoMovimientoBilletera;
    montoUsd: Dec;
    recargaId?: string;
    facturaId?: string;
    motivo?: string | null;
    autorId: string | null;
  },
): Promise<{ movimiento: MovimientoBilletera; saldo: Dec }> {
  const saldo = cliente.saldoUsd.add(e.montoUsd);
  if (saldo.isNegative()) {
    throw new ErrorApp(
      409,
      'SALDO_INSUFICIENTE',
      `El saldo disponible (${usd(cliente.saldoUsd)}) no alcanza para ${usd(e.montoUsd.neg())}.`,
    );
  }
  await tx.cliente.update({ where: { id: cliente.id }, data: { saldoUsd: saldo } });
  const movimiento = await tx.movimientoBilletera.create({
    data: {
      clienteId: cliente.id,
      tipo: e.tipo,
      montoUsd: e.montoUsd,
      saldoResultanteUsd: saldo,
      recargaId: e.recargaId ?? null,
      facturaId: e.facturaId ?? null,
      motivo: e.motivo ?? null,
      autorId: e.autorId,
    },
  });
  // El objeto bloqueado queda al día por si la transacción mueve más saldo.
  cliente.saldoUsd = saldo;
  return { movimiento, saldo };
}
