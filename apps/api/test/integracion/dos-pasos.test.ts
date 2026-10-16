import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  codigoTotp,
  type Contexto,
  crearContexto,
  crearUsuario,
  limpiar,
  Navegador,
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

describe('verificación en dos pasos', () => {
  it('el equipo debe configurarla antes de usar el panel', async () => {
    const admin = await crearUsuario(ctx.prisma, { rol: 'admin' });
    const n = new Navegador(ctx.app);
    const r = await n.entrar(admin.correo);
    expect(r.cuerpo.pendiente).toBe('configurar_2fa');
    expect(r.cuerpo.permisos).toEqual([]);
    expect((await n.get('/usuarios')).cuerpo.error.codigo).toBe('VERIFICACION_PENDIENTE');

    const inicio = await n.post('/cuenta/2fa/iniciar');
    expect(inicio.cuerpo.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(inicio.cuerpo.qr).toContain('<svg');

    const cookiePendiente = n.cookie;
    const conf = await n.post('/cuenta/2fa/confirmar', {
      codigo: await codigoTotp(inicio.cuerpo.secreto),
    });
    expect(conf.estado).toBe(200);
    expect(conf.cuerpo.codigosRespaldo).toHaveLength(10);
    expect(conf.cuerpo.sesion.pendiente).toBeNull();
    // La sesión se rota al completar el segundo factor.
    expect(n.cookie).not.toBe(cookiePendiente);
    expect((await n.get('/usuarios')).estado).toBe(200);

    const guardado = await ctx.prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(guardado.totpSecreto).toMatch(/^v1\./);
    expect(guardado.totpSecreto).not.toContain(inicio.cuerpo.secreto);
  });

  it('pide el código al volver a entrar y no acepta reutilizarlo', async () => {
    const admin = await crearUsuario(ctx.prisma, { rol: 'admin' });
    const secreto = (await new Navegador(ctx.app).entrarCompleto(admin.correo))!;

    const n = new Navegador(ctx.app);
    expect((await n.entrar(admin.correo)).cuerpo.pendiente).toBe('verificar_2fa');
    // Con la contraseña sola no se puede reemplazar el segundo factor.
    expect((await n.post('/cuenta/2fa/iniciar')).cuerpo.error.codigo).toBe(
      'VERIFICACION_PENDIENTE',
    );

    const codigo = await codigoTotp(secreto, 1);
    expect((await n.post('/auth/2fa/verificar', { codigo })).estado).toBe(200);
    expect((await n.get('/usuarios')).estado).toBe(200);

    const otro = new Navegador(ctx.app);
    await otro.entrar(admin.correo);
    expect((await otro.post('/auth/2fa/verificar', { codigo })).cuerpo.error.codigo).toBe(
      'CODIGO_INCORRECTO',
    );
  });

  it('los códigos de respaldo sirven una sola vez', async () => {
    const admin = await crearUsuario(ctx.prisma, { rol: 'admin' });
    const n0 = new Navegador(ctx.app);
    await n0.entrar(admin.correo);
    const { cuerpo } = await n0.post('/cuenta/2fa/iniciar');
    const conf = await n0.post('/cuenta/2fa/confirmar', {
      codigo: await codigoTotp(cuerpo.secreto),
    });
    const [respaldo] = conf.cuerpo.codigosRespaldo as string[];

    const a = new Navegador(ctx.app);
    await a.entrar(admin.correo);
    expect((await a.post('/auth/2fa/verificar', { codigoRespaldo: respaldo })).estado).toBe(200);
    const b = new Navegador(ctx.app);
    await b.entrar(admin.correo);
    expect((await b.post('/auth/2fa/verificar', { codigoRespaldo: respaldo })).estado).toBe(400);
    expect((await a.get('/cuenta/2fa')).cuerpo.codigosRestantes).toBe(9);
  });

  it('un rol con 2FA obligatorio no puede desactivarla; un cliente sí', async () => {
    const admin = await crearUsuario(ctx.prisma, { rol: 'admin' });
    const na = new Navegador(ctx.app);
    const sa = (await na.entrarCompleto(admin.correo))!;
    const r = await na.post('/cuenta/2fa/desactivar', {
      contrasena: 'Prueba-Segura-2026',
      codigo: await codigoTotp(sa, 1),
    });
    expect(r.cuerpo.error.codigo).toBe('DOS_PASOS_OBLIGATORIO');

    const cliente = await crearUsuario(ctx.prisma);
    const nc = new Navegador(ctx.app);
    await nc.entrar(cliente.correo);
    const { cuerpo } = await nc.post('/cuenta/2fa/iniciar');
    await nc.post('/cuenta/2fa/confirmar', { codigo: await codigoTotp(cuerpo.secreto) });
    const d = await nc.post('/cuenta/2fa/desactivar', {
      contrasena: 'Prueba-Segura-2026',
      codigo: await codigoTotp(cuerpo.secreto, 1),
    });
    expect(d.estado).toBe(200);
    expect((await nc.get('/cuenta/2fa')).cuerpo.activo).toBe(false);
  });
});
