import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fechaCaracas } from '../../src/automatizaciones/horario.js';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
  type Navegador,
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

const DIA_MS = 24 * 3600_000;

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const cliente = await conectar(ctx, 'cliente');
  const catalogo = await prepararCatalogo(admin.n);
  return { admin, operador, cliente: cliente.n, clienteUsuario: cliente.usuario, ...catalogo };
}

/** Contrata, reporta el pago con comprobante y el operador lo confirma. */
async function venta(
  e: Awaited<ReturnType<typeof escenario>>,
  moneda: 'VES' | 'USD',
  monto: string,
): Promise<string> {
  const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda });
  expect(alta.estado).toBe(201);
  const pago = await e.cliente.formulario(
    `/mi/facturas/${alta.cuerpo.factura.id}/pagos`,
    {
      metodoCobroId: moneda === 'VES' ? e.pagoMovilId : e.zelleId,
      monto,
      referenciaExterna: `REF${Math.floor(Math.random() * 1e9)}`,
      fechaPago: hoy(),
    },
    { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 },
  );
  expect(pago.estado).toBe(201);
  const ok = await e.operador.n.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: monto });
  expect(ok.estado).toBe(200);
  return pago.cuerpo.id as string;
}

const caja = (n: Navegador, dia?: string) => n.get(dia ? `/caja?dia=${dia}` : '/caja');

describe('caja diaria', () => {
  it('suma lo cobrado hoy por método y moneda, y resta los reembolsos', async () => {
    const e = await escenario();
    await venta(e, 'VES', '200.00');
    const zelle = await venta(e, 'USD', '5.00');

    const r = await caja(e.operador.n);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.dia).toBe(fechaCaracas(new Date()));
    expect(r.cuerpo.hoy).toBe(true);
    expect(r.cuerpo.totales).toEqual([
      { moneda: 'USD', metodo: 'Zelle', monto: '5.00', cantidad: 1 },
      { moneda: 'VES', metodo: 'Pago Móvil', monto: '200.00', cantidad: 1 },
    ]);
    expect(r.cuerpo.movimientos).toHaveLength(2);
    expect(r.cuerpo.movimientos[0]).toMatchObject({
      tipo: 'pago',
      quien: expect.any(String),
      por: { id: e.operador.usuario.id },
    });
    expect(r.cuerpo.cierres).toEqual([]);

    // Un reembolso completado hoy resta en su método y moneda.
    await ctx.prisma.reembolso.create({
      data: {
        pagoId: zelle,
        monto: '2.00',
        moneda: 'USD',
        motivo: 'Prueba',
        estado: 'completado',
        claveIdempotencia: 'caja-reembolso-1',
        solicitadoPorId: e.admin.usuario.id,
        completadoEn: new Date(),
      },
    });
    const conReembolso = (await caja(e.operador.n)).cuerpo;
    expect(conReembolso.totales[0]).toEqual({
      moneda: 'USD',
      metodo: 'Zelle',
      monto: '3.00',
      cantidad: 2,
    });
    expect(conReembolso.movimientos.at(-1)).toMatchObject({ tipo: 'reembolso', monto: '-2.00' });

    // Un pago con saldo de la billetera no es dinero nuevo (ni el ajuste de saldo).
    const ficha = await ctx.prisma.cliente.findFirstOrThrow({
      where: { usuarioId: e.clienteUsuario.id },
    });
    const ajuste = await e.admin.n.post(`/billeteras/clientes/${ficha.id}/ajustes`, {
      montoUsd: '10',
      motivo: 'Saldo de prueba',
    });
    expect(ajuste.estado).toBe(201);
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const conSaldo = await e.cliente.post(`/mi/facturas/${alta.cuerpo.factura.id}/pagar-con-saldo`);
    expect(conSaldo.estado).toBe(200);
    expect(await ctx.prisma.pago.count({ where: { origen: 'billetera' } })).toBe(1);
    expect((await caja(e.operador.n)).cuerpo.movimientos).toHaveLength(3);

    // Una recarga de billetera confirmada sí es dinero que entra.
    const recarga = await e.cliente.formulario(
      '/mi/billetera/recargas',
      { metodoCobroId: e.zelleId, moneda: 'USD', monto: '7', fechaPago: hoy() },
      { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    expect(recarga.estado).toBe(201);
    await e.operador.n.post(`/billeteras/recargas/${recarga.cuerpo.id}/confirmar`, {
      montoRecibido: '7',
    });
    const conRecarga = (await caja(e.operador.n)).cuerpo;
    expect(conRecarga.movimientos.at(-1)).toMatchObject({
      tipo: 'recarga_billetera',
      monto: '7.00',
      metodo: 'Zelle',
    });
    expect(conRecarga.totales[0]).toMatchObject({ moneda: 'USD', monto: '10.00', cantidad: 3 });
  });

  it('cada día va por separado, en hora de Venezuela', async () => {
    const e = await escenario();
    const pago = await venta(e, 'VES', '200.00');
    const ayer = fechaCaracas(new Date(Date.now() - DIA_MS));
    await ctx.prisma.pago.update({
      where: { id: pago },
      data: { revisadoEn: new Date(Date.now() - DIA_MS) },
    });
    expect((await caja(e.operador.n)).cuerpo.movimientos).toEqual([]);
    const deAyer = (await caja(e.operador.n, ayer)).cuerpo;
    expect(deAyer.hoy).toBe(false);
    expect(deAyer.movimientos).toHaveLength(1);
  });

  it('cerrar guarda una foto; se vuelve a cerrar solo si entró algo después', async () => {
    const e = await escenario();
    await venta(e, 'VES', '200.00');
    const dia = fechaCaracas(new Date());

    const c1 = await e.operador.n.post('/caja/cierres', { dia, notas: 'Cuadró con el banco' });
    expect(c1.estado).toBe(201);
    expect(c1.cuerpo).toMatchObject({
      dia,
      secuencia: 1,
      movimientos: 1,
      notas: 'Cuadró con el banco',
      totales: [{ moneda: 'VES', metodo: 'Pago Móvil', monto: '200.00', cantidad: 1 }],
      cerradoPor: { id: e.operador.usuario.id },
    });

    const repetido = await e.operador.n.post('/caja/cierres', { dia });
    expect(repetido.estado).toBe(409);
    expect(repetido.cuerpo.error.codigo).toBe('NADA_QUE_CERRAR');

    await venta(e, 'USD', '5.00');
    const abierta = (await caja(e.operador.n)).cuerpo;
    expect(abierta.cierres).toHaveLength(1);
    expect(abierta.movimientosDespuesDelCierre).toBe(1);
    expect(abierta.despuesDelCierre).toEqual([
      { moneda: 'USD', metodo: 'Zelle', monto: '5.00', cantidad: 1 },
    ]);

    const c2 = await e.admin.n.post('/caja/cierres', { dia });
    expect(c2.estado).toBe(201);
    expect(c2.cuerpo).toMatchObject({ secuencia: 2, movimientos: 2 });
    expect((await caja(e.operador.n)).cuerpo.movimientosDespuesDelCierre).toBe(0);

    const auditoria = await ctx.prisma.auditoria.findMany({ where: { accion: 'caja.cerrada' } });
    expect(auditoria).toHaveLength(2);

    // Un cierre no se modifica ni se borra.
    await expect(
      ctx.prisma.cierreCaja.update({ where: { id: c1.cuerpo.id }, data: { notas: 'otra' } }),
    ).rejects.toThrow(/no se pueden modificar/);
    await expect(ctx.prisma.cierreCaja.delete({ where: { id: c1.cuerpo.id } })).rejects.toThrow(
      /no se pueden modificar/,
    );
  });

  it('dos cierres a la vez no repiten la secuencia', async () => {
    const e = await escenario();
    const dia = fechaCaracas(new Date());
    const r = await Promise.all([
      e.operador.n.post('/caja/cierres', { dia }),
      e.admin.n.post('/caja/cierres', { dia }),
    ]);
    expect(r.map((x) => x.estado).sort()).toEqual([201, 409]);
  });

  it('valida el día y los permisos', async () => {
    const e = await escenario();
    const ventas = await conectar(ctx, 'ventas');
    const dia = fechaCaracas(new Date());
    expect((await caja(ventas.n)).estado).toBe(403);
    expect((await caja(e.cliente)).estado).toBe(403);
    expect((await ventas.n.post('/caja/cierres', { dia })).estado).toBe(403);

    const manana = fechaCaracas(new Date(Date.now() + DIA_MS));
    expect((await caja(e.operador.n, manana)).estado).toBe(400);
    expect((await e.operador.n.post('/caja/cierres', { dia: manana })).estado).toBe(400);
    expect((await caja(e.operador.n, '2026-02-30')).estado).toBe(400);
    expect((await caja(e.operador.n, 'ayer')).estado).toBe(400);
    expect(
      (await e.operador.n.post('/caja/cierres', { dia, notas: 'x'.repeat(501) })).estado,
    ).toBe(400);
  });
});
