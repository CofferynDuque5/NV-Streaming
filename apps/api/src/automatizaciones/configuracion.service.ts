import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Automatizacion, Prisma, PrismaClient } from '@nv/db';
import {
  AUTOMATIZACIONES,
  type CanalAviso,
  PARAMETROS_AUTOMATIZACION,
  type ParametrosAutomatizacion,
  TIPOS_AUTOMATIZACION,
  type TipoAutomatizacion,
} from '@nv/shared';
import { PRISMA } from '../comun/tokens.js';

/** Configuración vigente de una automatización, ya validada. */
export interface ConfigAutomatizacion<T extends TipoAutomatizacion = TipoAutomatizacion> {
  tipo: T;
  activa: boolean;
  canales: CanalAviso[];
  parametros: ParametrosAutomatizacion<T>;
  ultimaEjecucionEn: Date | null;
}

/** Canales por defecto: solo correo (WhatsApp tiene costo por mensaje y se activa a mano). */
const CANALES_POR_DEFECTO: CanalAviso[] = ['correo'];

/**
 * Filas de la tabla `automatizaciones`. Al arrancar se crean las que falten con
 * los valores del catálogo; nunca se sobrescribe una configuración existente.
 */
@Injectable()
export class ConfigAutomatizacionesService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Automatizaciones');

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.asegurar();
    } catch (e) {
      // Sin base de datos la API ya falla por otros lados; esto se reintenta al leer.
      this.logger.warn(`No se pudo preparar el catálogo de automatizaciones: ${String(e)}`);
    }
  }

  /** Crea las filas del catálogo que falten (idempotente). */
  async asegurar(): Promise<void> {
    await this.prisma.automatizacion.createMany({
      data: TIPOS_AUTOMATIZACION.map((tipo) => {
        const def = AUTOMATIZACIONES[tipo];
        return {
          tipo,
          activa: def.activaPorDefecto,
          parametros: def.parametrosPorDefecto as Prisma.InputJsonObject,
          canales: CANALES_POR_DEFECTO.filter((c) => def.canales.includes(c)),
        };
      }),
      skipDuplicates: true,
    });
  }

  async leer<T extends TipoAutomatizacion>(tipo: T): Promise<ConfigAutomatizacion<T>> {
    let fila = await this.prisma.automatizacion.findUnique({ where: { tipo } });
    if (!fila) {
      await this.asegurar();
      fila = await this.prisma.automatizacion.findUniqueOrThrow({ where: { tipo } });
    }
    return interpretar(tipo, fila);
  }

  async todas(): Promise<
    (Automatizacion & { actualizadoPor: { id: string; nombre: string } | null })[]
  > {
    const filas = await this.prisma.automatizacion.findMany({
      include: { actualizadoPor: { select: { id: true, nombre: true } } },
    });
    if (filas.length >= TIPOS_AUTOMATIZACION.length) return filas;
    await this.asegurar();
    return this.prisma.automatizacion.findMany({
      include: { actualizadoPor: { select: { id: true, nombre: true } } },
    });
  }
}

export const esTipoAutomatizacion = (v: string): v is TipoAutomatizacion =>
  (TIPOS_AUTOMATIZACION as readonly string[]).includes(v);

/**
 * Valida los parámetros guardados con el esquema del tipo. Si una versión
 * nueva añade un parámetro, se completa con el valor por defecto; si algo no
 * es válido, se usa el valor por defecto entero.
 */
export function interpretar<T extends TipoAutomatizacion>(
  tipo: T,
  fila: Pick<Automatizacion, 'activa' | 'canales' | 'parametros' | 'ultimaEjecucionEn'>,
): ConfigAutomatizacion<T> {
  const def = AUTOMATIZACIONES[tipo];
  const guardados =
    fila.parametros && typeof fila.parametros === 'object' && !Array.isArray(fila.parametros)
      ? (fila.parametros as Record<string, unknown>)
      : {};
  const r = PARAMETROS_AUTOMATIZACION[tipo].safeParse({
    ...def.parametrosPorDefecto,
    ...guardados,
  });
  const parametros = (r.success ? r.data : def.parametrosPorDefecto) as ParametrosAutomatizacion<T>;
  return {
    tipo,
    activa: fila.activa,
    canales: fila.canales.filter((c) => def.canales.includes(c)),
    parametros,
    ultimaEjecucionEn: fila.ultimaEjecucionEn,
  };
}
