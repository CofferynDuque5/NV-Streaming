import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma, PrismaClient, RevisionSpotify } from '@nv/db';
import {
  DOMINIO_SPOTIFY_PREDETERMINADO,
  type DiagnosticoSpotify,
  type EstadoRevisionSpotify,
  type PegarSesionSpotifyEntrada,
  type RevisarSpotifyEntrada,
  type RevisionSpotifyPublica,
  type SituacionSpotify,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { Cifrador } from '../comun/cripto.js';
import { iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { contextoUsuario, dia } from '../cuentas/cuentas.service.js';
import { contextoClaveBuzon, contextoUsuarioBuzon } from './codigos.service.js';
import { textoDeHtml } from './extraer.js';
import {
  codigoSpotify,
  esCorreoCodigoSpotify,
  fechaAplicable,
  leerCuentaSpotify,
} from './leer-spotify.js';
import { LectorImap } from './lector-imap.js';
import { ErrorSpotify, RobotSpotify } from './robot-spotify.js';

const ctxSesion = (cuentaId: string) => `spotify:${cuentaId}:sesion`;

/** Dominio de las cuentas principales propias (se puede cambiar con DOMINIO_SPOTIFY). */
export const dominioSpotify = () =>
  (process.env['DOMINIO_SPOTIFY'] || DOMINIO_SPOTIFY_PREDETERMINADO)
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

const esSpotify = { nombre: { contains: 'spotify', mode: 'insensitive' } } as const;

/**
 * Revisión de las cuentas Spotify principales (las del dominio propio): el robot
 * entra con el código que llega al correo y lee el vencimiento, si el pago falló
 * y los cupos del plan. Solo corre cuando alguien del equipo lo pide.
 * Si Spotify muestra la cuenta al día, actualiza la fecha de vencimiento de la
 * cuenta en la web (solo ese dato). Con pago fallido, pausa o caída no cambia nada.
 */
@Injectable()
export class RevisionSpotifyService implements OnModuleInit {
  private readonly log = new Logger('RevisionSpotify');
  private corriendo = false;
  /** Pausa al azar entre una cuenta y la siguiente (ms), para no parecer un robot. */
  pausaEntreCuentas: [number, number] = [60_000, 120_000];

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LectorImap) private readonly lector: LectorImap,
    @Inject(RobotSpotify) private readonly robot: RobotSpotify,
  ) {}

  /** Si el servidor se reinició a mitad de una revisión, esas cuentas quedan con aviso. */
  async onModuleInit() {
    await this.prisma.revisionSpotify
      .updateMany({
        where: { estado: { in: ['en_cola', 'revisando'] } },
        data: {
          estado: 'error',
          ultimoError: 'Se reinició el servidor. Vuelve a pedir la revisión.',
        },
      })
      .catch(() => undefined);
  }

  /** Cuentas Spotify del dominio propio (no retiradas), con el correo descifrado. */
  private async cuentasDelDominio() {
    const dominio = `@${dominioSpotify()}`;
    const filas = await this.prisma.cuentaServicio.findMany({
      where: { servicio: esSpotify, estado: { not: 'retirada' } },
      select: {
        id: true,
        usuarioCifrado: true,
        pista: true,
        estado: true,
        facturaEn: true,
        servicio: { select: { nombre: true } },
        revisionSpotify: true,
      },
      orderBy: [{ facturaEn: { sort: 'asc', nulls: 'last' } }, { creadoEn: 'asc' }],
    });
    return filas
      .map((f) => {
        let correo = '';
        try {
          correo = this.cifrador
            .descifrar(f.usuarioCifrado, contextoUsuario(f.id))
            .trim()
            .toLowerCase();
        } catch {
          correo = '';
        }
        return { ...f, correo };
      })
      .filter((f) => f.correo.endsWith(dominio));
  }

  private publica(
    f: Awaited<ReturnType<RevisionSpotifyService['cuentasDelDominio']>>[number],
  ): RevisionSpotifyPublica {
    const r = f.revisionSpotify;
    return {
      cuentaId: f.id,
      pista: f.pista,
      servicio: f.servicio.nombre,
      estadoCuenta: f.estado,
      facturaEn: dia(f.facturaEn),
      conSesion: !!r?.sesionCifrada,
      revision: r
        ? {
            estado: r.estado as EstadoRevisionSpotify,
            situacion: (r.situacion as SituacionSpotify | null) ?? null,
            plan: r.plan,
            vencimiento: dia(r.vencimiento),
            cuposUsados: r.cuposUsados,
            cuposTotal: r.cuposTotal,
            fechaAnterior: dia(r.fechaAnterior),
            fechaAplicada: r.fechaAplicada,
            ultimoError: r.ultimoError,
            diagnostico: (r.diagnostico as DiagnosticoSpotify | null) ?? null,
            revisadaEn: iso(r.revisadaEn),
          }
        : null,
    };
  }

  async listar(): Promise<{
    dominio: string;
    corriendo: boolean;
    cuentas: RevisionSpotifyPublica[];
  }> {
    const cuentas = await this.cuentasDelDominio();
    return {
      dominio: dominioSpotify(),
      corriendo: this.corriendo,
      cuentas: cuentas.map((c) => this.publica(c)),
    };
  }

  /** Pone en cola las cuentas pedidas (o todas las del dominio) y empieza en segundo plano. */
  async revisar(auth: ContextoAuth, e: RevisarSpotifyEntrada, cliente: InfoCliente) {
    const todas = await this.cuentasDelDominio();
    const pedidas = e.cuentaIds?.length ? todas.filter((c) => e.cuentaIds!.includes(c.id)) : todas;
    const nuevas = pedidas.filter(
      (c) => !['en_cola', 'revisando'].includes(c.revisionSpotify?.estado ?? ''),
    );
    for (const c of nuevas) {
      await this.prisma.revisionSpotify.upsert({
        where: { cuentaId: c.id },
        create: { cuentaId: c.id, estado: 'en_cola', pedidaPorId: auth.usuario.id },
        update: { estado: 'en_cola', ultimoError: null, pedidaPorId: auth.usuario.id },
      });
    }
    if (nuevas.length) {
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'spotify.revision_pedida',
        entidad: 'cuenta_servicio',
        despues: { cuentas: nuevas.length },
        cliente,
      });
      void this.procesar();
    }
    return this.listar();
  }

  /**
   * Guarda (cifrada) la sesión de una cuenta copiada del navegador de quien ya entró.
   * Así el robot entra directo a la cuenta, sin pedir código ni pasar por el captcha
   * que Spotify pone a los inicios de sesión desde servidores.
   */
  async pegarSesion(
    auth: ContextoAuth,
    cuentaId: string,
    e: PegarSesionSpotifyEntrada,
    cliente: InfoCliente,
  ) {
    const cuenta = (await this.cuentasDelDominio()).find((c) => c.id === cuentaId);
    if (!cuenta) {
      throw new NotFoundException({
        codigo: 'CUENTA_NO_ENCONTRADA',
        mensaje: `Esa cuenta no es una Spotify con correo @${dominioSpotify()}.`,
      });
    }
    const actual = cuenta.revisionSpotify;
    if (actual && ['en_cola', 'revisando'].includes(actual.estado)) {
      throw new ConflictException({
        codigo: 'REVISION_EN_CURSO',
        mensaje: 'Esa cuenta se está revisando. Espera a que termine.',
      });
    }
    const unAnio = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const estado = {
      cookies: ['.spotify.com', 'accounts.spotify.com'].map((domain) => ({
        name: 'sp_dc',
        value: e.spDc,
        domain,
        path: '/',
        expires: unAnio,
        httpOnly: true,
        secure: true,
        sameSite: 'None' as const,
      })),
      origins: [],
    };
    const sesionCifrada = this.cifrador.cifrar(JSON.stringify(estado), ctxSesion(cuentaId));
    await this.prisma.revisionSpotify.upsert({
      where: { cuentaId },
      create: { cuentaId, estado: 'pendiente', sesionCifrada },
      update: {
        sesionCifrada,
        ...(actual?.estado === 'error' ? { estado: 'pendiente', ultimoError: null } : {}),
      },
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'spotify.sesion_pegada',
      entidad: 'cuenta_servicio',
      entidadId: cuentaId,
      cliente,
    });
    return this.listar();
  }

  /** Revisa las cuentas en cola, una a la vez, con una pausa al azar entre cada una. */
  private async procesar() {
    if (this.corriendo) return;
    this.corriendo = true;
    try {
      let primera = true;
      for (;;) {
        const sig = await this.prisma.revisionSpotify.findFirst({
          where: { estado: 'en_cola' },
          orderBy: { actualizadoEn: 'asc' },
        });
        if (!sig) break;
        if (!primera) {
          const [min, max] = this.pausaEntreCuentas;
          await new Promise((r) => setTimeout(r, Math.round(min + Math.random() * (max - min))));
        }
        primera = false;
        await this.revisarUna(sig).catch((err) => {
          this.log.warn(`Revisión de Spotify falló: ${(err as Error)?.name ?? 'error'}`);
        });
      }
    } finally {
      this.corriendo = false;
    }
  }

  private async revisarUna(r: RevisionSpotify) {
    await this.prisma.revisionSpotify.update({
      where: { cuentaId: r.cuentaId },
      data: { estado: 'revisando' },
    });
    const cuenta = await this.prisma.cuentaServicio.findUnique({
      where: { id: r.cuentaId },
      select: { id: true, usuarioCifrado: true, facturaEn: true },
    });
    if (!cuenta) return;
    const correo = this.cifrador
      .descifrar(cuenta.usuarioCifrado, contextoUsuario(cuenta.id))
      .trim()
      .toLowerCase();
    let sesion: string | null = null;
    try {
      sesion = r.sesionCifrada
        ? this.cifrador.descifrar(r.sesionCifrada, ctxSesion(cuenta.id))
        : null;
    } catch {
      sesion = null;
    }

    try {
      const paginas = await this.robot.revisar({
        correo,
        sesion,
        pedirCodigo: (desde) => this.buscarCodigo(correo, desde),
      });
      const l = leerCuentaSpotify(
        paginas.textoCuenta,
        paginas.textoFamilia,
        paginas.miembrosContados,
      );
      const aplicar = fechaAplicable(l) && dia(cuenta.facturaEn) !== l.vencimiento;
      const datos: Prisma.RevisionSpotifyUpdateInput = {
        estado: 'lista',
        situacion: l.situacion,
        plan: l.plan,
        vencimiento: l.vencimiento ? new Date(`${l.vencimiento}T00:00:00.000Z`) : null,
        cuposUsados: l.cuposUsados,
        cuposTotal: l.cuposTotal,
        fechaAplicada: aplicar,
        fechaAnterior: aplicar ? cuenta.facturaEn : null,
        ultimoError:
          l.situacion === 'desconocida'
            ? 'Entró, pero no se reconoció el plan. Revisa el detalle.'
            : l.vencimiento
              ? null
              : 'Entró, pero no se encontró la fecha de vencimiento.',
        diagnostico: paginas.diagnostico as unknown as Prisma.InputJsonValue,
        sesionCifrada: this.cifrador.cifrar(paginas.sesion, ctxSesion(cuenta.id)),
        revisadaEn: new Date(),
      };
      await this.prisma.$transaction(async (tx) => {
        if (aplicar) {
          await tx.cuentaServicio.update({
            where: { id: cuenta.id },
            data: { facturaEn: new Date(`${l.vencimiento}T00:00:00.000Z`) },
          });
          await this.auditoria.registrar(
            {
              actorId: r.pedidaPorId,
              accion: 'cuenta.vencimiento_spotify',
              entidad: 'cuenta_servicio',
              entidadId: cuenta.id,
              antes: { facturaEn: dia(cuenta.facturaEn) },
              despues: { facturaEn: l.vencimiento },
            },
            tx,
          );
        }
        await tx.revisionSpotify.update({ where: { cuentaId: cuenta.id }, data: datos });
      });
    } catch (err) {
      const e = err instanceof ErrorSpotify ? err : null;
      const mensaje =
        sesion && (e?.motivo === 'CAPTCHA' || e?.motivo === 'SIN_CODIGO' || e?.motivo === 'ENTRADA')
          ? 'La sesión guardada ya no sirve y Spotify no dejó entrar desde el servidor. Vuelve a pegar la sesión.'
          : (e?.message ?? 'No se pudo revisar la cuenta.');
      await this.prisma.revisionSpotify.update({
        where: { cuentaId: cuenta.id },
        data: {
          estado: 'error',
          ultimoError: mensaje.slice(0, 300),
          diagnostico: (e?.diagnostico ?? undefined) as Prisma.InputJsonValue | undefined,
          revisadaEn: new Date(),
          // Si Spotify no dejó entrar, la sesión guardada ya no sirve.
          ...(e && e.motivo !== 'LECTURA' && e.motivo !== 'NAVEGADOR'
            ? { sesionCifrada: null }
            : {}),
        },
      });
      // Ante un captcha no se intenta entrar con código a las demás: insistir provoca
      // bloqueos. Las que tienen sesión guardada siguen, porque no pasan por el inicio de sesión.
      if (e?.motivo === 'CAPTCHA') {
        await this.prisma.revisionSpotify.updateMany({
          where: { estado: 'en_cola', sesionCifrada: null },
          data: {
            estado: 'error',
            ultimoError: 'No se revisó: Spotify pidió un captcha en otra cuenta. Prueba más tarde.',
          },
        });
      }
    }
  }

  /** Último código de Spotify enviado a `correo` desde `desde`, en cualquier buzón activo. */
  private async buscarCodigo(correo: string, desde: Date): Promise<string | null> {
    const buzones = await this.prisma.buzonCodigos.findMany({ where: { activo: true } });
    const hallados: { fecha: Date; codigo: string }[] = [];
    await Promise.all(
      buzones.map(async (b) => {
        const correos = await this.lector
          .buscar(
            {
              host: b.host,
              puerto: b.puerto,
              seguro: b.seguro,
              usuario: this.cifrador.descifrar(b.usuarioCifrado, contextoUsuarioBuzon(b.id)),
              clave: this.cifrador.descifrar(b.claveCifrada, contextoClaveBuzon(b.id)),
              carpeta: b.carpeta,
            },
            correo,
            desde,
          )
          .catch(() => []);
        for (const c of correos) {
          if (!esCorreoCodigoSpotify(c.de, c.asunto)) continue;
          const plano = c.texto?.trim() ? c.texto : c.html ? textoDeHtml(c.html) : '';
          const codigo = codigoSpotify(c.asunto, plano);
          if (codigo) hallados.push({ fecha: c.fecha, codigo });
        }
      }),
    );
    hallados.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return hallados[0]?.codigo ?? null;
  }
}
