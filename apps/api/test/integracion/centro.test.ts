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
  nombre: 'pago.png',
  tipo: 'image/png',
  contenido: PNG_1X1,
};
const AYER = () => new Date(Date.now() - 86_400_000);

async function equipo() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const ventas = await conectar(ctx, 'ventas');
  return { admin, operador, ventas };
}

/** Un cliente contrata el plan y su factura ya pasó la fecha límite. */
async function clienteConFacturaVencida(planId: string, asignadoAId: string | null) {
  const c = await conectar(ctx, 'cliente');
  const alta = await c.n.post('/mi/suscripciones', { planId, moneda: 'USD' });
  expect(alta.estado).toBe(201);
  const facturaId = alta.cuerpo.factura.id as string;
  await ctx.prisma.factura.update({ where: { id: facturaId }, data: { venceEn: AYER() } });
  await ctx.prisma.cliente.update({
    where: { usuarioId: c.usuario.id },
    data: { asignadoAId },
  });
  return { ...c, facturaId };
}

async function accionPropuesta(usuarioId: string) {
  const conversacion = await ctx.prisma.conversacionAsistente.create({
    data: { usuarioId, titulo: 'Renovaciones' },
  });
  return ctx.prisma.accionPropuesta.create({
    data: {
      conversacionId: conversacion.id,
      solicitadaPorId: usuarioId,
      herramienta: 'renovar_suscripcion',
      permiso: 'suscripciones.crear',
      parametros: {},
      resumen: 'Renovar una suscripción',
      expiraEn: new Date(Date.now() + 3_600_000),
    },
  });
}

const centro = async (n: Navegador) => {
  const r = await n.get('/metricas/centro');
  expect(r.estado).toBe(200);
  return r.cuerpo;
};

describe('centro de módulos del equipo', () => {
  it('cada rol recibe solo lo de los módulos que puede abrir', async () => {
    const { admin, operador, ventas } = await equipo();
    await prepararCatalogo(admin.n);

    const a = await centro(admin.n);
    for (const v of [...Object.values(a.colas), ...Object.values(a.modulos)]) {
      expect(v).not.toBeNull();
    }
    expect(a.sistema.canales).toEqual({ correo: 'sandbox', whatsapp: 'sin_configurar' });
    expect(a.sistema.asistente).not.toBeNull();
    expect(a.tasasFaltantes).not.toContain('VES');
    // De las pasarelas solo si están configuradas y su modo: nunca claves ni direcciones.
    for (const p of a.sistema.pasarelas) {
      expect(Object.keys(p).sort()).toEqual(['configurada', 'modo', 'nombre', 'pasarela']);
    }
    // PayPal y Mercado Pago siempre; la de pruebas, solo si está habilitada.
    expect(a.sistema.pasarelas.slice(0, 2)).toMatchObject([
      { pasarela: 'paypal', configurada: false },
      { pasarela: 'mercadopago', configurada: false },
    ]);
    expect(a.sistema.pasarelas.slice(2)).toMatchObject([
      { pasarela: 'sandbox', configurada: true, modo: 'pruebas' },
    ]);
    expect(JSON.stringify(a)).not.toMatch(/https?:|webhook|clave|token/i);
    expect(a.trabajador).toEqual({ activo: false, ultimoLatidoEn: null });

    const o = await centro(operador.n);
    expect(o.colas.pocosCodigos).toBeNull();
    expect(o.colas.pagosEnRevision).toBe(0);
    expect(o.colas.entregas).toEqual({ fallidas: 0, pendientes: 0 });
    expect(o.modulos).toMatchObject({ cuponesActivos: null, equipo: 3 });
    expect(o.modulos.catalogo).toEqual({ servicios: 1, planes: 1 });
    expect(o.sistema.pasarelas).toBeNull();
    expect(o.tasasFaltantes).toBeNull();

    const v = await centro(ventas.n);
    expect(v.colas).toMatchObject({
      pagosEnRevision: null,
      recargasBilletera: null,
      recargasRevendedor: null,
      entregas: null,
      solicitudesRevendedor: null,
      pocosCodigos: null,
      tickets: { abiertos: 0, fueraDePlazo: 0 },
      facturasVencidas: 0,
      accionesAsistente: 0,
    });
    expect(v.modulos).toEqual({
      catalogo: { servicios: 1, planes: 1 },
      cuponesActivos: 0,
      equipo: null,
      revendedores: null,
      automatizacionesActivas: null,
      paginasPublicadas: null,
    });
    expect(v.sistema.canales).toBeNull();
    expect(v.sistema.pasarelas).toBeNull();
    expect(v.sistema.asistente).not.toBeNull();

    // Fuera del equipo, no existe.
    for (const rol of ['cliente', 'revendedor'] as const) {
      const { n } = await conectar(ctx, rol);
      expect((await n.get('/metricas/centro')).estado).toBe(403);
    }
  });

  it('cuenta lo que espera en cada cola y ventas solo lo de su cartera', async () => {
    const { admin, operador, ventas } = await equipo();
    const cat = await prepararCatalogo(admin.n);

    // Facturas vencidas: una de la cartera de ventas y otra de nadie.
    const suyo = await clienteConFacturaVencida(cat.planId, ventas.usuario.id);
    await clienteConFacturaVencida(cat.planId, null);

    // Un pago por conciliar, una recarga de billetera y un ticket fuera de plazo del cliente de ventas.
    const pago = await suyo.n.formulario(
      `/mi/facturas/${suyo.facturaId}/pagos`,
      {
        metodoCobroId: cat.zelleId,
        monto: '5.00',
        referenciaExterna: 'Z-CENTRO-1',
        fechaPago: hoy(),
      },
      comprobante,
    );
    expect(pago.estado).toBe(201);
    const recarga = await suyo.n.formulario(
      '/mi/billetera/recargas',
      { metodoCobroId: cat.zelleId, moneda: 'USD', monto: '10', fechaPago: hoy() },
      comprobante,
    );
    expect(recarga.estado).toBe(201);
    const ticket = await suyo.n.post('/mi/tickets', {
      asunto: 'No me llega el código',
      categoria: 'acceso',
      mensaje: 'Pagué y no veo el código.',
    });
    expect(ticket.estado).toBe(201);
    await ctx.prisma.ticket.update({
      where: { id: ticket.cuerpo.id },
      data: { slaPrimeraRespuesta: AYER() },
    });

    // Una solicitud de revendedor y un revendedor aprobado con su recarga en revisión.
    const nivel = await admin.n.post('/revendedores/niveles', { nombre: 'Plata' });
    const aspirante = await conectar(ctx, 'cliente');
    expect(
      (await aspirante.n.post('/revendedor/solicitud', { nombreComercial: 'Tienda Sol' })).estado,
    ).toBe(201);
    const futuro = await conectar(ctx, 'cliente');
    const sol = await futuro.n.post('/revendedor/solicitud', { nombreComercial: 'Tienda Luna' });
    await admin.n.post(`/revendedores/${sol.cuerpo.id}/aprobar`, { nivelId: nivel.cuerpo.id });
    await futuro.n.entrarCompleto(futuro.usuario.correo);
    const rec = await futuro.n.formulario(
      '/revendedor/recargas',
      { metodoCobroId: cat.zelleId, moneda: 'USD', monto: '20', fechaPago: hoy() },
      comprobante,
    );
    expect(rec.estado).toBe(201);

    // Una acción del asistente de cada persona, y un cupón activo y otro vencido.
    await accionPropuesta(ventas.usuario.id);
    await accionPropuesta(operador.usuario.id);
    await admin.n.post('/cupones', { codigo: 'HOLA10', tipo: 'porcentaje', valor: '10' });
    await admin.n.post('/cupones', { codigo: 'VIEJO', tipo: 'porcentaje', valor: '10' });
    await ctx.prisma.cupon.update({ where: { codigo: 'VIEJO' }, data: { validoHasta: AYER() } });

    // El plan pasa a entregarse con códigos y no tiene ninguno.
    const proveedor = await ctx.prisma.proveedor.findFirstOrThrow();
    const conf = await admin.n.pedir('PUT', `/catalogo/proveedores/${proveedor.id}/entrega`, {
      adaptador: 'codigos',
    });
    expect(conf.estado).toBe(200);

    const a = await centro(admin.n);
    expect(a.colas).toMatchObject({
      pagosEnRevision: 1,
      recargasBilletera: 1,
      recargasRevendedor: 1,
      tickets: { abiertos: 1, fueraDePlazo: 1 },
      entregas: { fallidas: 0, pendientes: 0 },
      solicitudesRevendedor: 1,
      facturasVencidas: 2,
      // Con asistente.configurar ve las de todos.
      accionesAsistente: 2,
    });
    expect(a.colas.pocosCodigos).toEqual([
      { planId: cat.planId, plan: 'Mensual', servicio: 'NV Cine', disponibles: 0, pendientes: 0 },
    ]);
    expect(a.modulos).toMatchObject({
      cuponesActivos: 1,
      revendedores: { aprobados: 1, suspendidos: 0 },
    });

    // Ventas: solo su cartera (su cliente) y sus propias acciones.
    const v = await centro(ventas.n);
    expect(v.colas).toMatchObject({
      tickets: { abiertos: 1, fueraDePlazo: 1 },
      facturasVencidas: 1,
      accionesAsistente: 1,
    });
    expect(v.modulos.cuponesActivos).toBe(1);

    // Al atender las colas dejan de contar: el pago confirmado paga la factura y crea su entrega.
    expect(
      (await operador.n.post(`/pagos/${pago.cuerpo.id}/confirmar`, { montoRecibido: '5.00' }))
        .estado,
    ).toBe(200);
    const entrega = await ctx.prisma.entrega.findFirstOrThrow({
      where: { facturaId: suyo.facturaId },
    });
    await ctx.prisma.entrega.update({ where: { id: entrega.id }, data: { estado: 'fallida' } });
    const o = await centro(operador.n);
    expect(o.colas).toMatchObject({
      pagosEnRevision: 0,
      facturasVencidas: 1,
      entregas: { fallidas: 1, pendientes: 0 },
      accionesAsistente: 1,
    });
    expect((await centro(ventas.n)).colas.facturasVencidas).toBe(0);
  });
});
