import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTRASENA,
  type Contexto,
  crearContexto,
  crearUsuario,
  limpiar,
  Navegador,
  tokenDelUltimoCorreo,
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

describe('registro y verificación de correo', () => {
  const datos = {
    nombre: 'Ana Pérez',
    correo: 'Ana@Correo.test',
    contrasena: 'Una-Clave-Larga-9',
    aceptaTerminos: true,
  };

  it('registra, envía el enlace, verifica y permite entrar', async () => {
    const n = new Navegador(ctx.app);
    const r = await n.post('/auth/registro', datos);
    expect(r.estado).toBe(202);

    const usuario = await ctx.prisma.usuario.findUniqueOrThrow({
      where: { correo: 'ana@correo.test' },
    });
    expect(usuario.rol).toBe('cliente');
    expect(usuario.hashContrasena).toMatch(/^\$argon2id\$/);

    const antes = await n.entrar('ana@correo.test', datos.contrasena);
    expect(antes.cuerpo.error.codigo).toBe('CORREO_NO_VERIFICADO');

    const token = await tokenDelUltimoCorreo(ctx.prisma, 'ana@correo.test');
    expect((await n.post('/auth/correo/verificar', { token })).estado).toBe(200);
    // El enlace es de un solo uso.
    expect((await n.post('/auth/correo/verificar', { token })).cuerpo.error.codigo).toBe(
      'ENLACE_INVALIDO',
    );

    const entrada = await n.entrar('ana@correo.test', datos.contrasena);
    expect(entrada.estado).toBe(200);
    expect(entrada.cuerpo.pendiente).toBeNull();
    expect(entrada.cuerpo.usuario).not.toHaveProperty('hashContrasena');
    expect(String(entrada.cabeceras['set-cookie'])).toMatch(/HttpOnly/i);
    expect((await n.get('/auth/sesion')).cuerpo.usuario.correo).toBe('ana@correo.test');
  });

  it('responde igual si el correo ya existe y avisa por correo a su dueño', async () => {
    await crearUsuario(ctx.prisma, { correo: 'ana@correo.test' });
    const r = await new Navegador(ctx.app).post('/auth/registro', datos);
    expect(r.estado).toBe(202);
    const correo = await ctx.prisma.correoSaliente.findFirstOrThrow({
      where: { para: 'ana@correo.test' },
    });
    expect(correo.plantilla).toBe('cuentaExistente');
    expect(await ctx.prisma.usuario.count()).toBe(1);
  });

  it('valida los datos en español', async () => {
    const r = await new Navegador(ctx.app).post('/auth/registro', {
      ...datos,
      contrasena: 'ana12345678',
    });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error.codigo).toBe('DATOS_INVALIDOS');
    expect(r.cuerpo.error.campos.contrasena[0]).toMatch(/correo/);
  });
  it('propone país y moneda según la conexión, y respeta la moneda que eligió', async () => {
    const registrar = (correo: string, headers: Record<string, string>) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/registro',
        headers: { origin: 'http://localhost:3000', ...headers },
        payload: { ...datos, correo },
      });
    await registrar('desde.venezuela@correo.test', { 'cf-ipcountry': 'VE' });
    await registrar('desde.colombia@correo.test', { 'accept-language': 'es-CO,es;q=0.9' });
    await registrar('eligio.euro@correo.test', { 'cf-ipcountry': 'AR', cookie: 'nv_moneda=EUR' });
    const fichas = await ctx.prisma.cliente.findMany({
      select: { correo: true, pais: true, monedaPreferida: true },
      orderBy: { correo: 'asc' },
    });
    expect(fichas).toEqual([
      { correo: 'desde.colombia@correo.test', pais: 'CO', monedaPreferida: 'COP' },
      { correo: 'desde.venezuela@correo.test', pais: 'VE', monedaPreferida: 'VES' },
      { correo: 'eligio.euro@correo.test', pais: 'AR', monedaPreferida: 'EUR' },
    ]);
  });
});

describe('inicio de sesión', () => {
  it('no revela si el correo existe', async () => {
    await crearUsuario(ctx.prisma, { correo: 'existe@nv.test' });
    const n = new Navegador(ctx.app);
    const a = await n.entrar('existe@nv.test', 'incorrecta');
    const b = await n.entrar('noexiste@nv.test', 'incorrecta');
    expect(a.estado).toBe(401);
    expect(b.cuerpo).toEqual(a.cuerpo);
  });

  it('bloquea tras demasiados intentos con el mismo correo', async () => {
    await crearUsuario(ctx.prisma, { correo: 'objetivo@nv.test' });
    const n = new Navegador(ctx.app);
    for (let i = 0; i < 8; i++)
      expect((await n.entrar('objetivo@nv.test', 'mala')).estado).toBe(401);
    const r = await n.entrar('objetivo@nv.test', CONTRASENA);
    expect(r.estado).toBe(429);
    expect(r.cabeceras['retry-after']).toBeDefined();
  });

  it('una cuenta suspendida no entra y sus sesiones dejan de valer', async () => {
    const u = await crearUsuario(ctx.prisma);
    const n = new Navegador(ctx.app);
    await n.entrar(u.correo);
    await ctx.prisma.usuario.update({ where: { id: u.id }, data: { estado: 'suspendido' } });
    expect((await n.get('/auth/sesion')).estado).toBe(401);
    expect((await n.entrar(u.correo)).cuerpo.error.codigo).toBe('CUENTA_SUSPENDIDA');
  });

  it('cerrar sesión invalida la cookie', async () => {
    const u = await crearUsuario(ctx.prisma);
    const n = new Navegador(ctx.app);
    await n.entrar(u.correo);
    const cookie = n.cookie;
    expect((await n.post('/auth/cierre-sesion')).estado).toBe(204);
    n.cookie = cookie;
    expect((await n.get('/auth/sesion')).estado).toBe(401);
  });
});

describe('recuperación de contraseña', () => {
  it('restablece la contraseña y cierra todas las sesiones', async () => {
    const u = await crearUsuario(ctx.prisma);
    const abierta = new Navegador(ctx.app);
    await abierta.entrar(u.correo);

    const n = new Navegador(ctx.app);
    expect((await n.post('/auth/contrasena/recuperar', { correo: u.correo })).estado).toBe(202);
    expect((await n.post('/auth/contrasena/recuperar', { correo: 'nadie@nv.test' })).estado).toBe(
      202,
    );
    const token = await tokenDelUltimoCorreo(ctx.prisma, u.correo);

    const r = await n.post('/auth/contrasena/restablecer', {
      token,
      contrasena: 'Nueva-Clave-2026',
    });
    expect(r.estado).toBe(200);
    expect((await abierta.get('/auth/sesion')).estado).toBe(401);
    expect((await n.entrar(u.correo)).estado).toBe(401);
    expect((await n.entrar(u.correo, 'Nueva-Clave-2026')).estado).toBe(200);
  });
});

describe('protección CSRF', () => {
  it('rechaza escrituras sin origen o desde otro sitio', async () => {
    const u = await crearUsuario(ctx.prisma);
    const sinOrigen = new Navegador(ctx.app, null);
    expect((await sinOrigen.entrar(u.correo)).cuerpo.error.codigo).toBe('ORIGEN_NO_PERMITIDO');
    const ajeno = new Navegador(ctx.app, 'https://sitio-malicioso.test');
    expect((await ajeno.entrar(u.correo)).estado).toBe(403);
  });

  it('permite lecturas sin origen', async () => {
    expect((await new Navegador(ctx.app, null).get('/salud')).cuerpo).toEqual({ estado: 'ok' });
  });
});
