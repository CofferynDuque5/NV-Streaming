import type {
  MovimientoSaldo,
  Prisma,
  PrismaClient,
  Revendedor,
  TipoMovimientoSaldo,
} from '@nv/db';
import { formatearMonto } from '@nv/shared';
import type { ContextoAuth } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import type { Dec } from '../dinero/dinero.js';

export type Tx = Prisma.TransactionClient;

/**
 * Bloquea la fila del revendedor hasta el final de la transacción. Todo lo que
 * cambia su saldo (recargas, compras, reembolsos y ajustes) pasa por aquí, así
 * que dos operaciones simultáneas nunca leen el mismo saldo.
 */
export async function bloquearRevendedor(tx: Tx, id: string): Promise<Revendedor> {
  await tx.$queryRaw`SELECT id FROM revendedores WHERE id = ${id}::uuid FOR UPDATE`;
  const r = await tx.revendedor.findUnique({ where: { id } });
  if (!r) throw Errores.noEncontrado('El revendedor');
  return r;
}

/** Ficha de revendedor de quien hace la petición. */
export async function revendedorPropio(
  auth: ContextoAuth,
  tx: Tx | PrismaClient,
): Promise<Revendedor> {
  const r = await tx.revendedor.findUnique({ where: { usuarioId: auth.usuario.id } });
  if (!r) {
    throw new ErrorApp(
      404,
      'SIN_FICHA_REVENDEDOR',
      'Tu cuenta de revendedor no está configurada. Escribe a soporte para que la revisemos.',
    );
  }
  return r;
}

/** Un revendedor suspendido ve su panel, pero no recarga ni compra. */
export function exigirOperativo(r: Revendedor): void {
  if (r.estado === 'suspendido') {
    throw new ErrorApp(
      403,
      'REVENDEDOR_SUSPENDIDO',
      `Tu cuenta de revendedor está suspendida${r.motivoEstado ? ` (${r.motivoEstado})` : ''}. No puedes recargar saldo ni comprar mientras tanto. Escribe a soporte.`,
    );
  }
  if (r.estado !== 'aprobado') {
    throw new ErrorApp(403, 'REVENDEDOR_NO_APROBADO', 'Tu cuenta de revendedor no está activa.');
  }
}

export const usd = (v: Dec) => formatearMonto(v.toFixed(2), 'USD');

/**
 * Escribe un movimiento en el libro mayor y actualiza el saldo reflejado en la
 * ficha. Exige la fila del revendedor bloqueada con `bloquearRevendedor` en la
 * misma transacción. Nunca deja el saldo por debajo de cero (la base de datos
 * también lo impide).
 */
export async function moverSaldo(
  tx: Tx,
  revendedor: Revendedor,
  e: {
    tipo: TipoMovimientoSaldo;
    montoUsd: Dec;
    recargaId?: string;
    compraId?: string;
    motivo?: string | null;
    autorId: string | null;
  },
): Promise<{ movimiento: MovimientoSaldo; saldo: Dec }> {
  const saldo = revendedor.saldoUsd.add(e.montoUsd);
  if (saldo.isNegative()) {
    throw new ErrorApp(
      409,
      'SALDO_INSUFICIENTE',
      `El saldo disponible (${usd(revendedor.saldoUsd)}) no alcanza para ${usd(e.montoUsd.neg())}.`,
    );
  }
  await tx.revendedor.update({ where: { id: revendedor.id }, data: { saldoUsd: saldo } });
  const movimiento = await tx.movimientoSaldo.create({
    data: {
      revendedorId: revendedor.id,
      tipo: e.tipo,
      montoUsd: e.montoUsd,
      saldoResultanteUsd: saldo,
      recargaId: e.recargaId ?? null,
      compraId: e.compraId ?? null,
      motivo: e.motivo ?? null,
      autorId: e.autorId,
    },
  });
  // El objeto bloqueado queda al día por si la transacción mueve más saldo.
  revendedor.saldoUsd = saldo;
  return { movimiento, saldo };
}
