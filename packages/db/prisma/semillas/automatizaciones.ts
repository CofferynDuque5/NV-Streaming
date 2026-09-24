import { AUTOMATIZACIONES, TIPOS_AUTOMATIZACION } from '@nv/shared';
import type { PrismaClient } from '../../src/index.js';

/**
 * Filas de las automatizaciones (fase 3) con los valores del catálogo. La API y
 * el trabajador también las crean al arrancar; nunca se sobrescribe una
 * configuración existente. Idempotente.
 */
export async function sembrarAutomatizaciones(prisma: PrismaClient): Promise<void> {
  const r = await prisma.automatizacion.createMany({
    data: TIPOS_AUTOMATIZACION.map((tipo) => {
      const def = AUTOMATIZACIONES[tipo];
      return {
        tipo,
        activa: def.activaPorDefecto,
        parametros: def.parametrosPorDefecto as object,
        // WhatsApp tiene costo por mensaje: se activa a mano en el panel.
        canales: ['correo' as const],
      };
    }),
    skipDuplicates: true,
  });
  console.log(r.count > 0 ? `✓ automatizaciones: ${r.count}` : '· las automatizaciones ya existen');
}
