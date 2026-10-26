import type { Prisma, PrismaClient, Revendedor } from '@nv/db';
import type { ServicioRenovable } from '@nv/shared';
import { type Dec } from '../dinero/dinero.js';
import { INCLUIR_SUSCRIPCION, suscripcionPublica } from '../suscripciones/presentacion.js';
import type { Tx } from './libro-mayor.js';
import { planRevendible } from './niveles.service.js';

const DIA_MS = 24 * 3600_000;

/** Estados desde los que una compra de renovación suma un periodo. */
export const ESTADOS_RENOVABLES = ['activa', 'en_gracia', 'suspendida', 'vencida'] as const;

/** La suscripción con lo que hace falta para saber si se renueva (plan activo y factura abierta). */
export const INCLUIR_RENOVABLE = {
  ...INCLUIR_SUSCRIPCION,
  plan: { select: { ...INCLUIR_SUSCRIPCION.plan.select, activo: true } },
} as const satisfies Prisma.SuscripcionInclude;

export type SuscripcionRenovable = Prisma.SuscripcionGetPayload<{
  include: typeof INCLUIR_RENOVABLE;
}>;

/**
 * Precio mayorista de cada plan que el nivel puede revender hoy. Sin nivel no
 * hay precios. Un precio por debajo del costo no se ofrece (la compra tampoco
 * lo acepta).
 */
export async function preciosDelNivel(
  tx: Tx | PrismaClient,
  nivelId: string | null,
): Promise<Map<string, Dec>> {
  if (!nivelId) return new Map();
  const filas = await tx.precioMayorista.findMany({
    where: { nivelId, plan: planRevendible },
    select: { planId: true, precioUsd: true, plan: { select: { costoUsd: true } } },
  });
  return new Map(
    filas
      .filter((f) => !f.plan.costoUsd || f.precioUsd.gte(f.plan.costoUsd))
      .map((f) => [f.planId, f.precioUsd]),
  );
}

/**
 * Si el revendedor puede renovar el servicio con su saldo y a qué precio, o
 * por qué no. Son las mismas reglas que comprueba la compra de renovación al
 * cobrar; aquí sirven para listar y para validar un lote antes de empezar.
 */
export function renovacionDe(
  s: SuscripcionRenovable,
  r: Pick<Revendedor, 'id' | 'nivelId'>,
  precios: Map<string, Dec>,
): ServicioRenovable {
  const fila = (precio: Dec | null, motivo: string | null): ServicioRenovable => ({
    suscripcion: suscripcionPublica(s),
    precioUsd: precio ? precio.toFixed(2) : null,
    noRenovable: motivo,
  });
  if (s.estado === 'pausada') {
    return fila(null, 'Está pausada: pide al equipo que la reanude.');
  }
  if (!(ESTADOS_RENOVABLES as readonly string[]).includes(s.estado)) return fila(null, null);
  if (s.revendedorId !== r.id) return fila(null, 'Lo gestiona tu cliente desde su cuenta.');
  if (s.cancelarAlVencer) return fila(null, 'Tiene una cancelación programada.');
  if (s.facturas.length > 0) return fila(null, 'Tiene una factura de NV pendiente.');
  if (!s.plan.renovable || !s.plan.activo) return fila(null, 'Este plan ya no se renueva.');
  if (!r.nivelId) return fila(null, 'Aún no tienes nivel asignado.');
  const precio = precios.get(s.planId);
  if (!precio) return fila(null, 'Sin precio mayorista para tu nivel.');
  return fila(precio, null);
}

/** Vencido, en gracia o suspendido: ya se pasó de la fecha. */
export const atrasado = (s: { estado: string }) => s.estado !== 'activa';

/** Atrasado o que vence en 7 días o menos. */
export function urgente(s: { estado: string; venceEn: Date | string | null }, ahora = new Date()) {
  if (atrasado(s)) return true;
  return s.venceEn !== null && new Date(s.venceEn).getTime() <= ahora.getTime() + 7 * DIA_MS;
}

/**
 * Servicios de la cartera que el revendedor activó y puede renovar ahora, del
 * que vence primero al último. Con `ids`, solo esos (para validar un lote).
 */
export async function serviciosRenovables(
  tx: Tx | PrismaClient,
  r: Pick<Revendedor, 'id' | 'nivelId'>,
  ids?: string[],
): Promise<{ suscripcion: SuscripcionRenovable; servicio: ServicioRenovable }[]> {
  const [precios, filas] = await Promise.all([
    preciosDelNivel(tx, r.nivelId),
    tx.suscripcion.findMany({
      where: {
        cliente: { revendedorId: r.id },
        ...(ids
          ? { id: { in: ids } }
          : { revendedorId: r.id, estado: { in: [...ESTADOS_RENOVABLES] } }),
      },
      include: INCLUIR_RENOVABLE,
      orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return filas.map((s) => ({ suscripcion: s, servicio: renovacionDe(s, r, precios) }));
}
