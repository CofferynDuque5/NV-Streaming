import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LectorImap } from '../../src/codigos/lector-imap.js';
import { CorreosPaypalService } from '../../src/pagos-en-linea/paypal-correo/correos-paypal.service.js';
import { correoPaypal, resolverPruebas } from '../correo-binance-falso.js';
import {
  conectar,
  type Contexto,
  crearContexto,
  limpiar,
  PNG_1X1,
  prepararCatalogo,
} from './ayudas.js';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await crearContexto();
  ctx.app.get(CorreosPaypalService).resolverDkim = resolverPruebas;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await limpiar(ctx.prisma);
});

const servicio = () => ctx.app.get(CorreosPaypalService);
const lector = () => ctx.app.get(LectorImap);
const captura = { campo: 'comprobante', nombre: 'pago.png', tipo: 'image/png', contenido: PNG_1X1 };

/** Buzón configurado y probado, método PayPal personal creado y un cliente con su factura de 5 USD. */
async function escenario(categoria: 'streaming' | 'juegos' = 'streaming') {
  const admin = await conectar(ctx, 'admin');
  const cliente = await conectar(ctx, 'cliente');
  const cat = await prepararCatalogo(admin.n);
  await ctx.prisma.servicio.update({ where: { id: cat.servicioId }, data: { categoria } });

  const conf = await admin.n.put('/pasarelas/paypal-correo/config', {
    usuario: 'tienda@example.com',
    clave: 'clave-de-aplicacion',
  });
  expect(conf.estado).toBe(200);
  expect(JSON.stringify(conf.cuerpo)).not.toContain('clave-de-aplicacion');
  vi.spyOn(lector(), 'probar').mockResolvedValueOnce();
  const prueba = await admin.n.post('/pasarelas/paypal-correo/probar');
  expect(prueba.estado).toBe(200);

  const metodo = await admin.n.post('/finanzas/metodos-cobro', {
    nombre: 'PayPal',
    moneda: 'USD',
    instrucciones: 'Envía el pago a tienda@example.com por PayPal.',
    tipo: 'pasarela',
    pasarela: 'paypal_correo',
  });
  expect(metodo.estado).toBe(201);

  const alta = await cliente.n.post('/mi/suscripciones', { planId: cat.planId, moneda: 'USD' });
  expect(alta.estado).toBe(201);
  const facturaId = alta.cuerpo.factura.id as string;
  const i = await cliente.n.post(`/mi/facturas/${facturaId}/pago-en-linea`, {
    metodoCobroId: metodo.cuerpo.id,
  });
  expect(i.estado).toBe(201);
  return { admin: admin.n, cliente: cliente.n, facturaId, intento: i.cuerpo };
}

function buzon(...correos: Buffer[]) {
  return vi.spyOn(lector(), 'nuevos').mockResolvedValueOnce({
    validez: 9n,
    correos: correos.map((fuente, n) => ({ uid: n + 1, fuente })),
  });
}

describe('PayPal (cuenta personal) confirmado por correo', () => {
  it('lleva al cliente a la página de PayPal con las instrucciones del método', async () => {
    const e = await escenario();
    expect(e.intento.urlPago).toContain('/cuenta/pagos/paypal?intento=');
    expect(e.intento.paypalCorreo).toMatchObject({
      nombre: null,
      tieneComprobante: false,
      instrucciones: 'Envía el pago a tienda@example.com por PayPal.',
    });
  });

  it('confirma por la referencia de NV en la nota, aunque el cliente no vuelva a la página', async () => {
    const e = await escenario();
    buzon(
      // Sin firma de paypal.com: no sirve.
      await correoPaypal({ monto: '5.00', nota: e.intento.referencia, firmaDominio: null }),
      await correoPaypal({ monto: '5.00', nota: `Pago ${e.intento.referencia}` }),
    );
    expect(await servicio().leer()).toBe(1);
    const i = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: e.intento.id } });
    expect(i.estado).toBe('aprobado');
    const factura = await ctx.prisma.factura.findUniqueOrThrow({ where: { id: e.facturaId } });
    expect(factura.estado).toBe('pagada');
  });

  it('confirma por nombre del pagador y monto exacto, y guarda la captura en el pago', async () => {
    const e = await escenario();
    const sinCaptura = await e.cliente.formulario(`/mi/pagos-en-linea/${e.intento.id}/paypal`, {
      nombre: 'Samuel Amador',
    });
    expect(sinCaptura.estado).toBe(400);
    const d = await e.cliente.formulario(
      `/mi/pagos-en-linea/${e.intento.id}/paypal`,
      { nombre: 'samuel amador' },
      captura,
    );
    expect(d.estado).toBe(200);
    expect(d.cuerpo).toMatchObject({
      estado: 'pendiente',
      paypalCorreo: { nombre: 'samuel amador', tieneComprobante: true },
    });

    buzon(
      await correoPaypal({ pagador: 'Samuel Amador', monto: '4.99' }),
      await correoPaypal({ pagador: 'Otra Persona', monto: '5.00' }),
      await correoPaypal({ pagador: 'Sámuel Amador', monto: '5.00' }),
    );
    await servicio().leer();
    const i = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: e.intento.id } });
    expect(i.estado).toBe('aprobado');
    const pago = await ctx.prisma.pago.findUniqueOrThrow({ where: { id: i.pagoId! } });
    expect(pago.estado).toBe('confirmado');
    expect(pago.comprobanteId).toBe(i.comprobanteId);
    const lista = await e.admin.get('/pasarelas/paypal-correo/correos');
    expect(lista.cuerpo).toHaveLength(3);
    const img = await e.cliente.descargar(`/mi/pagos-en-linea/${e.intento.id}/paypal/comprobante`);
    expect(img.estado).toBe(200);
  });

  it('juegos queda en revisión aunque el pago llegue bien', async () => {
    const e = await escenario('juegos');
    buzon(await correoPaypal({ monto: '5.00', nota: e.intento.referencia }));
    await servicio().leer();
    const i = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: e.intento.id } });
    const pago = await ctx.prisma.pago.findUniqueOrThrow({ where: { id: i.pagoId! } });
    expect(pago.estado).toBe('en_revision');
  });

  it('si no llega el aviso, avisa al equipo una sola vez', async () => {
    const e = await escenario();
    await e.cliente.formulario(
      `/mi/pagos-en-linea/${e.intento.id}/paypal`,
      { nombre: 'Samuel Amador' },
      captura,
    );
    const despues = new Date(Date.now() + 31 * 60_000);
    await servicio().conciliar(despues);
    await servicio().conciliar(despues);
    expect(
      await ctx.prisma.correoSaliente.count({ where: { plantilla: 'paypalSinConfirmar' } }),
    ).toBe(1);
    const img = await e.admin.descargar(
      `/pasarelas/paypal-correo/intentos/${e.intento.id}/comprobante`,
    );
    expect(img.estado).toBe(200);
  });

  it('un pago ajeno no se puede declarar', async () => {
    const e = await escenario();
    const otro = await conectar(ctx, 'cliente');
    const ajeno = await otro.n.formulario(
      `/mi/pagos-en-linea/${e.intento.id}/paypal`,
      { nombre: 'Samuel Amador' },
      captura,
    );
    expect(ajeno.estado).toBe(404);
  });
});
