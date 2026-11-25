import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CorreoLeido, ErrorBuzon, LectorImap } from '../../src/codigos/lector-imap.js';
import { ErrorRobot, RobotProveedor } from '../../src/codigos/robot-proveedor.js';
import { conectar, type Contexto, crearContexto, limpiar, prepararCatalogo } from './ayudas.js';

let ctx: Contexto;
let lector: LectorImap;
beforeAll(async () => {
  ctx = await crearContexto();
  lector = ctx.app.get(LectorImap);
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await limpiar(ctx.prisma);
  vi.restoreAllMocks();
});

const CLAVE_BUZON = 'clave-de-aplicacion-16';
const hace = (min: number) => new Date(Date.now() - min * 60_000);

function correo(datos: Partial<CorreoLeido>): CorreoLeido {
  return {
    asunto: '',
    de: 'Netflix <info@account.netflix.com>',
    fecha: hace(2),
    texto: '',
    html: null,
    ...datos,
  };
}

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  const cuenta = await operador.n.post('/cuentas', {
    servicioId: catalogo.servicioId,
    usuario: 'Cine.Uno@Midominio.com',
    clave: 'Clave-Cuenta-1',
    perfiles: 3,
    // Vigente: la web solo vende planes con perfiles de cuentas al día.
    facturaEn: '2099-11-05',
    datosPerfiles: [{ nombre: 'Sala', pin: '1357' }, { pin: '' }, { nombre: 'Cuarto' }],
  });
  expect(cuenta.estado).toBe(201);
  // Revisados y aptos: la web solo vende lo que el equipo marcó.
  await operador.n.post('/cuentas/entrega-web/aptos', {
    perfilIds: (cuenta.cuerpo.listaPerfiles as { id: string }[]).map((p) => p.id),
    apto: true,
  });
  return { admin: admin.n, operador: operador.n, cuenta: cuenta.cuerpo, ...catalogo };
}

describe('cuentas: PIN al crear, nota del perfil e inventario', () => {
  it('guarda nombre y PIN de cada perfil al crear la cuenta', async () => {
    const e = await escenario();
    expect(
      e.cuenta.listaPerfiles.map((p: { nombre: string; tienePin: boolean }) => [
        p.nombre,
        p.tienePin,
      ]),
    ).toEqual([
      ['Sala', true],
      ['Perfil 2', false],
      ['Cuarto', false],
    ]);
    const revelado = await e.operador.post(`/cuentas/${e.cuenta.id}/revelar`);
    expect(revelado.cuerpo.perfiles[0]).toMatchObject({ numero: 1, nombre: 'Sala', pin: '1357' });
    const fila = await ctx.prisma.perfilCuenta.findFirstOrThrow({
      where: { cuentaId: e.cuenta.id, numero: 1 },
    });
    expect(fila.pinCifrado).not.toContain('1357');

    const malo = await e.operador.post('/cuentas', {
      servicioId: e.servicioId,
      usuario: 'otra@midominio.com',
      clave: 'x',
      perfiles: 1,
      datosPerfiles: [{ pin: '12' }],
    });
    expect(malo.estado).toBe(400);

    const p2 = e.cuenta.listaPerfiles[1];
    const nota = await e.operador.patch(`/cuentas/${e.cuenta.id}/perfiles/${p2.id}`, {
      nota: 'TV de la sala',
    });
    expect(nota.cuerpo.listaPerfiles[1].nota).toBe('TV de la sala');
  });

  it('el inventario agrupa por servicio, cuenta libres, ocupados y por vencer, sin secretos', async () => {
    const e = await escenario();
    const cliente = await conectar(ctx, 'cliente');
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa', venceEn: new Date(Date.now() + 86_400_000) },
    });
    const p1 = e.cuenta.listaPerfiles[0];
    await e.operador.post(`/cuentas/${e.cuenta.id}/perfiles/${p1.id}/asignar`, { suscripcionId });
    await e.operador.patch(`/cuentas/${e.cuenta.id}/perfiles/${e.cuenta.listaPerfiles[2].id}`, {
      bloqueado: true,
    });

    const r = await e.operador.get('/cuentas/inventario');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.servicios).toHaveLength(1);
    const s = r.cuerpo.servicios[0];
    expect(s.conteo).toEqual({
      cuentas: 1,
      caidas: 0,
      perfiles: 3,
      libres: 1,
      ocupados: 1,
      bloqueados: 1,
      respaldos: 0,
      porVencer: 1,
      vencidos: 0,
    });
    expect(s.cuentas[0].perfiles[0]).toMatchObject({
      nombre: 'Sala',
      tienePin: true,
      suscripcionId,
      estadoSuscripcion: 'activa',
      cliente: { nombre: expect.any(String) },
    });
    const texto = JSON.stringify(r.cuerpo).toLowerCase();
    expect(texto).not.toContain('cine.uno');
    expect(texto).not.toContain('1357');
    expect((await cliente.n.get('/cuentas/inventario')).estado).toBe(403);
  });
});

describe('correos de códigos', () => {
  it('guarda el buzón cifrado, lo prueba y solo el admin lo configura', async () => {
    const e = await escenario();
    const probar = vi.spyOn(lector, 'probar').mockResolvedValueOnce();
    const b = await e.admin.post('/codigos/buzones', {
      nombre: 'Gmail principal',
      host: 'IMAP.gmail.com',
      usuario: 'codigos@gmail.com',
      clave: CLAVE_BUZON,
    });
    expect(b.estado).toBe(201);
    expect(b.cuerpo).toMatchObject({
      host: 'imap.gmail.com',
      puerto: 993,
      seguro: true,
      pista: 'co•••@gmail.com',
    });
    expect(JSON.stringify(b.cuerpo)).not.toContain(CLAVE_BUZON);
    const fila = await ctx.prisma.buzonCodigos.findUniqueOrThrow({ where: { id: b.cuerpo.id } });
    expect(fila.claveCifrada).not.toContain(CLAVE_BUZON);
    expect(fila.usuarioCifrado).not.toContain('codigos@');

    const ok = await e.admin.post(`/codigos/buzones/${b.cuerpo.id}/probar`);
    expect(ok.cuerpo.ultimoError).toBeNull();
    expect(probar.mock.calls[0]![0]).toMatchObject({
      usuario: 'codigos@gmail.com',
      clave: CLAVE_BUZON,
      carpeta: 'INBOX',
    });

    vi.spyOn(lector, 'probar').mockRejectedValueOnce(
      new ErrorBuzon('El servidor rechazó el correo o la clave.'),
    );
    const mal = await e.admin.post(`/codigos/buzones/${b.cuerpo.id}/probar`);
    expect(mal.cuerpo.ultimoError).toContain('rechazó');

    // Cambiar el nombre no toca la clave; cambiar la clave borra la prueba anterior.
    await e.admin.patch(`/codigos/buzones/${b.cuerpo.id}`, { nombre: 'Gmail 1', clave: '' });
    const despues = await ctx.prisma.buzonCodigos.findUniqueOrThrow({ where: { id: b.cuerpo.id } });
    expect(despues.claveCifrada).toBe(fila.claveCifrada);

    expect((await e.operador.get('/codigos/buzones')).estado).toBe(403);
    expect(
      (
        await e.admin.post('/codigos/buzones', {
          nombre: 'Gmail 1',
          host: 'imap.gmail.com',
          usuario: 'x@y.com',
          clave: 'z',
        })
      ).cuerpo.error.codigo,
    ).toBe('DUPLICADO');
    expect(
      (
        await e.admin.post('/codigos/buzones', {
          nombre: 'Malo',
          host: 'imap.gmail.com/x',
          usuario: 'x@y.com',
          clave: 'z',
        })
      ).estado,
    ).toBe(400);
  });

  it('el equipo busca el último código de una cuenta filtrando por los asuntos del servicio', async () => {
    const e = await escenario();
    await e.admin.post('/codigos/buzones', {
      nombre: 'Dominio',
      host: 'mail.midominio.com',
      usuario: 'todo@midominio.com',
      clave: CLAVE_BUZON,
    });
    const sinAsuntos = await e.admin.post('/codigos/asuntos/sugerir', { servicioId: e.servicioId });
    expect(sinAsuntos.cuerpo.error.codigo).toBe('SIN_SUGERENCIAS');
    const a = await e.admin.post('/codigos/asuntos', {
      servicioId: e.servicioId,
      asunto: 'Código de acceso',
    });
    expect(a.estado).toBe(201);
    expect(a.cuerpo).toEqual([expect.objectContaining({ asunto: 'Código de acceso' })]);

    const buscar = vi.spyOn(lector, 'buscar').mockResolvedValue([
      correo({ asunto: 'Restablece tu contraseña', fecha: hace(1), texto: 'Tu código 9999' }),
      correo({
        asunto: 'Tu código de acceso temporal',
        fecha: hace(3),
        texto: 'Ingresa este código:\n4821',
      }),
      correo({ asunto: 'Tu codigo de acceso', fecha: hace(10), texto: 'Código:\n1111' }),
    ]);
    const r = await e.operador.post('/codigos/buscar', { cuentaId: e.cuenta.id, minutos: 30 });
    expect(r.estado).toBe(200);
    expect(r.cabeceras['cache-control']).toContain('no-store');
    expect(r.cuerpo.mensajes.map((m: { codigo: string }) => m.codigo)).toEqual(['4821', '1111']);
    expect(r.cuerpo.sinFiltroAsunto).toBe(false);
    // Se busca por el correo real de la cuenta, en minúsculas.
    expect(buscar.mock.calls[0]![1]).toBe('cine.uno@midominio.com');
    const desde = buscar.mock.calls[0]![2] as Date;
    expect(Date.now() - desde.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000);

    // Un buzón que falla no tumba la consulta.
    buscar.mockRejectedValueOnce(new ErrorBuzon('El servidor tardó demasiado en responder.'));
    const conError = await e.operador.post('/codigos/buscar', { correo: 'Otro@Midominio.com' });
    expect(conError.cuerpo).toMatchObject({
      mensajes: [],
      buzonesConError: [{ nombre: 'Dominio', error: 'El servidor tardó demasiado en responder.' }],
      sinFiltroAsunto: true,
    });

    const consultas = await ctx.prisma.consultaCodigo.findMany({ orderBy: { creadoEn: 'asc' } });
    expect(consultas.map((c) => c.resultado)).toEqual(['encontrado', 'error']);
    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { accion: 'codigo.consultado' },
    });
    // Solo lo que se guardó, sin los ids al azar (un UUID puede llevar «4821»).
    const guardado = JSON.stringify(auditoria.map((a) => ({ antes: a.antes, despues: a.despues })));
    expect(guardado).not.toContain('4821');
    expect(guardado.toLowerCase()).not.toContain('cine.uno');

    const ventas = await conectar(ctx, 'ventas');
    expect((await ventas.n.post('/codigos/buscar', { cuentaId: e.cuenta.id })).estado).toBe(403);
  });

  it('el cliente pide el código de su perfil solo con la suscripción vigente', async () => {
    const e = await escenario();
    const cliente = await conectar(ctx, 'cliente');
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    await e.operador.post(
      `/cuentas/${e.cuenta.id}/perfiles/${e.cuenta.listaPerfiles[0].id}/asignar`,
      {
        suscripcionId,
      },
    );
    const ruta = `/mi/perfiles/${suscripcionId}/codigo`;

    let lista = await cliente.n.get('/mi/perfiles');
    expect(lista.cuerpo[0].pideCodigos).toBe(false);

    await e.admin.post('/codigos/buzones', {
      nombre: 'Dominio',
      host: 'mail.midominio.com',
      usuario: 'todo@midominio.com',
      clave: CLAVE_BUZON,
    });
    await e.admin.post('/codigos/asuntos', { servicioId: e.servicioId, asunto: 'Hogar' });
    lista = await cliente.n.get('/mi/perfiles');
    expect(lista.cuerpo[0].pideCodigos).toBe(true);

    expect((await cliente.n.post(ruta)).cuerpo.error.codigo).toBe('PERFIL_NO_DISPONIBLE');
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa' },
    });

    vi.spyOn(lector, 'buscar').mockResolvedValue([
      correo({
        asunto: 'Actualiza tu Hogar con Netflix',
        html: '<a href="https://www.netflix.com/password?nftoken=a">Clave</a><a href="https://www.netflix.com/account/update-primary-location?nftoken=b">Sí, la envié yo</a>',
      }),
    ]);
    const r = await cliente.n.post(ruta);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.codigo).toMatchObject({
      codigo: null,
      enlace: {
        tipo: 'hogar',
        url: 'https://www.netflix.com/account/update-primary-location?nftoken=b',
      },
    });

    vi.spyOn(lector, 'buscar').mockResolvedValue([]);
    expect((await cliente.n.post(ruta)).cuerpo).toEqual({ codigo: null });

    const otro = await conectar(ctx, 'cliente');
    expect((await otro.n.post(ruta)).estado).toBe(404);

    // Límite: 5 cada 10 minutos.
    for (let i = 0; i < 3; i++) await cliente.n.post(ruta);
    expect((await cliente.n.post(ruta)).estado).toBe(429);
  });

  it('el revendedor pide el código de los perfiles de su cartera, no de otros', async () => {
    const e = await escenario();
    const cliente = await conectar(ctx, 'cliente');
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    await e.operador.post(
      `/cuentas/${e.cuenta.id}/perfiles/${e.cuenta.listaPerfiles[0].id}/asignar`,
      { suscripcionId },
    );
    await e.admin.post('/codigos/buzones', {
      nombre: 'Dominio',
      host: 'mail.midominio.com',
      usuario: 'todo@midominio.com',
      clave: CLAVE_BUZON,
    });
    await e.admin.post('/codigos/asuntos', { servicioId: e.servicioId, asunto: 'Código' });
    const vende = await conectar(ctx, 'revendedor');
    const r = await ctx.prisma.revendedor.create({
      data: { usuarioId: vende.usuario.id, estado: 'aprobado', nombreComercial: 'Tienda Uno' },
    });
    const ruta = `/revendedor/perfiles/${suscripcionId}/codigo`;
    // Todavía no es de su cartera.
    expect((await vende.n.post(ruta)).estado).toBe(404);

    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa', revendedorId: r.id },
    });
    const lista = await vende.n.get('/revendedor/perfiles');
    expect(lista.cuerpo[0]).toMatchObject({ suscripcionId, pideCodigos: true });
    vi.spyOn(lector, 'buscar').mockResolvedValue([
      correo({ asunto: 'Tu código de acceso', fecha: hace(2), texto: 'Código:\n7350' }),
    ]);
    const pedido = await vende.n.post(ruta);
    expect(pedido.estado).toBe(200);
    expect(pedido.cuerpo.codigo).toMatchObject({ codigo: '7350' });
    expect(
      await ctx.prisma.auditoria.count({ where: { accion: 'codigo.consultado_por_revendedor' } }),
    ).toBe(1);

    // Otro revendedor no puede pedirlo.
    const otro = await conectar(ctx, 'revendedor');
    await ctx.prisma.revendedor.create({
      data: { usuarioId: otro.usuario.id, estado: 'aprobado', nombreComercial: 'Tienda Dos' },
    });
    expect((await otro.n.post(ruta)).estado).toBe(404);
  });
});

describe('conector con el panel de ikercuentas', () => {
  it('guarda el acceso cifrado, aprueba la IP por correo y entrega el código al cliente', async () => {
    const e = await escenario();
    const robot = ctx.app.get(RobotProveedor);
    // La cuenta es un Netflix individual comprado en Iker.
    await ctx.prisma.servicio.update({
      where: { id: e.servicioId },
      data: { nombre: 'Netflix Individual' },
    });
    await ctx.prisma.cuentaServicio.update({
      where: { id: e.cuenta.id },
      data: { proveedor: 'Iker Cuentas' },
    });
    const buzon = await e.admin.post('/codigos/buzones', {
      nombre: 'Dominio',
      host: 'mail.midominio.com',
      usuario: 'info@midominio.com',
      clave: CLAVE_BUZON,
    });

    // Solo el admin configura; el operador puede verlo sin secretos.
    const datos = {
      activo: true,
      urlBase: 'https://ikercuentas.com/',
      usuario: 'nathan@gmail.com',
      clave: 'Clave-De-Iker-1',
      marcaProveedor: 'Iker',
      buzonId: buzon.cuerpo.id,
      carpetaAprobacion: 'NV-Iker',
      remitenteAprobacion: 'no-reply@ikercuentas.com',
      accionesCliente: ['code', 'code6', 'link', 'sobre', 'hogar'],
    };
    expect((await e.operador.put('/codigos/conector', datos)).estado).toBe(403);
    const guardado = await e.admin.put('/codigos/conector', datos);
    expect(guardado.estado).toBe(200);
    expect(guardado.cuerpo).toMatchObject({
      urlBase: 'https://ikercuentas.com',
      pista: 'na•••@gmail.com',
      tieneClave: true,
      estado: 'sin_probar',
    });
    expect(JSON.stringify(guardado.cuerpo)).not.toContain('Clave-De-Iker-1');
    const fila = await ctx.prisma.conectorCodigos.findFirstOrThrow();
    expect(fila.claveCifrada).not.toContain('Clave-De-Iker-1');
    expect(fila.usuarioCifrado).not.toContain('nathan@gmail.com');
    expect((await e.operador.get('/codigos/conector')).cuerpo.pista).toBe('na•••@gmail.com');

    // «Probar entrada»: el panel pide aprobar la IP y el enlace llega al buzón.
    vi.spyOn(lector, 'deRemitente').mockResolvedValue([
      correo({
        de: 'no-reply@ikercuentas.com',
        asunto: 'Nuevo dispositivo detectado — ikercuentas',
        html: '<a href="https://ikercuentas.com/api/auth/approve-ip?token=t0k">Aprobar</a>',
      }),
    ]);
    let enlace: string | null = null;
    vi.spyOn(robot, 'entrar').mockImplementation(async (p) => {
      expect(p.usuario).toBe('nathan@gmail.com');
      expect(p.clave).toBe('Clave-De-Iker-1');
      enlace = await p.aprobar(new Date(Date.now() - 60_000));
      return {
        sesion: '{"cookies":[{"name":"s","value":"v"}]}',
        diagnostico: { paso: 'sesion_iniciada', rutas: [], botones: [], avisos: [], en: '' },
      };
    });
    const probado = await e.admin.post('/codigos/conector/probar');
    expect(enlace).toBe('https://ikercuentas.com/api/auth/approve-ip?token=t0k');
    expect(lector.deRemitente).toHaveBeenCalledWith(
      expect.objectContaining({ carpeta: 'NV-Iker' }),
      'no-reply@ikercuentas.com',
      expect.any(Date),
    );
    expect(probado.cuerpo.estado).toBe('conectado');
    const conSesion = await ctx.prisma.conectorCodigos.findFirstOrThrow();
    expect(conSesion.sesionCifrada).toBeTruthy();
    expect(conSesion.sesionCifrada).not.toContain('cookies');

    // El cliente ve los botones de Netflix y recibe el código.
    const cliente = await conectar(ctx, 'cliente');
    const alta = await cliente.n.post('/mi/suscripciones', { planId: e.planId, moneda: 'USD' });
    const suscripcionId = alta.cuerpo.suscripcion.id as string;
    await e.operador.post(
      `/cuentas/${e.cuenta.id}/perfiles/${e.cuenta.listaPerfiles[0].id}/asignar`,
      { suscripcionId },
    );
    await ctx.prisma.suscripcion.update({
      where: { id: suscripcionId },
      data: { estado: 'activa' },
    });
    const lista = await cliente.n.get('/mi/perfiles');
    expect(lista.cuerpo[0].accionesProveedor).toEqual(['code', 'code6', 'link']);

    const pulsar = vi.spyOn(robot, 'pulsar').mockResolvedValue({
      textos: ['Código 4 dígitos: 5090'],
      sesion: null,
      diagnostico: { paso: 'boton_pulsado', rutas: [], botones: ['Code'], avisos: [], en: '' },
    });
    const ruta = `/mi/perfiles/${suscripcionId}/codigo-proveedor`;
    const r = await cliente.n.post(ruta, { accion: 'code' });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ codigo: '5090', enlace: null, mensaje: null });
    expect(pulsar).toHaveBeenCalledWith(
      expect.objectContaining({
        correoCuenta: 'cine.uno@midominio.com',
        plataforma: 'netflix',
        accion: 'code',
      }),
    );
    // Netflix no tiene botón «Hogar» ni otro cliente puede usar ese perfil.
    expect((await cliente.n.post(ruta, { accion: 'hogar' })).cuerpo.error.codigo).toBe(
      'ACCION_NO_DISPONIBLE',
    );
    const otro = await conectar(ctx, 'cliente');
    expect((await otro.n.post(ruta, { accion: 'code' })).estado).toBe(404);

    // Si el panel no encuentra la cuenta, se avisa sin dejar el conector en error.
    pulsar.mockRejectedValueOnce(
      new ErrorRobot('NO_ENCONTRADA', 'Esa cuenta no aparece en el panel del proveedor.'),
    );
    const falla = await cliente.n.post(ruta, { accion: 'code6' });
    expect(falla.estado).toBe(404);
    expect((await e.admin.get('/codigos/conector')).cuerpo.estado).toBe('conectado');

    // El código nunca queda en la auditoría.
    const auditoria = await ctx.prisma.auditoria.findMany({
      where: { accion: { startsWith: 'codigo_proveedor' } },
    });
    expect(auditoria.length).toBeGreaterThan(0);
    expect(JSON.stringify(auditoria)).not.toContain('5090');

    // Si se desactiva el conector, el cliente deja de ver los botones.
    await e.admin.put('/codigos/conector', { ...datos, usuario: '', clave: '', activo: false });
    expect((await cliente.n.get('/mi/perfiles')).cuerpo[0].accionesProveedor).toEqual([]);
    expect((await cliente.n.post(ruta, { accion: 'code' })).cuerpo.error.codigo).toBe(
      'CONECTOR_INACTIVO',
    );
  });
});
