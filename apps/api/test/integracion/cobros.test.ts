import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SuscripcionesService } from '../../src/suscripciones/suscripciones.service.js';
import {
  conectar,
  type Contexto,
  crearContexto,
  hoy,
  limpiar,
  Navegador,
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

const DIA = 24 * 3600_000;

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const cliente = await conectar(ctx, 'cliente');
  const catalogo = await prepararCatalogo(admin.n);
  return {
    admin: admin.n,
    operador: operador.n,
    cliente: cliente.n,
    clienteUsuario: cliente.usuario,
    ...catalogo,
  };
}

const comprobante = {
  campo: 'comprobante',
  nombre: 'pago.png',
  tipo: 'image/png',
  contenido: PNG_1X1,
};

async function reportar(
  n: Navegador,
  facturaId: string,
  metodoCobroId: string,
  monto: string,
  referencia = `REF${Math.floor(Math.random() * 1e9)}`,
) {
  return n.formulario(
    `/mi/facturas/${facturaId}/pagos`,
    { metodoCobroId, monto, referenciaExterna: referencia, fechaPago: hoy() },
    comprobante,
  );
}

describe('catálogo y monedas', () => {
  it('muestra el precio en USD y lo convierte con la tasa vigente', async () => {
    await escenario();
    const r = await new Navegador(ctx.app).get('/catalogo');
    expect(r.estado).toBe(200);
    const plan = r.cuerpo.planes[0];
    expect(plan.precios.USD).toEqual({ precio: '5.00', fijo: false });
    expect(plan.precios.VES).toEqual({ precio: '200.00', fijo: false });
    expect(plan.precios.ARS).toBeNull();
    expect(r.cuerpo.monedas).toEqual(['VES', 'USD']);
  });

  it('un precio fijo ignora la tasa y los pesos colombianos se redondean sin decimales', async () => {
    const e = await escenario();
    await e.admin.post('/finanzas/tasas', { moneda: 'COP', valor: '4012.37' });
    const fijo = await e.admin.pedir('PUT', `/catalogo/planes/${e.planId}/precio`, {
      moneda: 'EUR',
      precio: '4,90',
    });
    expect(fijo.estado).toBe(200);
    expect(fijo.cuerpo.precios.EUR).toEqual({ precio: '4.90', fijo: true });
    expect(fijo.cuerpo.precios.COP).toEqual({ precio: '20062.00', fijo: false });
    const quitar = await e.admin.pedir('PUT', `/catalogo/planes/${e.planId}/precio`, {
      moneda: 'EUR',
      precio: null,
    });
    expect(quitar.cuerpo.precios.EUR).toBeNull();
    const detalle = await e.admin.get(`/catalogo/planes/${e.planId}`);
    expect(detalle.cuerpo.historial.map((h: { moneda: string }) => h.moneda)).toEqual([
      'EUR',
      'EUR',
      'USD',
    ]);
  });

  it('solo administración registra tasas y edita el catálogo', async () => {
    const e = await escenario();
    expect((await e.operador.post('/finanzas/tasas', { moneda: 'VES', valor: '41' })).estado).toBe(
      403,
    );
    expect(
      (await e.operador.post('/catalogo/proveedores', { nombre: 'X', tipo: 'propio' })).estado,
    ).toBe(403);
    expect((await e.cliente.get('/catalogo/planes')).estado).toBe(403);
    expect((await e.admin.post('/finanzas/tasas', { moneda: 'USD', valor: '1' })).estado).toBe(400);
    expect((await e.admin.post('/finanzas/tasas', { moneda: 'VES', valor: '-3' })).estado).toBe(
      400,
    );
  });

  it('un plan oculto no aparece en el sitio ni lo puede contratar el cliente', async () => {
    const e = await escenario();
    await e.admin.patch(`/catalogo/planes/${e.planId}`, { visible: false });
    expect((await e.cliente.get('/catalogo')).cuerpo.planes).toHaveLength(0);
    const r = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.error.codigo).toBe('PLAN_NO_DISPONIBLE');
  });
});

describe('alta, pago manual y conciliación', () => {
  it('flujo completo en bolívares con cupón: contratar, reportar, conciliar y activar', async () => {
    const e = await escenario();
    await e.admin.post('/cupones', { codigo: 'bienvenida10', tipo: 'porcentaje', valor: '10' });

    const cot = await e.cliente.post('/mi/cotizar', {
      planId: e.planId,
      moneda: 'VES',
      cupon: 'BIENVENIDA10',
    });
    expect(cot.cuerpo).toEqual({
      moneda: 'VES',
      subtotal: '200.00',
      descuento: '20.00',
      total: '180.00',
      cupon: 'BIENVENIDA10',
    });

    const alta = await e.cliente.post('/mi/suscripciones', {
      planId: e.planId,
      moneda: 'VES',
      cupon: 'bienvenida10',
    });
    expect(alta.estado).toBe(201);
    expect(alta.cuerpo.suscripcion.estado).toBe('pendiente_pago');
    const facturaId = alta.cuerpo.factura.id;

    const factura = await e.cliente.get(`/mi/facturas/${facturaId}`);
    expect(factura.cuerpo).toMatchObject({
      numero: 'NV-000001',
      estado: 'emitida',
      moneda: 'VES',
      subtotal: '200.00',
      descuento: '20.00',
      total: '180.00',
      totalUsd: '4.50',
      cupon: 'BIENVENIDA10',
    });
    const metodos = await e.cliente.get('/mi/metodos-cobro?moneda=VES');
    expect(metodos.cuerpo.map((m: { nombre: string }) => m.nombre)).toEqual(['Pago Móvil']);

    const pago = await reportar(e.cliente, facturaId, e.pagoMovilId, '180', 'REF-0001');
    expect(pago.estado).toBe(201);
    expect(pago.cuerpo).toMatchObject({
      estado: 'en_revision',
      montoDeclarado: '180.00',
      tieneComprobante: true,
    });
    expect(pago.cuerpo.referencia).toMatch(/^P-[2-9A-Z]{8}$/);
    expect(pago.cuerpo).not.toHaveProperty('notasConciliacion');

    const cola = await e.operador.get('/pagos?estado=en_revision');
    expect(cola.cuerpo.total).toBe(1);

    const corto = await e.operador.post(`/pagos/${pago.cuerpo.id}/confirmar`, {
      montoRecibido: '150',
    });
    expect(corto.estado).toBe(409);
    expect(corto.cuerpo.error.codigo).toBe('MONTO_INSUFICIENTE');

    const ok = await e.operador.post(`/pagos/${pago.cuerpo.id}/confirmar`, {
      montoRecibido: '180.00',
      notas: 'Visto en el banco',
    });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo).toMatchObject({
      estado: 'confirmado',
      montoRecibido: '180.00',
      notasConciliacion: 'Visto en el banco',
    });

    const s = await e.cliente.get(`/mi/suscripciones/${alta.cuerpo.suscripcion.id}`);
    expect(s.cuerpo.estado).toBe('activa');
    const vence = new Date(s.cuerpo.venceEn).getTime();
    expect(vence - Date.now()).toBeGreaterThan(27 * DIA);
    expect(vence - Date.now()).toBeLessThan(32 * DIA);
    expect(s.cuerpo.eventos.map((x: { tipo: string }) => x.tipo)).toEqual(['activacion', 'alta']);

    expect((await e.cliente.get(`/mi/facturas/${facturaId}`)).cuerpo.estado).toBe('pagada');
    const correo = await ctx.prisma.correoSaliente.findFirst({
      where: { plantilla: 'pagoConfirmado' },
    });
    expect(correo?.texto).toContain('NV-000001');

    const acciones = (await ctx.prisma.auditoria.findMany({ orderBy: { fecha: 'asc' } })).map(
      (a) => a.accion,
    );
    expect(acciones).toEqual(
      expect.arrayContaining(['suscripcion.creada', 'pago.reportado', 'pago.confirmado']),
    );

    const metricas = await e.admin.get('/metricas/panel');
    expect(metricas.cuerpo).toMatchObject({
      ingresoMensualRecurrenteUsd: '5.00',
      ingresosMes: [{ moneda: 'VES', total: '180.00', pagos: 1 }],
      ingresosMesUsd: '4.50',
      // Tasa VES = 40: todo se muestra también en bolívares.
      enBolivares: { tasa: '40.00', ingresoMensualRecurrente: '200.00', ingresosMes: '180.00' },
      pagosEnRevision: 0,
    });
    expect(metricas.cuerpo.suscripcionesPorEstado.activa).toBe(1);
  });

  it('valida el comprobante, el método, la referencia y un solo pago en revisión', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const f = alta.cuerpo.factura.id;
    const base = {
      metodoCobroId: e.pagoMovilId,
      monto: '200',
      referenciaExterna: 'ABC123',
      fechaPago: hoy(),
    };

    const sinArchivo = await e.cliente.formulario(`/mi/facturas/${f}/pagos`, base);
    expect(sinArchivo.estado).toBe(400);
    expect(sinArchivo.cuerpo.error.campos.comprobante).toBeDefined();

    const falso = await e.cliente.formulario(`/mi/facturas/${f}/pagos`, base, {
      ...comprobante,
      contenido: Buffer.from('<script>alert(1)</script>'),
    });
    expect(falso.estado).toBe(415);

    const otraMoneda = await e.cliente.formulario(
      `/mi/facturas/${f}/pagos`,
      { ...base, metodoCobroId: e.zelleId },
      comprobante,
    );
    expect(otraMoneda.estado).toBe(400);
    expect(otraMoneda.cuerpo.error.campos.metodoCobroId).toBeDefined();

    const sinRef = await e.cliente.formulario(
      `/mi/facturas/${f}/pagos`,
      { ...base, referenciaExterna: '' },
      comprobante,
    );
    expect(sinRef.estado).toBe(400);

    const futuro = await e.cliente.formulario(
      `/mi/facturas/${f}/pagos`,
      { ...base, fechaPago: new Date(Date.now() + 5 * DIA).toISOString() },
      comprobante,
    );
    expect(futuro.estado).toBe(400);

    expect((await e.cliente.formulario(`/mi/facturas/${f}/pagos`, base, comprobante)).estado).toBe(
      201,
    );
    const segundo = await e.cliente.formulario(
      `/mi/facturas/${f}/pagos`,
      { ...base, referenciaExterna: 'OTRA' },
      comprobante,
    );
    expect(segundo.estado).toBe(409);
    expect(segundo.cuerpo.error.codigo).toBe('PAGO_EN_REVISION');

    // Otra persona no puede reutilizar la misma referencia bancaria.
    const otro = await conectar(ctx, 'cliente');
    const alta2 = await otro.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const repetida = await otro.n.formulario(
      `/mi/facturas/${alta2.cuerpo.factura.id}/pagos`,
      base,
      comprobante,
    );
    expect(repetida.estado).toBe(409);
    expect(repetida.cuerpo.error.codigo).toBe('REFERENCIA_REPETIDA');
  });

  it('un rechazo avisa al cliente y le deja reportar de nuevo', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const f = alta.cuerpo.factura.id;
    const p1 = await reportar(e.cliente, f, e.pagoMovilId, '200');
    const rechazo = await e.operador.post(`/pagos/${p1.cuerpo.id}/rechazar`, {
      motivo: 'La referencia no aparece en el banco.',
    });
    expect(rechazo.cuerpo.estado).toBe('rechazado');
    expect(
      (await e.operador.post(`/pagos/${p1.cuerpo.id}/confirmar`, { montoRecibido: '200' })).cuerpo
        .error.codigo,
    ).toBe('PAGO_YA_REVISADO');
    const correo = await ctx.prisma.correoSaliente.findFirst({
      where: { plantilla: 'pagoRechazado' },
    });
    expect(correo?.texto).toContain('La referencia no aparece en el banco.');
    expect((await reportar(e.cliente, f, e.pagoMovilId, '200')).estado).toBe(201);
  });

  it('dos confirmaciones simultáneas del mismo pago: solo una gana', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const p = await reportar(e.cliente, alta.cuerpo.factura.id, e.pagoMovilId, '200');
    const otro = new Navegador(ctx.app);
    otro.cookie = e.operador.cookie;
    const [a, b] = await Promise.all([
      e.operador.post(`/pagos/${p.cuerpo.id}/confirmar`, { montoRecibido: '200' }),
      otro.post(`/pagos/${p.cuerpo.id}/confirmar`, { montoRecibido: '200' }),
    ]);
    expect([a.estado, b.estado].sort()).toEqual([200, 409]);
    expect(await ctx.prisma.pago.count({ where: { estado: 'confirmado' } })).toBe(1);
    const eventos = await ctx.prisma.eventoSuscripcion.count({ where: { tipo: 'activacion' } });
    expect(eventos).toBe(1);
  });

  it('el comprobante solo lo ven su dueño y el equipo, sin que el navegador lo ejecute', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const p = await reportar(e.cliente, alta.cuerpo.factura.id, e.pagoMovilId, '200');
    const propio = await e.cliente.descargar(`/mi/pagos/${p.cuerpo.id}/comprobante`);
    expect(propio.estado).toBe(200);
    expect(propio.cabeceras['content-type']).toBe('image/png');
    expect(String(propio.cabeceras['content-security-policy'])).toContain('sandbox');
    expect(propio.cabeceras['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(propio.cuerpo, PNG_1X1)).toBe(0);

    expect((await e.operador.descargar(`/pagos/${p.cuerpo.id}/comprobante`)).estado).toBe(200);
    const ajeno = await conectar(ctx, 'cliente');
    expect((await ajeno.n.descargar(`/mi/pagos/${p.cuerpo.id}/comprobante`)).estado).toBe(404);
    expect((await ajeno.n.get(`/mi/facturas/${alta.cuerpo.factura.id}`)).estado).toBe(404);
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.descargar(`/pagos/${p.cuerpo.id}/comprobante`)).estado).toBe(403);
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'pago.comprobante_consultado' } }),
    ).toBe(1);
  });

  it('el equipo registra un pago recibido y la factura queda pagada al instante', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const r = await e.operador.formulario(`/facturas/${alta.cuerpo.factura.id}/pagos`, {
      metodoCobroId: e.zelleId,
      monto: '5',
      fechaPago: hoy(),
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.estado).toBe('confirmado');
    expect(
      (await e.cliente.get(`/mi/suscripciones/${alta.cuerpo.suscripcion.id}`)).cuerpo.estado,
    ).toBe('activa');
    expect(
      (await e.cliente.formulario(`/facturas/${alta.cuerpo.factura.id}/pagos`, {})).estado,
    ).toBe(403);
  });
});

describe('renovación, pausa, cancelación y vencimientos', () => {
  async function activa(e: Awaited<ReturnType<typeof escenario>>) {
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    await e.operador.formulario(`/facturas/${alta.cuerpo.factura.id}/pagos`, {
      metodoCobroId: e.zelleId,
      monto: '5',
      fechaPago: hoy(),
    });
    return alta.cuerpo.suscripcion.id as string;
  }

  it('renovar extiende desde el vencimiento actual, no desde hoy', async () => {
    const e = await escenario();
    const id = await activa(e);
    const antes = new Date((await e.cliente.get(`/mi/suscripciones/${id}`)).cuerpo.venceEn);
    const ren = await e.cliente.post(`/mi/suscripciones/${id}/renovar`, {});
    expect(ren.estado).toBe(200);
    expect((await e.cliente.post(`/mi/suscripciones/${id}/renovar`, {})).cuerpo.error.codigo).toBe(
      'FACTURA_ABIERTA',
    );
    await e.operador.formulario(`/facturas/${ren.cuerpo.factura.id}/pagos`, {
      metodoCobroId: e.zelleId,
      monto: '5',
      fechaPago: hoy(),
    });
    const despues = new Date((await e.cliente.get(`/mi/suscripciones/${id}`)).cuerpo.venceEn);
    expect(despues.getUTCMonth()).toBe((antes.getUTCMonth() + 1) % 12);
    expect(despues.getTime() - antes.getTime()).toBeGreaterThan(27 * DIA);
  });

  it('pausar guarda el tiempo restante y reanudar lo devuelve; el cliente no puede pausar', async () => {
    const e = await escenario();
    const id = await activa(e);
    expect((await e.cliente.post(`/suscripciones/${id}/pausar`, { motivo: 'viaje' })).estado).toBe(
      403,
    );
    const vence = new Date((await e.operador.get(`/suscripciones/${id}`)).cuerpo.venceEn).getTime();
    const p = await e.operador.post(`/suscripciones/${id}/pausar`, {
      motivo: 'Pedido del cliente',
    });
    expect(p.cuerpo.estado).toBe('pausada');
    expect((await e.operador.post(`/suscripciones/${id}/renovar`, {})).cuerpo.error.codigo).toBe(
      'TRANSICION_NO_PERMITIDA',
    );
    const r = await e.operador.post(`/suscripciones/${id}/reanudar`, {});
    expect(r.cuerpo.estado).toBe('activa');
    expect(Math.abs(new Date(r.cuerpo.venceEn).getTime() - vence)).toBeLessThan(5_000);
  });

  it('la cancelación del cliente espera al vencimiento y la pasada de vencimientos la aplica', async () => {
    const e = await escenario();
    const id = await activa(e);
    const c = await e.cliente.post(`/mi/suscripciones/${id}/cancelar`, { motivo: 'Ya no lo uso' });
    expect(c.cuerpo).toMatchObject({ estado: 'activa', cancelarAlVencer: true });
    expect((await e.cliente.post(`/mi/suscripciones/${id}/renovar`, {})).estado).toBe(409);
    const servicio = ctx.app.get(SuscripcionesService);
    expect(await servicio.aplicarVencimientos(new Date(Date.now() + 40 * DIA))).toBe(1);
    expect((await e.cliente.get(`/mi/suscripciones/${id}`)).cuerpo.estado).toBe('cancelada');
  });

  it('sin pago pasa a gracia, luego a suspendida y a vencida; pagar la recupera', async () => {
    const e = await escenario();
    const id = await activa(e);
    const servicio = ctx.app.get(SuscripcionesService);
    const vence = new Date(
      (await e.cliente.get(`/mi/suscripciones/${id}`)).cuerpo.venceEn,
    ).getTime();
    await servicio.aplicarVencimientos(new Date(vence + 1000));
    expect((await e.operador.get(`/suscripciones/${id}`)).cuerpo.estado).toBe('en_gracia');
    await servicio.aplicarVencimientos(new Date(vence + 6 * DIA));
    expect((await e.operador.get(`/suscripciones/${id}`)).cuerpo.estado).toBe('suspendida');
    await servicio.aplicarVencimientos(new Date(vence + 40 * DIA));
    expect((await e.operador.get(`/suscripciones/${id}`)).cuerpo.estado).toBe('vencida');
    const ren = await e.cliente.post(`/mi/suscripciones/${id}/renovar`, {});
    await e.operador.formulario(`/facturas/${ren.cuerpo.factura.id}/pagos`, {
      metodoCobroId: e.zelleId,
      monto: '5',
      fechaPago: hoy(),
    });
    const s = await e.operador.get(`/suscripciones/${id}`);
    expect(s.cuerpo.estado).toBe('activa');
    expect(s.cuerpo.eventos[0].tipo).toBe('recuperacion');
  });

  it('cancelar un alta sin pagar anula su factura y libera el cupón', async () => {
    const e = await escenario();
    await e.admin.post('/cupones', { codigo: 'UNICO', tipo: 'monto', valor: '1', usosMaximos: 1 });
    const alta = await e.cliente.post('/mi/suscripciones', {
      planId: e.planId,
      moneda: 'VES',
      cupon: 'UNICO',
    });
    expect(alta.estado).toBe(201);
    // Monto en USD convertido con la tasa: 1 USD = 40 VES.
    expect((await e.cliente.get(`/mi/facturas/${alta.cuerpo.factura.id}`)).cuerpo.descuento).toBe(
      '40.00',
    );
    const otro = await conectar(ctx, 'cliente');
    expect(
      (await otro.n.post('/mi/cotizar', { planId: e.planId, moneda: 'VES', cupon: 'UNICO' })).cuerpo
        .error.codigo,
    ).toBe('CUPON_AGOTADO');
    await e.cliente.post(`/mi/suscripciones/${alta.cuerpo.suscripcion.id}/cancelar`, {
      motivo: 'Me equivoqué',
    });
    expect((await e.cliente.get(`/mi/facturas/${alta.cuerpo.factura.id}`)).cuerpo.estado).toBe(
      'anulada',
    );
    expect(
      (await otro.n.post('/mi/cotizar', { planId: e.planId, moneda: 'VES', cupon: 'UNICO' }))
        .estado,
    ).toBe(200);
  });

  it('un plan gratuito se activa sin pasar por caja y hay un límite de altas pendientes', async () => {
    const e = await escenario();
    await e.admin.patch(`/catalogo/planes/${e.planId}`, { precioUsd: '0' });
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(alta.cuerpo.factura.estado).toBe('pagada');
    expect(alta.cuerpo.suscripcion.estado).toBe('activa');
    await e.admin.patch(`/catalogo/planes/${e.planId}`, { precioUsd: '5' });
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' })).estado,
      ).toBe(201);
    }
    const cuarta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(cuarta.cuerpo.error.codigo).toBe('DEMASIADAS_PENDIENTES');
  });

  it('recotizar aplica la tasa nueva y anular un alta cancela su suscripción (solo admin)', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'VES' });
    const f = alta.cuerpo.factura.id;
    await e.admin.post('/finanzas/tasas', { moneda: 'VES', valor: '45.5' });
    const r = await e.cliente.post(`/mi/facturas/${f}/recotizar`, { moneda: 'VES' });
    expect(r.cuerpo).toMatchObject({ total: '227.50', tasa: '45.500000', totalUsd: '5.00' });
    const usd = await e.cliente.post(`/mi/facturas/${f}/recotizar`, { moneda: 'USD' });
    expect(usd.cuerpo).toMatchObject({ moneda: 'USD', total: '5.00' });
    expect((await e.operador.post(`/facturas/${f}/anular`, { motivo: 'Duplicada' })).estado).toBe(
      403,
    );
    const an = await e.admin.post(`/facturas/${f}/anular`, { motivo: 'Duplicada' });
    expect(an.cuerpo.estado).toBe('anulada');
    expect(
      (await e.cliente.get(`/mi/suscripciones/${alta.cuerpo.suscripcion.id}`)).cuerpo.estado,
    ).toBe('cancelada');
  });
});

describe('cupones y cartera de ventas', () => {
  it('ventas crea cupones con límite y solo desactiva los suyos', async () => {
    const e = await escenario();
    const ventas = await conectar(ctx, 'ventas');
    const alto = await ventas.n.post('/cupones', {
      codigo: 'MITAD',
      tipo: 'porcentaje',
      valor: '50',
      usosMaximos: 5,
    });
    expect(alto.estado).toBe(403);
    const monto = await ventas.n.post('/cupones', {
      codigo: 'CINCO',
      tipo: 'monto',
      valor: '5',
      usosMaximos: 5,
    });
    expect(monto.estado).toBe(403);
    const sinTope = await ventas.n.post('/cupones', {
      codigo: 'SINTOPE',
      tipo: 'porcentaje',
      valor: '10',
    });
    expect(sinTope.estado).toBe(400);
    const ok = await ventas.n.post('/cupones', {
      codigo: 'VENTAS10',
      tipo: 'porcentaje',
      valor: '10',
      usosMaximos: 5,
    });
    expect(ok.estado).toBe(201);
    const deAdmin = await e.admin.post('/cupones', {
      codigo: 'ADMIN',
      tipo: 'porcentaje',
      valor: '20',
    });
    expect((await ventas.n.post(`/cupones/${deAdmin.cuerpo.id}/desactivar`, {})).estado).toBe(403);
    expect((await ventas.n.post(`/cupones/${ok.cuerpo.id}/desactivar`, {})).cuerpo.activo).toBe(
      false,
    );
    expect(
      (await e.operador.post('/cupones', { codigo: 'OPER', tipo: 'porcentaje', valor: '5' }))
        .estado,
    ).toBe(403);
  });

  it('ventas solo ve y gestiona su cartera', async () => {
    const e = await escenario();
    const ventas = await conectar(ctx, 'ventas');
    const propio = await ventas.n.post('/clientes', {
      nombre: 'Cliente de Ventas',
      correo: 'cv@nv.test',
    });
    expect(propio.estado).toBe(201);
    expect(propio.cuerpo.asignadoA.id).toBe(ventas.usuario.id);
    const ajeno = await e.operador.post('/clientes', { nombre: 'Cliente de Operación' });
    expect(
      (await ventas.n.get('/clientes')).cuerpo.elementos.map((c: { nombre: string }) => c.nombre),
    ).toEqual(['Cliente de Ventas']);
    expect((await ventas.n.get(`/clientes/${ajeno.cuerpo.id}`)).estado).toBe(404);
    expect(
      (await ventas.n.patch(`/clientes/${propio.cuerpo.id}`, { asignadoAId: null })).estado,
    ).toBe(403);
    const alta = await ventas.n.post('/suscripciones', {
      clienteId: propio.cuerpo.id,
      planId: e.planId,
      moneda: 'USD',
    });
    expect(alta.estado).toBe(201);
    expect(
      (
        await ventas.n.post('/suscripciones', {
          clienteId: ajeno.cuerpo.id,
          planId: e.planId,
          moneda: 'USD',
        })
      ).estado,
    ).toBe(404);
    const m = await ventas.n.get('/metricas/panel');
    expect(m.cuerpo).toMatchObject({ soloCartera: true, clientesActivos: 1 });
    expect(
      (
        await ventas.n.post(`/suscripciones/${alta.cuerpo.suscripcion.id}/cancelar`, {
          motivo: 'x x x',
        })
      ).estado,
    ).toBe(403);
  });

  it('el equipo invita a un cliente a su panel y el registro enlaza la ficha existente', async () => {
    const e = await escenario();
    const c = await e.operador.post('/clientes', {
      nombre: 'Ana Pérez',
      correo: 'ana@nv.test',
      whatsapp: '+58 414 000 0000',
      aceptaWhatsapp: true,
    });
    expect(c.cuerpo.contactos[0]).toMatchObject({ tipo: 'whatsapp', valor: '+584140000000' });
    const inv = await e.operador.post(`/clientes/${c.cuerpo.id}/invitar`, {});
    expect(inv.cuerpo.tieneAcceso).toBe(true);
    expect(
      (await e.operador.post(`/clientes/${c.cuerpo.id}/invitar`, {})).cuerpo.error.codigo,
    ).toBe('CLIENTE_CON_ACCESO');

    const sinCuenta = await e.operador.post('/clientes', {
      nombre: 'Luis Gómez',
      correo: 'luis@nv.test',
    });
    await new Navegador(ctx.app).post('/auth/registro', {
      nombre: 'Luis Gómez',
      correo: 'luis@nv.test',
      contrasena: 'Clave-Muy-Segura-9',
      aceptaTerminos: true,
    });
    const ficha = await ctx.prisma.cliente.findUniqueOrThrow({
      where: { id: sinCuenta.cuerpo.id },
    });
    expect(ficha.usuarioId).not.toBeNull();
    expect(await ctx.prisma.cliente.count({ where: { correo: 'luis@nv.test' } })).toBe(1);
  });

  it('no se archiva un cliente con suscripciones vivas', async () => {
    const e = await escenario();
    const c = await e.operador.post('/clientes', { nombre: 'Con Servicio' });
    await e.operador.post('/suscripciones', {
      clienteId: c.cuerpo.id,
      planId: e.planId,
      moneda: 'USD',
    });
    const r = await e.operador.post(`/clientes/${c.cuerpo.id}/archivar`, { motivo: 'Baja' });
    expect(r.cuerpo.error.codigo).toBe('CLIENTE_CON_SUSCRIPCIONES');
  });
});
