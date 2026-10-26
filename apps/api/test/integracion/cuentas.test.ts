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
      'cuenta_servicio.creada',
      'perfil_cuenta.editado',
      'cuenta_servicio.credenciales_vistas',
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
    expect(acciones.map((a) => a.accion)).toEqual([
      'perfil_cuenta.asignado',
      'perfil_cuenta.liberado',
    ]);
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

  it('el cliente ve los datos de su perfil solo con la suscripción vigente y el equipo arma el mensaje', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    const p2 = e.cuenta.listaPerfiles[1] as { id: string };
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}/perfiles/${p2.id}`, {
      nombre: 'Sala',
      pin: '2468',
    });
    expect(
      (
        await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${p2.id}/asignar`, {
          suscripcionId,
        })
      ).estado,
    ).toBe(201);
    const ruta = `/mi/perfiles/${suscripcionId}/revelar`;

    // Sin pagar: aparece, pero sin datos.
    const lista = await e.cliente.get('/mi/perfiles');
    expect(lista.cuerpo).toEqual([
      expect.objectContaining({
        suscripcionId,
        estado: 'pendiente_pago',
        perfil: { numero: 2, nombre: 'Sala', tienePin: true },
        disponible: false,
      }),
    ]);
    expect(JSON.stringify(lista.cuerpo)).not.toContain(CLAVE);
    expect((await e.cliente.post(ruta)).cuerpo.error.codigo).toBe('PERFIL_NO_DISPONIBLE');

    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa' },
    });
    const r = await e.cliente.post(ruta);
    expect(r.estado).toBe(200);
    expect(r.cabeceras['cache-control']).toContain('no-store');
    expect(r.cuerpo).toEqual({
      usuario: 'Maria.Cine@Example.com',
      clave: CLAVE,
      perfil: 'Sala',
      pin: '2468',
    });

    // Otro cliente no ve el perfil ajeno.
    const otro = await conectar(ctx, 'cliente');
    expect((await otro.n.post(ruta)).estado).toBe(404);
    expect((await otro.n.get('/mi/perfiles')).cuerpo).toEqual([]);

    // El equipo arma el mensaje; el enlace de WhatsApp solo con consentimiento.
    const clienteId = (
      await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } })
    ).clienteId;
    await ctx.prisma.contactoCliente.create({
      data: { clienteId, tipo: 'whatsapp', valor: '+58 414-000-0000' },
    });
    const rutaMensaje = `/cuentas/${e.cuenta.id}/perfiles/${p2.id}/mensaje`;
    const sinPermiso = await conectar(ctx, 'ventas');
    expect((await sinPermiso.n.post(rutaMensaje)).estado).toBe(403);
    const m1 = await e.operador.n.post(rutaMensaje);
    expect(m1.estado).toBe(201);
    expect(m1.cuerpo.texto).toContain(`Clave: ${CLAVE}`);
    expect(m1.cuerpo.texto).toContain('PIN: 2468');
    expect(m1.cuerpo.whatsapp).toBeNull();
    await ctx.prisma.contactoCliente.updateMany({
      where: { clienteId },
      data: { consentimientoEn: new Date() },
    });
    const m2 = await e.operador.n.post(rutaMensaje);
    expect(m2.cuerpo.whatsapp).toMatch(/^https:\/\/wa\.me\/584140000000\?text=/);

    // Cuenta caída: el cliente no ve datos viejos.
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'caida' });
    expect((await e.cliente.post(ruta)).cuerpo.error.codigo).toBe('CUENTA_EN_REVISION');
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'activa' });

    // Vencida: desaparece de la lista y no se muestra.
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'vencida' },
    });
    expect((await e.cliente.get('/mi/perfiles')).cuerpo).toEqual([]);
    expect((await e.cliente.post(ruta)).cuerpo.error.codigo).toBe('PERFIL_NO_DISPONIBLE');

    const auditoria = await ctx.prisma.auditoria.findMany({
      where: {
        entidadId: p2.id,
        accion: { in: ['perfil_cuenta.visto_por_cliente', 'perfil_cuenta.mensaje_armado'] },
      },
    });
    expect(auditoria).toHaveLength(3);
    const todo = JSON.stringify(auditoria);
    expect(todo).not.toContain(CLAVE);
    // El PIN solo son dígitos (podría aparecer al azar en un id): se revisan las claves guardadas.
    for (const a of auditoria) {
      expect(Object.keys(a.despues as object).sort()).toEqual(
        a.accion === 'perfil_cuenta.mensaje_armado'
          ? ['conCorreo', 'conWhatsapp', 'cuentaId', 'suscripcionId']
          : ['conPin', 'cuentaId', 'suscripcionId'],
      );
    }
    expect(todo.toLowerCase()).not.toContain('maria.cine');
  });
});
