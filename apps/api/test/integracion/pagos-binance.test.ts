import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LectorImap } from '../../src/codigos/lector-imap.js';
import { CorreosBinanceService } from '../../src/pagos-en-linea/binance/correos-binance.service.js';
import { correoBinance, resolverPruebas } from '../correo-binance-falso.js';
import { conectar, type Contexto, crearContexto, limpiar, prepararCatalogo } from './ayudas.js';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await crearContexto();
  ctx.app.get(CorreosBinanceService).resolverDkim = resolverPruebas;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await limpiar(ctx.prisma);
});

const servicio = () => ctx.app.get(CorreosBinanceService);
const lector = () => ctx.app.get(LectorImap);

/** Buzón configurado y probado, método Binance creado y un cliente con su factura de 5 USD. */
async function escenario(categoria: 'streaming' | 'juegos' = 'streaming') {
  const admin = await conectar(ctx, 'admin');
  const cliente = await conectar(ctx, 'cliente');
  const cat = await prepararCatalogo(admin.n);
  await ctx.prisma.servicio.update({ where: { id: cat.servicioId }, data: { categoria } });

  const conf = await admin.n.put('/pasarelas/binance/config', {
    usuario: 'tienda@example.com',
    clave: 'clave-de-aplicacion',
    codigoAntiPhishing: 'NVSECRETO1',
  });
  expect(conf.estado).toBe(200);
  expect(conf.cuerpo).toMatchObject({ configurada: true, tieneCodigoAntiPhishing: true });
  expect(JSON.stringify(conf.cuerpo)).not.toContain('NVSECRETO1');
  expect(JSON.stringify(conf.cuerpo)).not.toContain('clave-de-aplicacion');
  vi.spyOn(lector(), 'probar').mockResolvedValueOnce();
  const prueba = await admin.n.post('/pasarelas/binance/probar');
  expect(prueba.estado).toBe(200);
  expect(prueba.cuerpo.probadoEn).not.toBeNull();

  const metodo = await admin.n.post('/finanzas/metodos-cobro', {
    nombre: 'Binance',
    moneda: 'USD',
    instrucciones: 'Envía USDT por Binance Pay al usuario NV-Tienda.',
    tipo: 'pasarela',
    pasarela: 'binance',
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

/** El buzón devuelve estos correos en la próxima lectura. */
function buzon(...correos: Buffer[]) {
  return vi.spyOn(lector(), 'nuevos').mockResolvedValueOnce({
    validez: 7n,
    correos: correos.map((fuente, n) => ({ uid: n + 1, fuente })),
  });
}

describe('Binance Pay confirmado por correo', () => {
  it('lleva al cliente a la página de Binance con las instrucciones y el QR del método', async () => {
    const e = await escenario();
    expect(e.intento.urlPago).toContain('/cuenta/pagos/binance?intento=');
    expect(e.intento.binance).toMatchObject({
      usuario: null,
      instrucciones: 'Envía USDT por Binance Pay al usuario NV-Tienda.',
    });
  });

  it('confirma solo con el correo firmado de Binance (usuario sin importar mayúsculas y monto exacto)', async () => {
    const e = await escenario();
    const d = await e.cliente.post(`/mi/pagos-en-linea/${e.intento.id}/binance`, {
      usuario: 'katy-2207',
      monto: '5',
    });
    expect(d.estado).toBe(200);
    expect(d.cuerpo).toMatchObject({
      estado: 'pendiente',
      binance: { usuario: 'katy-2207', monto: '5.00' },
    });

    buzon(
      // Sin firma de binance.com: no sirve.
      await correoBinance({ monto: '5', firmaDominio: null }),
      // Código anti-phishing distinto: no sirve.
      await correoBinance({ monto: '5', codigo: 'OTRO' }),
      // Otro monto: no coincide.
      await correoBinance({ monto: '4.99' }),
      await correoBinance({ monto: '5', remitente: 'Katy-2207' }),
    );
    expect(await servicio().leer()).toBe(2);

    const r = await e.cliente.get(`/mi/pagos-en-linea/${e.intento.id}`);
    expect(r.cuerpo.estado).toBe('aprobado');
    const pago = await ctx.prisma.pago.findUniqueOrThrow({ where: { id: r.cuerpo.pagoId } });
    expect(pago.estado).toBe('confirmado');
    const factura = await ctx.prisma.factura.findUniqueOrThrow({ where: { id: e.facturaId } });
    expect(factura.estado).toBe('pagada');

    const filas = await ctx.prisma.correoBinance.findMany({ orderBy: { monto: 'asc' } });
    expect(filas.map((f) => f.estado).sort()).toEqual([
      'descartado',
      'descartado',
      'libre',
      'usado',
    ]);
    const lista = await e.admin.get('/pasarelas/binance/correos');
    expect(lista.cuerpo).toHaveLength(4);
    expect(lista.cuerpo.find((c: { estado: string }) => c.estado === 'usado').intento.id).toBe(
      e.intento.id,
    );
    const config = await ctx.prisma.configBinance.findUniqueOrThrow({ where: { id: 1 } });
    expect(config.ultimoUid).toBe(4n);
    expect(config.uidValidez).toBe(7n);
  });

  it('el mismo correo no se guarda dos veces y sirve aunque llegue antes de declarar', async () => {
    const e = await escenario();
    const correo = await correoBinance({ monto: '5', idMensaje: 'unico@binance.com' });
    buzon(correo);
    await servicio().leer();
    buzon(correo);
    await servicio().leer();
    expect(await ctx.prisma.correoBinance.count()).toBe(1);
    await e.cliente.post(`/mi/pagos-en-linea/${e.intento.id}/binance`, {
      usuario: 'Katy-2207',
      monto: '5.00',
    });
    const r = await e.cliente.get(`/mi/pagos-en-linea/${e.intento.id}`);
    expect(r.cuerpo.estado).toBe('aprobado');
  });

  it('juegos (y lo que no se entrega solo) queda en revisión aunque el pago llegue bien', async () => {
    const e = await escenario('juegos');
    await e.cliente.post(`/mi/pagos-en-linea/${e.intento.id}/binance`, {
      usuario: 'Katy-2207',
      monto: '5',
    });
    buzon(await correoBinance({ monto: '5' }));
    await servicio().leer();
    const i = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: e.intento.id } });
    expect(i.estado).toBe('aprobado');
    const pago = await ctx.prisma.pago.findUniqueOrThrow({ where: { id: i.pagoId! } });
    expect(pago.estado).toBe('en_revision');
  });

  it('si el correo no llega a tiempo avisa al equipo, y si llega tarde el pago se registra igual', async () => {
    const e = await escenario();
    await e.cliente.post(`/mi/pagos-en-linea/${e.intento.id}/binance`, {
      usuario: 'Katy-2207',
      monto: '5',
    });
    const despues = new Date(Date.now() + 31 * 60_000);
    await servicio().conciliar(despues);
    const i = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: e.intento.id } });
    expect(i.avisoEquipoEn).not.toBeNull();
    expect(
      await ctx.prisma.correoSaliente.count({ where: { plantilla: 'binanceSinConfirmar' } }),
    ).toBe(1);
    // Una segunda pasada no repite el aviso.
    await servicio().conciliar(despues);
    expect(
      await ctx.prisma.correoSaliente.count({ where: { plantilla: 'binanceSinConfirmar' } }),
    ).toBe(1);

    await ctx.prisma.intentoPago.update({
      where: { id: e.intento.id },
      data: { estado: 'expirado' },
    });
    buzon(await correoBinance({ monto: '5' }));
    await servicio().leer();
    const final = await ctx.prisma.intentoPago.findUniqueOrThrow({ where: { id: e.intento.id } });
    expect(final.estado).toBe('aprobado');
    expect(final.pagoId).not.toBeNull();
  });

  it('no se puede declarar en un pago ajeno ni con datos mal escritos', async () => {
    const e = await escenario();
    await ctx.prisma.configBinance.update({ where: { id: 1 }, data: { activo: false } });
    const otro = await conectar(ctx, 'cliente');
    const ajeno = await otro.n.post(`/mi/pagos-en-linea/${e.intento.id}/binance`, {
      usuario: 'Katy-2207',
      monto: '5',
    });
    expect(ajeno.estado).toBe(404);
    const malo = await e.cliente.post(`/mi/pagos-en-linea/${e.intento.id}/binance`, {
      usuario: 'Katy 2207 <x>',
      monto: '5.001',
    });
    expect(malo.estado).toBe(400);
  });
});
