import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const SIN_PENDIENTES = { accesosSinVer: 0, facturasPorPagar: 0, ticketsPorResponder: 0 };

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  await ctx.prisma.servicio.update({
    where: { id: catalogo.servicioId },
    data: { categoria: 'streaming' },
  });
  return { admin: admin.n, operador: operador.n, ...catalogo };
}

describe('panel de la cuenta del cliente', () => {
  it('cuenta lo que espera al cliente y deja de contarlo al atenderlo', async () => {
    const e = await escenario();
    const cliente = await conectar(ctx, 'cliente');
    const otro = await conectar(ctx, 'cliente');

    const vacio = await cliente.n.get('/mi/panel');
    expect(vacio.estado).toBe(200);
    expect(vacio.cuerpo).toEqual({ revendedor: null, pendientes: SIN_PENDIENTES });

    // Una factura emitida está por pagar; con el pago en revisión, ya no.
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(alta.estado).toBe(201);
    const facturaId = alta.cuerpo.factura.id as string;
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes.facturasPorPagar).toBe(1);
    const pago = await cliente.n.formulario(
      `/mi/facturas/${facturaId}/pagos`,
      { metodoCobroId: e.zelleId, monto: '5.00', referenciaExterna: 'Z-PANEL-1', fechaPago: hoy() },
      comprobante,
    );
    expect(pago.estado).toBe(201);
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes.facturasPorPagar).toBe(0);
    expect(
      (await e.operador.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' }))
        .estado,
    ).toBe(200);

    // Un acceso entregado con código cuenta hasta que el cliente lo muestra.
    const entrega = await ctx.prisma.entrega.findFirstOrThrow({ where: { facturaId } });
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes.accesosSinVer).toBe(0);
    const completar = await e.operador.post(`/entregas/${entrega.id}/completar`, {
      instrucciones: 'Abre la app oficial y pega el código.',
      codigo: 'NVPN-1234-ABCD',
    });
    expect(completar.estado).toBe(200);
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes.accesosSinVer).toBe(1);
    expect((await cliente.n.post(`/mi/accesos/${entrega.id}/revelar`)).estado).toBe(200);
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes.accesosSinVer).toBe(0);

    // Una solicitud respondida por el equipo espera al cliente hasta que contesta.
    const t = await cliente.n.post('/mi/tickets', {
      asunto: 'No me llega el código',
      categoria: 'acceso',
      mensaje: 'Pagué y no veo el código.',
    });
    expect(t.estado).toBe(201);
    await e.operador.post(`/tickets/${t.cuerpo.id}/mensajes`, {
      texto: 'Ya lo cargamos, ¿lo ves?',
    });
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes.ticketsPorResponder).toBe(1);
    await cliente.n.post(`/mi/tickets/${t.cuerpo.id}/mensajes`, { texto: 'Sí, gracias.' });
    expect((await cliente.n.get('/mi/panel')).cuerpo.pendientes).toEqual(SIN_PENDIENTES);

    // Lo de otro cliente no se cuenta.
    expect((await otro.n.get('/mi/panel')).cuerpo.pendientes).toEqual(SIN_PENDIENTES);
    // El equipo no tiene panel de cliente.
    expect((await e.operador.get('/mi/panel')).estado).toBe(403);
  });

  it('dice qué revendedor gestiona la cuenta', async () => {
    const cliente = await conectar(ctx, 'cliente');
    await cliente.n.get('/mi/panel');
    const rev = await conectar(ctx, 'revendedor');
    const revendedor = await ctx.prisma.revendedor.create({
      data: { usuarioId: rev.usuario.id, nombreComercial: 'Tienda Luna', estado: 'aprobado' },
    });
    await ctx.prisma.cliente.update({
      where: { usuarioId: cliente.usuario.id },
      data: { revendedorId: revendedor.id },
    });
    const panel = await cliente.n.get('/mi/panel');
    expect(panel.cuerpo.revendedor).toEqual({ nombre: 'Tienda Luna' });
  });

  it('las suscripciones, facturas y accesos traen el servicio para mostrar su imagen', async () => {
    const e = await escenario();
    const cliente = await conectar(ctx, 'cliente');
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(alta.cuerpo.suscripcion.plan).toMatchObject({
      servicio: 'NV Cine',
      servicioSlug: 'nv-cine',
      categoria: 'streaming',
    });

    const facturas = await cliente.n.get('/mi/facturas');
    expect(facturas.cuerpo.elementos[0]).toMatchObject({
      concepto: 'alta',
      plan: {
        id: e.planId,
        nombre: 'Mensual',
        servicio: { nombre: 'NV Cine', slug: 'nv-cine', categoria: 'streaming' },
      },
    });
    const resumen = await cliente.n.get('/mi/resumen');
    expect(resumen.cuerpo.facturasPendientes[0].plan.nombre).toBe('Mensual');
    expect(resumen.cuerpo.suscripciones[0].plan.servicioSlug).toBe('nv-cine');

    const pago = await cliente.n.formulario(
      `/mi/facturas/${alta.cuerpo.factura.id}/pagos`,
      { metodoCobroId: e.zelleId, monto: '5.00', referenciaExterna: 'Z-PANEL-2', fechaPago: hoy() },
      comprobante,
    );
    await e.operador.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' });
    const accesos = await cliente.n.get('/mi/accesos');
    expect(accesos.cuerpo[0]).toMatchObject({
      servicio: 'NV Cine',
      servicioSlug: 'nv-cine',
      categoria: 'streaming',
      plan: 'Mensual',
    });
  });
});
