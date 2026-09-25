import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Contexto,
  crearContexto,
  crearUsuario,
  limpiar,
  Navegador,
  tokenDelUltimoCorreo,
} from './ayudas.js';
import { UsuariosService } from '../../src/usuarios/usuarios.service.js';

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

async function adminConectado() {
  const admin = await crearUsuario(ctx.prisma, { rol: 'admin' });
  const n = new Navegador(ctx.app);
  await n.entrarCompleto(admin.correo);
  return { admin, n };
}

describe('permisos por rol', () => {
  it.each([
    ['cliente', 403, 403],
    ['revendedor', 403, 403],
    ['ventas', 403, 403],
    ['operador', 200, 403],
    ['admin', 200, 200],
  ] as const)('%s: usuarios %i, auditoría %i', async (rol, usuarios, auditoria) => {
    const u = await crearUsuario(ctx.prisma, { rol });
    const n = new Navegador(ctx.app);
    await n.entrarCompleto(u.correo);
    expect((await n.get('/usuarios')).estado).toBe(usuarios);
    expect((await n.get('/auditoria')).estado).toBe(auditoria);
  });

  it('el operador puede ver pero no gestionar', async () => {
    const op = await crearUsuario(ctx.prisma, { rol: 'operador' });
    const cliente = await crearUsuario(ctx.prisma);
    const n = new Navegador(ctx.app);
    await n.entrarCompleto(op.correo);
    expect((await n.patch(`/usuarios/${cliente.id}/rol`, { rol: 'admin' })).estado).toBe(403);
  });

  it('sin sesión todo es 401', async () => {
    expect((await new Navegador(ctx.app).get('/cuenta/sesiones')).estado).toBe(401);
  });
});

describe('gestión del equipo', () => {
  it('invita a una persona que acepta y entra con su rol', async () => {
    const { n } = await adminConectado();
    const r = await n.post('/usuarios/invitaciones', {
      correo: 'nueva@nv.test',
      nombre: 'Nueva',
      rol: 'ventas',
    });
    expect(r.estado).toBe(201);
    expect(
      (
        await n.post('/usuarios/invitaciones', {
          correo: 'nueva@nv.test',
          nombre: 'Otra',
          rol: 'ventas',
        })
      ).estado,
    ).toBe(409);

    const token = await tokenDelUltimoCorreo(ctx.prisma, 'nueva@nv.test');
    const invitada = new Navegador(ctx.app);
    expect(
      (
        await invitada.post('/auth/invitacion/aceptar', {
          token,
          nombre: 'Nueva Persona',
          contrasena: 'Clave-De-Ventas-1',
        })
      ).estado,
    ).toBe(200);
    const e = await invitada.entrar('nueva@nv.test', 'Clave-De-Ventas-1');
    expect(e.cuerpo.usuario.rol).toBe('ventas');
    expect(e.cuerpo.pendiente).toBe('configurar_2fa');
  });

  it('cambiar el rol cierra las sesiones de esa persona', async () => {
    const { n } = await adminConectado();
    const cliente = await crearUsuario(ctx.prisma);
    const nc = new Navegador(ctx.app);
    await nc.entrar(cliente.correo);
    const r = await n.patch(`/usuarios/${cliente.id}/rol`, { rol: 'ventas' });
    expect(r.cuerpo.rol).toBe('ventas');
    expect((await nc.get('/auth/sesion')).estado).toBe(401);
  });

  it('nadie puede cambiar su propio rol ni estado', async () => {
    const { admin, n } = await adminConectado();
    expect(
      (await n.patch(`/usuarios/${admin.id}/rol`, { rol: 'cliente' })).cuerpo.error.codigo,
    ).toBe('ACCION_SOBRE_UNO_MISMO');
    expect(
      (await n.patch(`/usuarios/${admin.id}/estado`, { estado: 'suspendido', motivo: 'Prueba' }))
        .estado,
    ).toBe(403);
  });

  it('dos administradores que se quitan el rol a la vez no dejan el sistema sin administración', async () => {
    const { admin: a, n: na } = await adminConectado();
    const b = await crearUsuario(ctx.prisma, { rol: 'admin' });
    const nb = new Navegador(ctx.app);
    await nb.entrarCompleto(b.correo);

    const [ra, rb] = await Promise.all([
      na.patch(`/usuarios/${b.id}/rol`, { rol: 'ventas' }),
      nb.patch(`/usuarios/${a.id}/rol`, { rol: 'ventas' }),
    ]);
    // Gana una petición. La otra, según cuándo llegue, choca con el bloqueo (409), ya no
    // tiene permiso (403) o su sesión ya se cerró (401). Lo importante: queda un admin.
    const [ganadora, perdedora] = [ra, rb].sort((x, y) => x.estado - y.estado);
    expect(ganadora!.estado).toBe(200);
    expect([401, 403, 409]).toContain(perdedora!.estado);
    expect(await ctx.prisma.usuario.count({ where: { rol: 'admin', estado: 'activo' } })).toBe(1);
  });

  it('rechaza quitar al último administrador activo aunque la petición ya haya pasado los permisos', async () => {
    // Simula la carrera de forma determinista: quien actúa dejó de ser admin después
    // de que su petición superara los guardias, y el objetivo es el único admin activo.
    const actor = await crearUsuario(ctx.prisma, { rol: 'ventas' });
    const unico = await crearUsuario(ctx.prisma, { rol: 'admin' });
    const sesion = await ctx.prisma.sesion.create({
      data: {
        usuarioId: actor.id,
        tokenHash: 'x'.repeat(64),
        expiraEn: new Date(Date.now() + 60_000),
      },
    });
    const usuarios = ctx.app.get(UsuariosService);
    const cliente = { ip: '127.0.0.1', agenteUsuario: null, idPeticion: 'prueba-ultimo-admin' };
    await expect(
      usuarios.cambiarRol(
        { usuario: actor, sesion, pendiente: null },
        unico.id,
        'cliente',
        cliente,
      ),
    ).rejects.toMatchObject({ codigo: 'ULTIMO_ADMINISTRADOR' });
    await expect(
      usuarios.cambiarEstado(
        { usuario: actor, sesion, pendiente: null },
        unico.id,
        { estado: 'suspendido', motivo: 'Prueba' },
        cliente,
      ),
    ).rejects.toMatchObject({ codigo: 'ULTIMO_ADMINISTRADOR' });
    expect((await ctx.prisma.usuario.findUniqueOrThrow({ where: { id: unico.id } })).rol).toBe(
      'admin',
    );
  });
});

describe('registro de auditoría', () => {
  it('registra las acciones sensibles con actor, IP e id de petición', async () => {
    const { admin, n } = await adminConectado();
    const cliente = await crearUsuario(ctx.prisma);
    await n.patch(`/usuarios/${cliente.id}/estado`, {
      estado: 'suspendido',
      motivo: 'Pago rechazado',
    });
    const r = await n.get('/auditoria?accion=usuario.suspendido');
    expect(r.cuerpo.total).toBe(1);
    const [e] = r.cuerpo.elementos;
    expect(e.actor.id).toBe(admin.id);
    expect(e.entidadId).toBe(cliente.id);
    expect(e.despues).toEqual({ estado: 'suspendido', motivo: 'Pago rechazado' });
    expect(e.ip).toBeTruthy();
    const fila = await ctx.prisma.auditoria.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila.idPeticion).toBeTruthy();
  });

  it('es de solo inserción: la base de datos rechaza modificar o borrar', async () => {
    await crearUsuario(ctx.prisma);
    const fila = await ctx.prisma.auditoria.create({
      data: { actorTipo: 'sistema', accion: 'prueba', entidad: 'prueba' },
    });
    await expect(
      ctx.prisma.auditoria.update({ where: { id: fila.id }, data: { accion: 'otra' } }),
    ).rejects.toThrow(/solo inserción|auditor/i);
    await expect(ctx.prisma.auditoria.delete({ where: { id: fila.id } })).rejects.toThrow();
    await expect(ctx.prisma.$executeRawUnsafe('TRUNCATE auditoria')).rejects.toThrow();
  });

  it('nunca expone secretos en las respuestas', async () => {
    const { n } = await adminConectado();
    const texto =
      JSON.stringify((await n.get('/usuarios')).cuerpo) +
      JSON.stringify((await n.get('/auditoria')).cuerpo);
    expect(texto).not.toMatch(/argon2|totp_?secreto|hashContrasena|tokenHash/i);
  });
});
