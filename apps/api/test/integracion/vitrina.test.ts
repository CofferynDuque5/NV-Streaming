import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  conectar,
  type Contexto,
  crearContexto,
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

async function subirImagen(n: Navegador) {
  const r = await n.formulario(
    '/sitio/medios',
    { textoAlternativo: 'Escena' },
    { campo: 'archivo', nombre: 'escena.png', tipo: 'image/png', contenido: PNG_1X1 },
  );
  expect(r.estado).toBe(201);
  return r.cuerpo.id as string;
}

describe('vitrina del servicio', () => {
  it('cada pestaña guarda lo suyo sin borrar lo demás, y la tienda la ve con sus imágenes', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    const c = await prepararCatalogo(admin);
    const escena = await subirImagen(admin);
    const ruta = `/catalogo/servicios/${c.servicioId}`;

    const insignias = await admin.patch(ruta, {
      vitrina: { destacado: true, nuevo: true, mensajeWhatsapp: 'Hola, quiero {plan}' },
    });
    expect(insignias.estado).toBe(200);
    const preguntas = await admin.patch(ruta, {
      vitrina: {
        preguntas: [{ pregunta: '¿Funciona en TV?', respuesta: 'Sí, en cualquier Smart TV.' }],
        portadaId: escena,
        tituloCartelera: 'Estrenos de la semana',
        cartelera: [{ titulo: 'Película de prueba', etiqueta: 'Estreno', imagenId: escena }],
      },
    });
    expect(preguntas.cuerpo.vitrina).toMatchObject({
      destacado: true,
      nuevo: true,
      mensajeWhatsapp: 'Hola, quiero {plan}',
      portadaId: escena,
      visible: true,
      comentarios: true,
    });

    const publico = new Navegador(ctx.app);
    const cat = await publico.get('/catalogo');
    const s = cat.cuerpo.servicios[0];
    expect(s.vitrina).toMatchObject({
      destacado: true,
      portada: `/api/v1/sitio/publico/medios/${escena}`,
      cartelera: [
        {
          titulo: 'Película de prueba',
          etiqueta: 'Estreno',
          imagen: `/api/v1/sitio/publico/medios/${escena}`,
        },
      ],
      preguntas: [{ pregunta: '¿Funciona en TV?' }],
    });
    expect(JSON.stringify(s.vitrina)).not.toContain('portadaId');

    // Una imagen que no está en la biblioteca no se acepta.
    const mala = await admin.patch(ruta, {
      vitrina: { portadaId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(mala.estado).toBe(404);

    // Oculto en la vitrina: ni el servicio ni sus planes salen en la tienda.
    await admin.patch(ruta, { vitrina: { visible: false } });
    const oculto = await publico.get('/catalogo');
    expect(oculto.cuerpo.servicios).toEqual([]);
    expect(oculto.cuerpo.planes).toEqual([]);
  });
});

describe('comentarios del servicio', () => {
  it('el cliente comenta, el equipo oculta y responde, y hay un tope diario', async () => {
    const { n: admin } = await conectar(ctx, 'admin');
    const c = await prepararCatalogo(admin);
    const cliente = await conectar(ctx, 'cliente');
    await ctx.prisma.usuario.update({
      where: { id: cliente.usuario.id },
      data: { nombre: 'Prueba Ejemplo Gómez' },
    });

    const r = await cliente.n.post('/mi/comentarios', {
      servicioId: c.servicioId,
      texto: 'Muy buen servicio, rápido.',
      estrellas: 5,
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toMatchObject({
      autor: 'Prueba E.',
      estrellas: 5,
      propio: true,
      compro: false,
    });

    const publico = new Navegador(ctx.app);
    const lista = await publico.get(`/sitio/publico/servicios/${c.servicioId}/comentarios`);
    expect(lista.cuerpo).toMatchObject({ total: 1, promedio: 5, abiertos: true });
    expect(lista.cuerpo.comentarios[0].propio).toBe(false);
    expect(JSON.stringify(lista.cuerpo)).not.toContain('@');

    // El equipo responde y oculta.
    const equipo = await admin.get(`/catalogo/servicios/${c.servicioId}/comentarios`);
    expect(equipo.cuerpo[0].usuario.correo).toBe(cliente.usuario.correo);
    const id = equipo.cuerpo[0].id;
    expect(
      (await admin.patch(`/catalogo/comentarios/${id}`, { respuesta: '¡Gracias!' })).estado,
    ).toBe(204);
    const respondido = await publico.get(`/sitio/publico/servicios/${c.servicioId}/comentarios`);
    expect(respondido.cuerpo.comentarios[0].respuesta).toBe('¡Gracias!');
    await admin.patch(`/catalogo/comentarios/${id}`, { oculto: true });
    expect(
      (await publico.get(`/sitio/publico/servicios/${c.servicioId}/comentarios`)).cuerpo.total,
    ).toBe(0);

    // Tope diario y comentarios cerrados.
    await cliente.n.post('/mi/comentarios', {
      servicioId: c.servicioId,
      texto: 'Dos' + '.'.repeat(3),
    });
    await cliente.n.post('/mi/comentarios', { servicioId: c.servicioId, texto: 'Tres...' });
    const cuarto = await cliente.n.post('/mi/comentarios', {
      servicioId: c.servicioId,
      texto: 'Cuatro',
    });
    expect(cuarto.estado).toBe(429);
    await admin.patch(`/catalogo/servicios/${c.servicioId}`, { vitrina: { comentarios: false } });
    const otro = await conectar(ctx, 'cliente');
    expect(
      (await otro.n.post('/mi/comentarios', { servicioId: c.servicioId, texto: 'Cerrado' })).estado,
    ).toBe(409);

    // Solo quien lo escribió lo borra.
    const mios = await cliente.n.get(`/mi/comentarios/${c.servicioId}`);
    const propio = mios.cuerpo.comentarios.find((x: { propio: boolean }) => x.propio);
    expect((await otro.n.pedir('DELETE', `/mi/comentarios/${propio.id}`)).estado).toBe(404);
    expect((await cliente.n.pedir('DELETE', `/mi/comentarios/${propio.id}`)).estado).toBe(204);
    // El equipo no modera sin permiso de catálogo.
    expect((await otro.n.get(`/catalogo/servicios/${c.servicioId}/comentarios`)).estado).toBe(403);
  });
});
