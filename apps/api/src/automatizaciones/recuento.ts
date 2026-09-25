import type { Prisma, PrismaClient } from '@nv/db';
import { type Permiso, ROLES, tienePermiso } from '@nv/shared';
import { NotificacionesService, type ResultadoAviso } from '../avisos/notificaciones.service.js';

/** Resultado de una ejecución de automatización. */
export interface ResultadoTarea {
  procesados: number;
  omitidos: number;
  errores: number;
  resumen: string;
  detalle?: Prisma.InputJsonValue;
}

/** Contadores de una ejecución: cada elemento revisado suma en uno de los tres. */
export class Recuento {
  procesados = 0;
  omitidos = 0;
  errores = 0;
  readonly incidencias: string[] = [];

  /** Cuenta un aviso según cómo salió (enviado, omitido o con error). */
  aviso(r: ResultadoAviso): void {
    const c = NotificacionesService.clasificar(r);
    if (c === 'procesado') this.procesados += 1;
    else if (c === 'omitido') this.omitidos += 1;
    else this.errores += 1;
  }

  error(texto: string): void {
    this.errores += 1;
    if (this.incidencias.length < 20) this.incidencias.push(texto.slice(0, 300));
  }

  resultado(resumen: string): ResultadoTarea {
    return {
      procesados: this.procesados,
      omitidos: this.omitidos,
      errores: this.errores,
      resumen,
      ...(this.incidencias.length ? { detalle: { incidencias: this.incidencias } } : {}),
    };
  }
}

/** Personas activas del equipo con un permiso (para los avisos internos). */
export function equipoConPermiso(prisma: PrismaClient, permiso: Permiso) {
  const roles = ROLES.filter((r) => tienePermiso(r, permiso));
  return prisma.usuario.findMany({
    where: { rol: { in: [...roles] }, estado: 'activo' },
    select: { id: true, nombre: true, correo: true },
    orderBy: { creadoEn: 'asc' },
  });
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const mensajeError = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 300);
