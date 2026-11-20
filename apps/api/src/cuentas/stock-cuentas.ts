import { Prisma, type PrismaClient } from '@nv/db';
import { sirveVentaWeb, type TipoPlataforma, tipoPlataforma } from '@nv/shared';
import { fechaCaracas } from '../automatizaciones/horario.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ErrorApp } from '../comun/errores.js';

/*
 * Stock y entrega automática desde Plataformas (como en el Gestor).
 *
 * Un plan se entrega desde Plataformas si es una suscripción de alquiler de un
 * proveedor con entrega manual y su servicio tiene cuentas en Plataformas: el
 * cliente recibe un perfil (o la cuenta principal, o una cuenta individual).
 *
 * Solo cuentan los lugares libres de cuentas activas y VIGENTES: con fecha de
 * vencimiento (próximo cobro del proveedor) de hoy en adelante, en hora de
 * Venezuela. Una cuenta vencida o sin fecha nunca se entrega por la web.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export interface PlanInventario {
  tipo: string;
  entrega: string;
  adaptador: string;
}

/** El plan se entrega con un perfil o una cuenta de Plataformas. */
export const seEntregaDeInventario = (p: PlanInventario) =>
  p.tipo === 'suscripcion' && p.entrega === 'alquiler' && p.adaptador === 'manual';

interface FilaLibre {
  id: string;
  cuenta_id: string;
  servicio_id: string;
  servicio: string;
  numero: number;
  individual: boolean;
}

/** Condición del tipo de lugar que se vende por la web (ver `sirveVentaWeb`). */
function condicionTipo(tipo: TipoPlataforma): Prisma.Sql {
  const total = Prisma.sql`(SELECT count(*) FROM perfiles_cuenta x WHERE x.cuenta_id = c.id)`;
  if (tipo === 'familiar') {
    return Prisma.sql`AND (c.modo = 'completa' OR ${total} = 1 OR p.numero = 1)`;
  }
  return Prisma.empty;
}

/** En las plataformas por perfiles se entrega primero un perfil compartido y luego una cuenta individual. */
function ordenTipo(tipo: TipoPlataforma): Prisma.Sql {
  if (tipo !== 'perfiles') return Prisma.empty;
  return Prisma.sql`(c.modo = 'completa' OR (SELECT count(*) FROM perfiles_cuenta x WHERE x.cuenta_id = c.id) = 1),`;
}

const libresVigentes = (servicioIds: string[], hoy: string) => Prisma.sql`
  SELECT p.id, p.cuenta_id, c.servicio_id, s.nombre AS servicio, p.numero,
         (c.modo = 'completa'
           OR (SELECT count(*) FROM perfiles_cuenta x WHERE x.cuenta_id = c.id) = 1) AS individual
  FROM perfiles_cuenta p
  JOIN cuentas_servicio c ON c.id = p.cuenta_id
  JOIN servicios s ON s.id = c.servicio_id
  WHERE c.servicio_id = ANY(${servicioIds}::uuid[])
    AND c.estado = 'activa'
    AND p.estado = 'libre'
    AND c.factura_en IS NOT NULL
    AND c.factura_en >= ${hoy}::date`;

/**
 * Lugares libres y vigentes que la web puede entregar, por servicio. Solo
 * vienen los servicios que se manejan en Plataformas (con alguna cuenta no
 * retirada); los demás se siguen entregando a mano y no tienen stock.
 */
export async function stockPorServicio(
  db: Db,
  servicioIds: string[],
  ahora = new Date(),
): Promise<Map<string, number>> {
  const ids = [...new Set(servicioIds)];
  if (!ids.length) return new Map();
  const conCuentas = await db.cuentaServicio.findMany({
    where: { servicioId: { in: ids }, estado: { not: 'retirada' } },
    select: { servicioId: true },
    distinct: ['servicioId'],
  });
  const stock = new Map(conCuentas.map((c) => [c.servicioId, 0]));
  if (!stock.size) return stock;
  const filas = await db.$queryRaw<FilaLibre[]>(
    libresVigentes([...stock.keys()], fechaCaracas(ahora)),
  );
  for (const f of filas) {
    if (sirveVentaWeb(tipoPlataforma(f.servicio), f.individual, f.numero)) {
      stock.set(f.servicio_id, (stock.get(f.servicio_id) ?? 0) + 1);
    }
  }
  return stock;
}

/** Los planes (de cualquier forma) que se entregan desde Plataformas y no tienen stock. */
export async function planesAgotados<T extends PlanInventario & { id: string; servicioId: string }>(
  db: Db,
  planes: T[],
  ahora = new Date(),
): Promise<Set<string>> {
  const deInventario = planes.filter(seEntregaDeInventario);
  const stock = await stockPorServicio(
    db,
    deInventario.map((p) => p.servicioId),
    ahora,
  );
  return new Set(deInventario.filter((p) => stock.get(p.servicioId) === 0).map((p) => p.id));
}

export interface AsignacionAutomatica {
  perfilId: string;
  cuentaId: string;
  numero: number;
}

/**
 * Entrega sola el mejor lugar libre y vigente a una suscripción que se acaba
 * de pagar, como el «Mejor perfil» del Gestor: primero la cuenta que vence
 * más tarde, luego el lugar que lleva más tiempo libre. Bloquea la fila con
 * SKIP LOCKED para que dos compras a la vez no reciban el mismo perfil.
 * Devuelve null si el plan no se entrega desde Plataformas, si la suscripción
 * ya tiene perfil o si no queda ninguno (el equipo la asigna a mano).
 */
export async function asignarAutomatico(
  tx: Prisma.TransactionClient,
  auditoria: AuditoriaService,
  suscripcionId: string,
  ahora = new Date(),
): Promise<AsignacionAutomatica | null> {
  const s = await tx.suscripcion.findUnique({
    where: { id: suscripcionId },
    select: {
      id: true,
      perfilCuenta: { select: { id: true } },
      plan: {
        select: {
          tipo: true,
          entrega: true,
          servicioId: true,
          servicio: { select: { nombre: true, proveedor: { select: { adaptador: true } } } },
        },
      },
    },
  });
  if (!s || s.perfilCuenta) return null;
  const plan = s.plan;
  if (!seEntregaDeInventario({ ...plan, adaptador: plan.servicio.proveedor.adaptador })) {
    return null;
  }
  const tipo = tipoPlataforma(plan.servicio.nombre);
  const [lugar] = await tx.$queryRaw<FilaLibre[]>`
    ${libresVigentes([plan.servicioId], fechaCaracas(ahora))}
    ${condicionTipo(tipo)}
    ORDER BY ${ordenTipo(tipo)} c.factura_en DESC, p.actualizado_en ASC, c.creado_en ASC, p.numero ASC
    LIMIT 1
    FOR UPDATE OF p SKIP LOCKED`;
  if (!lugar) return null;
  const r = await tx.perfilCuenta.updateMany({
    where: { id: lugar.id, estado: 'libre', suscripcionId: null },
    data: { estado: 'asignado', suscripcionId: s.id, asignadoEn: ahora },
  });
  if (r.count === 0) return null;
  await auditoria.registrar(
    {
      actorId: null,
      accion: 'perfil_cuenta.asignado',
      entidad: 'perfil_cuenta',
      entidadId: lugar.id,
      despues: {
        cuentaId: lugar.cuenta_id,
        numero: lugar.numero,
        suscripcionId: s.id,
        automatico: true,
      },
    },
    tx,
  );
  return { perfilId: lugar.id, cuentaId: lugar.cuenta_id, numero: lugar.numero };
}

/** Compras por la web (clientes y revendedores): un plan agotado no se vende. */
export async function exigirStock(tx: Prisma.TransactionClient, planId: string): Promise<void> {
  const p = await tx.plan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      tipo: true,
      entrega: true,
      servicioId: true,
      servicio: { select: { proveedor: { select: { adaptador: true } } } },
    },
  });
  if (!p) return;
  const agotados = await planesAgotados(tx, [{ ...p, adaptador: p.servicio.proveedor.adaptador }]);
  if (agotados.size) {
    throw new ErrorApp(
      409,
      'SIN_STOCK',
      'Este plan está agotado por ahora. Pídelo por WhatsApp y te avisamos cuando haya.',
    );
  }
}
