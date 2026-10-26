import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conectar, type Contexto, crearContexto, limpiar, prepararCatalogo } from './ayudas.js';

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

describe('palabras del lector de pedidos', () => {
  it('guarda la palabra normalizada, no la repite, la borra y queda en la auditoría', async () => {
    const admin = await conectar(ctx, 'admin');
    const operador = await conectar(ctx, 'operador');
    const { servicioId } = await prepararCatalogo(admin.n);

    const nueva = await operador.n.post('/lector/alias', { palabra: '  Películas ', servicioId });
    expect(nueva.estado).toBe(201);
    expect(nueva.cuerpo).toMatchObject({ palabra: 'peliculas', servicio: { id: servicioId } });

    const repetida = await operador.n.post('/lector/alias', { palabra: 'PELICULAS', servicioId });
    expect(repetida.estado).toBe(409);
    expect(repetida.cuerpo.error.codigo).toBe('PALABRA_REPETIDA');

    expect(
      (await operador.n.post('/lector/alias', { palabra: 'a@b.com', servicioId })).estado,
    ).toBe(400);
    expect(
      (
        await operador.n.post('/lector/alias', {
          palabra: 'otra',
          servicioId: '7d0f4a0e-3c3a-4a77-9b0a-0b8f7f4a3c11',
        })
      ).estado,
    ).toBe(404);

    const lista = await operador.n.get('/lector/alias');
    expect(lista.cuerpo.map((a: { palabra: string }) => a.palabra)).toEqual(['peliculas']);

    expect((await operador.n.delete(`/lector/alias/${nueva.cuerpo.id}`)).estado).toBe(204);
    expect((await operador.n.get('/lector/alias')).cuerpo).toEqual([]);

    const acciones = await ctx.prisma.auditoria.findMany({
      where: { entidad: 'alias_servicio' },
      orderBy: { fecha: 'asc' },
    });
    expect(acciones.map((a) => a.accion)).toEqual(['alias_servicio.creado', 'alias_servicio.borrado']);

    const cliente = await conectar(ctx, 'cliente');
    expect((await cliente.n.get('/lector/alias')).estado).toBe(403);
  });
});
