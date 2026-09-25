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

const whatsapp = (c: {
  contactos: { tipo: string; valor: string; consentimientoEn: string | null }[];
}) => c.contactos.find((x) => x.tipo === 'whatsapp') ?? null;

describe('fichas de clientes', () => {
  it('al editar, un campo vacío borra el dato y uno sin enviar no cambia', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    const alta = await admin.post('/clientes', {
      nombre: 'Ana Pérez',
      correo: 'ana@example.com',
      documento: 'V-12345678',
      pais: 'VE',
      monedaPreferida: 'VES',
      whatsapp: '+58 412 0000000',
      aceptaWhatsapp: true,
    });
    expect(alta.estado).toBe(201);
    const id = alta.cuerpo.id as string;
    const consentido = whatsapp(alta.cuerpo)!.consentimientoEn;
    expect(consentido).not.toBeNull();

    // Cambiar solo el país no toca el WhatsApp ni la fecha del consentimiento.
    const pais = await admin.patch(`/clientes/${id}`, { pais: 'CO' });
    expect(pais.cuerpo.pais).toBe('CO');
    expect(pais.cuerpo.documento).toBe('V-12345678');
    expect(whatsapp(pais.cuerpo)!.consentimientoEn).toBe(consentido);

    // Retirar el consentimiento sin reenviar el número.
    const sinPermiso = await admin.patch(`/clientes/${id}`, { aceptaWhatsapp: false });
    expect(whatsapp(sinPermiso.cuerpo)).toMatchObject({
      valor: '+584120000000',
      consentimientoEn: null,
    });

    const vacio = await admin.patch(`/clientes/${id}`, { documento: '', correo: '', whatsapp: '' });
    expect(vacio.estado).toBe(200);
    expect(vacio.cuerpo).toMatchObject({ documento: null, correo: null, pais: 'CO' });
    expect(whatsapp(vacio.cuerpo)).toBeNull();
  });

  it('el cliente con acceso no pierde su correo desde el equipo y "todos" lista archivados', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    const { n: cliente } = await conectar(ctx, 'cliente');
    const propio = await cliente.get('/mi/resumen');
    const id = propio.cuerpo.cliente.id as string;

    const borrar = await admin.patch(`/clientes/${id}`, { correo: '' });
    expect(borrar.estado).toBe(409);

    await admin.post(`/clientes/${id}/archivar`, { motivo: 'Prueba de archivo' });
    expect((await admin.get('/clientes')).cuerpo.total).toBe(0);
    expect((await admin.get('/clientes?estado=todos')).cuerpo.total).toBe(1);
  });
});
