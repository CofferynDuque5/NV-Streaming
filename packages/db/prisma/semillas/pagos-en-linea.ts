import type { PrismaClient } from '../../src/index.js';

const NOMBRE = 'Pago en línea (pruebas)';

/**
 * Métodos de pago en línea con la pasarela de pruebas (fase 4), en USD y EUR.
 * Solo para desarrollo: la pasarela de pruebas no existe en producción.
 * Idempotente: no duplica ni modifica los que ya existen.
 */
export async function sembrarPagosEnLinea(prisma: PrismaClient): Promise<void> {
  let creados = 0;
  for (const [moneda, orden] of [
    ['USD', 50],
    ['EUR', 50],
  ] as const) {
    const existe = await prisma.metodoCobro.findFirst({
      where: { nombre: NOMBRE, moneda, tipo: 'pasarela', pasarela: 'sandbox' },
    });
    if (existe) continue;
    await prisma.metodoCobro.create({
      data: {
        nombre: NOMBRE,
        moneda,
        instrucciones:
          'Pasarela de pruebas: no cobra de verdad. Elige aprobar, rechazar o cancelar en su página.',
        requiereReferencia: false,
        tipo: 'pasarela',
        pasarela: 'sandbox',
        orden,
      },
    });
    creados += 1;
  }
  console.log(
    creados > 0
      ? `✓ métodos de pago en línea de prueba: ${creados}`
      : '· los métodos de pago en línea de prueba ya existen',
  );
}
