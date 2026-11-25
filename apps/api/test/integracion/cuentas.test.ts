import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TrabajosService } from '../../src/automatizaciones/trabajos.service.js';
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
    facturaEn: '2099-11-05',
    metodoPago: 'Tarjeta ···· 1234',
  });
  expect(cuenta.estado).toBe(201);
  // Revisados y aptos para la web (si no, el plan queda agotado).
  await operador.n.post('/cuentas/entrega-web/aptos', {
    perfilIds: (cuenta.cuerpo.listaPerfiles as { id: string }[]).map((p) => p.id),
    apto: true,
  });
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
      facturaEn: '2099-11-05',
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
        { numero: 1, nombre: 'Perfil 1', pin: null, usuarioMiembro: null, claveMiembro: null },
        { numero: 2, nombre: 'Niños', pin: '4321', usuarioMiembro: null, claveMiembro: null },
        { numero: 3, nombre: 'Perfil 3', pin: null, usuarioMiembro: null, claveMiembro: null },
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
    expect(cuenta2.cuerpo.listaPerfiles[0].nombre).toBe('Cuenta individual');
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
      where: { entidad: 'perfil_cuenta', accion: { not: 'perfil_cuenta.apto_web' } },
      select: { accion: true },
      orderBy: { fecha: 'asc' },
    });
    expect(acciones.map((a) => a.accion)).toEqual([
      'perfil_cuenta.asignado',
      'perfil_cuenta.liberado',
    ]);
  });

  it('cambia el orden de los perfiles: los PIN y clientes van con su perfil y se renumeran', async () => {
    const e = await escenario();
    const [p1, p2, p3] = e.cuenta.listaPerfiles as { id: string }[];
    const pin = await e.operador.n.patch(`/cuentas/${e.cuenta.id}/perfiles/${p3!.id}`, {
      nombre: 'Ana',
      pin: '4321',
    });
    expect(pin.estado).toBe(200);

    const ruta = `/cuentas/${e.cuenta.id}/perfiles/orden`;
    const r = await e.operador.n.post(ruta, { perfilIds: [p3!.id, p1!.id, p2!.id] });
    expect(r.estado).toBe(200);
    expect(
      r.cuerpo.listaPerfiles.map(
        (p: { id: string; numero: number; nombre: string; tienePin: boolean }) => [
          p.id,
          p.numero,
          p.nombre,
          p.tienePin,
        ],
      ),
    ).toEqual([
      [p3!.id, 1, 'Ana', true],
      [p1!.id, 2, 'Perfil 2', false],
      [p2!.id, 3, 'Perfil 3', false],
    ]);
    const credenciales = await e.admin.n.post(`/cuentas/${e.cuenta.id}/revelar`, {});
    expect(credenciales.cuerpo.perfiles[0]).toMatchObject({
      numero: 1,
      nombre: 'Ana',
      pin: '4321',
    });

    // Lista incompleta o con perfiles de otra cuenta: no.
    const corta = await e.operador.n.post(ruta, { perfilIds: [p1!.id, p2!.id] });
    expect(corta.cuerpo.error.codigo).toBe('ORDEN_DESACTUALIZADO');
    const repetida = await e.operador.n.post(ruta, { perfilIds: [p1!.id, p1!.id, p2!.id] });
    expect(repetida.estado).toBe(400);
    expect((await e.cliente.post(ruta, { perfilIds: [p1!.id, p2!.id, p3!.id] })).estado).toBe(403);

    const auditoria = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'cuenta_servicio.perfiles_ordenados' },
    });
    expect(auditoria.despues).toEqual({ orden: [3, 1, 2] });
  });

  it('una cuenta caída no recibe asignaciones y el método de pago no acepta números de tarjeta', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    const caida = await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'caida' });
    expect(caida.cuerpo.estado).toBe('caida');
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

  it('una caída entra en la cola de reposición y se repone en otra cuenta con los días perdidos', async () => {
    const e = await escenario();
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    // Activa, para que tenga vencimiento.
    const vence = new Date(Date.now() + 20 * 86_400_000);
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa', venceEn: vence },
    });
    const p1 = e.cuenta.listaPerfiles[0] as { id: string };
    await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${p1.id}/asignar`, { suscripcionId });
    expect((await e.operador.n.get('/cuentas/reposicion')).cuerpo).toEqual([]);

    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'caida' });
    // Se cayó hace 3 días.
    await ctx.prisma.cuentaServicio.update({
      where: { id: e.cuenta.id },
      data: { caidaEn: new Date(Date.now() - 3 * 86_400_000 - 60_000) },
    });
    const cola = (await e.operador.n.get('/cuentas/reposicion')).cuerpo;
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({
      perfilId: p1.id,
      diasPerdidos: 3,
      libres: 0,
      suscripcion: { id: suscripcionId },
    });
    expect((await e.operador.n.post(`/cuentas/reposicion/${p1.id}`, {})).cuerpo.error.codigo).toBe(
      'SIN_PERFILES_LIBRES',
    );

    const nueva = await e.operador.n.post('/cuentas', {
      servicioId: e.servicioId,
      usuario: 'reemplazo@example.com',
      clave: 'x',
      perfiles: 2,
    });
    expect((await e.operador.n.get('/cuentas/reposicion')).cuerpo[0].libres).toBe(2);
    expect((await e.cliente.post(`/cuentas/reposicion/${p1.id}`, {})).estado).toBe(403);
    const r = await e.operador.n.post(`/cuentas/reposicion/${p1.id}`, { compensar: true });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({
      cuentaId: nueva.cuerpo.id,
      perfil: { numero: 1 },
      diasCompensados: 3,
    });
    expect((await e.operador.n.get('/cuentas/reposicion')).cuerpo).toEqual([]);
    const s = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: suscripcionId } });
    expect(Math.round((s.venceEn!.getTime() - vence.getTime()) / 86_400_000)).toBe(3);
    const perfil = await ctx.prisma.perfilCuenta.findFirstOrThrow({ where: { suscripcionId } });
    expect(perfil.cuentaId).toBe(nueva.cuerpo.id);
    expect((await e.operador.n.post(`/cuentas/reposicion/${p1.id}`, {})).cuerpo.error.codigo).toBe(
      'NADA_QUE_REPONER',
    );
    // Al volver a activa se borra la fecha de la caída.
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'activa' });
    expect(
      (await ctx.prisma.cuentaServicio.findUniqueOrThrow({ where: { id: e.cuenta.id } })).caidaEn,
    ).toBeNull();
  });

  it('un perfil de respaldo se usa primero al reponer y una cuenta completa pasa a individuales', async () => {
    const e = await escenario();
    const completa = await e.operador.n.post('/cuentas', {
      servicioId: e.servicioId,
      usuario: 'completa@example.com',
      clave: 'x',
      modo: 'completa',
      perfiles: 1,
    });
    const cupo = completa.cuerpo.listaPerfiles[0] as { id: string };
    const ruta = (c: string, p: string) => `/cuentas/${c}/perfiles/${p}`;

    // Respaldo: solo un perfil libre; no cuenta como libre.
    const resp = await e.operador.n.patch(ruta(completa.cuerpo.id, cupo.id), { respaldo: true });
    expect(resp.cuerpo.perfiles).toMatchObject({ libres: 0, respaldos: 1 });

    // Una suscripción en la cuenta caída va al respaldo, no a la cuenta con más libres.
    const alta = await e.cliente.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    const p1 = e.cuenta.listaPerfiles[0] as { id: string };
    await e.operador.n.post(`${ruta(e.cuenta.id, p1.id)}/asignar`, { suscripcionId });
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { estado: 'caida' });
    expect((await e.operador.n.get('/cuentas/reposicion')).cuerpo[0].libres).toBe(1);
    const r = await e.operador.n.post(`/cuentas/reposicion/${p1.id}`, { compensar: false });
    expect(r.cuerpo).toMatchObject({ cuentaId: completa.cuerpo.id, diasCompensados: 0 });

    // Pasar a individuales: el cliente queda en el perfil 1 y se agregan los demás libres.
    const ind = await e.operador.n.post(`/cuentas/${completa.cuerpo.id}/individuales`, {
      perfiles: 4,
    });
    expect(ind.estado).toBe(200);
    expect(ind.cuerpo.modo).toBe('perfiles');
    expect(ind.cuerpo.perfiles).toMatchObject({ total: 4, asignados: 1, libres: 3 });
    expect(ind.cuerpo.listaPerfiles[0]).toMatchObject({
      nombre: 'Perfil 1',
      asignacion: { suscripcionId },
    });
    expect(
      (await e.operador.n.post(`/cuentas/${completa.cuerpo.id}/individuales`, { perfiles: 4 }))
        .cuerpo.error.codigo,
    ).toBe('YA_INDIVIDUAL');
    expect(
      (await e.operador.n.post(`/cuentas/${e.cuenta.id}/individuales`, { perfiles: 1 })).estado,
    ).toBe(400);
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
      perfil: '2',
      pin: '2468',
      tipo: 'perfiles',
      miembro: false,
      contrato: expect.stringContaining('Perfil: 2\nPin: 2468'),
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
    // Se envía con el mensaje de datos de la cuenta.
    expect(m1.cuerpo.texto).toMatch(/^Hola, .+\.\nLos datos de su cuenta de /);
    expect(m1.cuerpo.texto).toContain(`Contraseña: ${CLAVE}`);
    expect(m1.cuerpo.texto).toContain('Perfil: 2\nPIN: 2468');
    expect(m1.cuerpo.texto).toMatch(/¡Gracias por confiar en NV Streaming!$/);
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

  it('corta con clave y PIN nuevos, mueve al cliente y arma los avisos de la cuenta', async () => {
    const e = await escenario();
    const subs: string[] = [];
    const clientes: Awaited<ReturnType<typeof conectar>>[] = [];
    for (let i = 0; i < 2; i++) {
      const c = await conectar(ctx, 'cliente');
      clientes.push(c);
      const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
      subs.push(alta.cuerpo.suscripcion.id as string);
    }
    await ctx.prisma.suscripcion.updateMany({ data: { estado: 'activa' } });
    const [p1, p2, p3] = e.cuenta.listaPerfiles as { id: string }[];
    const ruta = (p: { id: string }, accion: string) =>
      `/cuentas/${e.cuenta.id}/perfiles/${p.id}/${accion}`;
    await e.operador.n.post(ruta(p1!, 'asignar'), { suscripcionId: subs[0] });
    await e.operador.n.post(ruta(p2!, 'asignar'), { suscripcionId: subs[1] });

    // Mover: a un perfil libre de otra cuenta del mismo servicio.
    const otra = await e.operador.n.post('/cuentas', {
      servicioId: e.servicioId,
      usuario: 'otra.cine@example.com',
      clave: 'Otra-123',
      perfiles: 2,
      facturaEn: '2099-12-01',
    });
    // Las cuentas vencidas o sin fecha no salen como destino.
    for (const [usuario, facturaEn] of [
      ['vencida.cine@example.com', '2020-01-01'],
      ['sinfecha.cine@example.com', null],
    ] as const) {
      await e.operador.n.post('/cuentas', {
        servicioId: e.servicioId,
        usuario,
        clave: 'Vieja-123',
        perfiles: 2,
        ...(facturaEn ? { facturaEn } : {}),
      });
    }
    const destinos = await e.operador.n.get(ruta(p2!, 'destinos'));
    expect(destinos.cuerpo.map((d: { cuentaId: string }) => d.cuentaId).sort()).toEqual(
      [e.cuenta.id, otra.cuerpo.id].sort(),
    );
    const destino = otra.cuerpo.listaPerfiles[1].id as string;
    const movido = await e.operador.n.post(ruta(p2!, 'mover'), { destinoPerfilId: destino });
    expect(movido.estado).toBe(200);
    expect(movido.cuerpo.listaPerfiles[1].asignacion.suscripcionId).toBe(subs[1]);
    const vieja = await e.operador.n.get(`/cuentas/${e.cuenta.id}`);
    expect(vieja.cuerpo.listaPerfiles[1]).toMatchObject({ estado: 'libre', asignacion: null });
    expect(
      (await e.operador.n.post(ruta(p3!, 'mover'), { destinoPerfilId: destino })).cuerpo.error
        .codigo,
    ).toBe('PERFIL_NO_ASIGNADO');

    // Avisos de la cuenta: uno por cliente vigente, con la nota.
    const avisos = await e.operador.n.post(`/cuentas/${otra.cuerpo.id}/avisos`, {
      nota: 'Si ve un aviso de dispositivo nuevo, acéptelo.',
    });
    expect(avisos.estado).toBe(200);
    expect(avisos.cuerpo.avisos).toHaveLength(1);
    expect(avisos.cuerpo.avisos[0].texto).toContain('Clave: Otra-123');
    expect(avisos.cuerpo.avisos[0].texto).toContain('acéptelo');
    expect(
      (await (await conectar(ctx, 'ventas')).n.post(`/cuentas/${otra.cuerpo.id}/avisos`)).estado,
    ).toBe(403);

    // Cortar a quien aún está vigente pide el motivo.
    const sinMotivo = await e.operador.n.post(ruta(p1!, 'liberar'), { nuevoPin: '9753' });
    expect(sinMotivo.estado).toBe(400);
    expect(sinMotivo.cuerpo.error.codigo).toBe('MOTIVO_REQUERIDO');
    expect(
      (await ctx.prisma.perfilCuenta.findUniqueOrThrow({ where: { id: p1!.id } })).estado,
    ).toBe('asignado');

    // Cortar con clave y PIN nuevos: la cuenta guarda la clave y el perfil el PIN.
    const corte = await e.operador.n.post(ruta(p1!, 'liberar'), {
      motivo: 'Compartió la cuenta con otras personas',
      nuevaClave: 'Nueva-456',
      nuevoPin: '9753',
    });
    expect(corte.estado).toBe(201);
    // Queda suspendida con su motivo: el cliente lo ve y no la renueva él mismo.
    const suya = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id: subs[0] } });
    expect(suya).toMatchObject({
      estado: 'suspendida',
      motivoSuspension: 'Compartió la cuenta con otras personas',
    });
    const vista = await clientes[0]!.n.get(`/mi/suscripciones/${subs[0]}`);
    expect(vista.cuerpo.motivoSuspension).toBe('Compartió la cuenta con otras personas');
    const renovar = await clientes[0]!.n.post(`/mi/suscripciones/${subs[0]}/renovar`, {});
    expect(renovar.cuerpo.error.codigo).toBe('SUSPENDIDA_POR_EQUIPO');
    expect(
      await ctx.prisma.eventoSuscripcion.count({
        where: { suscripcionId: subs[0], tipo: 'suspension', motivo: { contains: 'Compartió' } },
      }),
    ).toBe(1);
    expect(corte.cuerpo.listaPerfiles[0]).toMatchObject({ estado: 'libre', tienePin: true });
    const cred = await e.operador.n.post(`/cuentas/${e.cuenta.id}/revelar`);
    expect(cred.cuerpo.clave).toBe('Nueva-456');
    expect(cred.cuerpo.perfiles[0].pin).toBe('9753');
    const auditoria = await ctx.prisma.auditoria.findFirstOrThrow({
      where: { accion: 'perfil_cuenta.liberado' },
    });
    expect(JSON.stringify(auditoria)).not.toContain('Nueva-456');
    expect(
      (await e.operador.n.post(ruta(p3!, 'liberar'), { nuevoPin: '12' })).cuerpo.error.codigo,
    ).toBe('DATOS_INVALIDOS');
  });

  it('en un plan familiar el miembro entra con su propio correo, sin PIN', async () => {
    const e = await escenario();
    const proveedorId = (
      await ctx.prisma.servicio.findUniqueOrThrow({ where: { id: e.servicioId } })
    ).proveedorId;
    const servicio = await e.admin.n.post('/catalogo/servicios', {
      proveedorId,
      nombre: 'Spotify Premium',
      slug: 'spotify-premium',
    });
    const plan = await e.admin.n.post('/catalogo/planes', {
      servicioId: servicio.cuerpo.id,
      nombre: 'Mensual',
      precioUsd: '3.00',
      duracionCantidad: 1,
      duracionUnidad: 'mes',
    });
    const cuenta = await e.operador.n.post('/cuentas', {
      servicioId: servicio.cuerpo.id,
      usuario: 'familia@example.com',
      clave: 'Titular-789',
      perfiles: 6,
      facturaEn: '2099-11-05',
    });
    await e.operador.n.post('/cuentas/entrega-web/aptos', {
      perfilIds: (cuenta.cuerpo.listaPerfiles as { id: string }[]).map((p) => p.id),
      apto: true,
    });
    const alta = await e.cliente.post('/mi/suscripciones', {
      planId: plan.cuerpo.id,
      moneda: 'USD',
    });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa' },
    });
    const cupo = cuenta.cuerpo.listaPerfiles[2] as { id: string };
    const rutaCupo = `/cuentas/${cuenta.cuerpo.id}/perfiles/${cupo.id}`;
    const editado = await e.operador.n.patch(rutaCupo, {
      usuarioMiembro: 'miembro@gmail.com',
      claveMiembro: 'Propia-111',
    });
    expect(editado.cuerpo.listaPerfiles[2].tieneMiembro).toBe(true);
    await e.operador.n.post(`${rutaCupo}/asignar`, { suscripcionId });

    const lista = await e.cliente.get('/mi/perfiles');
    expect(lista.cuerpo[0]).toMatchObject({ tipo: 'familiar' });
    const r = await e.cliente.post(`/mi/perfiles/${suscripcionId}/revelar`);
    expect(r.cuerpo).toMatchObject({
      usuario: 'miembro@gmail.com',
      clave: 'Propia-111',
      tipo: 'familiar',
      miembro: true,
      pin: null,
    });
    expect(JSON.stringify(r.cuerpo)).not.toContain('Titular-789');
    const m = await e.operador.n.post(`${rutaCupo}/mensaje`);
    expect(m.cuerpo.texto).toContain('Correo: miembro@gmail.com\nContraseña: Propia-111');
    expect(m.cuerpo.texto).not.toContain('Titular-789');
    const fila = await ctx.prisma.perfilCuenta.findUniqueOrThrow({ where: { id: cupo.id } });
    expect(fila.usuarioMiembroCifrado).not.toContain('miembro');

    // Al cortar, el cupo queda libre y conserva el correo del miembro (como en el Gestor).
    const corte = await e.operador.n.post(`${rutaCupo}/liberar`, { motivo: 'Dejó el plan' });
    expect(corte.cuerpo.listaPerfiles[2]).toMatchObject({ estado: 'libre', tieneMiembro: true });
  });

  it('da de alta desde un perfil libre: cliente nuevo, suscripción activa, venta en Caja y perfil asignado', async () => {
    const e = await escenario();
    const libre = e.cuenta.listaPerfiles[1] as { id: string };
    const ruta = `/cuentas/${e.cuenta.id}/perfiles/${libre.id}/alta`;

    // Validación: ni cliente ni plazo.
    const malo = await e.operador.n.post(ruta, { planId: e.planId, precio: '4', moneda: 'USD' });
    expect(malo.estado).toBe(400);

    const r = await e.operador.n.post(ruta, {
      clienteNuevo: { nombre: 'Rosa Alta', whatsapp: '+584141234567', aceptaWhatsapp: true },
      planId: e.planId,
      meses: 3,
      precio: '4.50',
      moneda: 'USD',
      metodoCobroId: e.zelleId,
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.cuenta.listaPerfiles[1]).toMatchObject({ estado: 'asignado' });
    const s = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: r.cuerpo.suscripcionId },
      include: { cliente: true },
    });
    expect(s.estado).toBe('activa');
    expect(s.cliente.nombre).toBe('Rosa Alta');
    const dias = (s.venceEn!.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(85);
    expect(dias).toBeLessThan(95);
    const factura = await ctx.prisma.factura.findUniqueOrThrow({
      where: { id: r.cuerpo.facturaId },
      include: { pagos: true },
    });
    expect(factura).toMatchObject({ estado: 'pagada', periodos: 3 });
    expect(factura.total.toFixed(2)).toBe('13.50');
    expect(factura.pagos[0]).toMatchObject({ estado: 'confirmado' });
    expect(factura.pagos[0]!.montoRecibido!.toFixed(2)).toBe('13.50');
    // No deja una entrega manual pendiente: el perfil ya se entregó.
    expect(await ctx.prisma.entrega.count({ where: { suscripcionId: s.id } })).toBe(0);

    // El mismo perfil ya no está libre.
    const otra = await e.operador.n.post(ruta, {
      clienteId: s.clienteId,
      planId: e.planId,
      meses: 1,
      precio: '5',
      moneda: 'USD',
    });
    expect(otra.estado).toBe(409);
    expect(otra.cuerpo.error.codigo).toBe('PERFIL_NO_LIBRE');

    // Cliente que ya está, fecha exacta y sin pago: no se emite factura.
    const tercero = e.cuenta.listaPerfiles[2] as { id: string };
    const sinPago = await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${tercero.id}/alta`, {
      clienteId: s.clienteId,
      planId: e.planId,
      vence: '2099-01-31',
      precio: '7',
      moneda: 'USD',
    });
    expect(sinPago.estado).toBe(201);
    expect(sinPago.cuerpo.facturaId).toBeNull();
    const s2 = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: sinPago.cuerpo.suscripcionId },
    });
    expect(s2.venceEn!.toISOString()).toBe('2099-01-31T23:59:59.000Z');

    // Un correo propio solo va en los cupos de un plan familiar.
    const primero = e.cuenta.listaPerfiles[0] as { id: string };
    const conMiembro = await e.operador.n.post(
      `/cuentas/${e.cuenta.id}/perfiles/${primero.id}/alta`,
      {
        clienteId: s.clienteId,
        planId: e.planId,
        meses: 1,
        precio: '5',
        moneda: 'USD',
        usuarioMiembro: 'otro@gmail.com',
      },
    );
    expect(conMiembro.estado).toBe(400);
    // Y nada quedó a medias: el perfil sigue libre.
    const fila = await ctx.prisma.perfilCuenta.findUniqueOrThrow({ where: { id: primero.id } });
    expect(fila.estado).toBe('libre');
  });

  it('muestra una plataforma con sus cuentas (sin las retiradas) y su tipo', async () => {
    const e = await escenario();
    const r = await e.operador.n.get(`/cuentas/plataforma/${e.servicioId}`);
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ servicio: { id: e.servicioId }, tipo: 'perfiles' });
    expect(r.cuerpo.cuentas).toHaveLength(1);
    expect(r.cuerpo.cuentas[0].listaPerfiles).toHaveLength(3);
    expect(JSON.stringify(r.cuerpo)).not.toContain(CLAVE);
    await ctx.prisma.cuentaServicio.update({
      where: { id: e.cuenta.id },
      data: { estado: 'retirada' },
    });
    expect(
      (await e.operador.n.get(`/cuentas/plataforma/${e.servicioId}`)).cuerpo.cuentas,
    ).toHaveLength(0);
    // «Todas las cuentas» tampoco la muestra: las borradas solo salen si se piden.
    const todas = await e.operador.n.get(`/cuentas?servicioId=${e.servicioId}`);
    expect(todas.cuerpo.total).toBe(0);
    const borradas = await e.operador.n.get(`/cuentas?servicioId=${e.servicioId}&estado=retirada`);
    expect(borradas.cuerpo.total).toBe(1);
    expect((await e.cliente.get(`/cuentas/plataforma/${e.servicioId}`)).estado).toBe(403);
  });
  it('la plataforma trae el correo completo (con permiso, auditado), el responsable y el contacto', async () => {
    const e = await escenario();
    const libre = e.cuenta.listaPerfiles[0] as { id: string };
    const alta = await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${libre.id}/alta`, {
      clienteNuevo: {
        nombre: 'Lucía Gestor',
        responsable: '  Pedro   Reventa ',
        whatsapp: '584121234567',
        aceptaWhatsapp: true,
      },
      planId: e.planId,
      meses: 1,
      precio: '4',
      moneda: 'USD',
    });
    expect(alta.estado).toBe(201);

    const r = await e.operador.n.get(`/cuentas/plataforma/${e.servicioId}`);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.correos).toEqual({ [e.cuenta.id]: 'Maria.Cine@Example.com' });
    expect(JSON.stringify(r.cuerpo)).not.toContain(CLAVE);
    const asignado = r.cuerpo.cuentas[0].listaPerfiles[0].asignacion;
    expect(r.cuerpo.clientes[asignado.cliente.id]).toMatchObject({
      responsable: 'Pedro Reventa',
      whatsapp: '+584121234567',
    });
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'cuenta.correos_vistos' } }),
    ).toBeGreaterThan(0);

    expect((await e.operador.n.get('/clientes/responsables')).cuerpo).toContain('Pedro Reventa');
    // Al escribir el responsable se llena su número (el más usado entre sus clientes).
    expect((await e.operador.n.get('/clientes/responsables/contactos')).cuerpo).toContainEqual({
      responsable: 'Pedro Reventa',
      whatsapp: '+584121234567',
      telegram: null,
    });
    const filtrado = await e.operador.n.get('/clientes?responsable=pedro%20reventa');
    expect(filtrado.cuerpo.elementos.map((c: { nombre: string }) => c.nombre)).toEqual([
      'Lucía Gestor',
    ]);
    expect(filtrado.cuerpo.elementos[0].responsable).toBe('Pedro Reventa');
  });
});

describe('Cobros: vencimientos y cortes', () => {
  const DIA = 24 * 3600_000;

  it('«Renovar» por meses o hasta una fecha deja la factura pagada y la fecha nueva', async () => {
    const e = await escenario();
    const c = await conectar(ctx, 'cliente');
    const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const id = alta.cuerpo.suscripcion.id as string;
    // El alta ya está pagada y vence mañana.
    await ctx.prisma.factura.updateMany({
      where: { suscripcionId: id },
      data: { estado: 'pagada', pagadaEn: new Date() },
    });
    const vence = new Date(Date.now() + 1.2 * DIA);
    await ctx.prisma.suscripcion.update({
      where: { id },
      data: { estado: 'activa', inicioEn: new Date(), venceEn: vence },
    });
    // La renovación pendiente (aviso automático) se reemplaza por la pagada.
    const pendiente = await e.operador.n.post(`/suscripciones/${id}/renovar`, {});
    expect(pendiente.estado).toBe(200);
    const pendienteId = pendiente.cuerpo.factura.id as string;

    // Meses y fecha a la vez, o ninguno: error.
    expect(
      (
        await e.operador.n.post(`/suscripciones/${id}/renovar-pagada`, {
          metodoCobroId: e.zelleId,
        })
      ).estado,
    ).toBe(400);

    const r = await e.operador.n.post(`/suscripciones/${id}/renovar-pagada`, {
      meses: 3,
      metodoCobroId: e.zelleId,
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    const pagada = await ctx.prisma.factura.findUniqueOrThrow({
      where: { id: r.cuerpo.factura.id },
    });
    expect(pagada).toMatchObject({ estado: 'pagada', periodos: 3, concepto: 'renovacion' });
    expect(
      await ctx.prisma.pago.count({ where: { facturaId: pagada.id, estado: 'confirmado' } }),
    ).toBe(1);
    expect(
      (await ctx.prisma.factura.findUniqueOrThrow({ where: { id: pendienteId } })).estado,
    ).toBe('anulada');
    const tras = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id } });
    expect(tras.estado).toBe('activa');
    // Tres meses desde el vencimiento (no desde hoy): no pierde días.
    const dias = (tras.venceEn!.getTime() - vence.getTime()) / DIA;
    expect(dias).toBeGreaterThanOrEqual(89);
    expect(dias).toBeLessThanOrEqual(92);

    // Hasta una fecha exacta (día de Venezuela).
    const destino = new Date(tras.venceEn!.getTime() + 45 * DIA);
    const dia = destino.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    const conFecha = await e.operador.n.post(`/suscripciones/${id}/renovar-pagada`, {
      venceEn: dia,
      metodoCobroId: e.zelleId,
    });
    expect(conFecha.estado, JSON.stringify(conFecha.cuerpo)).toBe(200);
    const final = await ctx.prisma.suscripcion.findUniqueOrThrow({ where: { id } });
    expect(final.venceEn!.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })).toBe(dia);
    expect(
      (await ctx.prisma.factura.findUniqueOrThrow({ where: { id: conFecha.cuerpo.factura.id } }))
        .estado,
    ).toBe('pagada');
    // Una fecha que ya pasó no se acepta.
    expect(
      (
        await e.operador.n.post(`/suscripciones/${id}/renovar-pagada`, {
          venceEn: '2020-01-01',
          metodoCobroId: e.zelleId,
        })
      ).estado,
    ).toBe(400);
  });

  it('una cuenta con todos sus perfiles a nombre de la misma persona sale una sola vez', async () => {
    const e = await escenario();
    const c = await conectar(ctx, 'cliente');
    const subs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
      subs.push(alta.cuerpo.suscripcion.id as string);
    }
    await ctx.prisma.suscripcion.updateMany({
      where: { id: { in: subs } },
      data: { estado: 'en_gracia', venceEn: new Date(Date.now() - 3 * DIA) },
    });
    const cuenta = await e.operador.n.post('/cuentas', {
      servicioId: e.servicioId,
      usuario: 'toda.de.uno@example.com',
      clave: 'Uno-123',
      perfiles: 2,
    });
    expect(cuenta.estado).toBe(201);
    const perfiles = cuenta.cuerpo.listaPerfiles as { id: string }[];
    for (const [i, id] of subs.entries()) {
      const r = await e.operador.n.post(
        `/cuentas/${cuenta.cuerpo.id}/perfiles/${perfiles[i]!.id}/asignar`,
        { suscripcionId: id },
      );
      expect(r.estado).toBe(201);
    }
    const lista = await e.operador.n.get('/suscripciones/vencimientos-cortes');
    const deLaCuenta = lista.cuerpo.cortes.filter(
      (s: { lugar: { cuentaId: string } | null }) => s.lugar?.cuentaId === cuenta.cuerpo.id,
    );
    expect(deLaCuenta).toHaveLength(1);
    expect(deLaCuenta[0].lugar.etiqueta).toBe('Cuenta completa');
    expect([...deLaCuenta[0].lugar.completa.suscripcionIds].sort()).toEqual([...subs].sort());
    expect(deLaCuenta[0].lugar.completa.perfiles).toBe(2);

    // Si un perfil queda libre ya no es de una sola persona: sale cada uno por su lado.
    await ctx.prisma.perfilCuenta.update({
      where: { id: perfiles[1]!.id },
      data: { estado: 'libre', suscripcionId: null },
    });
    const otra = await e.operador.n.get('/suscripciones/vencimientos-cortes');
    const sueltas = otra.cuerpo.cortes.filter(
      (s: { lugar: { cuentaId: string; completa?: unknown } | null }) =>
        s.lugar?.cuentaId === cuenta.cuerpo.id,
    );
    expect(sueltas).toHaveLength(1);
    expect(sueltas[0].lugar.completa ?? null).toBeNull();
  });

  it('separa vencimientos de cortes, corta con clave y PIN nuevos y deja el historial', async () => {
    const e = await escenario();
    // Tres clientes: uno vence mañana, uno venció hace 3 días y otro con dos perfiles vencidos.
    const subs: string[] = [];
    const clientes: Awaited<ReturnType<typeof conectar>>[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await conectar(ctx, 'cliente');
      clientes.push(c);
      const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
      subs.push(alta.cuerpo.suscripcion.id as string);
    }
    // El tercer cliente tiene una segunda suscripción (otro perfil en la misma cuenta).
    const extra = await clientes[2]!.n.post('/mi/suscripciones', {
      planId: e.planId,
      moneda: 'USD',
    });
    subs.push(extra.cuerpo.suscripcion.id as string);
    const ahora = Date.now();
    const vence = [ahora + 1.2 * DIA, ahora - 3 * DIA, ahora - 3 * DIA, ahora - 3 * DIA];
    for (const [i, id] of subs.entries()) {
      await ctx.prisma.suscripcion.update({
        where: { id },
        data: { estado: i === 0 ? 'activa' : 'en_gracia', venceEn: new Date(vence[i]!) },
      });
    }
    const cuenta = await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { perfiles: 4 });
    const perfiles = cuenta.cuerpo.listaPerfiles as { id: string }[];
    for (const [i, id] of subs.entries()) {
      const r = await e.operador.n.post(
        `/cuentas/${e.cuenta.id}/perfiles/${perfiles[i]!.id}/asignar`,
        { suscripcionId: id },
      );
      expect(r.estado).toBe(201);
    }

    const lista = await e.operador.n.get('/suscripciones/vencimientos-cortes');
    expect(lista.estado).toBe(200);
    expect(lista.cuerpo.horaCorte).toBe(21);
    const ids = (l: { id: string }[]) => l.map((s) => s.id).sort();
    expect(ids(lista.cuerpo.cortes)).toEqual(subs.slice(1).sort());
    expect(lista.cuerpo.cortes[0].lugar).toMatchObject({
      cuentaId: e.cuenta.id,
      tipo: 'perfiles',
      otrosActivos: 1,
    });
    expect(lista.cuerpo.cortes[0].diasVencida).toBeGreaterThanOrEqual(3);
    // El de mañana (o pasado, según la hora) no está en cortes.
    expect(ids(lista.cuerpo.cortes)).not.toContain(subs[0]);

    // «Cobrar» lo deja marcado con la fecha y quién; se puede volver a cobrar.
    expect(lista.cuerpo.cortes.every((s: { cobro: unknown }) => s.cobro === null)).toBe(true);
    const cobrado = await e.operador.n.post(`/suscripciones/${subs[1]}/cobrado`, {
      canal: 'whatsapp',
    });
    expect(cobrado.estado).toBe(200);
    expect(
      (await e.operador.n.post(`/suscripciones/${subs[1]}/cobrado`, { canal: 'sms' })).estado,
    ).toBe(400);
    const otraVez = await e.operador.n.post(`/suscripciones/${subs[1]}/cobrado`, {
      canal: 'telegram',
    });
    expect(otraVez.estado).toBe(200);
    const conCobro = await e.operador.n.get('/suscripciones/vencimientos-cortes');
    const marcada = conCobro.cuerpo.cortes.find((s: { id: string }) => s.id === subs[1]);
    expect(marcada.cobro).toMatchObject({ en: otraVez.cuerpo.cobradoEn });
    expect(typeof marcada.cobro.por).toBe('string');
    expect(
      await ctx.prisma.auditoria.count({
        where: { accion: 'suscripcion.cobrada', entidadId: subs[1] },
      }),
    ).toBe(2);

    // A quien todavía no vence solo se le corta con motivo.
    const pronto = await e.operador.n.post(`/suscripciones/${subs[0]}/cortar`, {});
    expect(pronto.cuerpo.error.codigo).toBe('MOTIVO_REQUERIDO');
    // Ventas no tiene permiso para cortar.
    expect(
      (await (await conectar(ctx, 'ventas')).n.post(`/suscripciones/${subs[1]}/cortar`)).estado,
    ).toBe(403);

    // Cortar con clave y PIN nuevos: el perfil queda libre y todos ven la clave nueva.
    const corte = await e.operador.n.post(`/suscripciones/${subs[1]}/cortar`, {
      nuevaClave: 'Corte-2468',
      nuevoPin: '1357',
    });
    expect(corte.estado).toBe(200);
    expect(corte.cuerpo).toEqual({ cortadas: 1 });
    const cred = await e.operador.n.post(`/cuentas/${e.cuenta.id}/revelar`);
    expect(cred.cuerpo.clave).toBe('Corte-2468');
    expect(cred.cuerpo.perfiles[1].pin).toBe('1357');
    const s1 = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: subs[1] },
      include: { perfilCuenta: true, eventos: true },
    });
    expect(s1.estado).toBe('suspendida');
    expect(s1.perfilCuenta).toBeNull();
    expect(s1.eventos.find((ev) => ev.motivo?.includes('Cortado'))).toBeTruthy();
    const aud = await ctx.prisma.auditoria.findMany({ where: { accion: 'suscripcion.cortada' } });
    expect(aud).toHaveLength(1);
    expect(JSON.stringify(aud)).not.toContain('Corte-2468');

    // A quien sigue en la cuenta se le avisa solo de la clave nueva (sin la clave).
    await ctx.app.get(TrabajosService).procesarTodo();
    const avisos = await ctx.prisma.correoSaliente.findMany({
      where: { para: clientes[0]!.usuario.correo, plantilla: 'datosAccesoActualizados' },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.texto).toContain('la clave');
    expect(avisos[0]!.texto).toContain('/cuenta/accesos');
    expect(JSON.stringify(avisos)).not.toContain('Corte-2468');
    const notif = await ctx.prisma.notificacion.findMany({
      where: { plantilla: 'datosAccesoActualizados' },
    });
    expect(JSON.stringify(notif)).not.toContain('Corte-2468');

    // Cortar uno = cortar todos los vencidos del mismo cliente en esa cuenta.
    const dos = await e.operador.n.post(`/suscripciones/${subs[2]}/cortar`, {});
    expect(dos.cuerpo).toEqual({ cortadas: 2 });
    const despues = await e.operador.n.get('/suscripciones/vencimientos-cortes');
    expect(despues.cuerpo.cortes).toEqual([]);
    expect((await e.operador.n.post(`/suscripciones/${subs[3]}/cortar`)).cuerpo.error.codigo).toBe(
      'SIN_LUGAR',
    );

    // Si renueva quien se cortó por vencimiento, vuelve a su mismo perfil (sigue libre).
    await ctx.prisma.cuentaServicio.update({
      where: { id: e.cuenta.id },
      data: { facturaEn: new Date('2099-12-01') },
    });
    await ctx.prisma.factura.updateMany({
      where: { suscripcionId: subs[1] },
      data: { estado: 'pagada', pagadaEn: new Date() },
    });
    const vuelve = await e.operador.n.post(`/suscripciones/${subs[1]}/renovar-pagada`, {
      meses: 1,
      metodoCobroId: e.zelleId,
    });
    expect(vuelve.estado, JSON.stringify(vuelve.cuerpo)).toBe(200);
    const s1b = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: subs[1] },
      include: { perfilCuenta: true },
    });
    expect(s1b.estado).toBe('activa');
    expect(s1b.perfilCuenta?.id).toBe(perfiles[1]!.id);
  });
});

describe('avisos de datos nuevos y planes familiares', () => {
  it('cambiar el correo, la clave o el PIN avisa a quienes lo usan, sin los datos', async () => {
    const e = await escenario();
    const ana = await conectar(ctx, 'cliente');
    const beto = await conectar(ctx, 'cliente');
    const subs: string[] = [];
    for (const c of [ana, beto]) {
      const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
      subs.push(alta.cuerpo.suscripcion.id as string);
    }
    await ctx.prisma.suscripcion.updateMany({
      where: { id: { in: subs } },
      data: { estado: 'activa', venceEn: new Date(Date.now() + 10 * 86_400_000) },
    });
    const perfiles = e.cuenta.listaPerfiles as { id: string }[];
    for (const [i, id] of subs.entries()) {
      await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${perfiles[i]!.id}/asignar`, {
        suscripcionId: id,
      });
    }
    const trabajos = ctx.app.get(TrabajosService);
    const avisosDe = (correo: string) =>
      ctx.prisma.correoSaliente.findMany({
        where: { para: correo, plantilla: 'datosAccesoActualizados' },
        orderBy: { creadoEn: 'asc' },
      });

    // Correo y clave de la cuenta: les llega a los dos.
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, {
      usuario: 'nuevo.correo@example.com',
      clave: 'Nueva-Clave-777',
    });
    await trabajos.procesarTodo();
    const [aAna] = await avisosDe(ana.usuario.correo);
    expect(aAna?.texto).toContain('el correo y la clave');
    expect((await avisosDe(beto.usuario.correo)).length).toBe(1);
    const todo = JSON.stringify(await ctx.prisma.correoSaliente.findMany());
    expect(todo).not.toContain('Nueva-Clave-777');
    expect(todo).not.toContain('nuevo.correo@example.com');

    // PIN de un perfil: solo a su dueña.
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}/perfiles/${perfiles[0]!.id}`, {
      pin: '2468',
    });
    await trabajos.procesarTodo();
    const ana2 = await avisosDe(ana.usuario.correo);
    expect(ana2).toHaveLength(2);
    expect(ana2[1]!.texto).toContain('el PIN de tu perfil');
    expect(ana2[1]!.texto).not.toContain('2468');
    expect(await avisosDe(beto.usuario.correo)).toHaveLength(1);
    // En «Mis accesos» queda qué cambió y cuándo (sin los valores).
    const mios = await ana.n.get('/mi/perfiles');
    expect(mios.cuerpo[0].cambioReciente.cambios).toEqual(['pin']);
    expect(JSON.stringify(mios.cuerpo)).not.toContain('2468');
    expect((await beto.n.get('/mi/perfiles')).cuerpo[0].cambioReciente.cambios).toEqual([
      'correo',
      'clave',
    ]);

    // Cambiar el nombre del perfil también se avisa.
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}/perfiles/${perfiles[0]!.id}`, {
      nombre: 'Ana TV',
    });
    await trabajos.procesarTodo();
    const ana3 = await avisosDe(ana.usuario.correo);
    expect(ana3).toHaveLength(3);
    expect(ana3[2]!.texto).toContain('el nombre de tu perfil');

    // Apagada la automatización, no sale nada.
    await ctx.prisma.automatizacion.update({
      where: { tipo: 'aviso_datos_acceso' },
      data: { activa: false },
    });
    await e.operador.n.patch(`/cuentas/${e.cuenta.id}`, { clave: 'Otra-Clave-888' });
    await trabajos.procesarTodo();
    expect(await avisosDe(beto.usuario.correo)).toHaveLength(1);
  });

  it('Spotify: cortar conserva el correo del miembro; eliminar lo borra y cancela', async () => {
    const e = await escenario();
    await ctx.prisma.servicio.update({ where: { id: e.servicioId }, data: { nombre: 'Spotify' } });
    const perfiles = e.cuenta.listaPerfiles as { id: string; numero: number }[];
    const miembroId = perfiles.find((p) => p.numero === 2)!.id;
    const otroId = perfiles.find((p) => p.numero === 3)!.id;
    const subs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const c = await conectar(ctx, 'cliente');
      const alta = await c.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
      subs.push(alta.cuerpo.suscripcion.id as string);
    }
    await ctx.prisma.suscripcion.updateMany({
      where: { id: { in: subs } },
      data: { estado: 'en_gracia', venceEn: new Date(Date.now() - 2 * 86_400_000) },
    });
    for (const [i, pid] of [miembroId, otroId].entries()) {
      await e.operador.n.patch(`/cuentas/${e.cuenta.id}/perfiles/${pid}`, {
        usuarioMiembro: `miembro${i}@example.com`,
        claveMiembro: 'Miembro-123',
      });
      await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${pid}/asignar`, {
        suscripcionId: subs[i],
      });
    }

    // Cortar desde Plataformas: queda libre, con su correo y la clave nueva del miembro.
    const corte = await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${miembroId}/liberar`, {
      nuevaClave: 'Miembro-Nueva-9',
    });
    expect(corte.estado).toBe(201);
    const cortado = await ctx.prisma.perfilCuenta.findUniqueOrThrow({ where: { id: miembroId } });
    expect(cortado.estado).toBe('libre');
    expect(cortado.usuarioMiembroCifrado).not.toBeNull();
    const cred = await e.operador.n.post(`/cuentas/${e.cuenta.id}/revelar`);
    expect(cred.cuerpo.clave).toBe(CLAVE);

    // Eliminar: libera, borra el correo y la clave del miembro y cancela la suscripción.
    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.post(`/suscripciones/${subs[1]}/eliminar-del-lugar`, {})).estado).toBe(
      403,
    );
    const eliminar = await e.operador.n.post(`/suscripciones/${subs[1]}/eliminar-del-lugar`, {});
    expect(eliminar.estado).toBe(200);
    expect(eliminar.cuerpo).toEqual({ eliminada: true, miembroBorrado: true });
    const vacio = await ctx.prisma.perfilCuenta.findUniqueOrThrow({ where: { id: otroId } });
    expect(vacio.estado).toBe('libre');
    expect(vacio.usuarioMiembroCifrado).toBeNull();
    expect(vacio.claveMiembroCifrada).toBeNull();
    const s = await ctx.prisma.suscripcion.findUniqueOrThrow({
      where: { id: subs[1] },
      include: { eventos: true, cliente: true },
    });
    expect(s.estado).toBe('cancelada');
    expect(s.eventos.some((ev) => ev.motivo === 'Eliminado de su lugar')).toBe(true);
    // El cliente y su historial se conservan.
    expect(s.cliente.estado).not.toBe('archivado');
    const aud = await ctx.prisma.auditoria.findMany({
      where: { accion: 'suscripcion.eliminada_del_lugar' },
    });
    expect(aud).toHaveLength(1);
    expect(JSON.stringify(aud)).not.toContain('miembro1@example.com');
  });
});

describe('resumen de Plataformas', () => {
  it('da los mismos totales que el inventario completo, sin las cuentas', async () => {
    const e = await escenario();
    const ana = await conectar(ctx, 'cliente');
    const alta = await ana.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const id = alta.cuerpo.suscripcion.id as string;
    await ctx.prisma.suscripcion.update({
      where: { id },
      data: { estado: 'activa', venceEn: new Date(Date.now() + 86_400_000) },
    });
    const perfiles = e.cuenta.listaPerfiles as { id: string }[];
    await e.operador.n.post(`/cuentas/${e.cuenta.id}/perfiles/${perfiles[0]!.id}/asignar`, {
      suscripcionId: id,
    });
    const completo = await e.operador.n.get('/cuentas/inventario');
    const resumen = await e.operador.n.get('/cuentas/inventario/resumen');
    expect(resumen.estado).toBe(200);
    type S = { servicio: { id: string }; cuentas: unknown[]; conteo: Record<string, number> };
    const totales = (l: S[]) => Object.fromEntries(l.map((s) => [s.servicio.id, s.conteo]));
    expect(totales(resumen.cuerpo.servicios)).toEqual(totales(completo.cuerpo.servicios));
    expect((resumen.cuerpo.servicios as S[]).every((s) => s.cuentas.length === 0)).toBe(true);
    const fila = (resumen.cuerpo.servicios as S[]).find((s) =>
      (completo.cuerpo.servicios as S[]).some((c) => c.servicio.id === s.servicio.id),
    );
    expect(fila?.conteo).toMatchObject({ ocupados: 1, porVencer: 1 });
  });
});
