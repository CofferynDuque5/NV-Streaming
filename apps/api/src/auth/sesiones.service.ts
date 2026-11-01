import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, Sesion, Usuario } from '@nv/db';
import { exige2fa, type PasoPendiente } from '@nv/shared';
import type { InfoCliente } from '../comun/contexto.js';
import { sha256, tokenAleatorio } from '../comun/cripto.js';
import type { Entorno } from '../config/entorno.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import { versionDatos } from '../comun/version-datos.js';

export interface SesionValidada {
  sesion: Sesion;
  usuario: Usuario;
  pendiente: PasoPendiente | null;
}

/** Qué le falta a una sesión para estar completa. */
export function pasoPendiente(
  usuario: Usuario,
  sesion: Pick<Sesion, 'dosPasosCompleto'>,
): PasoPendiente | null {
  if (sesion.dosPasosCompleto) return null;
  if (usuario.totpSecreto) return 'verificar_2fa';
  if (exige2fa(usuario.rol)) return 'configurar_2fa';
  return null;
}

/** Actualizar la última actividad como mucho una vez por minuto. */
const INTERVALO_ACTIVIDAD_MS = 60_000;

/**
 * Cuánto se reutiliza una sesión ya leída. Cada petición del panel la comprobaba en la
 * base (un viaje de ida y vuelta a Neon); se reutiliza solo si en este proceso no hubo
 * ningún cambio desde entonces (cerrar sesión, suspender, cambiar rol o contraseña
 * pasan todos por la API y la invalidan al momento). Ver comun/version-datos.ts.
 */
const SESION_VIGENCIA_MS = 10_000;

@Injectable()
export class SesionesService {
  private readonly validadas = new Map<
    string,
    { version: number; vence: number; sesion: Sesion & { usuario: Usuario } }
  >();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  get duracionSegundos(): number {
    return this.entorno.SESION_DURACION_HORAS * 3600;
  }

  /** Crea una sesión y devuelve el token en claro (solo va en la cookie). */
  async crear(usuario: Usuario, cliente: InfoCliente, dosPasosCompleto: boolean): Promise<string> {
    const token = tokenAleatorio();
    await this.prisma.sesion.create({
      data: {
        usuarioId: usuario.id,
        tokenHash: sha256(token),
        dosPasosCompleto,
        ip: cliente.ip,
        agenteUsuario: cliente.agenteUsuario,
        expiraEn: new Date(Date.now() + this.duracionSegundos * 1000),
      },
    });
    return token;
  }

  async validar(token: string): Promise<SesionValidada | null> {
    const tokenHash = sha256(token);
    const version = versionDatos();
    const guardada = this.validadas.get(tokenHash);
    const ahoraMs = Date.now();
    let sesion: (Sesion & { usuario: Usuario }) | null;
    let reciente = false;
    if (guardada && guardada.version === version && guardada.vence > ahoraMs) {
      sesion = guardada.sesion;
      reciente = true;
    } else {
      sesion = await this.prisma.sesion.findUnique({
        where: { tokenHash },
        include: { usuario: true },
      });
      if (sesion && versionDatos() === version) {
        if (this.validadas.size > 2000) this.validadas.clear();
        this.validadas.set(tokenHash, { version, vence: ahoraMs + SESION_VIGENCIA_MS, sesion });
      } else {
        this.validadas.delete(tokenHash);
      }
    }
    if (!sesion || sesion.revocadaEn) return null;
    const ahora = Date.now();
    const limiteInactividad = this.entorno.SESION_INACTIVIDAD_MINUTOS * 60_000;
    if (sesion.expiraEn.getTime() <= ahora) return null;
    if (sesion.ultimaActividadEn.getTime() + limiteInactividad <= ahora) return null;
    if (sesion.usuario.estado !== 'activo') return null;

    if (!reciente && ahora - sesion.ultimaActividadEn.getTime() > INTERVALO_ACTIVIDAD_MS) {
      await this.prisma.sesion.update({
        where: { id: sesion.id },
        data: { ultimaActividadEn: new Date(ahora) },
      });
    }
    const { usuario, ...resto } = sesion;
    return { sesion: resto, usuario, pendiente: pasoPendiente(usuario, resto) };
  }

  /**
   * Sustituye la sesión por una nueva con la verificación en dos pasos completa.
   * Cambiar el token al subir de privilegio evita la fijación de sesión.
   */
  async elevar(sesion: Sesion, usuario: Usuario, cliente: InfoCliente): Promise<string> {
    await this.revocar(sesion.id);
    return this.crear(usuario, cliente, true);
  }

  async revocar(id: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { id, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  /** Cierra todas las sesiones del usuario, salvo la indicada. */
  async revocarTodas(usuarioId: string, excepto?: string): Promise<number> {
    const { count } = await this.prisma.sesion.updateMany({
      where: { usuarioId, revocadaEn: null, ...(excepto ? { id: { not: excepto } } : {}) },
      data: { revocadaEn: new Date() },
    });
    return count;
  }

  async listarActivas(usuarioId: string): Promise<Sesion[]> {
    const ahora = new Date();
    return this.prisma.sesion.findMany({
      where: {
        usuarioId,
        revocadaEn: null,
        expiraEn: { gt: ahora },
        ultimaActividadEn: {
          gt: new Date(ahora.getTime() - this.entorno.SESION_INACTIVIDAD_MINUTOS * 60_000),
        },
      },
      orderBy: { ultimaActividadEn: 'desc' },
    });
  }
}
