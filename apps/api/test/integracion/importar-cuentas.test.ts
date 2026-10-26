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

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  const otroServicio = await admin.n.post('/catalogo/servicios', {
    proveedorId: (
      await ctx.prisma.servicio.findUniqueOrThrow({ where: { id: catalogo.servicioId } })
    ).proveedorId,
    nombre: 'NV Música',
    slug: 'nv-musica',
  });
  expect(otroServicio.estado).toBe(201);
  const crear = (usuario: string, extra: Record<string, unknown> = {}) =>
    operador.n.post('/cuentas', {
      servicioId: catalogo.servicioId,
      usuario,
      clave: 'Clave-Vieja',
      perfiles: 2,
      facturaEn: '2026-11-01',
      proveedor: 'Distribuidor A',
      ...extra,
    });
  const igual = await crear('igual@example.com');
  const renovada = await crear('renovada@example.com');
  const sobra = await crear('sobra@example.com');
  const deOtro = await crear('otro-proveedor@example.com', { proveedor: 'Distribuidor B' });
  const musica = await operador.n.post('/cuentas', {
    servicioId: otroServicio.cuerpo.id,
    usuario: 'musica@example.com',
    clave: 'M',
    perfiles: 1,
  });
  for (const r of [igual, renovada, sobra, deOtro, musica]) expect(r.estado).toBe(201);
  return {
    admin,
    operador,
    servicioId: catalogo.servicioId as string,
    igual: igual.cuerpo.id as string,
    renovada: renovada.cuerpo.id as string,
    sobra: sobra.cuerpo.id as string,
  };
}

const FILAS = [
  { usuario: 'IGUAL@example.com', clave: 'Clave-Vieja', fecha: '2026-11-01' },
  { usuario: 'renovada@example.com', clave: 'Clave-Nueva', fecha: '2026-12-01' },
  { usuario: 'nueva@example.com', clave: 'Nueva-1', fecha: '2026-11-20' },
  { usuario: 'sin-clave@example.com', fecha: null },
  { usuario: 'musica@example.com', clave: 'M' },
];

describe('verificar e importar la lista del proveedor', () => {
  it('compara sin escribir nada y sin devolver correos ni claves', async () => {
    const e = await escenario();
    const antes = await ctx.prisma.cuentaServicio.count();
    const r = await e.operador.n.post('/cuentas/importar/revisar', {
      servicioId: e.servicioId,
      proveedor: 'distribuidor a',
      filas: FILAS,
    });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.filas.map((f: { estado: string }) => f.estado)).toEqual([
      'existe',
      'existe',
      'nueva',
      'sin_clave',
      'otro_servicio',
    ]);
    expect(r.cuerpo.filas[0]).toMatchObject({
      cuenta: { id: e.igual, pista: 'ig•••@example.com', facturaEn: '2026-11-01' },
      fechaDistinta: false,
      fechaPosterior: false,
      claveDistinta: false,
    });
    expect(r.cuerpo.filas[1]).toMatchObject({
      cuenta: { id: e.renovada },
      fechaDistinta: true,
      fechaPosterior: true,
      claveDistinta: true,
    });
    // Solo las del mismo proveedor: la de «Distribuidor B» no sale como faltante.
    expect(r.cuerpo.noEstan.map((c: { id: string }) => c.id)).toEqual([e.sobra]);
    expect(r.cuerpo.conteo).toEqual({
      nuevas: 1,
      sinClave: 1,
      existen: 2,
      otroServicio: 1,
      fechaDistinta: 1,
      claveDistinta: 1,
      noEstan: 1,
    });
    const texto = JSON.stringify(r.cuerpo);
    for (const secreto of [
      'Clave-Vieja',
      'Clave-Nueva',
      'nueva@example.com',
      'igual@example.com',
    ]) {
      expect(texto).not.toContain(secreto);
    }
    expect(await ctx.prisma.cuentaServicio.count()).toBe(antes);

    const a = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'cuenta_servicio.lista_revisada' },
    });
    expect(a.despues).toMatchObject({ filas: 5, nuevas: 1, claveDistinta: 1 });
    expect(JSON.stringify(a)).not.toContain('example.com');
  });

  it('crea las nuevas y actualiza las elegidas en una sola operación', async () => {
    const e = await escenario();
    const r = await e.operador.n.post('/cuentas/importar', {
      servicioId: e.servicioId,
      modo: 'perfiles',
      perfiles: 4,
      costoUsd: '9.00',
      proveedor: 'Distribuidor A',
      facturaEn: '2026-11-30',
      nuevas: [
        { usuario: 'nueva@example.com', clave: 'Nueva-1', fecha: '2026-11-20' },
        { usuario: 'sin-fecha@example.com', clave: 'Nueva-2' },
      ],
      actualizar: [{ cuentaId: e.renovada, facturaEn: '2026-12-01', clave: 'Clave-Nueva' }],
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toEqual({ creadas: 2, actualizadas: 1 });

    const nueva = await e.operador.n.get('/cuentas?busqueda=nueva@example.com');
    expect(nueva.cuerpo.elementos[0]).toMatchObject({
      costoUsd: '9.00',
      facturaEn: '2026-11-20',
      proveedor: 'Distribuidor A',
      perfiles: { total: 4, libres: 4 },
    });
    const sinFecha = await e.operador.n.get('/cuentas?busqueda=sin-fecha@example.com');
    expect(sinFecha.cuerpo.elementos[0].facturaEn).toBe('2026-11-30');

    const vista = await e.operador.n.post(`/cuentas/${e.renovada}/revelar`);
    expect(vista.cuerpo.clave).toBe('Clave-Nueva');
    expect((await e.operador.n.get(`/cuentas/${e.renovada}`)).cuerpo.facturaEn).toBe('2026-12-01');

    // Revisar otra vez: ya no hay nada nuevo ni distinto.
    const otra = await e.operador.n.post('/cuentas/importar/revisar', {
      servicioId: e.servicioId,
      filas: FILAS.slice(0, 3),
    });
    expect(otra.cuerpo.conteo).toMatchObject({
      nuevas: 0,
      existen: 3,
      fechaDistinta: 0,
      claveDistinta: 0,
    });

    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { despues: { path: ['origen'], equals: 'importacion' } },
    });
    expect(auditoria.map((a) => a.accion).sort()).toEqual([
      'cuenta_servicio.creada',
      'cuenta_servicio.creada',
      'cuenta_servicio.editada',
    ]);
    expect(JSON.stringify(auditoria)).not.toMatch(/Clave-Nueva|Nueva-1|nueva@example/);
  });

  it('no escribe nada si una de las nuevas ya existe, y valida permisos y límites', async () => {
    const e = await escenario();
    const antes = await ctx.prisma.cuentaServicio.count();
    const repetida = await e.operador.n.post('/cuentas/importar', {
      servicioId: e.servicioId,
      perfiles: 1,
      nuevas: [
        { usuario: 'otra-nueva@example.com', clave: 'x' },
        { usuario: 'Igual@Example.com', clave: 'x' },
      ],
    });
    expect(repetida.estado).toBe(409);
    expect(repetida.cuerpo.error.codigo).toBe('CUENTA_REPETIDA');
    expect(await ctx.prisma.cuentaServicio.count()).toBe(antes);

    const duplicadas = await e.operador.n.post('/cuentas/importar', {
      servicioId: e.servicioId,
      perfiles: 1,
      nuevas: [
        { usuario: 'a@example.com', clave: 'x' },
        { usuario: 'A@example.com ', clave: 'y' },
      ],
    });
    expect(duplicadas.estado).toBe(400);
    expect(duplicadas.cuerpo.error.codigo).toBe('FILAS_REPETIDAS');

    const vacia = await e.operador.n.post('/cuentas/importar', {
      servicioId: e.servicioId,
      perfiles: 1,
    });
    expect(vacia.estado).toBe(400);
    const tarjeta = await e.operador.n.post('/cuentas/importar', {
      servicioId: e.servicioId,
      perfiles: 1,
      metodoPago: '4111 1111 1111 1111',
      nuevas: [{ usuario: 'b@example.com', clave: 'x' }],
    });
    expect(tarjeta.estado).toBe(400);

    const ventas = await conectar(ctx, 'ventas');
    expect(
      (await ventas.n.post('/cuentas/importar/revisar', { servicioId: e.servicioId, filas: FILAS }))
        .estado,
    ).toBe(403);

    let ultimo = 0;
    for (let i = 0; i < 21; i++) {
      ultimo = (
        await e.admin.n.post('/cuentas/importar/revisar', {
          servicioId: e.servicioId,
          filas: FILAS,
        })
      ).estado;
    }
    expect(ultimo).toBe(429);
  });
});
