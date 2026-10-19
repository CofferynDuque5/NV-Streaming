import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@nv/db';

/** Tipos de trabajo de la cola. */
export const TRABAJO = {
  /** Ejecuta una automatización programada (o manual). Carga: { tipo, disparo }. */
  ejecutarAutomatizacion: 'automatizacion.ejecutar',
  /** Pasada de vencimientos, gracia y suspensiones. */
  vencimientos: 'suscripciones.vencimientos',
  /** Aviso por un cambio de estado de una suscripción. Carga: { automatizacion, suscripcionId }. */
  avisoSuscripcion: 'aviso.suscripcion',
  /** Saldo del revendedor bajo el umbral. Carga: { revendedorId, movimientoId, saldoUsd, umbralUsd }. */
  avisoSaldoBajo: 'aviso.saldo_bajo',
  /** Consulta y vence los pagos en línea abandonados. */
  expirarIntentosPago: 'pagos_en_linea.expirar_intentos',
  /** Procesa un webhook de pasarela ya guardado. Carga: { eventoId }. */
  eventoPasarela: 'pasarela.evento',
  /** Entrega un servicio con el adaptador de su proveedor (fase 6). Carga: { entregaId }. */
  procesarEntrega: 'entrega.procesar',
  /** Avisa al proveedor (webhook) de que una entrega se revoca. Carga: { entregaId, motivo }. */
  revocarEntrega: 'entrega.revocar',
} as const;

/** Prefijo de los trabajos de entregas (los procesa también la API con ENTREGAS_EN_API). */
export const PREFIJO_TRABAJOS_ENTREGA = 'entrega.';

export interface NuevoTrabajo {
  tipo: string;
  carga?: Prisma.InputJsonObject;
  ejecutarEn?: Date;
  /** Si ya existe un trabajo con esta clave (en cualquier estado), no se encola otro. */
  claveUnica?: string;
  maxIntentos?: number;
}

type Escritor = Pick<PrismaClient, 'trabajo'> | Prisma.TransactionClient;

/**
 * Encola un trabajo. Acepta la transacción de quien llama para que el trabajo
 * se confirme junto con el cambio que lo origina (bandeja de salida
 * transaccional). Una clave repetida no hace nada (ON CONFLICT DO NOTHING, que
 * no aborta la transacción). Devuelve si se encoló.
 */
export async function encolarTrabajo(db: Escritor, t: NuevoTrabajo): Promise<boolean> {
  const r = await db.trabajo.createMany({
    data: [
      {
        id: randomUUID(),
        tipo: t.tipo,
        carga: t.carga ?? {},
        ejecutarEn: t.ejecutarEn ?? new Date(),
        maxIntentos: t.maxIntentos ?? 5,
        claveUnica: t.claveUnica ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return r.count > 0;
}
