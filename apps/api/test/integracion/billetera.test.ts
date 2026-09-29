import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const comprobante = {
  campo: 'comprobante',
  nombre: 'recarga.png',
  tipo: 'image/png',
  contenido: PNG_1X1,
};

/** Catálogo de cobros con un segundo plan (anual, 50 USD) y un cliente directo conectado. */
async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  const anual = await admin.n.post('/catalogo/planes', {
    servicioId: catalogo.servicioId,
    nombre: 'Anual',
    precioUsd: '50.00',
    duracionCantidad: 12,
    duracionUnidad: 'mes',
    beneficios: ['HD'],
  });
  expect(anual.estado).toBe(201);
  const cliente = await conectar(ctx, 'cliente');
  return {
    admin: admin.n,
    operador: operador.n,
    cliente: cliente.n,
    usuarioId: cliente.usuario.id,
    anualId: anual.cuerpo.id as string,
    ...catalogo,
  };
}
type Escenario = Awaited<ReturnType<typeof escenario>>;

function recargar(e: Escenario, n: Navegador, monto: string, campos: Record<string, string> = {}) {
  return n.formulario(
    '/mi/billetera/recargas',
    { metodoCobroId: e.zelleId, moneda: 'USD', monto, fechaPago: hoy(), ...campos },
    comprobante,
  );
}

async function conSaldo(e: Escenario, monto: string) {
  const rec = await recargar(e, e.cliente, monto);
  expect(rec.estado).toBe(201);
  const ok = await e.operador.post(`/billeteras/recargas/${rec.cuerpo.id}/confirmar`, {
    montoRecibido: monto,
  });
  expect(ok.estado).toBe(200);
  return rec.cuerpo.id as string;
}

describe('billetera del cliente', () => {
  it('una recarga confirmada suma saldo; el libro mayor guarda cada movimiento', async () => {
    const e = await escenario();
    expect((await e.cliente.get('/mi/billetera')).cuerpo).toMatchObject({
      saldoUsd: '0.00',
      recargasEnRevision: 0,
      pedidoPendiente: null,
    });
    // En bolívares: 400 VES a 40 = 10 USD, con la tasa fijada al reportar.
    const rec = await e.cliente.formulario(
      '/mi/billetera/recargas',
      {
        metodoCobroId: e.pagoMovilId,
        moneda: 'VES',
        monto: '400',
        fechaPago: hoy(),
        referenciaExterna: 'PM-778899',
      },
      comprobante,
    );
    expect(rec.estado).toBe(201);
    expect(rec.cuerpo.referencia).toMatch(/^B-[2-9A-Z]{8}$/);
    expect((await e.cliente.get('/mi/billetera')).cuerpo.recargasEnRevision).toBe(1);
    await e.admin.post('/finanzas/tasas', { moneda: 'VES', valor: '50' });

    const cola = await e.operador.get('/billeteras/recargas?estado=en_revision');
    expect(cola.cuerpo.elementos.map((r: { id: string }) => r.id)).toEqual([rec.cuerpo.id]);
    const ok = await e.operador.post(`/billeteras/recargas/${rec.cuerpo.id}/confirmar`, {
      montoRecibido: '400',
    });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo).toMatchObject({ estado: 'confirmada', montoUsd: '10.00' });
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('10.00');
    const otra = await e.operador.post(`/billeteras/recargas/${rec.cuerpo.id}/confirmar`, {
      montoRecibido: '400',
    });
    expect(otra.cuerpo.error.codigo).toBe('RECARGA_YA_REVISADA');

    // La misma referencia no se puede usar otra vez, ni en un pago de factura.
    const repetida = await e.cliente.formulario(
      '/mi/billetera/recargas',
      {
        metodoCobroId: e.pagoMovilId,
        moneda: 'VES',
        monto: '100',
        fechaPago: hoy(),
        referenciaExterna: 'pm-778899',
      },
      comprobante,
    );
    expect(repetida.cuerpo.error.codigo).toBe('REFERENCIA_REPETIDA');

    const movs = await e.cliente.get('/mi/billetera/movimientos');
    expect(movs.cuerpo.elementos).toMatchObject([
      { tipo: 'recarga', montoUsd: '10.00', saldoResultanteUsd: '10.00' },
    ]);
    // El libro mayor no se puede reescribir.
    await expect(ctx.prisma.movimientoBilletera.deleteMany({})).rejects.toThrow();
  });

  it('un rechazo no mueve el saldo; el comprobante solo lo ven su dueño y quien concilia', async () => {
    const e = await escenario();
    const rec = await recargar(e, e.cliente, '5');
    const no = await e.operador.post(`/billeteras/recargas/${rec.cuerpo.id}/rechazar`, {
      motivo: 'No llegó el pago',
    });
    expect(no.cuerpo).toMatchObject({ estado: 'rechazada', motivoRechazo: 'No llegó el pago' });
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('0.00');

    const propio = await e.cliente.descargar(`/mi/billetera/recargas/${rec.cuerpo.id}/comprobante`);
    expect(propio.estado).toBe(200);
    const intruso = await conectar(ctx, 'cliente');
    const ajeno = await intruso.n.descargar(`/mi/billetera/recargas/${rec.cuerpo.id}/comprobante`);
    expect(ajeno.estado).toBe(404);
    expect((await intruso.n.get('/billeteras/recargas')).estado).toBe(403);
    const equipo = await e.operador.descargar(`/billeteras/recargas/${rec.cuerpo.id}/comprobante`);
    expect(equipo.estado).toBe(200);
    const auditado = await ctx.prisma.auditoria.count({
      where: { accion: 'billetera.comprobante_consultado', entidadId: rec.cuerpo.id },
    });
    expect(auditado).toBe(1);
  });

  it('pagar una factura con saldo la confirma al instante y activa la suscripción', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const facturaId = alta.cuerpo.factura.id as string;
    const sinSaldo = await e.cliente.post(`/mi/facturas/${facturaId}/pagar-con-saldo`);
    expect(sinSaldo.cuerpo.error.codigo).toBe('SALDO_INSUFICIENTE');

    await conSaldo(e, '7');
    const pago = await e.cliente.post(`/mi/facturas/${facturaId}/pagar-con-saldo`);
    expect(pago.estado).toBe(200);
    // 200 VES a 40 = 5 USD.
    expect(pago.cuerpo).toEqual({ saldoUsd: '2.00' });
    const factura = await e.cliente.get(`/mi/facturas/${facturaId}`);
    expect(factura.cuerpo.estado).toBe('pagada');
    const s = await e.cliente.get(`/mi/suscripciones/${alta.cuerpo.suscripcion.id}`);
    expect(s.cuerpo.estado).toBe('activa');
    const pagos = await ctx.prisma.pago.findMany({ where: { facturaId } });
    expect(pagos).toMatchObject([
      { origen: 'billetera', metodoCobroId: null, estado: 'confirmado' },
    ]);
    const otraVez = await e.cliente.post(`/mi/facturas/${facturaId}/pagar-con-saldo`);
    expect(otraVez.cuerpo.error.codigo).toBe('FACTURA_CERRADA');
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('2.00');
  });

  it('el resumen cuenta recargas por estado y lo que entró y salió en 30 días; los movimientos se filtran por tipo', async () => {
    const e = await escenario();
    expect((await e.cliente.get('/mi/billetera')).cuerpo).toMatchObject({
      recargasPorEstado: { en_revision: 0, confirmada: 0, rechazada: 0 },
      totalMovimientos: 0,
      ultimos30Dias: { entradasUsd: '0.00', salidasUsd: '0.00' },
    });
    await conSaldo(e, '10');
    const mala = await recargar(e, e.cliente, '4');
    await e.operador.post(`/billeteras/recargas/${mala.cuerpo.id}/rechazar`, {
      motivo: 'No llegó el pago',
    });
    await recargar(e, e.cliente, '3');
    // Una factura de 200 VES a 40 = 5 USD pagada con saldo.
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const pagada = await e.cliente.post(
      `/mi/facturas/${alta.cuerpo.factura.id as string}/pagar-con-saldo`,
    );
    expect(pagada.estado).toBe(200);
    const ficha = await ctx.prisma.cliente.findFirstOrThrow({ where: { usuarioId: e.usuarioId } });
    await e.admin.post(`/billeteras/clientes/${ficha.id}/ajustes`, {
      montoUsd: '-1.5',
      motivo: 'Corrección',
    });
    // Un movimiento de hace 40 días no cuenta en las cifras del mes.
    await ctx.prisma.movimientoBilletera.create({
      data: {
        clienteId: ficha.id,
        tipo: 'ajuste',
        montoUsd: '8',
        saldoResultanteUsd: '8',
        motivo: 'Antiguo',
        creadoEn: new Date(Date.now() - 40 * 24 * 3600_000),
      },
    });

    const r = await e.cliente.get('/mi/billetera');
    expect(r.cuerpo).toMatchObject({
      saldoUsd: '3.50',
      recargasEnRevision: 1,
      recargasPorEstado: { en_revision: 1, confirmada: 1, rechazada: 1 },
      totalMovimientos: 4,
      ultimos30Dias: { entradasUsd: '10.00', salidasUsd: '6.50' },
    });

    const pagos = await e.cliente.get('/mi/billetera/movimientos?tipo=pago');
    expect(pagos.estado).toBe(200);
    expect(pagos.cuerpo).toMatchObject({
      total: 1,
      elementos: [{ tipo: 'pago', montoUsd: '-5.00' }],
    });
    expect(pagos.cuerpo.elementos[0].factura).toMatchObject({ numero: expect.any(String) });
    const ajustes = await e.cliente.get('/mi/billetera/movimientos?tipo=ajuste&porPagina=1');
    expect(ajustes.cuerpo).toMatchObject({ total: 2, porPagina: 1 });
    expect(ajustes.cuerpo.elementos).toHaveLength(1);
    const todos = await e.cliente.get('/mi/billetera/movimientos');
    expect(todos.cuerpo.total).toBe(4);
    const malo = await e.cliente.get('/mi/billetera/movimientos?tipo=retiro');
    expect(malo.estado).toBe(400);

    // Otro cliente no ve nada de esta billetera.
    const otro = await conectar(ctx, 'cliente');
    expect((await otro.n.get('/mi/billetera')).cuerpo).toMatchObject({
      recargasPorEstado: { en_revision: 0, confirmada: 0, rechazada: 0 },
      totalMovimientos: 0,
    });
    expect((await otro.n.get('/mi/billetera/movimientos?tipo=pago')).cuerpo.total).toBe(0);
  });

  it('el equipo ve el saldo y lo ajusta con motivo, sin dejarlo nunca en negativo', async () => {
    const e = await escenario();
    await conSaldo(e, '3');
    const ficha = await ctx.prisma.cliente.findFirstOrThrow({ where: { usuarioId: e.usuarioId } });
    const menos = await e.admin.post(`/billeteras/clientes/${ficha.id}/ajustes`, {
      montoUsd: '-5',
      motivo: 'Corrección de prueba',
    });
    expect(menos.cuerpo.error.codigo).toBe('SALDO_INSUFICIENTE');
    const mas = await e.admin.post(`/billeteras/clientes/${ficha.id}/ajustes`, {
      montoUsd: '2.5',
      motivo: 'Compensación por demora',
    });
    expect(mas.estado).toBe(201);
    expect(mas.cuerpo).toMatchObject({
      tipo: 'ajuste',
      montoUsd: '2.50',
      saldoResultanteUsd: '5.50',
    });
    // Quien concilia pagos no ajusta saldos.
    const sinPermiso = await e.operador.post(`/billeteras/clientes/${ficha.id}/ajustes`, {
      montoUsd: '1',
      motivo: 'Intento',
    });
    expect(sinPermiso.estado).toBe(403);
    const vista = await e.operador.get(`/billeteras/clientes/${ficha.id}`);
    expect(vista.cuerpo.saldoUsd).toBe('5.50');
    expect(vista.cuerpo.movimientos.total).toBe(2);
  });
});

describe('carrito', () => {
  it('cotiza varios planes y aplica el cupón solo al de mayor descuento', async () => {
    const e = await escenario();
    await e.admin.post('/cupones', { codigo: 'DIEZ', tipo: 'porcentaje', valor: '10' });
    const cot = await e.cliente.post('/mi/pedidos/cotizar', {
      planes: [e.planId, e.anualId],
      moneda: 'USD',
      cupon: 'diez',
    });
    expect(cot.estado).toBe(200);
    expect(cot.cuerpo).toMatchObject({
      moneda: 'USD',
      subtotal: '55.00',
      descuento: '5.00',
      total: '50.00',
      totalUsd: '50.00',
      cupon: 'DIEZ',
      saldoUsd: '0.00',
      faltanteUsd: '50.00',
    });
    expect(cot.cuerpo.lineas).toMatchObject([
      { planId: e.planId, descuento: '0.00', total: '5.00' },
      { planId: e.anualId, descuento: '5.00', total: '45.00' },
    ]);
    const malo = await e.cliente.post('/mi/pedidos/cotizar', {
      planes: [e.planId],
      moneda: 'USD',
      cupon: 'NOEXISTE',
    });
    expect(malo.cuerpo.error.codigo).toBe('CUPON_NO_VALIDO');
    const repetido = await e.cliente.post('/mi/pedidos/cotizar', {
      planes: [e.planId, e.planId],
      moneda: 'USD',
    });
    expect(repetido.estado).toBe(400);
  });

  it('pagar con saldo crea y paga todo el pedido; si no alcanza no crea nada', async () => {
    const e = await escenario();
    await conSaldo(e, '20');
    const corto = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId, e.anualId],
      moneda: 'USD',
      pago: 'billetera',
    });
    expect(corto.cuerpo.error.codigo).toBe('SALDO_INSUFICIENTE');
    expect(await ctx.prisma.suscripcion.count()).toBe(0);
    expect(await ctx.prisma.pedido.count()).toBe(0);

    await conSaldo(e, '40');
    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId, e.anualId],
      moneda: 'VES',
      pago: 'billetera',
    });
    expect(pedido.estado).toBe(201);
    expect(pedido.cuerpo).toMatchObject({
      numero: 'PED-000001',
      estado: 'pagado',
      moneda: 'VES',
      total: '2200.00',
      totalUsd: '55.00',
      pendienteUsd: '0.00',
    });
    expect(pedido.cuerpo.facturas).toHaveLength(2);
    // Cada factura dice qué plan y servicio cobra (la web lo muestra con su imagen).
    expect(pedido.cuerpo.facturas.map((f: { plan: { id: string } | null }) => f.plan?.id)).toEqual([
      e.planId,
      e.anualId,
    ]);
    expect(pedido.cuerpo.facturas[1].plan).toMatchObject({
      nombre: 'Anual',
      servicio: { slug: expect.any(String), nombre: expect.any(String) },
    });
    expect(pedido.cuerpo.facturas[0]).toMatchObject({ vencida: false, ultimoPago: 'confirmado' });
    // La factura sabe a qué pedido pertenece y qué plan cobra (página de pago).
    const factura = await e.cliente.get(`/mi/facturas/${pedido.cuerpo.facturas[0].id}`);
    expect(factura.cuerpo).toMatchObject({ pedidoId: pedido.cuerpo.id, plan: { id: e.planId } });
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('5.00');
    const activas = await ctx.prisma.suscripcion.count({ where: { estado: 'activa' } });
    expect(activas).toBe(2);
    const movs = await e.cliente.get('/mi/billetera/movimientos');
    expect(movs.cuerpo.elementos.filter((m: { tipo: string }) => m.tipo === 'pago')).toHaveLength(
      2,
    );
  });

  it('"recargar y pagar": al confirmar la recarga se paga el pedido en espera', async () => {
    const e = await escenario();
    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId, e.anualId],
      moneda: 'USD',
      pago: 'recarga',
    });
    expect(pedido.cuerpo).toMatchObject({ estado: 'pendiente', pagarAlRecargar: true });
    // Solo un pedido pendiente a la vez.
    const otro = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId],
      moneda: 'USD',
      pago: 'facturas',
    });
    expect(otro.cuerpo.error.codigo).toBe('PEDIDO_PENDIENTE');
    expect((await e.cliente.get('/mi/billetera')).cuerpo.pedidoPendiente.id).toBe(pedido.cuerpo.id);

    // La primera recarga solo alcanza para una factura: paga la que puede.
    await conSaldo(e, '10');
    const parcial = await e.cliente.get(`/mi/pedidos/${pedido.cuerpo.id}`);
    expect(parcial.cuerpo).toMatchObject({ estado: 'pendiente', pendienteUsd: '50.00' });
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('5.00');

    await conSaldo(e, '45');
    const listo = await e.cliente.get(`/mi/pedidos/${pedido.cuerpo.id}`);
    expect(listo.cuerpo).toMatchObject({ estado: 'pagado', pendienteUsd: '0.00' });
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('0.00');
    const correos = await ctx.prisma.correoSaliente.count({
      where: { plantilla: 'pagoConfirmado' },
    });
    expect(correos).toBe(2);
  });

  it('una recarga ligada a un pedido lo marca para pagarse al confirmarla', async () => {
    const e = await escenario();
    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId],
      moneda: 'USD',
      pago: 'facturas',
    });
    expect(pedido.cuerpo.pagarAlRecargar).toBe(false);
    const rec = await recargar(e, e.cliente, '5', { pedidoId: pedido.cuerpo.id });
    expect(rec.estado).toBe(201);
    await e.operador.post(`/billeteras/recargas/${rec.cuerpo.id}/confirmar`, {
      montoRecibido: '5',
    });
    const listo = await e.cliente.get(`/mi/pedidos/${pedido.cuerpo.id}`);
    expect(listo.cuerpo.estado).toBe('pagado');
  });

  it('cancelar un pedido cancela sus suscripciones pendientes y libera el cupón', async () => {
    const e = await escenario();
    await e.admin.post('/cupones', { codigo: 'UNO', tipo: 'monto', valor: '1', usosMaximos: 1 });
    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId, e.anualId],
      moneda: 'USD',
      cupon: 'UNO',
      pago: 'facturas',
    });
    expect(pedido.estado).toBe(201);
    const no = await e.cliente.post(`/mi/pedidos/${pedido.cuerpo.id}/cancelar`);
    expect(no.estado).toBe(200);
    expect(no.cuerpo.estado).toBe('anulado');
    expect(await ctx.prisma.suscripcion.count({ where: { estado: 'cancelada' } })).toBe(2);
    const cupon = await ctx.prisma.cupon.findFirstOrThrow({ where: { codigo: 'UNO' } });
    expect(cupon.usos).toBe(0);
    // Otro cliente no ve ni cancela pedidos ajenos.
    const intruso = await conectar(ctx, 'cliente');
    expect((await intruso.n.get(`/mi/pedidos/${pedido.cuerpo.id}`)).estado).toBe(404);
  });
});

/**
 * Liga al cliente del escenario a un revendedor aprobado con saldo propio y un
 * precio mayorista de 3 USD para el plan mensual (que al público cuesta 5 USD).
 */
async function deRevendedor(e: Escenario) {
  await e.cliente.get('/mi/billetera');
  const ficha = await ctx.prisma.cliente.findFirstOrThrow({ where: { usuarioId: e.usuarioId } });
  const rev = await conectar(ctx, 'revendedor');
  const nivel = await ctx.prisma.nivelRevendedor.create({ data: { nombre: 'Plata' } });
  await ctx.prisma.precioMayorista.create({
    data: { planId: e.planId, nivelId: nivel.id, precioUsd: '3' },
  });
  const revendedor = await ctx.prisma.revendedor.create({
    data: {
      usuarioId: rev.usuario.id,
      nombreComercial: 'Tienda Luna',
      estado: 'aprobado',
      nivelId: nivel.id,
      saldoUsd: '25',
    },
  });
  await ctx.prisma.cliente.update({
    where: { id: ficha.id },
    data: { revendedorId: revendedor.id },
  });
  return { clienteId: ficha.id, revendedorId: revendedor.id };
}

describe('clientes de un revendedor', () => {
  it('recargan su billetera y compran en el carrito al precio público; el saldo del revendedor no cambia', async () => {
    const e = await escenario();
    const { clienteId, revendedorId } = await deRevendedor(e);

    expect((await e.cliente.get('/mi/billetera')).cuerpo).toMatchObject({
      saldoUsd: '0.00',
      pedidoPendiente: null,
    });
    await conSaldo(e, '20');
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('20.00');

    // Precio público (5 USD), nunca el mayorista del nivel de su revendedor (3 USD).
    const cot = await e.cliente.post('/mi/pedidos/cotizar', { planes: [e.planId], moneda: 'USD' });
    expect(cot.estado).toBe(200);
    expect(cot.cuerpo).toMatchObject({ total: '5.00', totalUsd: '5.00', saldoUsd: '20.00' });

    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId],
      moneda: 'USD',
      pago: 'billetera',
    });
    expect(pedido.estado).toBe(201);
    expect(pedido.cuerpo).toMatchObject({ estado: 'pagado', totalUsd: '5.00' });
    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('15.00');

    // La compra es suya: sin revendedor, y la renueva y cancela él.
    const s = await ctx.prisma.suscripcion.findFirstOrThrow({ where: { clienteId } });
    expect(s).toMatchObject({ estado: 'activa', revendedorId: null });
    const vista = await e.cliente.get(`/mi/suscripciones/${s.id}`);
    expect(vista.cuerpo.gestionadaPorRevendedor).toBe(false);
    const ren = await e.cliente.post(`/mi/suscripciones/${s.id}/renovar`, {});
    expect(ren.estado).toBe(200);
    const pagoRen = await e.cliente.post(`/mi/facturas/${ren.cuerpo.factura.id}/pagar-con-saldo`);
    expect(pagoRen.cuerpo).toEqual({ saldoUsd: '10.00' });

    // El saldo del revendedor y su libro mayor quedan intactos: son cuentas aparte.
    const r = await ctx.prisma.revendedor.findUniqueOrThrow({ where: { id: revendedorId } });
    expect(r.saldoUsd.toFixed(2)).toBe('25.00');
    expect(await ctx.prisma.movimientoSaldo.count()).toBe(0);
    expect(await ctx.prisma.compraRevendedor.count()).toBe(0);
    const movs = await ctx.prisma.movimientoBilletera.findMany({
      where: { clienteId },
      orderBy: { creadoEn: 'asc' },
    });
    expect(movs.map((m) => [m.tipo, m.montoUsd.toFixed(2)])).toEqual([
      ['recarga', '20.00'],
      ['pago', '-5.00'],
      ['pago', '-5.00'],
    ]);
  });

  it('lo que activó su revendedor no lo renueva, cancela ni paga el cliente', async () => {
    const e = await escenario();
    const { clienteId, revendedorId } = await deRevendedor(e);
    await conSaldo(e, '20');
    const s = await ctx.prisma.suscripcion.create({
      data: {
        clienteId,
        planId: e.planId,
        moneda: 'USD',
        revendedorId,
        estado: 'activa',
        inicioEn: new Date(Date.now() - 25 * 24 * 3600_000),
        venceEn: new Date(Date.now() + 5 * 24 * 3600_000),
      },
    });
    const vista = await e.cliente.get(`/mi/suscripciones/${s.id}`);
    expect(vista.cuerpo.gestionadaPorRevendedor).toBe(true);

    for (const ruta of ['renovar', 'cancelar', 'revertir-cancelacion']) {
      const r = await e.cliente.post(
        `/mi/suscripciones/${s.id}/${ruta}`,
        ruta === 'cancelar' ? { motivo: 'Ya no lo uso' } : {},
      );
      expect(r.estado).toBe(403);
      expect(r.cuerpo.error.codigo).toBe('GESTIONA_REVENDEDOR');
    }

    // Si el equipo le emite una factura, el cliente no la paga ni la ve como pendiente suya.
    const ren = await e.admin.post(`/suscripciones/${s.id}/renovar`, {});
    expect(ren.estado).toBe(200);
    const facturaId = ren.cuerpo.factura.id as string;
    const factura = await e.cliente.get(`/mi/facturas/${facturaId}`);
    expect(factura.cuerpo.gestionadaPorRevendedor).toBe(true);
    const conSaldoNo = await e.cliente.post(`/mi/facturas/${facturaId}/pagar-con-saldo`);
    expect(conSaldoNo.cuerpo.error.codigo).toBe('GESTIONA_REVENDEDOR');
    const reporte = await e.cliente.formulario(
      `/mi/facturas/${facturaId}/pagos`,
      { metodoCobroId: e.zelleId, monto: '5', fechaPago: hoy() },
      comprobante,
    );
    expect(reporte.cuerpo.error.codigo).toBe('GESTIONA_REVENDEDOR');
    const recotizar = await e.cliente.post(`/mi/facturas/${facturaId}/recotizar`, {
      moneda: 'VES',
    });
    expect(recotizar.cuerpo.error.codigo).toBe('GESTIONA_REVENDEDOR');
    expect((await e.cliente.get('/mi/panel')).cuerpo).toMatchObject({
      revendedor: { nombre: 'Tienda Luna' },
      pendientes: { facturasPorPagar: 0 },
    });

    expect((await e.cliente.get('/mi/billetera')).cuerpo.saldoUsd).toBe('20.00');
    expect(await ctx.prisma.pago.count({ where: { facturaId } })).toBe(0);
    const intacta = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: s.id } });
    expect(intacta).toMatchObject({ estado: 'activa', cancelarAlVencer: false });
    // El equipo sí puede gestionarla.
    const anular = await e.admin.post(`/facturas/${facturaId}/anular`, { motivo: 'Prueba' });
    expect(anular.estado).toBe(200);
  });

  it('los avisos de su billetera le llegan como a cualquier cliente', async () => {
    const e = await escenario();
    const { clienteId } = await deRevendedor(e);
    const { correo } = await ctx.prisma.usuario.findUniqueOrThrow({ where: { id: e.usuarioId } });
    const avisos = () =>
      ctx.prisma.correoSaliente.count({ where: { para: correo, plantilla: 'pagoConfirmado' } });

    // "Recargar y pagar": al confirmar la recarga se paga el pedido y se le avisa.
    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId],
      moneda: 'USD',
      pago: 'recarga',
    });
    expect(pedido.cuerpo).toMatchObject({ estado: 'pendiente', pagarAlRecargar: true });
    await conSaldo(e, '10');
    expect((await e.cliente.get(`/mi/pedidos/${pedido.cuerpo.id}`)).cuerpo.estado).toBe('pagado');
    expect(await avisos()).toBe(1);

    // Pagar con el saldo la renovación de lo que compró él también se le avisa.
    const s = await ctx.prisma.suscripcion.findFirstOrThrow({ where: { clienteId } });
    const ren = await e.cliente.post(`/mi/suscripciones/${s.id}/renovar`, {});
    expect(ren.estado).toBe(200);
    const pago = await e.cliente.post(`/mi/facturas/${ren.cuerpo.factura.id}/pagar-con-saldo`);
    expect(pago.cuerpo).toEqual({ saldoUsd: '0.00' });
    expect(await avisos()).toBe(2);
    // Ningún aviso a su nombre quedó retenido por tener revendedor.
    const omitidas = await ctx.prisma.notificacion.count({
      where: { clienteId, estado: 'omitida' },
    });
    expect(omitidas).toBe(0);
  });

  it('un cliente archivado, con o sin revendedor, no recarga ni compra', async () => {
    const e = await escenario();
    const { clienteId } = await deRevendedor(e);
    await ctx.prisma.cliente.update({ where: { id: clienteId }, data: { estado: 'archivado' } });
    const cot = await e.cliente.post('/mi/pedidos/cotizar', { planes: [e.planId], moneda: 'USD' });
    expect(cot.cuerpo.error.codigo).toBe('CLIENTE_ARCHIVADO');
    const pedido = await e.cliente.post('/mi/pedidos', {
      planes: [e.planId],
      moneda: 'USD',
      pago: 'facturas',
    });
    expect(pedido.cuerpo.error.codigo).toBe('CLIENTE_ARCHIVADO');
    expect((await recargar(e, e.cliente, '5')).cuerpo.error.codigo).toBe('CLIENTE_ARCHIVADO');
    expect(await ctx.prisma.recargaBilletera.count()).toBe(0);
    expect(await ctx.prisma.pedido.count()).toBe(0);
  });
});
