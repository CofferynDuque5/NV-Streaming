import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import { PRISMA } from '../comun/tokens.js';
import { encolarTrabajo, type NuevoTrabajo } from './trabajos.js';

/** Trabajo reservado por este proceso. `intentos` sirve de testigo: si la reserva venció y otro lo tomó, ya no coincide. */
export interface TrabajoReclamado {
  id: string;
  tipo: string;
  carga: Record<string, unknown>;
  intentos: number;
  maxIntentos: number;
  claveUnica: string | null;
}

export type ManejadorTrabajo = (
  carga: Record<string, unknown>,
  t: TrabajoReclamado,
) => Promise<void>;

/** Tiempo que un trabajador reserva un trabajo. Si se cae, otro lo retoma al vencer. */
export const RESERVA_SEGUNDOS = 10 * 60;
/** Espera antes del reintento n: 30 s, 1 min, 2 min… hasta 1 h. */
export const esperaReintento = (intento: number) =>
  Math.min(30 * 2 ** Math.max(0, intento - 1), 3600);

/**
 * Cola de trabajos sobre PostgreSQL. Los trabajadores reservan filas con
 * FOR UPDATE SKIP LOCKED (dos trabajadores nunca toman la misma), reintentan
 * con espera exponencial y marcan "fallido" al agotar los intentos.
 */
@Injectable()
export class TrabajosService {
  private readonly logger = new Logger('Trabajos');
  private readonly manejadores = new Map<string, ManejadorTrabajo>();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  registrar(tipo: string, manejador: ManejadorTrabajo): void {
    this.manejadores.set(tipo, manejador);
  }

  encolar(t: NuevoTrabajo, tx?: Prisma.TransactionClient): Promise<boolean> {
    return encolarTrabajo(tx ?? this.prisma, t);
  }

  /** Reserva hasta `limite` trabajos vencidos. */
  async reclamar(limite = 10, reservaSegundos = RESERVA_SEGUNDOS): Promise<TrabajoReclamado[]> {
    return this.prisma.$queryRaw<TrabajoReclamado[]>`
      UPDATE trabajos t
      SET estado = 'en_curso',
          intentos = t.intentos + 1,
          bloqueado_hasta = now() + make_interval(secs => ${reservaSegundos}::int)
      FROM (
        SELECT id FROM trabajos
        WHERE estado = 'pendiente' AND ejecutar_en <= now()
        ORDER BY ejecutar_en, creado_en
        LIMIT ${limite}::int
        FOR UPDATE SKIP LOCKED
      ) s
      WHERE t.id = s.id
      RETURNING t.id, t.tipo, t.carga, t.intentos, t.max_intentos AS "maxIntentos",
                t.clave_unica AS "claveUnica"`;
  }

  /** Devuelve a la cola (o da por fallidos) los trabajos cuya reserva venció: su trabajador se cayó. */
  async recuperarVencidos(): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE trabajos
      SET estado = CASE WHEN intentos >= max_intentos
                        THEN 'fallido'::"EstadoTrabajo" ELSE 'pendiente'::"EstadoTrabajo" END,
          completado_en = CASE WHEN intentos >= max_intentos THEN now() ELSE NULL END,
          bloqueado_hasta = NULL,
          ejecutar_en = now(),
          ultimo_error = 'El trabajador se detuvo antes de terminar (venció la reserva).'
      WHERE estado = 'en_curso' AND bloqueado_hasta < now()`;
  }

  async completar(t: TrabajoReclamado): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE trabajos
      SET estado = 'completado', completado_en = now(), bloqueado_hasta = NULL, ultimo_error = NULL
      WHERE id = ${t.id}::uuid AND estado = 'en_curso' AND intentos = ${t.intentos}::int`;
  }

  /** Registra el error y programa el reintento, o lo da por fallido si no quedan intentos. */
  async fallar(t: TrabajoReclamado, error: unknown): Promise<'pendiente' | 'fallido'> {
    const mensaje = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    const agotado = t.intentos >= t.maxIntentos;
    const espera = esperaReintento(t.intentos);
    await this.prisma.$executeRaw`
      UPDATE trabajos
      SET estado = ${agotado ? 'fallido' : 'pendiente'}::"EstadoTrabajo",
          ejecutar_en = now() + make_interval(secs => ${espera}::int),
          completado_en = ${agotado ? new Date() : null},
          bloqueado_hasta = NULL,
          ultimo_error = ${mensaje}
      WHERE id = ${t.id}::uuid AND estado = 'en_curso' AND intentos = ${t.intentos}::int`;
    return agotado ? 'fallido' : 'pendiente';
  }

  /** Ejecuta un trabajo reservado con su manejador. */
  async ejecutar(t: TrabajoReclamado): Promise<void> {
    const manejador = this.manejadores.get(t.tipo);
    try {
      if (!manejador) throw new Error(`No hay manejador para el trabajo "${t.tipo}".`);
      await manejador(t.carga ?? {}, t);
      await this.completar(t);
    } catch (e) {
      const estado = await this.fallar(t, e);
      this.logger.warn(
        `Trabajo ${t.tipo} (${t.id}) falló en el intento ${t.intentos}/${t.maxIntentos}` +
          `${estado === 'fallido' ? ' y quedó fallido' : ''}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Una vuelta de la cola: recupera reservas vencidas, reserva un lote y lo ejecuta. Devuelve cuántos ejecutó. */
  async procesarLote(limite = 10): Promise<number> {
    await this.recuperarVencidos();
    const lote = await this.reclamar(limite);
    for (const t of lote) await this.ejecutar(t);
    return lote.length;
  }

  /** Procesa hasta vaciar la cola de trabajos vencidos (para pruebas y ejecuciones puntuales). */
  async procesarTodo(maximo = 200): Promise<number> {
    let total = 0;
    while (total < maximo) {
      const n = await this.procesarLote(10);
      if (n === 0) break;
      total += n;
    }
    return total;
  }

  /** Borra los trabajos terminados hace más de 30 días. */
  async purgar(): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM trabajos
      WHERE estado IN ('completado', 'cancelado') AND completado_en < now() - interval '30 days'`;
  }
}
