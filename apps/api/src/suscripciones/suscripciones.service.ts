import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EstadoSuscripcion,
  Factura,
  Moneda,
  Prisma,
  PrismaClient,
  Suscripcion,
  TipoEventoSuscripcion,
} from '@nv/db';
import {
  type CambiarVencimientoEntrada,
  type CancelarSuscripcionEntrada,
  ESTADOS_CAMBIO_VENCIMIENTO,
  type Cotizacion,
  DATOS_ACTIVACION,
  type ListarSuscripcionesEntrada,
  type Pagina,
  REGLAS_COBRO,
  type SuscripcionDetalle,
  type SuscripcionPublica,
  type VencimientosEquipo,
  type VencimientosCortes,
  type SuscripcionConLugar,
  type CortarSuscripcionEntrada,
  esCuentaIndividual,
  esTitular,
  TEXTOS_PLATAFORMA,
  unaPersonaEnTodos,
  etiquetaPerfil,
  tipoPlataforma,
  tienePermiso,
  type DevolucionSugerida,
} from '@nv/shared';
import { asignarAutomatico, exigirStock } from '../cuentas/stock-cuentas.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  datosDeServicio,
  INCLUIR_PLAN,
  planVendible,
  type PlanCompleto,
} from '../catalogo/catalogo.service.js';
import { Cifrador } from '../comun/cripto.js';
import { descifrarDatosSecretos, valoresDeDatos } from '../comun/datos-cliente.js';
import { CuentasService, LIMITE_REVELAR_CUENTA } from '../cuentas/cuentas.service.js';
import { LimitesService } from '../limites/limites.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { FacturacionService } from '../cobros/facturacion.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { type Dec, sumarDuracion } from '../dinero/dinero.js';
import {
  DESFASE_CARACAS_MS,
  inicioDiaCaracas,
  partesCaracas,
} from '../automatizaciones/horario.js';
import { encolarTrabajo, TRABAJO } from '../automatizaciones/trabajos.js';
import { type OrigenEntrega, registrarEntrega, solicitarRevocacion } from '../entregas/registro.js';
import { INCLUIR_SUSCRIPCION, suscripcionDetalle, suscripcionPublica } from './presentacion.js';
import { exigirGestionDelCliente } from './canal-revendedor.js';

type Tx = Prisma.TransactionClient;
const DIA_MS = 24 * 3600_000;
/** Tope por grupo en Vencimientos (la lista completa está en Suscripciones). */
const MAX_VENCIMIENTOS = 300;
/** Llave del bloqueo que evita dos pasadas de vencimientos a la vez. */
const BLOQUEO_VENCIMIENTOS = 7_411_002;

const transicionInvalida = (mensaje: string) =>
  new ErrorApp(409, 'TRANSICION_NO_PERMITIDA', mensaje);

export interface ResultadoAlta {
  suscripcion: SuscripcionPublica;
  factura: { id: string; numero: string; estado: string };
}

/**
 * Ciclo de vida de las suscripciones (sección 5.9 de la arquitectura). Cada
 * transición bloquea la fila, comprueba el estado actual y deja un evento y
 * una entrada de auditoría en la misma transacción.
 */
/**
 * Desde qué fecha corre el período nuevo. Quien renueva tarde paga desde el día
 * en que venció (vencía el 22 y paga el 23: queda al 22 del mes siguiente).
 * «Desde hoy» lo elige el equipo a mano cuando el cliente perdió días (caída).
 * Si ni con el período pagado llega a hoy (lleva más de un período vencido),
 * corre desde hoy para no dejarlo vencido recién pagado.
 */
export function baseRenovacion(
  venceEn: Date | null,
  cantidad: number,
  unidad: 'dia' | 'mes',
  ahora: Date,
  desdeHoy: boolean,
): Date {
  if (desdeHoy || !venceEn) return ahora;
  if (venceEn > ahora) return venceEn;
  return sumarDuracion(venceEn, cantidad, unidad) > ahora ? venceEn : ahora;
}

/**
 * Una cuenta con todos sus perfiles a nombre de la misma persona sale una sola
 * vez (la primera fila), marcada como cuenta completa y con las suscripciones
 * de sus perfiles que están en esta lista.
 */
function juntarCompletas(
  filas: SuscripcionConLugar[],
  deUnaPersona: Map<string, string[]>,
): SuscripcionConLugar[] {
  const grupos = new Map<string, SuscripcionConLugar[]>();
  for (const f of filas) {
    const id = f.lugar?.cuentaId;
    if (id && deUnaPersona.has(id)) grupos.set(id, [...(grupos.get(id) ?? []), f]);
  }
  const vistos = new Set<string>();
  const salida: SuscripcionConLugar[] = [];
  for (const f of filas) {
    const id = f.lugar?.cuentaId;
    const grupo = id ? grupos.get(id) : undefined;
    if (!f.lugar || !grupo || grupo.length < 2) {
      salida.push(f);
      continue;
    }
    if (vistos.has(id!)) continue;
    vistos.add(id!);
    salida.push({
      ...f,
      lugar: {
        ...f.lugar,
        etiqueta: 'Cuenta completa',
        completa: { suscripcionIds: grupo.map((x) => x.id), perfiles: grupo.length },
      },
    });
  }
  return salida;
}

@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger('Suscripciones');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(CuentasService) private readonly cuentas: CuentasService,
  ) {}

  async listar(
    auth: ContextoAuth,
    filtro: ListarSuscripcionesEntrada,
  ): Promise<Pagina<SuscripcionPublica>> {
    const where: Prisma.SuscripcionWhereInput = {
      cliente: alcanceClientes(auth),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.planId ? { planId: filtro.planId } : {}),
      ...(filtro.vencenEnDias
        ? {
            estado: filtro.estado ?? { in: ['activa', 'en_gracia'] },
            venceEn: { lte: new Date(Date.now() + filtro.vencenEnDias * DIA_MS) },
          }
        : {}),
    };
    const [total, filas] = await Promise.all([
      this.prisma.suscripcion.count({ where }),
      this.prisma.suscripcion.findMany({
        where,
        include: INCLUIR_SUSCRIPCION,
        orderBy: filtro.vencenEnDias
          ? [{ venceEn: 'asc' }, { id: 'asc' }]
          : [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(suscripcionPublica),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  /** Lo que vence hoy, mañana y esta semana, y lo vencido sin resolver (día de Caracas). */
  async vencimientos(auth: ContextoAuth, ahora = new Date()): Promise<VencimientosEquipo> {
    const cliente = alcanceClientes(auth);
    const dia = (n: number) => inicioDiaCaracas(ahora, n);
    const lista = (where: Prisma.SuscripcionWhereInput) =>
      this.prisma.suscripcion
        .findMany({
          where: { cliente, ...where },
          include: INCLUIR_SUSCRIPCION,
          orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
          take: MAX_VENCIMIENTOS,
        })
        .then((filas) => filas.map(suscripcionPublica));
    const activas = (desde: Date, hasta: Date) =>
      lista({ estado: { in: ['activa', 'en_gracia'] }, venceEn: { gte: desde, lt: hasta } });
    const [vencidas, hoy, manana, semana] = await Promise.all([
      lista({
        OR: [
          { estado: { in: ['en_gracia', 'suspendida'] }, venceEn: { lt: dia(0) } },
          { estado: 'vencida', venceEn: { gte: new Date(ahora.getTime() - 30 * DIA_MS) } },
        ],
      }),
      activas(dia(0), dia(1)),
      activas(dia(1), dia(2)),
      activas(dia(2), dia(8)),
    ]);
    return { vencidas, hoy, manana, semana };
  }

  /**
   * Cobros → Vencimientos y Cortes, con las reglas del Gestor (día de Caracas):
   * - Vencimientos: vencen hoy y mañana. Los de hoy se quedan aquí hasta la
   *   hora de corte (21:00) y después pasan a Cortes.
   * - Cortes: ya vencidos (o que vencen hoy, pasada la hora de corte) que
   *   todavía ocupan un perfil o cupo. Al cortarlos el lugar queda libre y
   *   salen de la lista; si renuevan, su fecha avanza y también salen.
   */
  async vencimientosCortes(
    auth: ContextoAuth,
    ahora = new Date(),
    /** De quién: por defecto, el alcance del usuario (un revendedor pasa su cartera). */
    cliente: Prisma.ClienteWhereInput = alcanceClientes(auth),
  ): Promise<VencimientosCortes> {
    const dia = (n: number) => inicioDiaCaracas(ahora, n);
    const pasoHoraCorte = partesCaracas(ahora).hora >= REGLAS_COBRO.horaCorte;
    const limiteCortes = pasoHoraCorte ? dia(1) : dia(0);
    const incluir = {
      ...INCLUIR_SUSCRIPCION,
      // Para «Cobrar» por WhatsApp o Telegram desde la fila.
      cliente: {
        select: {
          id: true,
          nombre: true,
          contactos: {
            where: { tipo: { in: ['whatsapp', 'telefono', 'telegram'] } },
            select: { tipo: true, valor: true },
            orderBy: { creadoEn: 'asc' },
          },
        },
      },
      perfilCuenta: {
        select: {
          id: true,
          numero: true,
          nombre: true,
          cuenta: {
            select: {
              id: true,
              pista: true,
              modo: true,
              _count: { select: { perfiles: true } },
              perfiles: {
                where: {
                  estado: 'asignado',
                  // Los que siguen al día (no los vencidos que esperan corte).
                  suscripcion: { estado: { in: ['activa', 'en_gracia'] }, venceEn: { gte: ahora } },
                },
                select: { id: true },
              },
            },
          },
        },
      },
    } satisfies Prisma.SuscripcionInclude;
    const lista = (where: Prisma.SuscripcionWhereInput) =>
      this.prisma.suscripcion.findMany({
        where: { cliente, ...where },
        include: incluir,
        orderBy: [{ venceEn: 'asc' }, { id: 'asc' }],
        take: MAX_VENCIMIENTOS,
      });
    type Fila = Awaited<ReturnType<typeof lista>>[number];
    const [vencimientos, cortes] = await Promise.all([
      lista({
        estado: { in: ['activa', 'en_gracia'] },
        venceEn: { gte: pasoHoraCorte ? dia(1) : dia(0), lt: dia(2) },
      }),
      lista({
        estado: { in: ['activa', 'en_gracia', 'suspendida', 'vencida'] },
        venceEn: { lt: limiteCortes },
        perfilCuenta: { isNot: null },
      }),
    ]);
    // Quién cobró: el nombre del usuario y, si es revendedor, su nombre comercial.
    const idsCobro = [
      ...new Set(
        [...vencimientos, ...cortes].flatMap((f) => (f.cobradoPorId ? [f.cobradoPorId] : [])),
      ),
    ];
    const nombres = new Map(
      idsCobro.length
        ? (
            await this.prisma.usuario.findMany({
              where: { id: { in: idsCobro } },
              select: { id: true, nombre: true, revendedor: { select: { nombreComercial: true } } },
            })
          ).map((u) => [
            u.id,
            { nombre: u.nombre, revendedor: u.revendedor?.nombreComercial ?? null },
          ])
        : [],
    );
    /** El cobro cuenta para este vencimiento si fue desde una semana antes de la fecha. */
    const cobroDe = (f: Fila) =>
      f.cobradoEn && (!f.venceEn || f.cobradoEn.getTime() >= f.venceEn.getTime() - 7 * DIA_MS)
        ? {
            en: f.cobradoEn.toISOString(),
            por: f.cobradoPorId ? (nombres.get(f.cobradoPorId)?.nombre ?? null) : null,
            revendedor: f.cobradoPorId ? (nombres.get(f.cobradoPorId)?.revendedor ?? null) : null,
          }
        : null;
    const conLugar = (f: Fila): SuscripcionConLugar => {
      const p = f.perfilCuenta;
      const tipo = tipoPlataforma(f.plan.servicio.nombre);
      const diasVencida = f.venceEn
        ? Math.round((dia(0).getTime() - inicioDiaCaracas(f.venceEn).getTime()) / DIA_MS)
        : 0;
      const { contactos, ...cliente } = f.cliente;
      const de = (...tipos: string[]) =>
        contactos.find((c) => tipos.includes(c.tipo))?.valor ?? null;
      return {
        ...suscripcionPublica({ ...f, cliente }),
        diasVencida,
        contacto: { whatsapp: de('whatsapp', 'telefono'), telegram: de('telegram') },
        contactos: contactos.map((c) => ({
          tipo: c.tipo === 'telegram' ? ('telegram' as const) : ('whatsapp' as const),
          valor: c.valor,
        })),
        cobro: cobroDe(f),
        lugar: p
          ? {
              cuentaId: p.cuenta.id,
              perfilId: p.id,
              numero: p.numero,
              etiqueta: etiquetaPerfil(tipo, p.numero, p.nombre),
              nombre: p.nombre,
              tipo,
              individual: esCuentaIndividual(p.cuenta.modo, p.cuenta._count.perfiles),
              pistaCuenta: p.cuenta.pista,
              otrosActivos: p.cuenta.perfiles.filter((x) => x.id !== p.id).length,
            }
          : null,
      };
    };
    const deUnaPersona = await this.cuentasDeUnaPersona(
      [...vencimientos, ...cortes].flatMap((f) =>
        f.perfilCuenta &&
        !esCuentaIndividual(f.perfilCuenta.cuenta.modo, f.perfilCuenta.cuenta._count.perfiles)
          ? [f.perfilCuenta.cuenta.id]
          : [],
      ),
    );
    return {
      horaCorte: REGLAS_COBRO.horaCorte,
      pasoHoraCorte,
      vencimientos: juntarCompletas(vencimientos.map(conLugar), deUnaPersona),
      // Los más recientes primero, como en el Gestor (lo de hoy arriba).
      cortes: juntarCompletas(cortes.map(conLugar).reverse(), deUnaPersona),
    };
  }

  /**
   * Cuentas (de las dadas) con todos sus perfiles ocupados por la misma persona,
   * con los ids de los clientes que la ocupan (pueden ser fichas distintas con el
   * mismo nombre, como las que trajo el Gestor).
   */
  private async cuentasDeUnaPersona(
    ids: string[],
    db: Prisma.TransactionClient | PrismaClient = this.prisma,
  ): Promise<Map<string, string[]>> {
    const unicas = [...new Set(ids)];
    if (unicas.length === 0) return new Map();
    const perfiles = await db.perfilCuenta.findMany({
      where: { cuentaId: { in: unicas } },
      select: {
        cuentaId: true,
        estado: true,
        suscripcion: { select: { clienteId: true, cliente: { select: { nombre: true } } } },
      },
    });
    const porCuenta = new Map<string, typeof perfiles>();
    for (const x of perfiles) porCuenta.set(x.cuentaId, [...(porCuenta.get(x.cuentaId) ?? []), x]);
    const r = new Map<string, string[]>();
    for (const [id, lista] of porCuenta) {
      const nombre = unaPersonaEnTodos(
        lista.map((x) => ({
          asignado: x.estado === 'asignado',
          nombre: x.suscripcion?.cliente.nombre,
        })),
      );
      if (nombre)
        r.set(id, [
          ...new Set(lista.flatMap((x) => (x.suscripcion ? [x.suscripcion.clienteId] : []))),
        ]);
    }
    return r;
  }

  /**
   * Marca que se le cobró a mano (WhatsApp o Telegram) desde Vencimientos o
   * Cortes. Se puede volver a cobrar: queda la fecha del último cobro.
   */
  async marcarCobrado(
    auth: ContextoAuth,
    id: string,
    canal: 'whatsapp' | 'telegram' | 'copiado',
    cliente: InfoCliente,
    ahora = new Date(),
    /** De quién puede ser: por defecto, el alcance del usuario (un revendedor pasa su cartera). */
    deCliente: Prisma.ClienteWhereInput = alcanceClientes(auth),
  ): Promise<{ cobradoEn: string }> {
    const s = await this.prisma.suscripcion.findFirst({
      where: { id, cliente: deCliente },
      select: { id: true, cobradoEn: true },
    });
    if (!s) throw Errores.noEncontrado('La suscripción');
    await this.prisma.suscripcion.update({
      where: { id },
      data: { cobradoEn: ahora, cobradoPorId: auth.usuario.id },
    });
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'suscripcion.cobrada',
      entidad: 'suscripcion',
      entidadId: id,
      antes: { cobradoEn: s.cobradoEn?.toISOString() ?? null },
      despues: { cobradoEn: ahora.toISOString(), canal },
      cliente,
    });
    return { cobradoEn: ahora.toISOString() };
  }

  /**
   * Cortar a un cliente que no renovó (Cobros → Cortes), como en el Gestor:
   * - Su perfil o cupo queda libre; con clave nueva, la cuenta la guarda (y
   *   todos los que siguen en ella la ven al momento en «Mis accesos»); con
   *   PIN nuevo, el perfil. Todo cifrado.
   * - En un plan familiar, el cupo del miembro conserva su correo para
   *   volver a alquilarlo y la clave nueva es la del miembro.
   * - Si el mismo cliente tiene otros perfiles vencidos en esa cuenta, se
   *   cortan también (cortar uno = cortar todos, como en el Gestor).
   * - Las suscripciones pasan a suspendidas, con evento y auditoría. No se
   *   borra nada: si paga, se renueva y se le asigna un lugar otra vez.
   */
  async cortar(
    auth: ContextoAuth,
    id: string,
    e: CortarSuscripcionEntrada,
    cliente: InfoCliente,
    ahora = new Date(),
  ): Promise<{ cortadas: number }> {
    const manana = inicioDiaCaracas(ahora, 1);
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.suscripcion.findFirst({
        where: { id, cliente: alcanceClientes(auth) },
        select: {
          id: true,
          venceEn: true,
          clienteId: true,
          plan: { select: { servicio: { select: { nombre: true } } } },
          perfilCuenta: {
            select: { id: true, numero: true, cuentaId: true, cuenta: { select: { modo: true } } },
          },
        },
      });
      if (!s) throw Errores.noEncontrado('La suscripción');
      const p = s.perfilCuenta;
      if (!p) {
        throw new ErrorApp(409, 'SIN_LUGAR', 'Este cliente ya no ocupa ningún perfil ni cupo.');
      }
      // Antes de tiempo solo con motivo: el cliente lo ve como «Suspendida: <motivo>».
      const anticipado = !s.venceEn || s.venceEn >= manana;
      if (anticipado && !e.motivo) {
        throw new ErrorApp(
          400,
          'MOTIVO_REQUERIDO',
          'Este cliente todavía no vence: escribe el motivo del corte.',
          { motivo: ['Escribe por qué lo cortas antes de tiempo.'] },
        );
      }
      const tipo = tipoPlataforma(s.plan.servicio.nombre);
      if (!TEXTOS_PLATAFORMA[tipo].usaPin && e.nuevoPin) {
        throw new ErrorApp(400, 'SIN_PIN', 'Esta plataforma no usa PIN.');
      }
      // El lugar elegido y los otros vencidos del mismo cliente en la misma cuenta.
      // Si toda la cuenta es de la misma persona (aunque sean fichas distintas con
      // el mismo nombre), se corta como cuenta completa.
      const mismaPersona = (await this.cuentasDeUnaPersona([p.cuentaId], tx)).get(p.cuentaId) ?? [];
      const hermanos = await tx.perfilCuenta.findMany({
        where: {
          cuentaId: p.cuentaId,
          estado: 'asignado',
          id: { not: p.id },
          suscripcion: {
            clienteId: { in: [...new Set([s.clienteId, ...mismaPersona])] },
            venceEn: { lt: manana },
            estado: { in: ['activa', 'en_gracia', 'suspendida', 'vencida'] },
          },
        },
        orderBy: { numero: 'asc' },
        select: { id: true, numero: true },
      });
      // Un corte anticipado es solo de este lugar; el de vencidos lleva a sus hermanos.
      const lugares = [{ id: p.id, numero: p.numero }, ...(anticipado ? [] : hermanos)];
      const motivo = e.motivo ?? 'Cortado desde Cobros: no renovó';
      for (const [n, l] of lugares.entries()) {
        const miembro =
          tipo === 'familiar' && p.cuenta.modo !== 'completa' && !esTitular(tipo, l.numero);
        const actual = await tx.perfilCuenta.findUniqueOrThrow({
          where: { id: l.id },
          select: { suscripcion: { select: { id: true, estado: true } } },
        });
        const sus = actual.suscripcion;
        // La clave de la cuenta se cambia una sola vez; la de un miembro, en su cupo.
        const datos = {
          ...(e.nuevoPin ? { nuevoPin: e.nuevoPin } : {}),
          ...(e.nuevaClave && (miembro || n === 0) ? { nuevaClave: e.nuevaClave } : {}),
        };
        await this.cuentas.liberarEn(tx, auth, p.cuentaId, l.id, datos, cliente, miembro);
        if (!sus) continue;
        const suspender = sus.estado === 'activa' || sus.estado === 'en_gracia';
        if (suspender || e.motivo) {
          await tx.suscripcion.update({
            where: { id: sus.id },
            data: {
              ...(suspender ? { estado: 'suspendida' as const } : {}),
              ...(e.motivo ? { motivoSuspension: e.motivo } : {}),
            },
          });
        }
        await this.evento(tx, sus.id, 'suspension', auth.usuario.id, motivo, {
          de: sus.estado,
          a: suspender ? 'suspendida' : sus.estado,
          corte: true,
          ...(anticipado ? { anticipado: true } : {}),
          claveNueva: Boolean(datos.nuevaClave),
          pinNuevo: Boolean(datos.nuevoPin),
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'suscripcion.cortada',
            entidad: 'suscripcion',
            entidadId: sus.id,
            antes: { estado: sus.estado, perfilId: l.id },
            // Solo qué cambió: nunca la clave ni el PIN.
            despues: {
              estado: suspender ? 'suspendida' : sus.estado,
              ...(e.motivo ? { motivo: e.motivo } : {}),
              claveNueva: Boolean(datos.nuevaClave),
              pinNuevo: Boolean(datos.nuevoPin),
              ...(n > 0 ? { junto: s.id } : {}),
            },
            cliente,
          },
          tx,
        );
      }
      return { cortadas: lugares.length };
    });
  }

  /**
   * Eliminar a un cliente de su lugar, como «Eliminar» del Gestor: a diferencia
   * de cortar, se borra también el correo y la clave propios del miembro (plan
   * familiar) y la suscripción se cancela (sus facturas abiertas se anulan).
   * El cliente y su historial se conservan. Se puede hacer aunque no haya
   * vencido: el panel pide confirmarlo.
   */
  async eliminarDelLugar(
    auth: ContextoAuth,
    id: string,
    e: CortarSuscripcionEntrada,
    cliente: InfoCliente,
  ): Promise<{ eliminada: true; miembroBorrado: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.suscripcion.findFirst({
        where: { id, cliente: alcanceClientes(auth) },
        select: {
          id: true,
          estado: true,
          plan: { select: { servicio: { select: { nombre: true } } } },
          perfilCuenta: {
            select: {
              id: true,
              numero: true,
              cuentaId: true,
              usuarioMiembroCifrado: true,
              cuenta: { select: { modo: true } },
            },
          },
        },
      });
      if (!s) throw Errores.noEncontrado('La suscripción');
      const p = s.perfilCuenta;
      if (!p) {
        throw new ErrorApp(409, 'SIN_LUGAR', 'Este cliente ya no ocupa ningún perfil ni cupo.');
      }
      const tipo = tipoPlataforma(s.plan.servicio.nombre);
      if (!TEXTOS_PLATAFORMA[tipo].usaPin && e.nuevoPin) {
        throw new ErrorApp(400, 'SIN_PIN', 'Esta plataforma no usa PIN.');
      }
      const miembro =
        tipo === 'familiar' && p.cuenta.modo !== 'completa' && !esTitular(tipo, p.numero);
      // La clave del miembro se borra con él: la nueva solo aplica a la cuenta.
      const datos = {
        ...(e.nuevoPin ? { nuevoPin: e.nuevoPin } : {}),
        ...(e.nuevaClave && !miembro ? { nuevaClave: e.nuevaClave } : {}),
      };
      await this.cuentas.liberarEn(tx, auth, p.cuentaId, p.id, datos, cliente, false);
      const motivo = 'Eliminado de su lugar';
      const cancelar = s.estado !== 'cancelada' && s.estado !== 'vencida';
      if (cancelar) {
        await this.anularFacturasAbiertas(tx, s.id, motivo, auth.usuario.id);
        await tx.suscripcion.update({
          where: { id: s.id },
          data: { estado: 'cancelada', canceladaEn: new Date(), cancelarAlVencer: false },
        });
        await solicitarRevocacion(tx, s.id, motivo);
      }
      await this.evento(tx, s.id, 'cancelacion', auth.usuario.id, motivo, {
        de: s.estado,
        a: cancelar ? 'cancelada' : s.estado,
        eliminado: true,
        miembroBorrado: miembro && Boolean(p.usuarioMiembroCifrado),
        claveNueva: Boolean(datos.nuevaClave),
        pinNuevo: Boolean(datos.nuevoPin),
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'suscripcion.eliminada_del_lugar',
          entidad: 'suscripcion',
          entidadId: s.id,
          antes: { estado: s.estado, perfilId: p.id },
          // Solo qué cambió: nunca correos, claves ni PIN.
          despues: {
            estado: cancelar ? 'cancelada' : s.estado,
            miembroBorrado: miembro && Boolean(p.usuarioMiembroCifrado),
            claveNueva: Boolean(datos.nuevaClave),
            pinNuevo: Boolean(datos.nuevoPin),
          },
          cliente,
        },
        tx,
      );
      return { eliminada: true, miembroBorrado: miembro && Boolean(p.usuarioMiembroCifrado) };
    });
  }

  async obtener(auth: ContextoAuth, id: string): Promise<SuscripcionDetalle> {
    const s = await this.prisma.suscripcion.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: {
        ...INCLUIR_SUSCRIPCION,
        eventos: {
          orderBy: { creadoEn: 'desc' },
          include: { actor: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!s) throw Errores.noEncontrado('La suscripción');
    return suscripcionDetalle(s);
  }

  /**
   * Calculadora de devolución: lo pagado en la última factura, repartido entre
   * los días que cubre (duración del plan × períodos pagados), por los días que
   * le quedan hasta el vencimiento. Solo sugiere: no devuelve nada.
   */
  async devolucion(
    auth: ContextoAuth,
    id: string,
    ahora = new Date(),
  ): Promise<DevolucionSugerida> {
    const s = await this.prisma.suscripcion.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      select: {
        venceEn: true,
        plan: { select: { duracionCantidad: true, duracionUnidad: true } },
        facturas: {
          where: { estado: 'pagada' },
          orderBy: [{ pagadaEn: 'desc' }, { creadoEn: 'desc' }],
          take: 1,
          select: {
            id: true,
            numero: true,
            total: true,
            moneda: true,
            totalUsd: true,
            periodos: true,
          },
        },
      },
    });
    if (!s) throw Errores.noEncontrado('La suscripción');
    const f = s.facturas[0] ?? null;
    let diasPeriodo = 1;
    if (s.venceEn) {
      const cantidad = s.plan.duracionCantidad * (f?.periodos ?? 1);
      const inicio = sumarDuracion(s.venceEn, -cantidad, s.plan.duracionUnidad);
      diasPeriodo = Math.max(1, Math.round((s.venceEn.getTime() - inicio.getTime()) / 86_400_000));
    }
    const diasRestantes = s.venceEn
      ? Math.min(
          diasPeriodo,
          Math.max(0, Math.ceil((s.venceEn.getTime() - ahora.getTime()) / 86_400_000)),
        )
      : 0;
    const parte = (total: Dec) => total.mul(diasRestantes).div(diasPeriodo).toFixed(2);
    return {
      factura: f
        ? {
            id: f.id,
            numero: numeroFactura(f.numero),
            total: f.total.toFixed(2),
            moneda: f.moneda,
            totalUsd: f.totalUsd.toFixed(2),
          }
        : null,
      diasPeriodo,
      diasRestantes,
      monto: f ? parte(f.total) : '0.00',
      montoUsd: f ? parte(f.totalUsd) : '0.00',
    };
  }

  /**
   * Datos que dio el cliente al comprar, con la contraseña de su cuenta
   * descifrada (activación en su correo). Con límite por hora y auditado.
   */
  async revelarDatos(
    auth: ContextoAuth,
    id: string,
    cliente: InfoCliente,
  ): Promise<{ datos: { etiqueta: string; valor: string }[] }> {
    await this.limites.consumir(`revelar_datos:${auth.usuario.id}`, LIMITE_REVELAR_CUENTA);
    const s = await this.prisma.suscripcion.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      select: {
        id: true,
        clienteId: true,
        datosCliente: true,
        plan: { select: { servicio: { select: { datosRequeridos: true } } } },
      },
    });
    if (!s) throw Errores.noEncontrado('La suscripción');
    const valores = descifrarDatosSecretos(
      this.cifrador,
      s.clienteId,
      valoresDeDatos(s.datosCliente),
    );
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'suscripcion.datos_vistos',
      entidad: 'suscripcion',
      entidadId: s.id,
      cliente,
    });
    const nombres = new Map(
      [...DATOS_ACTIVACION, ...datosDeServicio(s.plan.servicio.datosRequeridos)].map((d) => [
        d.clave,
        d.etiqueta,
      ]),
    );
    return {
      datos: Object.entries(valores).map(([clave, valor]) => ({
        etiqueta: nombres.get(clave) ?? clave,
        valor,
      })),
    };
  }

  /** Precio final de un plan en una moneda, con cupón, sin guardar nada. */
  async cotizar(
    auth: ContextoAuth,
    e: { planId: string; moneda: Moneda; cupon?: string | undefined; clienteId?: string },
  ): Promise<Cotizacion> {
    return this.prisma.$transaction(async (tx) => {
      const plan = await this.planContratable(tx, auth, e.planId);
      const clienteId =
        auth.usuario.rol === 'cliente'
          ? (await this.clientes.deUsuario(auth.usuario, tx)).id
          : (e.clienteId ?? null);
      const c = await this.facturacion.calcular(tx, {
        plan,
        moneda: e.moneda,
        concepto: 'alta',
        cupon: e.cupon ?? null,
        clienteId,
      });
      return this.facturacion.cotizacion(c);
    });
  }

  /** Alta: la suscripción nace pendiente de pago con su factura. */
  async crear(
    auth: ContextoAuth,
    e: { clienteId?: string; planId: string; moneda: Moneda; cupon?: string | undefined },
    cliente: InfoCliente,
  ): Promise<ResultadoAlta> {
    return this.prisma.$transaction(async (tx) => {
      const titular =
        auth.usuario.rol === 'cliente'
          ? await this.clientes.deUsuario(auth.usuario, tx)
          : await this.clientes.exigirAlcance(auth, e.clienteId ?? '', tx);
      if (titular.estado !== 'activo') {
        throw new ErrorApp(
          409,
          'CLIENTE_ARCHIVADO',
          'El cliente está archivado; reactívalo primero.',
        );
      }
      // Serializa las altas del mismo cliente para que el límite de pendientes se cumpla.
      await tx.$queryRaw`SELECT id FROM clientes WHERE id = ${titular.id}::uuid FOR UPDATE`;
      const pendientes = await tx.suscripcion.count({
        where: { clienteId: titular.id, estado: 'pendiente_pago' },
      });
      if (pendientes >= REGLAS_COBRO.pendientesPorCliente) {
        throw new ErrorApp(
          409,
          'DEMASIADAS_PENDIENTES',
          `Hay ${pendientes} suscripciones esperando pago. Paga o cancela alguna antes de contratar otra.`,
        );
      }
      const plan = await this.planContratable(tx, auth, e.planId);
      const { s, factura } = await this.alta(tx, auth, {
        clienteId: titular.id,
        plan,
        moneda: e.moneda,
        cupon: e.cupon ?? null,
        pedidoId: null,
        cliente,
      });
      return {
        suscripcion: suscripcionPublica(await this.cargar(tx, s.id)),
        factura: {
          id: factura.id,
          numero: `NV-${String(factura.numero).padStart(6, '0')}`,
          estado: factura.estado,
        },
      };
    });
  }

  /**
   * Alta de un plan dentro de un pedido del carrito (en la transacción del
   * pedido, que ya bloqueó al cliente y comprobó sus límites).
   */
  async altaDePedido(
    tx: Tx,
    auth: ContextoAuth,
    e: {
      clienteId: string;
      planId: string;
      moneda: Moneda;
      cupon: string | null;
      pedidoId: string;
      cliente: InfoCliente;
      /** Datos que escribió el cliente (ID de jugador…), ya revisados. */
      datosCliente?: Record<string, string> | null;
      /** Descuento de combo de esta línea, en `moneda`. */
      descuentoCombo?: Dec | null;
    },
  ): Promise<Factura> {
    const plan = await this.planContratable(tx, auth, e.planId);
    const { factura } = await this.alta(tx, auth, { ...e, plan });
    return factura;
  }

  /** Crea la suscripción pendiente de pago con su factura de alta, y la audita. */
  private async alta(
    tx: Tx,
    auth: ContextoAuth,
    e: {
      clienteId: string;
      plan: PlanCompleto;
      moneda: Moneda;
      cupon: string | null;
      pedidoId: string | null;
      cliente: InfoCliente;
      datosCliente?: Record<string, string> | null;
      descuentoCombo?: Dec | null;
    },
  ): Promise<{ s: Suscripcion; factura: Factura }> {
    const { plan } = e;
    // Lo que compra un cliente en la web se entrega de Plataformas: sin stock vigente, no se vende.
    if (auth.usuario.rol === 'cliente') await exigirStock(tx, plan.id);
    const s = await tx.suscripcion.create({
      data: {
        clienteId: e.clienteId,
        planId: plan.id,
        moneda: e.moneda,
        creadoPorId: auth.usuario.id,
        ...(e.datosCliente && Object.keys(e.datosCliente).length > 0
          ? { datosCliente: e.datosCliente }
          : {}),
      },
    });
    await this.evento(tx, s.id, 'alta', auth.usuario.id, null, {
      planId: plan.id,
      moneda: e.moneda,
      ...(e.pedidoId ? { pedidoId: e.pedidoId } : {}),
    });
    const factura = await this.facturacion.emitir(tx, {
      clienteId: e.clienteId,
      suscripcionId: s.id,
      plan,
      moneda: e.moneda,
      concepto: 'alta',
      cupon: e.cupon,
      actorId: auth.usuario.id,
      pedidoId: e.pedidoId,
      descuentoCombo: e.descuentoCombo ?? null,
    });
    await this.auditoria.registrar(
      {
        actorId: auth.usuario.id,
        accion: 'suscripcion.creada',
        entidad: 'suscripcion',
        entidadId: s.id,
        despues: {
          clienteId: e.clienteId,
          planId: plan.id,
          moneda: e.moneda,
          facturaId: factura.id,
          total: factura.total.toFixed(2),
          cupon: e.cupon,
          ...(e.pedidoId ? { pedidoId: e.pedidoId } : {}),
        },
        cliente: e.cliente,
      },
      tx,
    );
    if (factura.estado === 'pagada') await this.aplicarPago(tx, factura, auth.usuario.id);
    return { s, factura };
  }

  /** Emite la factura de renovación. El periodo se extiende cuando se paga. */
  async renovar(
    auth: ContextoAuth,
    id: string,
    e: { moneda?: Moneda | undefined; periodos?: number; desde?: 'vencimiento' | 'hoy' },
    cliente: InfoCliente,
  ): Promise<ResultadoAlta> {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.bloquear(tx, auth, id);
      exigirGestionDelCliente(auth, s);
      // Cortada antes de tiempo por el equipo: solo el equipo la reactiva.
      if (
        s.motivoSuspension &&
        (auth.usuario.rol === 'cliente' || auth.usuario.rol === 'revendedor')
      ) {
        throw new ErrorApp(
          409,
          'SUSPENDIDA_POR_EQUIPO',
          `Esta suscripción está suspendida: ${s.motivoSuspension}. Escríbenos para revisarla.`,
        );
      }
      const factura = await this.facturarRenovacion(
        tx,
        s,
        e.moneda ?? s.moneda,
        auth.usuario.id,
        cliente,
        { periodos: e.periodos ?? 1, desdeHoy: e.desde === 'hoy' },
      );
      return {
        suscripcion: suscripcionPublica(await this.cargar(tx, id)),
        factura: {
          id: factura.id,
          numero: `NV-${String(factura.numero).padStart(6, '0')}`,
          estado: factura.estado,
        },
      };
    });
  }

  /**
   * Reglas de una renovación (manual o automática): comprueba el estado y el
   * plan, emite la factura y la audita. Exige la fila de la suscripción
   * bloqueada en la misma transacción. `actorId` nulo = la emite el sistema.
   */
  async facturarRenovacion(
    tx: Tx,
    s: Suscripcion,
    monedaFactura: Moneda,
    actorId: string | null,
    cliente?: InfoCliente,
    opciones: { periodos: number; desdeHoy: boolean } = { periodos: 1, desdeHoy: false },
  ): Promise<Factura> {
    if (!['activa', 'en_gracia', 'suspendida', 'vencida'].includes(s.estado)) {
      throw transicionInvalida(
        s.estado === 'pausada'
          ? 'Reanuda la suscripción antes de renovarla.'
          : 'Solo se renuevan suscripciones activas, en gracia, suspendidas o vencidas.',
      );
    }
    if (s.cancelarAlVencer) {
      throw transicionInvalida('Tiene una cancelación programada: reviértela antes de renovar.');
    }
    const plan = await tx.plan.findUnique({ where: { id: s.planId }, include: INCLUIR_PLAN });
    if (!plan || !plan.renovable || !plan.activo) {
      throw new ErrorApp(
        409,
        'PLAN_NO_RENOVABLE',
        'Este plan ya no se puede renovar. Contrata otro plan.',
      );
    }
    const factura = await this.facturacion.emitir(tx, {
      clienteId: s.clienteId,
      suscripcionId: s.id,
      plan,
      moneda: monedaFactura,
      concepto: 'renovacion',
      actorId,
      periodos: opciones.periodos,
      desdeHoy: opciones.desdeHoy,
      // Precio acordado (p. ej. el que tenía en el Gestor); sin él, el del plan.
      precioUnitario: await this.facturacion.precioAcordado(tx, plan, s.precioUsd, monedaFactura),
    });
    if (monedaFactura !== s.moneda) {
      await tx.suscripcion.update({ where: { id: s.id }, data: { moneda: monedaFactura } });
    }
    await this.auditoria.registrar(
      {
        actorId,
        accion: 'suscripcion.renovacion_facturada',
        entidad: 'suscripcion',
        entidadId: s.id,
        despues: {
          facturaId: factura.id,
          total: factura.total.toFixed(2),
          moneda: monedaFactura,
          ...(opciones.periodos > 1 ? { periodos: opciones.periodos } : {}),
          ...(opciones.desdeHoy ? { desde: 'hoy' } : {}),
          ...(actorId ? {} : { automatica: true }),
        },
        ...(cliente ? { cliente } : {}),
      },
      tx,
    );
    if (factura.estado === 'pagada') await this.aplicarPago(tx, factura, actorId);
    return factura;
  }

  async pausar(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      if (s.estado !== 'activa' || !s.venceEn) {
        throw transicionInvalida('Solo se pausan suscripciones activas.');
      }
      const ahora = new Date();
      const restantes = Math.max(0, Math.floor((s.venceEn.getTime() - ahora.getTime()) / 1000));
      await tx.suscripcion.update({
        where: { id },
        data: { estado: 'pausada', pausadaEn: ahora, segundosRestantes: restantes },
      });
      return {
        tipo: 'pausa',
        motivo,
        accion: 'suscripcion.pausada',
        datos: { segundosRestantes: restantes },
      };
    });
  }

  /**
   * El equipo corrige a mano la fecha de vencimiento (día de Venezuela). Conserva la
   * hora que tenía; no emite facturas ni cobra. Si estaba en gracia y la nueva fecha
   * es futura, vuelve a activa. Queda en el historial y en la auditoría.
   */
  async cambiarVencimiento(
    auth: ContextoAuth,
    id: string,
    e: CambiarVencimientoEntrada,
    cliente: InfoCliente,
  ) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      exigirGestionDelCliente(auth, s);
      if (!(ESTADOS_CAMBIO_VENCIMIENTO as readonly string[]).includes(s.estado)) {
        throw transicionInvalida(
          'Solo se cambia la fecha de suscripciones activas o en periodo de gracia.',
        );
      }
      const [a, m, d] = e.venceEn.split('-').map(Number) as [number, number, number];
      // Hora del día (Caracas) que ya tenía; sin fecha previa, al final del día.
      const horaDelDia = s.venceEn
        ? (((s.venceEn.getTime() + DESFASE_CARACAS_MS) % DIA_MS) + DIA_MS) % DIA_MS
        : DIA_MS - 1000;
      const venceEn = new Date(Date.UTC(a, m - 1, d) - DESFASE_CARACAS_MS + horaDelDia);
      const estado = s.estado === 'en_gracia' && venceEn > new Date() ? 'activa' : s.estado;
      await tx.suscripcion.update({ where: { id }, data: { venceEn, estado } });
      return {
        tipo: 'ajuste_vencimiento',
        motivo: e.motivo,
        accion: 'suscripcion.vencimiento_cambiado',
        datos: {
          venceAntes: s.venceEn?.toISOString() ?? null,
          venceEn: venceEn.toISOString(),
          estado,
        },
      };
    });
  }

  async reanudar(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      if (s.estado !== 'pausada') throw transicionInvalida('La suscripción no está pausada.');
      const venceEn = new Date(Date.now() + (s.segundosRestantes ?? 0) * 1000);
      await tx.suscripcion.update({
        where: { id },
        data: { estado: 'activa', venceEn, pausadaEn: null, segundosRestantes: null },
      });
      return {
        tipo: 'reanudacion',
        motivo: null,
        accion: 'suscripcion.reanudada',
        datos: { venceEn: venceEn.toISOString() },
      };
    });
  }

  /**
   * El cliente solo programa la cancelación al vencimiento (o cancela en el acto
   * si aún no pagó). El equipo con permiso puede cancelar en el acto.
   */
  async cancelar(
    auth: ContextoAuth,
    id: string,
    e: CancelarSuscripcionEntrada,
    cliente: InfoCliente,
  ) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      exigirGestionDelCliente(auth, s);
      if (s.estado === 'cancelada') throw transicionInvalida('La suscripción ya está cancelada.');
      const puedeInmediata = tienePermiso(auth.usuario.rol, 'suscripciones.gestionar');
      const programable = ['activa', 'en_gracia'].includes(s.estado);
      const inmediata =
        s.estado === 'pendiente_pago' || !programable || (e.inmediata && puedeInmediata);
      if (inmediata && !puedeInmediata && s.estado !== 'pendiente_pago') {
        throw transicionInvalida(
          'Esta suscripción no se puede cancelar desde aquí. Escribe a soporte.',
        );
      }
      if (!inmediata) {
        if (s.cancelarAlVencer) throw transicionInvalida('La cancelación ya está programada.');
        await tx.suscripcion.update({ where: { id }, data: { cancelarAlVencer: true } });
        await this.anularFacturasAbiertas(tx, id, 'Cancelación programada', auth.usuario.id);
        return {
          tipo: 'cancelacion_programada',
          motivo: e.motivo,
          accion: 'suscripcion.cancelacion_programada',
          datos: { venceEn: s.venceEn?.toISOString() ?? null },
        };
      }
      await this.anularFacturasAbiertas(tx, id, 'Suscripción cancelada', auth.usuario.id);
      await tx.suscripcion.update({
        where: { id },
        data: { estado: 'cancelada', canceladaEn: new Date(), cancelarAlVencer: false },
      });
      await solicitarRevocacion(tx, id, `Suscripción cancelada: ${e.motivo}`);
      return {
        tipo: 'cancelacion',
        motivo: e.motivo,
        accion: 'suscripcion.cancelada',
        datos: { estadoAnterior: s.estado },
      };
    });
  }

  async revertirCancelacion(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    return this.transicion(auth, id, cliente, async (tx, s) => {
      exigirGestionDelCliente(auth, s);
      if (!s.cancelarAlVencer || !['activa', 'en_gracia'].includes(s.estado)) {
        throw transicionInvalida('No hay una cancelación programada que revertir.');
      }
      await tx.suscripcion.update({ where: { id }, data: { cancelarAlVencer: false } });
      return {
        tipo: 'cancelacion_revertida',
        motivo: null,
        accion: 'suscripcion.cancelacion_revertida',
        datos: {},
      };
    });
  }

  /**
   * Aplica una factura pagada: activa el alta o extiende el periodo. Se llama
   * dentro de la transacción que confirma el pago.
   */
  async aplicarPago(tx: Tx, factura: Factura, actorId: string | null): Promise<void> {
    if (!factura.suscripcionId) return;
    await this.aplicarPeriodo(
      tx,
      factura.suscripcionId,
      factura.concepto,
      actorId,
      { facturaId: factura.id },
      { periodos: factura.periodos, desdeHoy: factura.desdeHoy },
    );
  }

  /**
   * Activa un alta (el periodo empieza hoy) o extiende el periodo de una
   * renovación, y deja el evento. La usan los pagos de facturas y las compras
   * de revendedores con saldo (que no generan factura). Devuelve el evento o
   * null si la suscripción no existe.
   */
  async aplicarPeriodo(
    tx: Tx,
    suscripcionId: string,
    concepto: 'alta' | 'renovacion',
    actorId: string | null,
    datos: Prisma.InputJsonObject,
    opciones: { periodos: number; desdeHoy: boolean } = { periodos: 1, desdeHoy: false },
  ): Promise<TipoEventoSuscripcion | null> {
    const [s] = await tx.$queryRaw<
      Suscripcion[]
    >`SELECT id FROM suscripciones WHERE id = ${suscripcionId}::uuid FOR UPDATE`;
    if (!s) return null;
    const actual = await tx.suscripcion.findUniqueOrThrow({
      where: { id: suscripcionId },
      include: { plan: true },
    });
    const ahora = new Date();
    const { duracionUnidad: u } = actual.plan;
    const n = actual.plan.duracionCantidad * opciones.periodos;
    let tipo: TipoEventoSuscripcion;
    let data: Prisma.SuscripcionUpdateInput;
    let inicioPeriodo: Date;
    if (concepto === 'alta') {
      if (actual.estado !== 'pendiente_pago') {
        throw transicionInvalida('La suscripción de esta factura ya no espera el pago del alta.');
      }
      tipo = 'activacion';
      inicioPeriodo = ahora;
      data = { estado: 'activa', inicioEn: ahora, venceEn: sumarDuracion(ahora, n, u) };
    } else if (
      actual.estado === 'activa' ||
      actual.estado === 'en_gracia' ||
      actual.estado === 'suspendida' ||
      actual.estado === 'vencida'
    ) {
      tipo =
        actual.estado === 'activa' || actual.estado === 'en_gracia' ? 'renovacion' : 'recuperacion';
      const base = baseRenovacion(actual.venceEn, n, u, ahora, opciones.desdeHoy);
      inicioPeriodo = base;
      data = { estado: 'activa', venceEn: sumarDuracion(base, n, u), motivoSuspension: null };
    } else {
      throw transicionInvalida('La suscripción no admite una renovación en su estado actual.');
    }
    await tx.suscripcion.update({ where: { id: actual.id }, data });
    await this.evento(tx, actual.id, tipo, actorId, null, datos);
    // Alquiler desde Plataformas: el perfil (o la cuenta) libre y vigente se entrega solo.
    // Si no queda ninguno, sigue la entrega del proveedor y el equipo la asigna a mano.
    const automatica =
      tipo === 'renovacion' ? null : await asignarAutomatico(tx, this.auditoria, actual.id);
    // Entrega del servicio (fase 6): se crea en esta misma transacción con su trabajo.
    const origen: OrigenEntrega | null =
      typeof datos['facturaId'] === 'string'
        ? { tipo: 'factura', facturaId: datos['facturaId'] }
        : typeof datos['compraRevendedorId'] === 'string'
          ? { tipo: 'compra', compraRevendedorId: datos['compraRevendedorId'] }
          : null;
    if (origen && !automatica) {
      await registrarEntrega(tx, {
        origen,
        suscripcionId: actual.id,
        concepto,
        periodo: {
          inicio: inicioPeriodo,
          fin: data.venceEn instanceof Date ? data.venceEn : null,
        },
      });
    }
    // Vuelve a estar activa tras la gracia o una suspensión: aviso de reactivación
    // (bandeja de salida: se encola en la misma transacción que el pago).
    if (
      ['en_gracia', 'suspendida', 'vencida'].includes(actual.estado) &&
      actual.revendedorId === null &&
      data.venceEn instanceof Date
    ) {
      await encolarTrabajo(tx, {
        tipo: TRABAJO.avisoSuscripcion,
        carga: { automatizacion: 'aviso_recuperacion', suscripcionId: actual.id },
        claveUnica: `aviso_recuperacion:${actual.id}:${data.venceEn.toISOString()}`,
      });
    }
    return tipo;
  }

  /**
   * Vencimientos, gracia y suspensión. Los avisos de gracia y suspensión se
   * encolan en la misma transacción y los envía el trabajador.
   * Devuelve cuántas suscripciones cambiaron de estado.
   */
  async aplicarVencimientos(ahora = new Date()): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const [bloqueo] = await tx.$queryRaw<
          { ok: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(${BLOQUEO_VENCIMIENTOS}::bigint) AS ok`;
        if (!bloqueo?.ok) return 0;
        const finGracia = new Date(ahora.getTime() - REGLAS_COBRO.diasGracia * DIA_MS);
        const finSuspension = new Date(
          ahora.getTime() - (REGLAS_COBRO.diasGracia + REGLAS_COBRO.diasSuspension) * DIA_MS,
        );
        const pasos: {
          where: Prisma.SuscripcionWhereInput;
          a: EstadoSuscripcion;
          tipo: TipoEventoSuscripcion;
          motivo: string;
        }[] = [
          {
            where: {
              estado: { in: ['activa', 'en_gracia'] },
              cancelarAlVencer: true,
              venceEn: { lte: ahora },
            },
            a: 'cancelada',
            tipo: 'cancelacion',
            motivo: 'Cancelación programada al vencer',
          },
          {
            where: { estado: 'activa', venceEn: { lte: ahora } },
            a: 'en_gracia',
            tipo: 'vencimiento',
            motivo: 'Venció el periodo pagado',
          },
          {
            where: { estado: 'en_gracia', venceEn: { lte: finGracia } },
            a: 'suspendida',
            tipo: 'suspension',
            motivo: `Sin pago tras ${REGLAS_COBRO.diasGracia} días de gracia`,
          },
          {
            where: { estado: 'suspendida', venceEn: { lte: finSuspension } },
            a: 'vencida',
            tipo: 'vencimiento',
            motivo: `Suspendida más de ${REGLAS_COBRO.diasSuspension} días`,
          },
        ];
        let cambios = 0;
        for (const paso of pasos) {
          const filas = await tx.suscripcion.findMany({
            // Las compras únicas (recargas, paquetes, pases, tarjetas) no vencen.
            where: { ...paso.where, plan: { tipo: 'suscripcion' } },
            select: { id: true, estado: true, venceEn: true, revendedorId: true },
            take: 500,
          });
          for (const f of filas) {
            await tx.suscripcion.update({
              where: { id: f.id },
              data: {
                estado: paso.a,
                ...(paso.a === 'cancelada' ? { canceladaEn: ahora, cancelarAlVencer: false } : {}),
              },
            });
            if (paso.a === 'cancelada') {
              await this.anularFacturasAbiertas(tx, f.id, paso.motivo, null);
            }
            // Fin del servicio: se anulan las entregas pendientes y se revocan las del proveedor.
            if (paso.a === 'cancelada' || paso.a === 'vencida') {
              await solicitarRevocacion(tx, f.id, paso.motivo, ahora);
            }
            await this.evento(tx, f.id, paso.tipo, null, paso.motivo, { de: f.estado, a: paso.a });
            // Avisos de gracia y suspensión: se encolan en la misma transacción que el cambio.
            const aviso =
              paso.a === 'en_gracia'
                ? 'aviso_gracia'
                : paso.a === 'suspendida'
                  ? 'aviso_suspension'
                  : null;
            if (aviso && f.revendedorId === null) {
              await encolarTrabajo(tx, {
                tipo: TRABAJO.avisoSuscripcion,
                carga: { automatizacion: aviso, suscripcionId: f.id },
                claveUnica: `${aviso}:${f.id}:${f.venceEn?.toISOString() ?? 'sin-fecha'}`,
              });
            }
            await this.auditoria.registrar(
              {
                actorTipo: 'sistema',
                accion: `suscripcion.${paso.a}`,
                entidad: 'suscripcion',
                entidadId: f.id,
                antes: { estado: f.estado },
                despues: { estado: paso.a, motivo: paso.motivo },
              },
              tx,
            );
            cambios += 1;
          }
        }
        if (cambios > 0) this.logger.log(`Vencimientos aplicados: ${cambios}`);
        return cambios;
      },
      { timeout: 60_000 },
    );
  }

  /** Anula las facturas emitidas de una suscripción (si no tienen un pago en revisión). */
  async anularFacturasAbiertas(
    tx: Tx,
    suscripcionId: string,
    motivo: string,
    actorId: string | null,
  ) {
    const abiertas = await tx.factura.findMany({
      where: { suscripcionId, estado: 'emitida' },
      include: { pagos: { where: { estado: 'en_revision' }, select: { id: true } } },
    });
    for (const f of abiertas) {
      if (f.pagos.length > 0) {
        throw new ErrorApp(
          409,
          'PAGO_EN_REVISION',
          'Hay un pago en revisión para esta suscripción. Resuélvelo antes de cancelarla.',
        );
      }
      await tx.factura.update({
        where: { id: f.id },
        data: {
          estado: 'anulada',
          anuladaEn: new Date(),
          motivoAnulacion: motivo,
          anuladaPorId: actorId,
        },
      });
      await this.facturacion.liberarCupon(tx, f.id);
    }
  }

  private async transicion(
    auth: ContextoAuth,
    id: string,
    cliente: InfoCliente,
    fn: (
      tx: Tx,
      s: Suscripcion,
    ) => Promise<{
      tipo: TipoEventoSuscripcion;
      motivo: string | null;
      accion: string;
      datos: Prisma.InputJsonObject;
    }>,
  ): Promise<SuscripcionPublica> {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.bloquear(tx, auth, id);
      const r = await fn(tx, s);
      await this.evento(tx, id, r.tipo, auth.usuario.id, r.motivo, r.datos);
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: r.accion,
          entidad: 'suscripcion',
          entidadId: id,
          antes: { estado: s.estado, cancelarAlVencer: s.cancelarAlVencer },
          despues: { ...r.datos, ...(r.motivo ? { motivo: r.motivo } : {}) },
          cliente,
        },
        tx,
      );
      return suscripcionPublica(await this.cargar(tx, id));
    });
  }

  async bloquear(tx: Tx, auth: ContextoAuth, id: string): Promise<Suscripcion> {
    const visible = await tx.suscripcion.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('La suscripción');
    await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.suscripcion.findUniqueOrThrow({ where: { id } });
  }

  private cargar(tx: Tx, id: string) {
    return tx.suscripcion.findUniqueOrThrow({ where: { id }, include: INCLUIR_SUSCRIPCION });
  }

  async planContratable(tx: Tx, auth: ContextoAuth, planId: string): Promise<PlanCompleto> {
    const plan = await tx.plan.findFirst({
      where: {
        id: planId,
        ...planVendible,
        // El cliente solo contrata planes visibles; el equipo también los ocultos.
        ...(auth.usuario.rol === 'cliente' ? { visible: true } : {}),
      },
      include: INCLUIR_PLAN,
    });
    if (!plan) throw new ErrorApp(409, 'PLAN_NO_DISPONIBLE', 'Ese plan no está disponible.');
    return plan;
  }

  async evento(
    tx: Tx,
    suscripcionId: string,
    tipo: TipoEventoSuscripcion,
    actorId: string | null,
    motivo: string | null,
    datos: Prisma.InputJsonObject,
  ) {
    await tx.eventoSuscripcion.create({
      data: { suscripcionId, tipo, actorId, motivo, datos },
    });
  }
}
