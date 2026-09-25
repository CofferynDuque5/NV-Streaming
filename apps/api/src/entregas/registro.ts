import { randomUUID } from 'node:crypto';
import type { MotivoEntrega, Prisma } from '@nv/db';
import { leerConfiguracionProveedor } from '@nv/shared';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';

type Tx = Prisma.TransactionClient;

/**
 * Registro de entregas dentro de la transacción que activa o renueva el
 * servicio (bandeja de salida transaccional): la entrega y su trabajo
 * `entrega.procesar` se confirman junto con el pago o la compra, o no se
 * crean. La clave de idempotencia (`factura:<id>` o `compra:<id>`) hace que
 * aplicar dos veces el mismo pago no cree dos entregas.
 */

export type OrigenEntrega =
  { tipo: 'factura'; facturaId: string } | { tipo: 'compra'; compraRevendedorId: string };

export interface NuevaEntrega {
  origen: OrigenEntrega;
  suscripcionId: string;
  concepto: 'alta' | 'renovacion';
  periodo: { inicio: Date | null; fin: Date | null };
}

/** Clave de idempotencia de la entrega de un pago o una compra. */
export const claveEntrega = (o: OrigenEntrega) =>
  o.tipo === 'factura' ? `factura:${o.facturaId}` : `compra:${o.compraRevendedorId}`;

/**
 * Crea la entrega (si corresponde) y encola su trabajo. Devuelve el id de la
 * entrega nueva, o null si ya existía o si el proveedor no entrega renovaciones.
 */
export async function registrarEntrega(tx: Tx, n: NuevaEntrega): Promise<string | null> {
  const s = await tx.suscripcion.findUniqueOrThrow({
    where: { id: n.suscripcionId },
    select: {
      id: true,
      clienteId: true,
      plan: {
        select: {
          id: true,
          servicio: {
            select: {
              proveedor: { select: { id: true, adaptador: true, configuracion: true } },
            },
          },
        },
      },
    },
  });
  const proveedor = s.plan.servicio.proveedor;
  const config = leerConfiguracionProveedor(proveedor.configuracion);
  if (n.concepto === 'renovacion' && !config.entregarRenovaciones) return null;

  let revendedorId: string | null = null;
  if (n.origen.tipo === 'compra') {
    const compra = await tx.compraRevendedor.findUniqueOrThrow({
      where: { id: n.origen.compraRevendedorId },
      select: { revendedorId: true },
    });
    revendedorId = compra.revendedorId;
  }
  const motivo: MotivoEntrega = n.origen.tipo === 'compra' ? 'compra' : n.concepto;
  const id = randomUUID();
  // ON CONFLICT DO NOTHING: una clave repetida no aborta la transacción del pago.
  const creada = await tx.entrega.createMany({
    data: [
      {
        id,
        proveedorId: proveedor.id,
        planId: s.plan.id,
        clienteId: s.clienteId,
        revendedorId,
        ...(n.origen.tipo === 'factura'
          ? { suscripcionId: s.id, facturaId: n.origen.facturaId }
          : { compraRevendedorId: n.origen.compraRevendedorId }),
        adaptador: proveedor.adaptador,
        motivo,
        claveIdempotencia: claveEntrega(n.origen),
        periodoInicio: n.periodo.inicio,
        periodoFin: n.periodo.fin,
      },
    ],
    skipDuplicates: true,
  });
  if (creada.count === 0) return null;
  await encolarTrabajo(tx, {
    tipo: TRABAJO.procesarEntrega,
    carga: { entregaId: id },
    claveUnica: `entrega:${id}:inicial`,
    maxIntentos: 3,
  });
  return id;
}

/** Entregas de una suscripción: las de sus facturas y las de las compras de revendedor. */
export const entregasDeSuscripcion = (suscripcionId: string): Prisma.EntregaWhereInput => ({
  OR: [{ suscripcionId }, { compraRevendedor: { suscripcionId } }],
});

/**
 * La suscripción terminó (cancelada o vencida tras la suspensión, o compra
 * reembolsada): anula las entregas que aún no se hicieron y encola la
 * revocación de las que el proveedor ya activó por webhook. Las entregas de
 * códigos o manuales ya hechas se quedan como están (el código ya se entregó).
 */
export async function solicitarRevocacion(
  tx: Tx,
  suscripcionId: string,
  motivo: string,
  ahora = new Date(),
): Promise<void> {
  const donde = entregasDeSuscripcion(suscripcionId);
  await tx.entrega.updateMany({
    where: { AND: [donde, { estado: { in: ['pendiente', 'fallida'] } }] },
    data: {
      estado: 'anulada',
      anuladaEn: ahora,
      motivoAnulacion: motivo.slice(0, 500),
      proximoIntentoEn: null,
    },
  });
  const activas = await tx.entrega.findMany({
    where: {
      AND: [donde, { adaptador: 'webhook', estado: { in: ['entregada', 'en_curso'] } }],
    },
    select: { id: true, estado: true },
  });
  for (const e of activas) {
    await encolarTrabajo(tx, {
      tipo: TRABAJO.revocarEntrega,
      carga: { entregaId: e.id, motivo: motivo.slice(0, 300) },
      claveUnica: `entrega_revocar:${e.id}`,
      // Si el webhook aún está en curso, se espera a que termine.
      ejecutarEn: e.estado === 'en_curso' ? new Date(ahora.getTime() + 60_000) : ahora,
      maxIntentos: 6,
    });
  }
}
