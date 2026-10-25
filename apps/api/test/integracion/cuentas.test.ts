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

const CLAVE = 'Clave-Secreta-123';

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const cliente = await conectar(ctx, 'cliente');
  const catalogo = await prepararCatalogo(admin.n);
  const cuenta = await operador.n.post('/cuentas', {
    servicioId: catalogo.servicioId,
    usuario: 'Maria.Cine@Example.com',
    clave: CLAVE,
    perfiles: 3,
    costoUsd: '12.50',
    facturaEn: '2026-11-05',
    metodoPago: 'Tarjeta ···· 1234',
  });
  expect(cuenta.estado).toBe(201);
  return { admin, operador, cliente: cliente.n, cuenta: cuenta.cuerpo, ...catalogo };
}

describe('cuentas de servicio', () => {
  it('guarda las credenciales cifradas y nunca las devuelve en la lista ni en el detalle', async () => {
    const e = await escenario();
    expect(e.cuenta).toMatchObject({
      pista: 'Ma•••@Example.com',
      modo: 'perfiles',
      estado: 'activa',
      costoUsd: '12.50',
      facturaEn: '2026-11-05',
      perfiles: { total: 3, libres: 3, asignados: 0, bloqueados: 0 },
    });
    expect(e.cuenta.listaPerfiles.map((p: { nombre: string }) => p.nombre)).toEqual([
      'Perfil 1',
      'Perfil 2',
      'Perfil 3',
    ]);

    const texto = JSON.stringify([
      e.cuenta,
      (await e.operador.n.get('/cuentas')).cuerpo,
      (await e.operador.n.get(`/cuentas/${e.cuenta.id}`)).cuerpo,
    ]);
    expect(texto).not.toContain(CLAVE);
    expect(texto.toLowerCase()).not.toContain('maria.cine');

    const fila = await ctx.prisma.cuentaServicio.findUniqueOrThrow({ where: { id: e.cuenta.id } });
    expect(fila.claveCifrada).not.toContain(CLAVE);
    expect(fila.usuarioCifrado.toLowerCase()).not.toContain('maria');

    // Repetida aunque cambien mayúsculas y espacios.
    const otra = await e.operador.n.post('/cuentas', {
      servicioId: e.servicioId,
      usuario: '  maria.cine@example.com ',
      clave: 'x',
      perfiles: 1,
    });
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo.error.codigo).toBe('CUENTA_REPETIDA');

    // Se encuentra por el correo exacto sin guardarlo en claro.
    const busqueda = await e.operador.n.get('/cuentas?busqueda=MARIA.CINE@example.com');
    expect(busqueda.cuerpo.total).toBe(1);
    expect((await e.operador.n.get('/cuentas?busqueda=otra@example.com')).cuerpo.total).toBe(0);
  });

  it('muestra las credenciales solo con permiso, lo deja en la auditoría sin los valores y tiene límite', async () => {
    const e = await escenario();
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.get('/cuentas')).estado).toBe(403);
    expect((await ventas.n.post(`/cuentas/${e.cuenta.id}/revelar`)).estado).toBe(403);
    expect((await e.cliente.get('/cuentas')).estado).toBe(403);

    const pin = await e.operador.n.patch(
      `/cuentas/${e.cuenta.id}/perfiles/${e.cuenta.listaPerfiles[1].id}`,
      { pin: '4321', nombre: 'Niños' },
    );
    expect(pin.estado).toBe(200);
    expect(pin.cuerpo.listaPerfiles[1]).toMatchObject({ nombre: 'Niños', tienePin: true });
    expect(pin.cuerpo.listaPerfiles[1]).not.toHaveProperty('pin');

    const r = await e.operador.n.post(`/cuentas/${e.cuenta.id}/revelar`);
    expect(r.estado).toBe(201);
    expect(r.cuerpo).toEqual({
      usuario: 'Maria.Cine@Example.com',
      clave: CLAVE,
      perfiles: [
        { numero: 1, nombre: 'Perfil 1', pin: null },
        { numero: 2, nombre: 'Niños', pin: '4321' },
        { numero: 3, nombre: 'Perfil 3', pin: null },
      ],
    });

    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { entidadId: { in: [e.cuenta.id, e.cuenta.listaPerfiles[1].id] } },
      orderBy: { fecha: 'asc' },
    });
    expect(auditoria.map((a) => a.accion)).toEqual([
      'cuenta.creada',
      'perfil.editado',
      'cuenta.credenciales_vistas',
    ]);
    const todo = JSON.stringify(auditoria);
    expect(todo).not.toContain(CLAVE);
    // El PIN solo son dígitos: se comprueba que la auditoría guarda exactamente qué cambió.
    expect(auditoria[1]!.despues).toEqual({
      cuentaId: e.cuenta.id,
      numero: 2,
      cambios: ['nombre', 'pin'],
    });
    expect(todo.toLowerCase()).not.toContain('maria.cine');

    for (let i = 1; i < 30; i++) {
      expect((await e.operador.n.post(`/cuentas/${e.cuenta.id}/revelar`)).estado).toBe(201);
    }
    expect((await e.operador.n.post(`/cuentas/${e.cuenta.id}/revelar`)).estado).toBe(429);
  });

  it('asigna cada perfil a una sola suscripción del mismo servicio y lo libera', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    expect(alta.estado).toBe(201);
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    const [p1, p2] = e.cuenta.listaPerfiles as { id: string }[];
    const ruta = (p: { id: string }, accion: string) =>
      `/cuentas/${e.cuenta.id}/perfiles/${p.id}/${accion}`;

    const libres = await e.operador.n.get(`/cuentas/${e.cuenta.id}/suscripciones-asignables`);
    expect(libres.cuerpo.map((s: { id: string }) => s.id)).toEqual([suscripcionId]);

    const ok = await e.operador.n.post(ruta(p1!, 'asignar'), { suscripcionId });
    expect(ok.estado).toBe(201);
    expect(ok.cuerpo.perfiles).toMatchObject({ libres: 2, asignados: 1 });
    expect(ok.cuerpo.listaPerfiles[0].asignacion).toMatchObject({
      suscripcionId,
      estado: 'pendiente_pago',
      terminada: false,
    });

    // Misma suscripción en otro perfil, o el mismo perfil otra vez: no.
    const doble = await e.operador.n.post(ruta(p2!, 'asignar'), { suscripcionId });
    expect(doble.cuerpo.error.codigo).toBe('SUSCRIPCION_CON_PERFIL');
    const ocupado = await e.operador.n.post(ruta(p1!, 'asignar'), { suscripcionId });
    expect(ocupado.cuerpo.error.codigo).toBe('PERFIL_NO_LIBRE');
    expect(
      (await e.operador.n.get(`/cuentas/${e.cuenta.id}/suscripciones-asignables`)).cuerpo,
    ).toEqual([]);

    // No se bloquea un perfil asignado ni se quitan perfiles ocupados.
    const bloquear = await e.operador.n.patch(`/cuentas/${e.cuenta.id}/perfiles/${p1!.id}`, {
      bloqueado: true,
    });
    expect(bloquear.cuerpo.error.codigo).toBe('PERFIL_ASIGNADO');
    expect((await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { perfiles: 1 })).estado).toBe(200);
    expect(
      (await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { perfiles: 4 })).cuerpo.perfiles,
    ).toMatchObject({ total: 4, libres: 3 });

    // Otra suscripción de otro servicio: no.
    const servicio2 = await e.admin.n.post('/catalogo/servicios', {
      proveedorId: (await ctx.prisma.servicio.findUniqueOrThrow({ where: { id: e.servicioId } }))
        .proveedorId,
      nombre: 'NV Música',
      slug: 'nv-musica',
    });
    const cuenta2 = await e.operador.n.post('/cuentas', {
      servicioId: servicio2.cuerpo.id,
      usuario: 'musica@example.com',
      clave: 'x',
      modo: 'completa',
      perfiles: 5,
    });
    expect(cuenta2.cuerpo.perfiles.total).toBe(1);
    expect(cuenta2.cuerpo.listaPerfiles[0].nombre).toBe('Cuenta completa');
    const otro = await e.operador.n.post(
      `/cuentas/${cuenta2.cuerpo.id}/perfiles/${cuenta2.cuerpo.listaPerfiles[0].id}/asignar`,
      { suscripcionId },
    );
    expect(otro.cuerpo.error.codigo).toBe('OTRO_SERVICIO');

    const liberar = await e.operador.n.post(ruta(p1!, 'liberar'));
    expect(liberar.estado).toBe(201);
    expect(liberar.cuerpo.listaPerfiles[0]).toMatchObject({ estado: 'libre', asignacion: null });
    expect((await e.operador.n.post(ruta(p1!, 'liberar'))).cuerpo.error.codigo).toBe(
      'PERFIL_NO_ASIGNADO',
    );

    const acciones = await ctx.prisma.auditoria.findMany({
      where: { entidad: 'perfil_cuenta' },
      select: { accion: true },
      orderBy: { fecha: 'asc' },
    });
    expect(acciones.map((a) => a.accion)).toEqual(['perfil.asignado', 'perfil.liberado']);
  });

  it('una cuenta caída no recibe asignaciones y el método de pago no acepta números de tarjeta', async () => {
    const e = await escenario();
    const caida = await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'caida' });
    expect(caida.cuerpo.estado).toBe('caida');
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    const r = await e.operador.n.post(
      `/cuentas/${e.cuenta.id}/perfiles/${e.cuenta.listaPerfiles[0].id}/asignar`,
      { suscripcionId },
    );
    expect(r.cuerpo.error.codigo).toBe('CUENTA_NO_ACTIVA');

    const tarjeta = await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, {
      metodoPago: '4111 1111 1111 1111',
    });
    expect(tarjeta.estado).toBe(400);
    expect((await e.operador.n.get('/cuentas?estado=caida')).cuerpo.total).toBe(1);
    expect((await e.operador.n.get('/cuentas?conLibres=true&estado=activa')).cuerpo.total).toBe(0);
  });
});
