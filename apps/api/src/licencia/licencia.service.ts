import { createPublicKey, type KeyObject, verify } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type DatosLicencia,
  type EstadoLicencia,
  estadoLicencia,
  hoyEnVenezuela,
  leerDatosLicencia,
  type LicenciaPublica,
  licenciaPublica,
  partesLicencia,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { LimitesService } from '../limites/limites.service.js';

/** Cada cuánto se vuelve a leer la licencia guardada (por si hay varias instancias de la API). */
const VIGENCIA_CACHE_MS = 60_000;
const LIMITE_CARGAR = { maximo: 10, ventanaSegundos: 3600 };

type Verificacion = { datos: DatosLicencia } | { motivo: string };

interface Cache {
  hasta: number;
  licencia: string | null;
  cargadaEn: Date | null;
  verificacion: Verificacion | null;
}

/**
 * Licencia de la instalación (G8). Sin LICENCIA_CLAVE_PUBLICA no hay control y todo
 * funciona como siempre. Con ella, la licencia guardada en el panel (o la variable
 * LICENCIA) debe estar firmada por esa clave, ser de esta dirección (WEB_ORIGEN) y no
 * haber pasado los días de gracia; si no, el equipo solo puede consultar.
 */
@Injectable()
export class LicenciaService {
  private readonly clavePublica: KeyObject | null;
  private cache: Cache | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {
    this.clavePublica = entorno.LICENCIA_CLAVE_PUBLICA
      ? createPublicKey({
          key: Buffer.from(entorno.LICENCIA_CLAVE_PUBLICA, 'base64'),
          format: 'der',
          type: 'spki',
        })
      : null;
  }

  get controlActivo(): boolean {
    return this.clavePublica !== null;
  }

  /** Comprueba la firma y que la licencia sea de esta instalación. */
  verificar(licencia: string): Verificacion {
    if (!this.clavePublica) return { motivo: 'Esta instalación no usa licencia.' };
    const partes = partesLicencia(licencia);
    if (!partes) return { motivo: 'El texto no tiene el formato de una licencia.' };
    let firmaValida = false;
    try {
      firmaValida = verify(
        null,
        Buffer.from(partes.firmado),
        this.clavePublica,
        Buffer.from(partes.firma, 'base64url'),
      );
    } catch {
      firmaValida = false;
    }
    if (!firmaValida) return { motivo: 'La firma no corresponde: la licencia no es auténtica.' };
    let datos: DatosLicencia | null = null;
    try {
      datos = leerDatosLicencia(
        JSON.parse(Buffer.from(partes.datos, 'base64url').toString('utf8')),
      );
    } catch {
      datos = null;
    }
    if (!datos) return { motivo: 'La licencia está firmada pero sus datos no se entienden.' };
    if (datos.origen !== this.entorno.WEB_ORIGEN) {
      return { motivo: 'La licencia es de otra instalación (otra dirección web).' };
    }
    return { datos };
  }

  private async leer(): Promise<Cache> {
    if (this.cache && this.cache.hasta > Date.now()) return this.cache;
    const fila = await this.prisma.licenciaInstalacion.findUnique({ where: { id: 1 } });
    const licencia = fila?.licencia ?? (this.entorno.LICENCIA || null);
    this.cache = {
      hasta: Date.now() + VIGENCIA_CACHE_MS,
      licencia,
      cargadaEn: fila?.cargadaEn ?? null,
      verificacion: licencia ? this.verificar(licencia) : null,
    };
    return this.cache;
  }

  async estado(ahora = new Date()): Promise<LicenciaPublica> {
    const hoy = hoyEnVenezuela(ahora);
    if (!this.controlActivo) return licenciaPublica(null, 'sin_control', hoy);
    const { verificacion, cargadaEn } = await this.leer();
    if (!verificacion) {
      return licenciaPublica(null, 'falta', hoy, {
        motivo: 'Esta instalación todavía no tiene licencia.',
      });
    }
    if ('motivo' in verificacion) {
      return licenciaPublica(null, 'invalida', hoy, { motivo: verificacion.motivo, cargadaEn });
    }
    const estado: EstadoLicencia = estadoLicencia(verificacion.datos, hoy);
    return licenciaPublica(verificacion.datos, estado, hoy, { cargadaEn });
  }

  /** Guarda una licencia nueva. Solo administración, y solo si es válida y no está vencida. */
  async cargar(
    licencia: string,
    auth: ContextoAuth,
    cliente: InfoCliente,
  ): Promise<LicenciaPublica> {
    if (auth.usuario.rol !== 'admin') {
      throw new ErrorApp(
        403,
        'SOLO_ADMINISTRACION',
        'Solo administración puede cargar la licencia.',
      );
    }
    if (!this.controlActivo) {
      throw new ErrorApp(409, 'SIN_CONTROL_LICENCIA', 'Esta instalación no usa licencia.');
    }
    await this.limites.consumir(`licencia:${auth.usuario.id}`, LIMITE_CARGAR);
    const verificacion = this.verificar(licencia);
    if ('motivo' in verificacion) {
      throw new ErrorApp(400, 'LICENCIA_INVALIDA', verificacion.motivo, {
        licencia: [verificacion.motivo],
      });
    }
    const { datos } = verificacion;
    if (estadoLicencia(datos, hoyEnVenezuela()) === 'vencida') {
      const mensaje = `Esa licencia venció el ${datos.vence}. Pide la renovación.`;
      throw new ErrorApp(400, 'LICENCIA_VENCIDA', mensaje, { licencia: [mensaje] });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.licenciaInstalacion.upsert({
        where: { id: 1 },
        create: { id: 1, licencia, cargadaPorId: auth.usuario.id },
        update: { licencia, cargadaPorId: auth.usuario.id, cargadaEn: new Date() },
      });
      // Sin la licencia en sí: solo lo necesario para saber qué se cargó.
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'licencia.cargada',
          entidad: 'licencia',
          entidadId: datos.id,
          despues: { plan: datos.plan, prueba: datos.prueba, vence: datos.vence },
          cliente,
        },
        tx,
      );
    });
    this.cache = null;
    return this.estado();
  }
}
