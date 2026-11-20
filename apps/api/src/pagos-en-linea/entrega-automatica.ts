import type { PrismaClient } from '@nv/db';
import {
  CATEGORIAS_ENTREGA_AUTOMATICA_BINANCE,
  INFO_CATEGORIA,
  esCategoriaServicio,
} from '@nv/shared';

const AUTOMATICAS = CATEGORIAS_ENTREGA_AUTOMATICA_BINANCE as readonly string[];

/**
 * Pagos confirmados por correo (Binance, PayPal personal): solo streaming, música,
 * IA y software se entregan solos. Devuelve el motivo para dejar el pago en revisión
 * si la factura trae otra cosa (juegos, nube, sin categoría), o null.
 */
export async function motivoRevisionEntrega(
  prisma: PrismaClient,
  facturaId: string,
  medio: string,
): Promise<string | null> {
  const f = await prisma.factura.findUnique({
    where: { id: facturaId },
    select: {
      lineas: {
        select: { plan: { select: { servicio: { select: { nombre: true, categoria: true } } } } },
      },
      suscripcion: {
        select: { plan: { select: { servicio: { select: { nombre: true, categoria: true } } } } },
      },
    },
  });
  if (!f) return null;
  const servicios = [...f.lineas.map((l) => l.plan?.servicio), f.suscripcion?.plan.servicio].filter(
    (s) => s !== undefined && s !== null,
  );
  const fuera = servicios.filter((s) => !s.categoria || !AUTOMATICAS.includes(s.categoria));
  if (fuera.length === 0) return null;
  const nombres = [
    ...new Set(
      fuera.map((s) =>
        s.categoria && esCategoriaServicio(s.categoria)
          ? `${s.nombre} (${INFO_CATEGORIA[s.categoria].nombre})`
          : `${s.nombre} (sin categoría)`,
      ),
    ),
  ];
  return `Pago por ${medio} confirmado. ${nombres.join(', ')} no se entrega solo: revísalo y entrégalo.`;
}
