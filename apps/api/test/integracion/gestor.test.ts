import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inicioDiaCaracas } from '../../src/automatizaciones/horario.js';
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

/** Cliente con una suscripción activa que vence en `venceEn`. */
async function clienteCon(planId: string, nombre: string, venceEn: Date, asignadoAId?: string) {
  const c = await ctx.prisma.cliente.create({
    data: { nombre, ...(asignadoAId ? { asignadoAId } : {}) },
  });
  const s = await ctx.prisma.suscripcion.create({
    data: {
      clienteId: c.id,
      planId,
      estado: 'activa',
      moneda: 'USD',
      inicioEn: new Date(venceEn.getTime() - 30 * 86_400_000),
      venceEn,
    },
  });
  return { clienteId: c.id, suscripcionId: s.id };
}

describe('Gestor, parte 2', () => {
  it('una cuenta sin anotar queda fuera del inventario y no se asigna hasta anotarla', async () => {
    const admin = await conectar(ctx, 'admin');
    const operador = await conectar(ctx, 'operador');
    const { servicioId, planId } = await prepararCatalogo(admin.n);
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const r = await operador.n.post('/cuentas', {
      servicioId,
      usuario: 'espera@example.com',
      clave: 'Clave-1',
      perfiles: 2,
      enEspera: true,
      liberacionEn: ayer,
      notas: 'Geobloqueo hasta mañana',
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toMatchObject({ estado: 'en_espera', liberacionEn: ayer });

    const lista = await operador.n.get('/cuentas?estado=en_espera');
    expect(lista.cuerpo.total).toBe(1);
    const inventario = await operador.n.get('/cuentas/inventario');
    expect(JSON.stringify(inventario.cuerpo)).not.toContain(r.cuerpo.id);
    expect((await admin.n.get('/metricas/inicio')).cuerpo.cuentasLiberadas).toBe(1);

    const { suscripcionId } = await clienteCon(
      planId,
      'Cliente Espera',
      new Date(Date.now() + 9e8),
    );
    const asignar = await operador.n.post(
      `/cuentas/${r.cuerpo.id}/perfiles/${r.cuerpo.listaPerfiles[0].id}/asignar`,
      { suscripcionId },
    );
    expect(asignar.estado).toBe(409);
    expect(asignar.cuerpo.error.codigo).toBe('CUENTA_NO_ACTIVA');

    const anotar = await operador.n.patch(`/cuentas/${r.cuerpo.id}`, { estado: 'activa' });
    expect(anotar.estado).toBe(200);
    expect(anotar.cuerpo).toMatchObject({ estado: 'activa', liberacionEn: null });
    expect(JSON.stringify((await operador.n.get('/cuentas/inventario')).cuerpo)).toContain(
      r.cuerpo.id,
    );
    expect((await admin.n.get('/metricas/inicio')).cuerpo.cuentasLiberadas).toBe(0);
  });

  it('la papelera junta lo archivado, retirado y apagado con quién lo quitó, y se restaura', async () => {
    const admin = await conectar(ctx, 'admin');
    const operador = await conectar(ctx, 'operador');
    const { servicioId } = await prepararCatalogo(admin.n);
    const cliente = await admin.n.post('/clientes', { nombre: 'Cliente Borrado' });
    expect(cliente.estado).toBe(201);
    expect(
      (await admin.n.post(`/clientes/${cliente.cuerpo.id}/archivar`, { motivo: 'Ya no compra' }))
        .estado,
    ).toBe(200);
    const cuenta = await admin.n.post('/cuentas', {
      servicioId,
      usuario: 'vieja@example.com',
      clave: 'x',
      perfiles: 1,
    });
    expect(
      (await admin.n.patch(`/cuentas/${cuenta.cuerpo.id}`, { estado: 'retirada' })).estado,
    ).toBe(200);
    expect(
      (await admin.n.patch(`/catalogo/servicios/${servicioId}`, { activo: false })).estado,
    ).toBe(200);

    expect((await operador.n.get('/papelera')).estado).toBe(403);
    const papelera = await admin.n.get('/papelera');
    expect(papelera.estado).toBe(200);
    expect(papelera.cuerpo).toHaveLength(3);
    const porTipo = Object.fromEntries(
      papelera.cuerpo.map((e: { tipo: string }) => [e.tipo, e]),
    ) as Record<string, { nombre: string; detalle: string | null; quitadoPor: { id: string } }>;
    expect(porTipo.cliente).toMatchObject({ nombre: 'Cliente Borrado' });
    expect(porTipo.cuenta).toMatchObject({ detalle: 'NV Cine' });
    expect(porTipo.plataforma).toMatchObject({ nombre: 'NV Cine', detalle: '1 cuenta' });
    for (const e of Object.values(porTipo)) expect(e.quitadoPor.id).toBe(admin.usuario.id);

    expect(
      (
        await admin.n.post(`/clientes/${cliente.cuerpo.id}/reactivar`, {
          motivo: 'Restaurado desde la papelera',
        })
      ).estado,
    ).toBe(200);
    const despues = await admin.n.get('/papelera');
    expect(despues.cuerpo.map((e: { tipo: string }) => e.tipo).sort()).toEqual([
      'cuenta',
      'plataforma',
    ]);
  });

  it('las notas tienen tipo, aviso y hecha; ventas solo ve las suyas y las generales', async () => {
    const admin = await conectar(ctx, 'admin');
    const ventas = await conectar(ctx, 'ventas');
    const otroVendedor = await crearUsuario(ctx.prisma, { rol: 'ventas' });
    const mio = await ctx.prisma.cliente.create({
      data: { nombre: 'Cliente Mío', asignadoAId: ventas.usuario.id },
    });
    const ajeno = await ctx.prisma.cliente.create({
      data: { nombre: 'Cliente Ajeno', asignadoAId: otroVendedor.id },
    });
    const hace2h = new Date(Date.now() - 7_200_000).toISOString();
    const hace1h = new Date(Date.now() - 3_600_000).toISOString();
    const enUnaSemana = new Date(Date.now() + 7 * 86_400_000).toISOString();

    const sinDia = await admin.n.post('/notas', { tipo: 'paga_dia', texto: 'Paga a fin de mes' });
    expect(sinDia.estado).toBe(400);
    expect(sinDia.cuerpo.error.campos.diaPago).toBeDefined();

    const general = await admin.n.post('/notas', {
      tipo: 'pendiente',
      texto: 'Comprar dos cuentas de Disney',
      avisarEn: hace2h,
    });
    expect(general.estado).toBe(201);
    expect(general.cuerpo).toMatchObject({ tipo: 'pendiente', cliente: null, hechaEn: null });
    const deMio = await admin.n.post('/notas', {
      tipo: 'paga_dia',
      texto: 'Paga cuando cobra',
      clienteId: mio.id,
      diaPago: 15,
      avisarEn: enUnaSemana,
    });
    expect(deMio.cuerpo).toMatchObject({ diaPago: 15, cliente: { nombre: 'Cliente Mío' } });
    const deAjeno = await admin.n.post('/notas', {
      tipo: 'fiado',
      texto: 'Debe 5 USD',
      clienteId: ajeno.id,
      avisarEn: hace1h,
    });
    expect(deAjeno.estado).toBe(201);

    // Las que ya pasaron su aviso, primero.
    const todas = await admin.n.get('/notas');
    expect(todas.cuerpo.map((n: { texto: string }) => n.texto)).toEqual([
      'Comprar dos cuentas de Disney',
      'Debe 5 USD',
      'Paga cuando cobra',
    ]);
    expect((await admin.n.get('/metricas/inicio')).cuerpo.notasPorAvisar).toBe(2);

    const deVentas = await ventas.n.get('/notas');
    expect(deVentas.cuerpo.map((n: { texto: string }) => n.texto).sort()).toEqual([
      'Comprar dos cuentas de Disney',
      'Paga cuando cobra',
    ]);
    expect((await ventas.n.patch(`/notas/${deAjeno.cuerpo.id}`, { hecha: true })).estado).toBe(404);
    expect((await ventas.n.post('/notas', { texto: 'Ajena', clienteId: ajeno.id })).estado).toBe(
      404,
    );

    const hecha = await ventas.n.patch(`/notas/${general.cuerpo.id}`, { hecha: true });
    expect(hecha.estado).toBe(200);
    expect(hecha.cuerpo.hechaEn).not.toBeNull();
    expect((await admin.n.get('/notas?estado=hechas')).cuerpo).toHaveLength(1);
    expect((await admin.n.get('/metricas/inicio')).cuerpo.notasPorAvisar).toBe(1);

    // Las notas de la ficha del cliente salen con su tipo.
    const ficha = await admin.n.get(`/clientes/${mio.id}/notas`);
    expect(ficha.cuerpo[0]).toMatchObject({ tipo: 'paga_dia', texto: 'Paga cuando cobra' });

    expect((await admin.n.pedir('DELETE', `/notas/${deAjeno.cuerpo.id}`)).estado).toBe(204);
    expect((await admin.n.get('/notas')).cuerpo).toHaveLength(1);
  });

  it('el inicio cuenta por plataforma, renovados hoy y la meta del mes con su proyección', async () => {
    const admin = await conectar(ctx, 'admin');
    const ventas = await conectar(ctx, 'ventas');
    const { planId } = await prepararCatalogo(admin.n);
    const ahora = new Date();
    const hoyAlMediodia = new Date(inicioDiaCaracas(ahora).getTime() + 12 * 3_600_000);
    const mananaAlMediodia = new Date(inicioDiaCaracas(ahora, 1).getTime() + 12 * 3_600_000);
    await clienteCon(planId, 'Vence Hoy', hoyAlMediodia);
    await clienteCon(planId, 'Vence Mañana', mananaAlMediodia);
    const renovada = await clienteCon(planId, 'Ya Renovó', new Date(Date.now() + 30 * 86_400_000));
    await ctx.prisma.eventoSuscripcion.create({
      data: {
        suscripcionId: renovada.suscripcionId,
        tipo: 'renovacion',
        actorId: admin.usuario.id,
      },
    });

    const inicio = await admin.n.get('/metricas/inicio');
    expect(inicio.estado).toBe(200);
    expect(inicio.cuerpo.plataformas).toEqual([
      expect.objectContaining({
        servicio: expect.objectContaining({ nombre: 'NV Cine' }),
        activas: 3,
        vencenHoy: 1,
        vencenManana: 1,
      }),
    ]);
    expect(inicio.cuerpo.renovadosHoy).toEqual({ hechos: 1, total: 2 });
    expect(inicio.cuerpo.meta).toMatchObject({ montoUsd: null, logradoUsd: '0.00' });

    expect((await ventas.n.pedir('PUT', '/metricas/meta', { montoUsd: '500' })).estado).toBe(403);
    const fijada = await admin.n.pedir('PUT', '/metricas/meta', { montoUsd: '500' });
    expect(fijada.estado).toBe(200);
    expect(fijada.cuerpo.meta).toMatchObject({ montoUsd: '500.00' });
    expect(fijada.cuerpo.meta.diasDelMes).toBeGreaterThanOrEqual(28);
    // Ventas ve su cartera: sin meta del negocio.
    expect((await ventas.n.get('/metricas/inicio')).cuerpo).toMatchObject({
      meta: null,
      plataformas: [],
    });
    const quitada = await admin.n.pedir('PUT', '/metricas/meta', { montoUsd: null });
    expect(quitada.cuerpo.meta.montoUsd).toBeNull();
  });

  it('lista los clientes de un revendedor con sus suscripciones', async () => {
    const admin = await conectar(ctx, 'admin');
    const { planId } = await prepararCatalogo(admin.n);
    const usuario = await crearUsuario(ctx.prisma, { rol: 'revendedor' });
    const revendedor = await ctx.prisma.revendedor.create({
      data: {
        id: randomUUID(),
        usuarioId: usuario.id,
        nombreComercial: 'Tienda Ana',
        estado: 'aprobado',
      },
    });
    const { clienteId } = await clienteCon(
      planId,
      'Final Uno',
      new Date(Date.now() + 5 * 86_400_000),
    );
    await ctx.prisma.cliente.update({
      where: { id: clienteId },
      data: { revendedorId: revendedor.id },
    });
    await ctx.prisma.contactoCliente.create({
      data: { clienteId, tipo: 'whatsapp', valor: '+584140000000' },
    });
    await clienteCon(planId, 'De Otro', new Date(Date.now() + 5 * 86_400_000));

    const r = await admin.n.get(`/revendedores/${revendedor.id}/clientes`);
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual([
      expect.objectContaining({
        nombre: 'Final Uno',
        whatsapp: '+584140000000',
        suscripciones: [
          expect.objectContaining({ servicio: 'NV Cine', plan: 'Mensual', estado: 'activa' }),
        ],
      }),
    ]);
    expect((await admin.n.get(`/revendedores/${randomUUID()}/clientes`)).estado).toBe(404);
  });
});
