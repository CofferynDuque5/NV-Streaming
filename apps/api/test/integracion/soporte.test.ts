import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conectar, type Contexto, crearContexto, limpiar } from './ayudas.js';

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

describe('soporte', () => {
  it('conversación completa: abrir, responder, nota interna, reabrir y cerrar', async () => {
    const cliente = await conectar(ctx, 'cliente');
    const operador = await conectar(ctx, 'operador');

    const t = await cliente.n.post('/mi/tickets', {
      asunto: 'No puedo entrar',
      categoria: 'acceso',
      mensaje: 'Me dice que la contraseña es incorrecta.',
    });
    expect(t.estado).toBe(201);
    expect(t.cuerpo).toMatchObject({
      numero: 1,
      estado: 'abierto',
      prioridad: 'normal',
      slaIncumplido: false,
    });

    const bandeja = await operador.n.get('/tickets?abiertos=true&asignacion=sin_asignar');
    expect(bandeja.cuerpo.total).toBe(1);

    await operador.n.patch(`/tickets/${t.cuerpo.id}`, {
      asignadoAId: operador.usuario.id,
      prioridad: 'alta',
    });
    await operador.n.post(`/tickets/${t.cuerpo.id}/mensajes`, {
      texto: 'Cliente verificado por teléfono.',
      interno: true,
    });
    const resp = await operador.n.post(`/tickets/${t.cuerpo.id}/mensajes`, {
      texto: 'Te enviamos un enlace para restablecerla.',
    });
    expect(resp.cuerpo).toMatchObject({ estado: 'esperando_cliente', prioridad: 'alta' });
    expect(resp.cuerpo.primeraRespuestaEn).not.toBeNull();
    expect(resp.cuerpo.mensajes).toHaveLength(3);

    const visto = await cliente.n.get(`/mi/tickets/${t.cuerpo.id}`);
    expect(visto.cuerpo.mensajes.map((m: { texto: string }) => m.texto)).toEqual([
      'Me dice que la contraseña es incorrecta.',
      'Te enviamos un enlace para restablecerla.',
    ]);
    expect(visto.cuerpo.mensajes[1].autor.esEquipo).toBe(true);
    const correo = await ctx.prisma.correoSaliente.findFirst({
      where: { plantilla: 'ticketRespondido' },
    });
    expect(correo?.para).toBe(cliente.usuario.correo);
    expect(correo?.texto).not.toContain('restablecerla');

    // El cliente no puede colar una nota interna.
    const r = await cliente.n.post(`/mi/tickets/${t.cuerpo.id}/mensajes`, {
      texto: 'Ya funcionó, gracias.',
      interno: true,
    });
    expect(r.cuerpo.estado).toBe('abierto');
    expect(await ctx.prisma.mensajeTicket.count({ where: { interno: true } })).toBe(1);

    const cerrado = await cliente.n.post(`/mi/tickets/${t.cuerpo.id}/cerrar`, {});
    expect(cerrado.cuerpo.estado).toBe('cerrado');
    const tarde = await cliente.n.post(`/mi/tickets/${t.cuerpo.id}/mensajes`, {
      texto: 'Otra cosa más',
    });
    expect(tarde.cuerpo.error.codigo).toBe('TICKET_CERRADO');
  });

  it('el equipo da por completado un ticket ya resuelto y deja de contar como abierto', async () => {
    const cliente = await conectar(ctx, 'cliente');
    const admin = await conectar(ctx, 'admin');
    const t = await cliente.n.post('/mi/tickets', {
      asunto: 'Ya se arregló',
      categoria: 'acceso',
      mensaje: 'Era la clave, ya entré.',
    });
    expect((await admin.n.get('/tickets?abiertos=true')).cuerpo.total).toBe(1);
    const listo = await admin.n.patch(`/tickets/${t.cuerpo.id}`, { estado: 'cerrado' });
    expect(listo.estado).toBe(200);
    expect(listo.cuerpo.estado).toBe('cerrado');
    expect(listo.cuerpo.resueltoEn).not.toBeNull();
    expect((await admin.n.get('/tickets?abiertos=true')).cuerpo.total).toBe(0);
  });

  it('cada quien ve solo lo que le toca', async () => {
    const a = await conectar(ctx, 'cliente');
    const b = await conectar(ctx, 'cliente');
    const ventas = await conectar(ctx, 'ventas');
    const t = await a.n.post('/mi/tickets', {
      asunto: 'Consulta de pago',
      categoria: 'pagos',
      mensaje: 'Hola equipo',
    });
    expect((await b.n.get(`/mi/tickets/${t.cuerpo.id}`)).estado).toBe(404);
    expect((await b.n.get('/mi/tickets')).cuerpo.total).toBe(0);
    expect((await a.n.get('/tickets')).estado).toBe(403);
    // Ventas ve tickets de su cartera (este cliente no es suyo) y no puede responder.
    expect((await ventas.n.get(`/tickets/${t.cuerpo.id}`)).estado).toBe(404);
    expect(
      (await ventas.n.post(`/tickets/${t.cuerpo.id}/mensajes`, { texto: 'Hola' })).estado,
    ).toBe(403);
  });

  it('el revendedor abre sus propias solicitudes y no ve las de nadie más', async () => {
    const rev = await conectar(ctx, 'revendedor');
    const cliente = await conectar(ctx, 'cliente');
    const operador = await conectar(ctx, 'operador');
    const delCliente = await cliente.n.post('/mi/tickets', {
      asunto: 'Consulta del cliente',
      categoria: 'otro',
      mensaje: 'Hola',
    });

    const t = await rev.n.post('/mi/tickets', {
      asunto: 'Mi recarga no aparece',
      categoria: 'pagos',
      mensaje: 'Hice una recarga de saldo y no la veo.',
    });
    expect(t.estado).toBe(201);
    const lista = await rev.n.get('/mi/tickets');
    expect(lista.cuerpo.total).toBe(1);
    expect(lista.cuerpo.elementos[0].id).toBe(t.cuerpo.id);
    expect((await rev.n.get(`/mi/tickets/${delCliente.cuerpo.id}`)).estado).toBe(404);
    expect((await cliente.n.get(`/mi/tickets/${t.cuerpo.id}`)).estado).toBe(404);
    // Sigue sin entrar a la bandeja del equipo ni al resto del autoservicio.
    expect((await rev.n.get('/tickets')).estado).toBe(403);
    expect((await rev.n.get('/mi/suscripciones')).estado).toBe(403);

    // El equipo lo ve en la bandeja y le responde; el revendedor contesta y cierra.
    const bandeja = await operador.n.get('/tickets?abiertos=true');
    expect(bandeja.cuerpo.total).toBe(2);
    await operador.n.post(`/tickets/${t.cuerpo.id}/mensajes`, { texto: 'Ya la acreditamos.' });
    const visto = await rev.n.get(`/mi/tickets/${t.cuerpo.id}`);
    expect(visto.cuerpo.mensajes).toHaveLength(2);
    const r = await rev.n.post(`/mi/tickets/${t.cuerpo.id}/mensajes`, { texto: 'Gracias' });
    expect(r.cuerpo.estado).toBe('abierto');
    const cerrado = await rev.n.post(`/mi/tickets/${t.cuerpo.id}/cerrar`, {});
    expect(cerrado.cuerpo.estado).toBe('cerrado');
  });

  it('marca el plazo de primera respuesta incumplido', async () => {
    const c = await conectar(ctx, 'cliente');
    const op = await conectar(ctx, 'operador');
    const t = await c.n.post('/mi/tickets', {
      asunto: 'Urgente',
      categoria: 'otro',
      mensaje: 'Ayuda por favor',
    });
    await ctx.prisma.ticket.update({
      where: { id: t.cuerpo.id },
      data: { slaPrimeraRespuesta: new Date(Date.now() - 1000) },
    });
    expect((await op.n.get(`/tickets/${t.cuerpo.id}`)).cuerpo.slaIncumplido).toBe(true);
    const admin = await conectar(ctx, 'admin');
    expect((await admin.n.get('/metricas/panel')).cuerpo.ticketsSlaIncumplido).toBe(1);
  });

  it('solo se asigna a personas de soporte o administración', async () => {
    const c = await conectar(ctx, 'cliente');
    const op = await conectar(ctx, 'operador');
    const ventas = await conectar(ctx, 'ventas');
    const t = await c.n.post('/mi/tickets', {
      asunto: 'Pregunta',
      categoria: 'otro',
      mensaje: 'Una duda',
    });
    const r = await op.n.patch(`/tickets/${t.cuerpo.id}`, { asignadoAId: ventas.usuario.id });
    expect(r.estado).toBe(400);
    expect((await op.n.patch(`/tickets/${t.cuerpo.id}`, {})).estado).toBe(400);
  });
});
