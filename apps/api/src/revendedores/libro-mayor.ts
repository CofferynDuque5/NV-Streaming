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
import { interpretar } from '../automatizaciones/configuracion.service.js';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';
import { D, type Dec } from '../dinero/dinero.js';

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
  const antes = revendedor.saldoUsd;
  // El objeto bloqueado queda al día por si la transacción mueve más saldo.
  revendedor.saldoUsd = saldo;
  if (e.montoUsd.isNegative())
    await avisarSiCruzaUmbral(tx, revendedor.id, antes, saldo, movimiento.id);
  return { movimiento, saldo };
}

/**
 * Si el movimiento deja el saldo por debajo del umbral configurado (cruzándolo
 * hacia abajo), encola el aviso de saldo bajo en la misma transacción. No se
 * repite mientras el saldo siga por debajo: solo avisa el movimiento que cruza.
 */
async function avisarSiCruzaUmbral(
  tx: Tx,
  revendedorId: string,
  antes: Dec,
  despues: Dec,
  movimientoId: string,
): Promise<void> {
  const fila = await tx.automatizacion.findUnique({ where: { tipo: 'saldo_bajo_revendedor' } });
  if (!fila?.activa) return;
  const umbral = D(interpretar('saldo_bajo_revendedor', fila).parametros.umbralUsd);
  if (antes.lt(umbral) || despues.gte(umbral)) return;
  await encolarTrabajo(tx, {
    tipo: TRABAJO.avisoSaldoBajo,
    carga: {
      revendedorId,
      movimientoId,
      saldoUsd: despues.toFixed(2),
      umbralUsd: umbral.toFixed(2),
    },
    claveUnica: `saldo_bajo:${movimientoId}`,
  });
}
