import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fechaCaracas } from '../../src/automatizaciones/horario.js';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
  PNG_1X1,
  prepararCatalogo,
} from './ayudas.js';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await crearContexto();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await limpiar(ctx.prisma);
});

const comprobante = {
  campo: 'comprobante',
  nombre: 'pago.png',
  tipo: 'image/png',
  contenido: PNG_1X1,
};

describe('balance', () => {
  it('es solo del administrador y valida el período', async () => {
    const admin = await conectar(ctx, 'admin');
    const operador = await conectar(ctx, 'operador');
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get('/balance')).estado).toBe(403);
    expect((await operador.n.get('/balance')).estado).toBe(403);
    expect((await admin.n.get('/balance')).estado).toBe(200);
    expect((await admin.n.get('/balance?desde=2026-05-02&hasta=2026-05-01')).estado).toBe(400);
    expect((await admin.n.get('/balance?desde=2025-01-01&hasta=2026-05-01')).estado).toBe(400);
  });

  it('suma ventas confirmadas, resta reembolsos y muestra lo que está por cobrar', async () => {
    const admin = await conectar(ctx, 'admin');
    const operador = await conectar(ctx, 'operador');
    const e = await prepararCatalogo(admin.n);
    const cliente = await conectar(ctx, 'cliente');

    // Venta confirmada: 5 USD.
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const pago = await cliente.n.formulario(
      `/mi/facturas/${alta.cuerpo.factura.id}/pagos`,
      { metodoCobroId: e.zelleId, monto: '5.00', referenciaExterna: 'Z-BAL-1', fechaPago: hoy() },
      comprobante,
    );
    expect(pago.estado).toBe(201);
    expect(
      (await operador.n.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' }))
        .estado,
    ).toBe(200);

    // Reembolso parcial de 2 USD completado hoy.
    await ctx.prisma.reembolso.create({
      data: {
        pagoId: pago.cuerpo.id,
        monto: '2.00',
        moneda: 'USD',
        motivo: 'Prueba',
        estado: 'completado',
        claveIdempotencia: 'bal-1',
        solicitadoPorId: admin.usuario.id,
        completadoEn: new Date(),
      },
    });

    // Otra factura emitida y sin pagar: por cobrar.
    const otro = await conectar(ctx, 'cliente');
    await otro.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });

    const b = await admin.n.get('/balance');
    expect(b.estado).toBe(200);
    expect(b.cuerpo).toEqual({
      desde: `${fechaCaracas(new Date()).slice(0, 7)}-01`,
      hasta: fechaCaracas(new Date()),
      ventasClientesUsd: '5.00',
      pagosClientes: 1,
      ventasRevendedoresUsd: '0.00',
      comprasRevendedores: 0,
      reembolsosUsd: '2.00',
      netoUsd: '3.00',
      porCobrar: { facturas: 1, vencidas: expect.any(Number), totalUsd: '5.00' },
    });

    // Un período viejo no ve las ventas de hoy.
    const viejo = await admin.n.get('/balance?desde=2020-01-01&hasta=2020-01-31');
    expect(viejo.cuerpo).toMatchObject({
      ventasClientesUsd: '0.00',
      reembolsosUsd: '0.00',
      netoUsd: '0.00',
    });
  });
});
