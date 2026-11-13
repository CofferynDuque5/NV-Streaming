import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  conectar,
  type Contexto,
  crearContexto,
  crearUsuario,
  limpiar,
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

const DIA = 86_400_000;

describe('Gestor, parte 3', () => {
  it('una nota se delega a alguien del equipo, le avisa y sale en «Mis tareas»', async () => {
    const admin = await conectar(ctx, 'admin');
    const ventas = await conectar(ctx, 'ventas');
    const cliente = await crearUsuario(ctx.prisma, { rol: 'cliente' });

    const equipo = await ventas.n.get('/notas/equipo');
    expect(equipo.estado).toBe(200);
    const ids = (equipo.cuerpo as { id: string }[]).map((u) => u.id);
    expect(ids).toContain(admin.usuario.id);
    expect(ids).not.toContain(cliente.id);

    const aCliente = await admin.n.post('/notas', {
      tipo: 'pendiente',
      texto: 'No se puede',
      asignadaAId: cliente.id,
    });
    expect(aCliente.estado).toBe(400);
    expect(aCliente.cuerpo.error.campos.asignadaAId).toBeDefined();

    const tarea = await admin.n.post('/notas', {
      tipo: 'entregar',
      texto: 'Entregar las cuentas de Disney',
      asignadaAId: ventas.usuario.id,
    });
    expect(tarea.estado).toBe(201);
    expect(tarea.cuerpo.asignadaA).toEqual({
      id: ventas.usuario.id,
      nombre: ventas.usuario.nombre,
    });
    const aviso = await ctx.prisma.notificacion.findFirst({
      where: { plantilla: 'tareaAsignada', usuarioId: ventas.usuario.id },
    });
    expect(aviso).not.toBeNull();
    // Una que se asigna a sí mismo no manda correo.
    await admin.n.post('/notas', { texto: 'Mía', asignadaAId: admin.usuario.id });
    expect(await ctx.prisma.notificacion.count({ where: { plantilla: 'tareaAsignada' } })).toBe(1);

    const mias = await ventas.n.get('/notas?vista=mias');
    expect(mias.cuerpo.map((n: { id: string }) => n.id)).toEqual([tarea.cuerpo.id]);
    const delegadas = await admin.n.get('/notas?vista=delegadas');
    expect(delegadas.cuerpo.map((n: { id: string }) => n.id)).toEqual([tarea.cuerpo.id]);
    expect((await ventas.n.get('/metricas/inicio')).cuerpo.misTareas).toBe(1);

    const hecha = await ventas.n.patch(`/notas/${tarea.cuerpo.id}`, { hecha: true });
    expect(hecha.estado).toBe(200);
    expect((await ventas.n.get('/metricas/inicio')).cuerpo.misTareas).toBe(0);
  });

  it('el reporte de caídas cuenta cada caída, su duración y las agrupa', async () => {
    const admin = await conectar(ctx, 'admin');
    const { servicioId } = await prepararCatalogo(admin.n);
    const crear = (usuario: string, proveedor: string) =>
      admin.n.post('/cuentas', { servicioId, usuario, clave: 'Clave-1', perfiles: 2, proveedor });
    const a = (await crear('caida.a@example.com', 'Distribuidor Uno')).cuerpo;
    const b = (await crear('caida.b@example.com', 'Distribuidor Dos')).cuerpo;

    expect((await admin.n.patch(`/cuentas/${a.id}`, { estado: 'caida' })).estado).toBe(200);
    expect((await admin.n.patch(`/cuentas/${a.id}`, { estado: 'activa' })).estado).toBe(200);
    expect((await admin.n.patch(`/cuentas/${a.id}`, { estado: 'caida' })).estado).toBe(200);
    expect((await admin.n.patch(`/cuentas/${b.id}`, { estado: 'caida' })).estado).toBe(200);
    expect((await admin.n.patch(`/cuentas/${b.id}`, { estado: 'activa' })).estado).toBe(200);

    const r = await admin.n.get('/cuentas/reporte-caidas?dias=7');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.caidas).toHaveLength(3);
    expect(r.cuerpo.sinResolver).toBe(1);
    expect(r.cuerpo.porServicio).toEqual([{ nombre: 'NV Cine', caidas: 3, horas: 0 }]);
    expect(r.cuerpo.porProveedor[0]).toMatchObject({ nombre: 'Distribuidor Uno', caidas: 2 });
    expect(r.cuerpo.porProveedor[1]).toMatchObject({ nombre: 'Distribuidor Dos', caidas: 1 });

    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get('/cuentas/reporte-caidas')).estado).toBe(403);
  });

  it('la calculadora de devolución reparte lo pagado entre los días que quedan', async () => {
    const admin = await conectar(ctx, 'admin');
    const { planId } = await prepararCatalogo(admin.n);
    const c = await ctx.prisma.cliente.create({ data: { nombre: 'Cliente Devolución' } });
    const venceEn = new Date(Date.now() + 15 * DIA - 60_000);
    const s = await ctx.prisma.suscripcion.create({
      data: {
        clienteId: c.id,
        planId,
        estado: 'activa',
        moneda: 'USD',
        inicioEn: new Date(),
        venceEn,
      },
    });

    const sinPagar = await admin.n.get(`/suscripciones/${s.id}/devolucion`);
    expect(sinPagar.estado).toBe(200);
    expect(sinPagar.cuerpo).toMatchObject({ factura: null, diasRestantes: 15, monto: '0.00' });

    await ctx.prisma.factura.create({
      data: {
        clienteId: c.id,
        suscripcionId: s.id,
        concepto: 'alta',
        estado: 'pagada',
        moneda: 'VES',
        subtotal: '1200',
        total: '1200',
        tasa: '40',
        totalUsd: '30',
        venceEn: new Date(),
        pagadaEn: new Date(),
      },
    });
    const r = await admin.n.get(`/suscripciones/${s.id}/devolucion`);
    const { diasPeriodo, diasRestantes } = r.cuerpo;
    expect(diasPeriodo).toBeGreaterThanOrEqual(28);
    expect(diasPeriodo).toBeLessThanOrEqual(31);
    expect(diasRestantes).toBe(15);
    expect(r.cuerpo.factura).toMatchObject({ total: '1200.00', moneda: 'VES', totalUsd: '30.00' });
    expect(r.cuerpo.monto).toBe(((1200 * 15) / diasPeriodo).toFixed(2));
    expect(r.cuerpo.montoUsd).toBe(((30 * 15) / diasPeriodo).toFixed(2));
  });
});
