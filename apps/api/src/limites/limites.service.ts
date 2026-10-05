import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import { ErrorApp } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';

export interface Limite {
  /** Máximo de intentos dentro de la ventana. */
  maximo: number;
  /** Duración de la ventana en segundos. */
  ventanaSegundos: number;
}

/** Límites predefinidos. Ajustarlos aquí afecta a toda la API. */
export const LIMITES = {
  inicioSesionIp: { maximo: 30, ventanaSegundos: 15 * 60 },
  inicioSesionCorreo: { maximo: 8, ventanaSegundos: 15 * 60 },
  registroIp: { maximo: 10, ventanaSegundos: 60 * 60 },
  correoPorDestino: { maximo: 3, ventanaSegundos: 60 * 60 },
  correoPorIp: { maximo: 15, ventanaSegundos: 60 * 60 },
  tokensIp: { maximo: 30, ventanaSegundos: 60 * 60 },
  dosPasosUsuario: { maximo: 10, ventanaSegundos: 15 * 60 },
  contrasenaUsuario: { maximo: 10, ventanaSegundos: 15 * 60 },
} satisfies Record<string, Limite>;

/**
 * Límites de uso guardados en PostgreSQL: funcionan igual con una o varias
 * instancias de la API y no necesitan Redis.
 */
@Injectable()
export class LimitesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Suma un intento; si supera el máximo lanza 429 con `Retry-After`. */
  async consumir(clave: string, limite: Limite): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ conteo: number; ventana_inicio: Date }[]>`
      INSERT INTO limites_uso (clave, ventana_inicio, conteo)
      VALUES (${clave}, now(), 1)
      ON CONFLICT (clave) DO UPDATE SET
        conteo = CASE
          WHEN limites_uso.ventana_inicio < now() - make_interval(secs => ${limite.ventanaSegundos}::int)
          THEN 1 ELSE limites_uso.conteo + 1 END,
        ventana_inicio = CASE
          WHEN limites_uso.ventana_inicio < now() - make_interval(secs => ${limite.ventanaSegundos}::int)
          THEN now() ELSE limites_uso.ventana_inicio END
      RETURNING conteo, ventana_inicio`;
    const fila = filas[0];
    if (fila && fila.conteo > limite.maximo) {
      const restante = Math.max(
        1,
        Math.ceil(
          (fila.ventana_inicio.getTime() + limite.ventanaSegundos * 1000 - Date.now()) / 1000,
        ),
      );
      throw new ErrorApp(
        429,
        'DEMASIADOS_INTENTOS',
        `Demasiados intentos. Vuelve a intentarlo en ${Math.ceil(restante / 60)} min.`,
        undefined,
        { 'Retry-After': String(restante) },
      );
    }
  }

  async limpiar(clave: string): Promise<void> {
    await this.prisma.limiteUso.deleteMany({ where: { clave } });
  }
}
