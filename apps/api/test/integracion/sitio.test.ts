import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conectar, type Contexto, crearContexto, limpiar, Navegador, PNG_1X1 } from './ayudas.js';

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

const portada = (titulo: string) => ({
  id: 'portada1',
  tipo: 'portada',
  titulo,
  subtitulo: 'Planes autorizados.',
  botonPrimario: { texto: 'Crear mi cuenta', enlace: '/registro' },
  ilustracion: true,
});

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const ventas = await conectar(ctx, 'ventas');
  const cliente = await conectar(ctx, 'cliente');
  const creada = await admin.n.post('/sitio/paginas', {
    ruta: 'nosotros',
    titulo: 'Quiénes somos',
    descripcion: 'La historia de NV.',
  });
  expect(creada.estado).toBe(201);
  return {
    admin: admin.n,
    operador: operador.n,
    ventas: ventas.n,
    cliente: cliente.n,
    pagina: creada.cuerpo as { id: string; ruta: string; borradorActualizadoEn: string },
  };
}

async function guardar(n: Navegador, id: string, titulo: string, fecha: string | null) {
  return n.pedir('PUT', `/sitio/paginas/${id}/borrador`, {
    titulo: 'Quiénes somos',
    descripcion: 'La historia de NV.',
    bloques: [portada(titulo)],
    borradorActualizadoEn: fecha,
  });
}

describe('editor visual: permisos', () => {
  it('operación guarda borradores pero no publica; ventas y clientes no entran', async () => {
    const e = await escenario();
    expect(e.pagina.ruta).toBe('/nosotros');

    const g = await guardar(e.operador, e.pagina.id, 'Hola', e.pagina.borradorActualizadoEn);
    expect(g.estado).toBe(200);
    expect(g.cuerpo.bloques[0].titulo).toBe('Hola');
    expect(g.cuerpo.cambiosSinPublicar).toBe(true);

    expect((await e.operador.post(`/sitio/paginas/${e.pagina.id}/publicar`)).estado).toBe(403);
    expect(
      (await e.operador.post(`/sitio/paginas/${e.pagina.id}/restaurar`, { numero: 1 })).estado,
    ).toBe(403);
    expect((await e.operador.post(`/sitio/paginas/${e.pagina.id}/archivar`)).estado).toBe(403);
    expect((await e.operador.pedir('PUT', '/sitio/tema', { paleta: 'violeta' })).estado).toBe(403);

    for (const n of [e.ventas, e.cliente]) {
      expect((await n.get('/sitio/paginas')).estado).toBe(403);
      expect((await n.get(`/sitio/paginas/${e.pagina.id}`)).estado).toBe(403);
      expect((await guardar(n, e.pagina.id, 'X', null)).estado).toBe(403);
      expect((await n.post(`/sitio/paginas/${e.pagina.id}/publicar`)).estado).toBe(403);
      expect((await n.get('/sitio/medios')).estado).toBe(403);
    }
    expect((await new Navegador(ctx.app).get('/sitio/paginas')).estado).toBe(401);
  });

  it('valida la ruta, los enlaces y el límite de bloques', async () => {
    const e = await escenario();
    const reservada = await e.admin.post('/sitio/paginas', { ruta: '/admin/x', titulo: 'X' });
    expect(reservada.estado).toBe(400);
    expect(reservada.cuerpo.error.campos.ruta).toBeDefined();
    const repetida = await e.admin.post('/sitio/paginas', { ruta: '/nosotros', titulo: 'X' });
    expect(repetida.estado).toBe(409);

    const peligrosa = await e.admin.pedir('PUT', `/sitio/paginas/${e.pagina.id}/borrador`, {
      titulo: 'X',
      bloques: [{ ...portada('X'), botonPrimario: { texto: 'Ir', enlace: 'javascript:alert(1)' } }],
      borradorActualizadoEn: e.pagina.borradorActualizadoEn,
    });
    expect(peligrosa.estado).toBe(400);
    expect(Object.keys(peligrosa.cuerpo.error.campos)).toContain('bloques.0.botonPrimario.enlace');

    const muchos = Array.from({ length: 41 }, (_, i) => ({
      id: `banner${i}`,
      tipo: 'banner',
      texto: 'Aviso',
    }));
    const r = await e.admin.pedir('PUT', `/sitio/paginas/${e.pagina.id}/borrador`, {
      titulo: 'X',
      bloques: muchos,
      borradorActualizadoEn: e.pagina.borradorActualizadoEn,
    });
    expect(r.estado).toBe(400);
  });
});

describe('editor visual: borradores y versiones', () => {
  it('publica versiones 1, 2… y el público solo ve la vigente, nunca el borrador', async () => {
    const e = await escenario();
    const publico = new Navegador(ctx.app, null);
    const ver = () => publico.get('/sitio/publico/pagina?ruta=/nosotros');

    expect((await ver()).estado).toBe(404);

    const g1 = await guardar(e.operador, e.pagina.id, 'Primera', e.pagina.borradorActualizadoEn);
    const p1 = await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {
      nota: 'Lanzamiento',
      borradorActualizadoEn: g1.cuerpo.borradorActualizadoEn,
    });
    expect(p1.estado).toBe(200);
    expect(p1.cuerpo.versionPublicada.numero).toBe(1);
    expect(p1.cuerpo.cambiosSinPublicar).toBe(false);
    expect((await ver()).cuerpo).toMatchObject({
      ruta: '/nosotros',
      titulo: 'Quiénes somos',
      numero: 1,
      bloques: [{ tipo: 'portada', titulo: 'Primera' }],
    });

    // Un borrador nuevo no cambia lo que ve el público.
    const g2 = await guardar(e.admin, e.pagina.id, 'Segunda', g1.cuerpo.borradorActualizadoEn);
    expect(g2.cuerpo.cambiosSinPublicar).toBe(true);
    expect((await ver()).cuerpo.bloques[0].titulo).toBe('Primera');

    const p2 = await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {});
    expect(p2.cuerpo.versionPublicada.numero).toBe(2);
    expect((await ver()).cuerpo).toMatchObject({ numero: 2, bloques: [{ titulo: 'Segunda' }] });

    const detalle = await e.admin.get(`/sitio/paginas/${e.pagina.id}`);
    expect(detalle.cuerpo.versiones.map((v: { numero: number }) => v.numero)).toEqual([2, 1]);
    expect(detalle.cuerpo.versiones[1]).toMatchObject({ nota: 'Lanzamiento', vigente: false });
    expect(detalle.cuerpo.versiones[0].vigente).toBe(true);

    // Las versiones publicadas no se pueden cambiar ni borrar.
    await expect(
      ctx.prisma.versionPagina.updateMany({ data: { nota: 'x' }, where: {} }),
    ).rejects.toThrow();

    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { entidad: 'pagina', entidadId: e.pagina.id },
      orderBy: { fecha: 'asc' },
    });
    expect(auditoria.map((a) => a.accion)).toEqual([
      'pagina.creada',
      'pagina.borrador_guardado',
      'pagina.publicada',
      'pagina.borrador_guardado',
      'pagina.publicada',
    ]);
  });

  it('volver a una versión anterior la copia al borrador sin publicarla', async () => {
    const e = await escenario();
    const g1 = await guardar(e.admin, e.pagina.id, 'Primera', e.pagina.borradorActualizadoEn);
    await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {});
    await guardar(e.admin, e.pagina.id, 'Segunda', g1.cuerpo.borradorActualizadoEn);
    await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {});

    const r = await e.admin.post(`/sitio/paginas/${e.pagina.id}/restaurar`, { numero: 1 });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.bloques[0].titulo).toBe('Primera');
    expect(r.cuerpo.versionPublicada.numero).toBe(2);
    expect(r.cuerpo.cambiosSinPublicar).toBe(true);
    const publico = await new Navegador(ctx.app).get('/sitio/publico/pagina?ruta=/nosotros');
    expect(publico.cuerpo.bloques[0].titulo).toBe('Segunda');

    const p3 = await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {});
    expect(p3.cuerpo.versionPublicada.numero).toBe(3);
    expect(
      (await e.admin.post(`/sitio/paginas/${e.pagina.id}/restaurar`, { numero: 9 })).estado,
    ).toBe(404);
  });

  it('si otra persona guardó antes, responde 409 con un mensaje claro', async () => {
    const e = await escenario();
    const base = e.pagina.borradorActualizadoEn;
    expect((await guardar(e.operador, e.pagina.id, 'De operación', base)).estado).toBe(200);
    const tarde = await guardar(e.admin, e.pagina.id, 'De administración', base);
    expect(tarde.estado).toBe(409);
    expect(tarde.cuerpo.error.codigo).toBe('BORRADOR_DESACTUALIZADO');
    expect(tarde.cuerpo.error.mensaje).toMatch(
      /guardó cambios en esta página mientras la editabas/,
    );
    const actual = await e.admin.get(`/sitio/paginas/${e.pagina.id}`);
    expect(actual.cuerpo.bloques[0].titulo).toBe('De operación');

    // Publicar sobre un borrador que cambió también se detiene.
    const p = await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {
      borradorActualizadoEn: base,
    });
    expect(p.estado).toBe(409);
  });

  it('una página archivada deja de verse y vuelve al desarchivarla', async () => {
    const e = await escenario();
    await guardar(e.admin, e.pagina.id, 'Hola', e.pagina.borradorActualizadoEn);
    await e.admin.post(`/sitio/paginas/${e.pagina.id}/publicar`, {});
    const publico = new Navegador(ctx.app);
    const ver = () => publico.get('/sitio/publico/pagina?ruta=/nosotros');
    expect((await ver()).estado).toBe(200);

    expect((await e.admin.post(`/sitio/paginas/${e.pagina.id}/archivar`)).cuerpo.archivada).toBe(
      true,
    );
    expect((await ver()).estado).toBe(404);
    await e.admin.post(`/sitio/paginas/${e.pagina.id}/desarchivar`);
    expect((await ver()).estado).toBe(200);
    expect((await publico.get('/sitio/publico/pagina?ruta=javascript:x')).estado).toBe(400);
  });
});

describe('editor visual: imágenes y tema', () => {
  it('solo acepta imágenes y las sirve públicamente con caché larga', async () => {
    const e = await escenario();
    const pdf = await e.operador.formulario(
      '/sitio/medios',
      { textoAlternativo: 'Documento' },
      {
        campo: 'archivo',
        nombre: 'doc.png',
        tipo: 'image/png',
        contenido: Buffer.from('%PDF-1.7\n'),
      },
    );
    expect(pdf.estado).toBe(415);
    const svg = await e.operador.formulario(
      '/sitio/medios',
      { textoAlternativo: 'Logo' },
      {
        campo: 'archivo',
        nombre: 'logo.svg',
        tipo: 'image/svg+xml',
        contenido: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      },
    );
    expect(svg.estado).toBe(415);
    const sinAlt = await e.operador.formulario(
      '/sitio/medios',
      {},
      { campo: 'archivo', nombre: 'a.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    expect(sinAlt.estado).toBe(400);
    expect(
      (
        await e.ventas.formulario(
          '/sitio/medios',
          { textoAlternativo: 'x' },
          { campo: 'archivo', nombre: 'a.png', tipo: 'image/png', contenido: PNG_1X1 },
        )
      ).estado,
    ).toBe(403);

    const ok = await e.operador.formulario(
      '/sitio/medios',
      { textoAlternativo: 'Panel de NV en un teléfono' },
      { campo: 'archivo', nombre: 'panel.png', tipo: 'image/png', contenido: PNG_1X1 },
    );
    expect(ok.estado).toBe(201);
    expect(ok.cuerpo.url).toBe(`/api/v1/sitio/publico/medios/${ok.cuerpo.id}`);
    expect((await e.operador.get('/sitio/medios')).cuerpo).toHaveLength(1);

    const imagen = await new Navegador(ctx.app, null).descargar(
      `/sitio/publico/medios/${ok.cuerpo.id}`,
    );
    expect(imagen.estado).toBe(200);
    expect(imagen.cabeceras['content-type']).toBe('image/png');
    expect(imagen.cabeceras['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(Buffer.compare(imagen.cuerpo, PNG_1X1)).toBe(0);

    // Un comprobante u otro archivo que no sea de la biblioteca no se sirve.
    const archivo = await ctx.prisma.medio.findUniqueOrThrow({ where: { id: ok.cuerpo.id } });
    expect(
      (await new Navegador(ctx.app).descargar(`/sitio/publico/medios/${archivo.archivoId}`)).estado,
    ).toBe(404);

    // Un bloque de imagen debe apuntar a una imagen de la biblioteca.
    const conImagen = (medioId: string) =>
      e.operador.pedir('PUT', `/sitio/paginas/${e.pagina.id}/borrador`, {
        titulo: 'Con imagen',
        bloques: [{ id: 'imagen1', tipo: 'imagen', medioId, alt: 'Panel de NV' }],
        borradorActualizadoEn: null,
      });
    expect((await conImagen('0b6f7c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f')).estado).toBe(400);
  });

  it('administración cambia la paleta y el público la ve', async () => {
    const e = await escenario();
    const publico = new Navegador(ctx.app, null);
    expect((await publico.get('/sitio/publico/tema')).cuerpo).toEqual({ paleta: 'nv' });
    expect((await e.operador.get('/sitio/tema')).cuerpo.paleta).toBe('nv');
    expect((await e.admin.pedir('PUT', '/sitio/tema', { paleta: 'neon' })).estado).toBe(400);
    const r = await e.admin.pedir('PUT', '/sitio/tema', { paleta: 'esmeralda' });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.actualizadoPor.nombre).toBeTruthy();
    expect((await publico.get('/sitio/publico/tema')).cuerpo).toEqual({ paleta: 'esmeralda' });
    const a = await ctx.prisma.auditoria.findFirst({ where: { accion: 'tema_sitio.cambiado' } });
    expect(a?.despues).toEqual({ paleta: 'esmeralda' });
  });
});
