import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CorreoLeido, ErrorBuzon, LectorImap } from '../../src/codigos/lector-imap.js';
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
    datosPerfiles: [{ nombre: 'Sala', pin: '1357' }, { pin: '' }, { nombre: 'Cuarto' }],
  });
  expect(cuenta.estado).toBe(201);
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
    expect(revelado.cuerpo.perfiles[0]).toEqual({ numero: 1, nombre: 'Sala', pin: '1357' });
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
    expect(JSON.stringify(auditoria)).not.toContain('4821');
    expect(JSON.stringify(auditoria).toLowerCase()).not.toContain('cine.uno');

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
});
