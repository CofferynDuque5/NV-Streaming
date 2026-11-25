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
 *
 * Y solo los que el equipo revisó a mano y marcó como APTOS (`apto_web`). Un
 * lugar deja de estar apto cuando cambia de estado (disparador de la base):
 * al liberarse después de un corte hay que revisarlo otra vez.
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
  nombre: string;
  pista: string;
  factura_en: Date;
  con_pin: boolean;
  apto_web: boolean;
  apto_revisado_en: Date | null;
  apto_revisado_por: string | null;
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

/** Aptos: solo los marcados. Por revisar: los que no. Todos: sin filtrar (para contar). */
type Revision = 'aptos' | 'por_revisar' | 'todos';

const libresVigentes = (servicioIds: string[], hoy: string, revision: Revision = 'aptos') =>
  Prisma.sql`
  SELECT p.id, p.cuenta_id, c.servicio_id, s.nombre AS servicio, p.numero, p.nombre, c.pista,
         c.factura_en, (p.pin_cifrado IS NOT NULL) AS con_pin, p.apto_web, p.apto_revisado_en,
         (SELECT u.nombre FROM usuarios u WHERE u.id = p.apto_revisado_por_id) AS apto_revisado_por,
         (c.modo = 'completa'
           OR (SELECT count(*) FROM perfiles_cuenta x WHERE x.cuenta_id = c.id) = 1) AS individual
  FROM perfiles_cuenta p
  JOIN cuentas_servicio c ON c.id = p.cuenta_id
  JOIN servicios s ON s.id = c.servicio_id
  WHERE c.servicio_id = ANY(${servicioIds}::uuid[])
    AND c.estado = 'activa'
    AND p.estado = 'libre'
    AND c.factura_en IS NOT NULL
    AND c.factura_en >= ${hoy}::date
    ${
      revision === 'aptos'
        ? Prisma.sql`AND p.apto_web`
        : revision === 'por_revisar'
          ? Prisma.sql`AND NOT p.apto_web`
          : Prisma.empty
    }`;

/** El mismo orden con el que `asignarAutomatico` elige el lugar (el «Mejor perfil»). */
const ordenEntrega = (tipo: TipoPlataforma) =>
  Prisma.sql`ORDER BY ${ordenTipo(tipo)} c.factura_en DESC, p.actualizado_en ASC, c.creado_en ASC, p.numero ASC`;

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
  // Vuelve a su mismo perfil o cupo si se le cortó y sigue libre (nadie lo usó)
  // en una cuenta activa y vigente: así renueva y conserva su lugar.
  const anterior = await lugarAnterior(tx, s.id, fechaCaracas(ahora));
  if (anterior) {
    const r = await tx.perfilCuenta.updateMany({
      where: { id: anterior.id, estado: 'libre', suscripcionId: null },
      data: { estado: 'asignado', suscripcionId: s.id, asignadoEn: ahora },
    });
    if (r.count > 0) {
      await auditoria.registrar(
        {
          actorId: null,
          accion: 'perfil_cuenta.asignado',
          entidad: 'perfil_cuenta',
          entidadId: anterior.id,
          despues: {
            cuentaId: anterior.cuentaId,
            numero: anterior.numero,
            suscripcionId: s.id,
            automatico: true,
            mismoLugar: true,
          },
        },
        tx,
      );
      return { perfilId: anterior.id, cuentaId: anterior.cuentaId, numero: anterior.numero };
    }
  }
  const plan = s.plan;
  if (!seEntregaDeInventario({ ...plan, adaptador: plan.servicio.proveedor.adaptador })) {
    return null;
  }
  const tipo = tipoPlataforma(plan.servicio.nombre);
  const [lugar] = await tx.$queryRaw<FilaLibre[]>`
    ${libresVigentes([plan.servicioId], fechaCaracas(ahora))}
    ${condicionTipo(tipo)}
    ${ordenEntrega(tipo)}
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

/**
 * El último perfil o cupo del que se liberó (cortó) esta suscripción, si sigue
 * libre y su cuenta está activa y vigente (`hoy`, día de Venezuela).
 */
async function lugarAnterior(
  tx: Prisma.TransactionClient,
  suscripcionId: string,
  hoy: string,
): Promise<{ id: string; cuentaId: string; numero: number } | null> {
  const [ultimo] = await tx.auditoria.findMany({
    where: {
      accion: 'perfil_cuenta.liberado',
      entidad: 'perfil_cuenta',
      despues: { path: ['suscripcionId'], equals: suscripcionId },
    },
    orderBy: { fecha: 'desc' },
    take: 1,
    select: { entidadId: true },
  });
  if (!ultimo?.entidadId) return null;
  const p = await tx.perfilCuenta.findFirst({
    where: {
      id: ultimo.entidadId,
      estado: 'libre',
      suscripcionId: null,
      cuenta: { estado: 'activa', facturaEn: { gte: new Date(`${hoy}T00:00:00.000Z`) } },
    },
    select: { id: true, cuentaId: true, numero: true },
  });
  return p;
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

/* ───────────────────── Entrega web: revisión y vista previa ───────────────────── */

export interface LugarEntregaFila {
  perfilId: string;
  cuentaId: string;
  pista: string;
  numero: number;
  nombre: string;
  individual: boolean;
  facturaEn: string;
  conPin: boolean;
  aptoRevisadoEn: string | null;
  aptoRevisadoPor: string | null;
}

export interface EntregaWebServicioFila {
  servicioId: string;
  servicio: string;
  tipo: TipoPlataforma;
  /** Lo que entregaría la web ahora mismo y los siguientes, en orden. */
  siguientes: LugarEntregaFila[];
  aptos: number;
  aptosIndividuales: number;
  aptosPorVencer: number;
  /** Libres y vigentes que la web podría vender pero nadie revisó. */
  porRevisar: LugarEntregaFila[];
  /** Todos los aptos, en el orden de entrega. */
  todosAptos: LugarEntregaFila[];
  correos?: Record<string, string> | null;
}

const aLugar = (f: FilaLibre): LugarEntregaFila => ({
  perfilId: f.id,
  cuentaId: f.cuenta_id,
  pista: f.pista,
  numero: f.numero,
  nombre: f.nombre,
  individual: f.individual,
  facturaEn: fechaCaracas(f.factura_en),
  conPin: f.con_pin,
  aptoRevisadoEn: f.apto_revisado_en ? f.apto_revisado_en.toISOString() : null,
  aptoRevisadoPor: f.apto_revisado_por,
});

/**
 * Por cada servicio que se vende por la web desde Plataformas: qué lugar se
 * entregaría si alguien compra ahora, cuáles siguen (con el mismo orden de la
 * entrega automática) y cuáles faltan por revisar. No bloquea ni cambia nada.
 */
export async function entregaWeb(
  db: Db,
  ahora = new Date(),
  siguientes = 5,
): Promise<EntregaWebServicioFila[]> {
  const planes = await db.plan.findMany({
    where: {
      activo: true,
      tipo: 'suscripcion',
      entrega: 'alquiler',
      servicio: {
        proveedor: { adaptador: 'manual' },
        cuentas: { some: { estado: { not: 'retirada' } } },
      },
    },
    select: { servicio: { select: { id: true, nombre: true } } },
    distinct: ['servicioId'],
  });
  const hoy = fechaCaracas(ahora);
  const enUnaSemana = fechaCaracas(new Date(ahora.getTime() + 7 * 86_400_000));
  const servicios = planes
    .map((p) => p.servicio)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const filas: EntregaWebServicioFila[] = [];
  for (const sv of servicios) {
    const tipo = tipoPlataforma(sv.nombre);
    const aptos = await db.$queryRaw<FilaLibre[]>`
      ${libresVigentes([sv.id], hoy, 'aptos')}
      ${condicionTipo(tipo)}
      ${ordenEntrega(tipo)}`;
    const porRevisar = await db.$queryRaw<FilaLibre[]>`
      ${libresVigentes([sv.id], hoy, 'por_revisar')}
      ${condicionTipo(tipo)}
      ${ordenEntrega(tipo)}`;
    filas.push({
      servicioId: sv.id,
      servicio: sv.nombre,
      tipo,
      siguientes: aptos.slice(0, siguientes).map(aLugar),
      aptos: aptos.length,
      aptosIndividuales: aptos.filter((f) => f.individual).length,
      aptosPorVencer: aptos.filter((f) => fechaCaracas(f.factura_en) <= enUnaSemana).length,
      porRevisar: porRevisar.map(aLugar),
      todosAptos: aptos.map(aLugar),
    });
  }
  return filas;
}
