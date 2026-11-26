import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LectorImap } from '../../src/codigos/lector-imap.js';
import { RevisionSpotifyService } from '../../src/codigos/revision-spotify.service.js';
import {
  ErrorSpotify,
  type PaginasSpotify,
  RobotSpotify,
} from '../../src/codigos/robot-spotify.js';
import { conectar, type Contexto, crearContexto, limpiar, prepararCatalogo } from './ayudas.js';

let ctx: Contexto;
let robot: RobotSpotify;
let servicio: RevisionSpotifyService;
beforeAll(async () => {
  ctx = await crearContexto();
  robot = ctx.app.get(RobotSpotify);
  servicio = ctx.app.get(RevisionSpotifyService);
  servicio.pausaEntreCuentas = [0, 0];
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await limpiar(ctx.prisma);
  vi.restoreAllMocks();
});

const diag = {
  paso: 'leida',
  url: 'www.spotify.com/account/family/',
  textos: [],
  en: new Date().toISOString(),
};

function paginas(textoCuenta: string, textoFamilia = 'Miembros (4/6)'): PaginasSpotify {
  return {
    textoCuenta,
    textoFamilia,
    miembrosContados: null,
    sesion: '{"cookies":[]}',
    diagnostico: diag,
  };
}

async function escenario() {
  const admin = await conectar(ctx, 'admin');
  const operador = await conectar(ctx, 'operador');
  const catalogo = await prepararCatalogo(admin.n);
  await ctx.prisma.servicio.update({
    where: { id: catalogo.servicioId },
    data: { nombre: 'Spotify Premium Familiar' },
  });
  const crear = async (usuario: string, facturaEn: string) => {
    const r = await operador.n.post('/cuentas', {
      servicioId: catalogo.servicioId,
      usuario,
      clave: 'Clave-Spotify-1',
      perfiles: 6,
      facturaEn,
    });
    expect(r.estado).toBe(201);
    return r.cuerpo.id as string;
  };
  const alDia = await crear('Familia1@ServiciosNat.com', '2026-11-30');
  const fallida = await crear('familia2@serviciosnat.com', '2026-11-28');
  const ajena = await crear('otra@gmail.com', '2026-11-28');
  return { admin: admin.n, operador: operador.n, alDia, fallida, ajena };
}

async function esperarFin() {
  for (let i = 0; i < 100; i++) {
    const n = await ctx.prisma.revisionSpotify.count({
      where: { estado: { in: ['en_cola', 'revisando'] } },
    });
    if (n === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('La revisión no terminó');
}

describe('revisión de cuentas Spotify', () => {
  it('lista solo las del dominio propio y actualiza la fecha solo si está al día', async () => {
    const e = await escenario();
    const lista = await e.operador.get('/codigos/spotify');
    expect(lista.estado).toBe(200);
    expect(lista.cuerpo.dominio).toBe('serviciosnat.com');
    expect(lista.cuerpo.cuentas.map((c: { cuentaId: string }) => c.cuentaId).sort()).toEqual(
      [e.alDia, e.fallida].sort(),
    );
    expect(JSON.stringify(lista.cuerpo)).not.toContain('familia1@');

    // El operador ve, pero solo quien configura códigos puede revisar.
    expect((await e.operador.post('/codigos/spotify/revisar', {})).estado).toBe(403);

    vi.spyOn(robot, 'revisar').mockImplementation(async (p) => {
      if (p.correo.toLowerCase().startsWith('familia1')) {
        return paginas(
          'Premium Familiar\nTu próxima factura es de US$ 10,99 y se cobrará el 5/12/26.',
        );
      }
      return paginas('Premium Familiar\nNo pudimos procesar tu pago.\nTu próxima factura: 1/12/26');
    });
    const r = await e.admin.post('/codigos/spotify/revisar', {});
    expect(r.estado).toBe(202);
    await esperarFin();
    expect(robot.revisar).toHaveBeenCalledTimes(2);

    const cuentaAlDia = await ctx.prisma.cuentaServicio.findUniqueOrThrow({
      where: { id: e.alDia },
    });
    expect(cuentaAlDia.facturaEn?.toISOString().slice(0, 10)).toBe('2026-12-05');
    const cuentaFallida = await ctx.prisma.cuentaServicio.findUniqueOrThrow({
      where: { id: e.fallida },
    });
    expect(cuentaFallida.facturaEn?.toISOString().slice(0, 10)).toBe('2026-11-28');
    // Solo cambia la fecha: el estado de la cuenta queda igual.
    expect(cuentaFallida.estado).toBe('activa');

    const despues = await e.operador.get('/codigos/spotify');
    const por = Object.fromEntries(
      despues.cuerpo.cuentas.map((c: { cuentaId: string }) => [c.cuentaId, c]),
    );
    expect(por[e.alDia].revision).toMatchObject({
      estado: 'lista',
      situacion: 'al_dia',
      vencimiento: '2026-12-05',
      cuposUsados: 4,
      cuposTotal: 6,
      fechaAplicada: true,
      fechaAnterior: '2026-11-30',
    });
    expect(por[e.fallida].revision).toMatchObject({
      estado: 'lista',
      situacion: 'pago_fallido',
      fechaAplicada: false,
    });
    const sesion = await ctx.prisma.revisionSpotify.findUniqueOrThrow({
      where: { cuentaId: e.alDia },
    });
    expect(sesion.sesionCifrada).not.toContain('cookies');
    const audit = await ctx.prisma.auditoria.findFirst({
      where: { accion: 'cuenta.vencimiento_spotify', entidadId: e.alDia },
    });
    expect(audit).not.toBeNull();
  });

  it('revisa solo las elegidas y un captcha detiene la cola', async () => {
    const e = await escenario();
    vi.spyOn(robot, 'revisar').mockRejectedValue(
      new ErrorSpotify('CAPTCHA', 'Spotify pidió un captcha.'),
    );
    await e.admin.post('/codigos/spotify/revisar', { cuentaIds: [e.alDia, e.fallida, e.ajena] });
    await esperarFin();
    // La ajena (otro dominio) no se revisa; tras el captcha la otra no se intenta.
    expect(robot.revisar).toHaveBeenCalledTimes(1);
    const filas = await ctx.prisma.revisionSpotify.findMany();
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.estado === 'error')).toBe(true);
    const c = await ctx.prisma.cuentaServicio.findUniqueOrThrow({ where: { id: e.alDia } });
    expect(c.facturaEn?.toISOString().slice(0, 10)).toBe('2026-11-30');
  });

  it('busca el código de Spotify en los buzones', async () => {
    const e = await escenario();
    await e.admin.post('/codigos/buzones', {
      nombre: 'Códigos',
      host: 'mail.serviciosnat.com',
      usuario: 'nathanstreamingcodigos@serviciosnat.com',
      clave: 'clave-de-aplicacion-16',
    });
    const lector = ctx.app.get(LectorImap);
    vi.spyOn(lector, 'buscar').mockResolvedValue([
      {
        asunto: 'Tu código de Spotify',
        de: 'Spotify <no-reply@alerts.spotify.com>',
        fecha: new Date(),
        texto: 'Ingresa este código\n104582',
        html: null,
      },
      {
        asunto: 'Novedades',
        de: 'Spotify <no-reply@spotify.com>',
        fecha: new Date(),
        texto: '999999',
        html: null,
      },
    ]);
    let codigo: string | null = null;
    vi.spyOn(robot, 'revisar').mockImplementation(async (p) => {
      codigo = await p.pedirCodigo(new Date(Date.now() - 60_000));
      return paginas('Premium Familiar\nSe renovará el 15 de diciembre de 2026');
    });
    await e.admin.post('/codigos/spotify/revisar', { cuentaIds: [e.alDia] });
    await esperarFin();
    expect(codigo).toBe('104582');
    expect(lector.buscar).toHaveBeenCalledWith(
      expect.anything(),
      'familia1@serviciosnat.com',
      expect.any(Date),
    );
  });
});
