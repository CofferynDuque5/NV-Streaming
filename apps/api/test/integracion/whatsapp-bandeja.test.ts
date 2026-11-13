import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WhatsAppBandejaService } from '../../src/soporte/whatsapp-bandeja.service.js';
import { conectar, type Contexto, crearContexto, limpiar } from './ayudas.js';

const SECRETO = 'secreto-de-la-app-de-prueba';
const VERIFICAR = 'palabra-de-verificacion';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await crearContexto({
    WHATSAPP_PROVEEDOR: 'sandbox',
    WHATSAPP_SECRETO_APP: SECRETO,
    WHATSAPP_VERIFICAR_TOKEN: VERIFICAR,
  });
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await limpiar(ctx.prisma);
});

/** Aviso tal cual lo manda Meta, firmado (o no) con el secreto de la app. */
function aviso(valor: object, firma = true) {
  const cuerpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value: valor }] }],
  });
  const cabeceras: Record<string, string> = { 'content-type': 'application/json' };
  if (firma) {
    cabeceras['x-hub-signature-256'] =
      `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}`;
  }
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/whatsapp/webhook',
    headers: cabeceras,
    payload: cuerpo,
  });
}

const mensaje = (id: string, texto: string, hace = 0) => ({
  messaging_product: 'whatsapp',
  contacts: [{ wa_id: '584141234567', profile: { name: 'Ana Pérez' } }],
  messages: [
    {
      from: '584141234567',
      id,
      timestamp: String(Math.floor((Date.now() - hace) / 1000)),
      type: 'text',
      text: { body: texto },
    },
  ],
});

describe('Bandeja de WhatsApp', () => {
  it('Meta verifica el webhook solo con la palabra correcta', async () => {
    const bien = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFICAR}&hub.challenge=12345`,
    });
    expect(bien.statusCode).toBe(200);
    expect(bien.body).toBe('12345');
    const mal = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otra&hub.challenge=12345',
    });
    expect(mal.statusCode).toBe(403);
  });

  it('guarda lo que escribe el cliente, lo une a su ficha y el equipo responde', async () => {
    const cliente = await ctx.prisma.cliente.create({
      data: {
        nombre: 'Ana Pérez',
        correo: 'ana@example.com',
        contactos: { create: { tipo: 'whatsapp', valor: '+58 414-123-4567' } },
      },
    });

    expect((await aviso(mensaje('wamid.1', 'Hola, no me entra Netflix'), false)).statusCode).toBe(
      401,
    );
    expect((await aviso(mensaje('wamid.1', 'Hola, no me entra Netflix'))).statusCode).toBe(200);
    // Meta reintenta el mismo aviso: no se duplica.
    expect((await aviso(mensaje('wamid.1', 'Hola, no me entra Netflix'))).statusCode).toBe(200);

    const operador = await conectar(ctx, 'operador');
    const bandeja = await operador.n.get('/whatsapp/conversaciones');
    expect(bandeja.estado).toBe(200);
    expect(bandeja.cuerpo.sinLeer).toBe(1);
    expect(bandeja.cuerpo.webhookListo).toBe(true);
    const [c] = bandeja.cuerpo.conversaciones;
    expect(c).toMatchObject({
      telefono: '+584141234567',
      nombre: 'Ana Pérez',
      cliente: { id: cliente.id, nombre: 'Ana Pérez' },
      noLeidos: 1,
    });
    expect(c.ventanaHasta).not.toBeNull();

    const detalle = await operador.n.get(`/whatsapp/conversaciones/${c.id}`);
    expect(detalle.cuerpo.mensajes).toHaveLength(1);
    expect((await operador.n.get('/whatsapp/conversaciones')).cuerpo.sinLeer).toBe(0);

    const r = await operador.n.post(`/whatsapp/conversaciones/${c.id}/mensajes`, {
      texto: 'Hola Ana, ya te reviso la cuenta.',
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toMatchObject({ direccion: 'saliente', estado: 'enviado' });

    // Meta avisa que se entregó y que se leyó, aunque lleguen desordenados.
    const waId = (await ctx.prisma.mensajeWhatsApp.findFirstOrThrow({
      where: { direccion: 'saliente' },
    }))!.waId!;
    await aviso({ statuses: [{ id: waId, status: 'read' }] });
    await aviso({ statuses: [{ id: waId, status: 'delivered' }] });
    expect((await ctx.prisma.mensajeWhatsApp.findUniqueOrThrow({ where: { waId } })).estado).toBe(
      'leido',
    );

    // Cerrada sale de la bandeja; si vuelve a escribir, se reabre.
    await operador.n.patch(`/whatsapp/conversaciones/${c.id}`, { cerrada: true });
    expect((await operador.n.get('/whatsapp/conversaciones')).cuerpo.conversaciones).toHaveLength(
      0,
    );
    await aviso(mensaje('wamid.2', 'Gracias, ya funciona'));
    expect((await operador.n.get('/whatsapp/conversaciones')).cuerpo.conversaciones).toHaveLength(
      1,
    );

    // Ventas no ve la bandeja.
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get('/whatsapp/conversaciones')).estado).toBe(403);
  });

  it('pasadas 24 h del último mensaje del cliente no deja responder con texto libre', async () => {
    await aviso(mensaje('wamid.viejo', 'Hola', 25 * 3_600_000));
    const admin = await conectar(ctx, 'admin');
    const [c] = (await admin.n.get('/whatsapp/conversaciones')).cuerpo.conversaciones;
    expect(c.ventanaHasta).toBeNull();
    const r = await admin.n.post(`/whatsapp/conversaciones/${c.id}/mensajes`, { texto: 'Hola' });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.error.codigo).toBe('VENTANA_CERRADA');
    expect(await ctx.prisma.mensajeWhatsApp.count({ where: { direccion: 'saliente' } })).toBe(0);
  });

  it('el número vinculado por QR guarda lo del cliente y lo escrito desde el teléfono', async () => {
    const admin = await conectar(ctx, 'admin');
    const vinculo = await admin.n.get('/whatsapp/vinculo');
    expect(vinculo.estado).toBe(200);
    expect(vinculo.cuerpo).toMatchObject({ estado: 'desvinculado', qr: null });
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get('/whatsapp/vinculo')).estado).toBe(403);

    const bandeja = ctx.app.get(WhatsAppBandejaService);
    const hace = new Date(Date.now() - 30 * 3_600_000); // Sin ventana de 24 h de por medio.
    await bandeja.entrante({
      telefono: '584241112233',
      waId: 'QR-1',
      tipo: 'text',
      texto: 'Hola, ¿tienen Disney?',
      fecha: hace,
      nombre: 'Luis',
    });
    // Respondió desde el teléfono: se ve en la bandeja y deja la conversación leída.
    await bandeja.salienteDesdeTelefono({
      telefono: '584241112233',
      waId: 'QR-2',
      tipo: 'text',
      texto: 'Sí, te paso los planes.',
      fecha: new Date(),
    });
    // El mismo aviso dos veces no duplica.
    await bandeja.salienteDesdeTelefono({
      telefono: '584241112233',
      waId: 'QR-2',
      tipo: 'text',
      texto: 'Sí, te paso los planes.',
      fecha: new Date(),
    });
    await bandeja.estado('QR-2', 'leido');

    const lista = await admin.n.get('/whatsapp/conversaciones');
    expect(lista.cuerpo).toMatchObject({
      sinVentana: false,
      vinculo: { estado: 'desvinculado', numero: null },
      sinLeer: 0,
    });
    const [c] = lista.cuerpo.conversaciones;
    expect(c).toMatchObject({ nombre: 'Luis', ultimoMensaje: { direccion: 'saliente' } });
    const detalle = await admin.n.get(`/whatsapp/conversaciones/${c.id}`);
    expect(detalle.cuerpo.mensajes.map((m: { estado: string | null }) => m.estado)).toEqual([
      null,
      'leido',
    ]);
  });
});
