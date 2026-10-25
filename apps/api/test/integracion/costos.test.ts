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

/** «AAAA-MM-DD» de hoy (Caracas) más `dias`. */
const diaMas = (dias: number) => {
  const d = new Date(`${fechaCaracas(new Date())}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  const crear = async (usuario: string, extra: Record<string, unknown>) => {
    const r = await operador.n.post('/cuentas', {
      servicioId: catalogo.servicioId,
      usuario,
      clave: 'x',
      perfiles: 2,
      ...extra,
    });
    expect(r.estado).toBe(201);
    return r.cuerpo as { id: string };
  };
  return { admin, operador, crear, ...catalogo };
}

describe('pagos al proveedor', () => {
  it('registra el pago, corre el próximo cobro un ciclo y al anularlo lo devuelve', async () => {
    const e = await escenario();
    const cuenta = await e.crear('cine@example.com', {
      costoUsd: '12.50',
      cicloMeses: 1,
      facturaEn: '2026-01-31',
    });
    const ruta = `/cuentas/${cuenta.id}/pagos`;

    const pago = await e.operador.n.post(ruta, { pagadoEl: '2026-01-30', metodoPago: 'Binance' });
    expect(pago.estado).toBe(201);
    expect(pago.cuerpo[0]).toMatchObject({
      montoUsd: '12.50',
      pagadoEl: '2026-01-30',
      facturaCubierta: '2026-01-31',
      // 31 de enero + 1 mes = 28 de febrero.
      siguienteCobro: '2026-02-28',
      metodoPago: 'Binance',
      anulacion: null,
      revierteCobro: true,
    });
    expect((await e.operador.n.get(`/cuentas/${cuenta.id}`)).cuerpo.facturaEn).toBe('2026-02-28');

    // Un segundo pago con otro monto: el primero ya no devuelve la fecha.
    const otro = await e.operador.n.post(ruta, { pagadoEl: '2026-02-27', montoUsd: '13' });
    expect(otro.cuerpo.map((p: { siguienteCobro: string }) => p.siguienteCobro)).toEqual([
      '2026-03-28',
      '2026-02-28',
    ]);
    expect(otro.cuerpo[1].revierteCobro).toBe(false);

    const anular = await e.operador.n.post(`${ruta}/${otro.cuerpo[0].id}/anular`, {
      motivo: 'Lo registré dos veces',
    });
    expect(anular.estado).toBe(201);
    expect(anular.cuerpo[0].anulacion).toMatchObject({ motivo: 'Lo registré dos veces' });
    expect(anular.cuerpo[1].revierteCobro).toBe(true);
    expect((await e.operador.n.get(`/cuentas/${cuenta.id}`)).cuerpo.facturaEn).toBe('2026-02-28');

    const doble = await e.operador.n.post(`${ruta}/${otro.cuerpo[0].id}/anular`, {
      motivo: 'otra vez',
    });
    expect(doble.cuerpo.error.codigo).toBe('PAGO_ANULADO');

    const acciones = await ctx.prisma.auditoria.findMany({
      where: { entidadId: cuenta.id, accion: { startsWith: 'cuenta_servicio.pago' } },
      orderBy: { fecha: 'asc' },
      select: { accion: true },
    });
    expect(acciones.map((a) => a.accion)).toEqual([
      'cuenta_servicio.pago_registrado',
      'cuenta_servicio.pago_registrado',
      'cuenta_servicio.pago_anulado',
    ]);
  });

  it('valida las fechas, el ciclo y los permisos', async () => {
    const e = await escenario();
    const sinFecha = await e.crear('sin-fecha@example.com', { costoUsd: '30', cicloMeses: 3 });
    const ruta = `/cuentas/${sinFecha.id}/pagos`;

    expect((await e.operador.n.post(ruta, { pagadoEl: diaMas(1) })).estado).toBe(400);
    expect(
      (await e.operador.n.post(ruta, { pagadoEl: '2026-05-10', siguienteCobro: '2026-05-10' }))
        .estado,
    ).toBe(400);
    expect((await e.operador.n.post(ruta, { metodoPago: '4111111111111111' })).estado).toBe(400);
    // Sin cobro pendiente, el ciclo (3 meses) corre desde el día del pago.
    const ok = await e.operador.n.post(ruta, { pagadoEl: '2026-05-10' });
    expect(ok.cuerpo[0]).toMatchObject({ siguienteCobro: '2026-08-10', facturaCubierta: null });
    expect((await e.operador.n.patch(`/cuentas/${sinFecha.id}`, { cicloMeses: 13 })).estado).toBe(
      400,
    );

    await e.operador.n.patch(`/cuentas/${sinFecha.id}`, { estado: 'retirada' });
    expect((await e.operador.n.post(ruta, {})).cuerpo.error.codigo).toBe('CUENTA_RETIRADA');

    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get(ruta)).estado).toBe(403);
    expect((await ventas.n.get('/balance/por-pagar')).estado).toBe(403);
    // El balance es solo del administrador.
    expect((await e.operador.n.get('/balance')).estado).toBe(403);
    expect((await e.admin.n.get('/balance')).estado).toBe(200);
    expect((await e.admin.n.get('/balance?desde=2026-05-02&hasta=2026-05-01')).estado).toBe(400);
    expect((await e.admin.n.get('/balance?desde=2025-01-01&hasta=2026-05-01')).estado).toBe(400);
  });

  it('lista los cobros atrasados y próximos', async () => {
    const e = await escenario();
    const atrasada = await e.crear('a@example.com', { costoUsd: '10', facturaEn: diaMas(-3) });
    const proxima = await e.crear('b@example.com', { costoUsd: '4.50', facturaEn: diaMas(5) });
    await e.crear('lejana@example.com', { costoUsd: '7', facturaEn: diaMas(20) });
    await e.crear('gratis@example.com', { costoUsd: '0', facturaEn: diaMas(-1) });
    const retirada = await e.crear('vieja@example.com', { costoUsd: '9', facturaEn: diaMas(-9) });
    await e.operador.n.patch(`/cuentas/${retirada.id}`, { estado: 'retirada' });

    const r = await e.operador.n.get('/balance/por-pagar');
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ totalAtrasadoUsd: '10.00', totalProximoUsd: '4.50' });
    expect(r.cuerpo.atrasadas).toEqual([
      expect.objectContaining({ cuenta: expect.objectContaining({ id: atrasada.id }), dias: -3 }),
    ]);
    expect(r.cuerpo.proximas).toEqual([
      expect.objectContaining({ cuenta: expect.objectContaining({ id: proxima.id }), dias: 5 }),
    ]);
    expect((await e.operador.n.get('/balance/por-pagar?dias=30')).cuerpo.proximas).toHaveLength(2);
    // La pista no deja ver el correo completo.
    expect(JSON.stringify(r.cuerpo)).not.toContain('a@example.com');
  });
});

describe('balance', () => {
  it('suma ventas confirmadas, resta reembolsos y costos, y muestra por cobrar y por pagar', async () => {
    const e = await escenario();
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
      (await e.operador.n.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' }))
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
        solicitadoPorId: e.admin.usuario.id,
        completadoEn: new Date(),
      },
    });

    // Otra factura emitida y sin pagar: por cobrar.
    const otro = await conectar(ctx, 'cliente');
    await otro.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });

    // Costo pagado hoy, uno anulado y uno fuera del período.
    const cuenta = await e.crear('costo@example.com', { costoUsd: '3', facturaEn: diaMas(2) });
    const ruta = `/cuentas/${cuenta.id}/pagos`;
    await e.operador.n.post(ruta, {});
    const anulado = await e.operador.n.post(ruta, { montoUsd: '50' });
    await e.operador.n.post(`${ruta}/${anulado.cuerpo[0].id}/anular`, { motivo: 'Error' });
    await e.operador.n.post(ruta, {
      montoUsd: '99',
      pagadoEl: '2020-01-01',
      siguienteCobro: '2020-02-01',
    });

    const b = await e.admin.n.get('/balance');
    expect(b.estado).toBe(200);
    expect(b.cuerpo).toMatchObject({
      hasta: fechaCaracas(new Date()),
      ventasClientesUsd: '5.00',
      pagosClientes: 1,
      ventasRevendedoresUsd: '0.00',
      reembolsosUsd: '2.00',
      costosProveedorUsd: '3.00',
      pagosProveedor: 1,
      netoUsd: '0.00',
      costosPorServicio: [
        { servicio: { id: e.servicioId, nombre: 'NV Cine' }, montoUsd: '3.00', pagos: 1 },
      ],
      porCobrar: { facturas: 1, totalUsd: '5.00' },
      costoMensualCuentasUsd: '3.00',
    });
    expect(b.cuerpo.desde).toBe(`${fechaCaracas(new Date()).slice(0, 7)}-01`);

    // El período viejo solo ve el pago de 2020.
    const viejo = await e.admin.n.get('/balance?desde=2020-01-01&hasta=2020-01-31');
    expect(viejo.cuerpo).toMatchObject({
      ventasClientesUsd: '0.00',
      costosProveedorUsd: '99.00',
      netoUsd: '-99.00',
    });
  });
});
