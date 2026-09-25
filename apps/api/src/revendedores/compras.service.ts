import { Inject, Injectable } from '@nestjs/common';
import type { Cliente, CompraRevendedor, Prisma, PrismaClient, Revendedor } from '@nv/db';
import {
  type CatalogoMayorista,
  type ClienteCartera,
  type ComprarEntrada,
  type CompraPublica,
  inicioDiaVenezuela,
  type ListarCarteraEntrada,
  type ListarComprasEntrada,
  type Pagina,
  type ResultadoCompra,
  type ResumenRevendedor,
} from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, iso } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { solicitarRevocacion } from '../entregas/registro.js';
import { CERO, type Dec, redondear } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';
import { INCLUIR_SUSCRIPCION, suscripcionPublica } from '../suscripciones/presentacion.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';
import {
  bloquearRevendedor,
  exigirOperativo,
  moverSaldo,
  revendedorPropio,
  type Tx,
  usd,
} from './libro-mayor.js';
import { planRevendible } from './niveles.service.js';
import { compraPublica, INCLUIR_COMPRA } from './presentacion.js';
import { inicioMesVenezuela, RevendedoresService } from './revendedores.service.js';

const DIA_MS = 24 * 3600_000;

const INCLUIR_CARTERA = {
  contactos: { where: { tipo: { in: ['correo', 'whatsapp'] } } },
  suscripciones: {
    include: INCLUIR_SUSCRIPCION,
    orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.ClienteInclude;

type ClienteConCartera = Prisma.ClienteGetPayload<{ include: typeof INCLUIR_CARTERA }>;

function clienteCartera(c: ClienteConCartera): ClienteCartera {
  return {
    id: c.id,
    nombre: c.nombre,
    correo: c.contactos.find((k) => k.tipo === 'correo')?.valor ?? null,
    whatsapp: c.contactos.find((k) => k.tipo === 'whatsapp')?.valor ?? null,
    documento: c.documento,
    pais: c.pais,
    creadoEn: iso(c.creadoEn)!,
    suscripciones: c.suscripciones.map(suscripcionPublica),
  };
}

/**
 * Compras con saldo: el revendedor compra activaciones (altas) o renovaciones
 * al precio mayorista de su nivel. El débito, la compra y la suscripción se
 * escriben en una sola transacción con la fila del revendedor bloqueada, así
 * que compras simultáneas no pueden gastar más saldo del que hay. NV no emite
 * factura al cliente final: le cobra el revendedor.
 */
@Injectable()
export class ComprasService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(RevendedoresService) private readonly revendedores: RevendedoresService,
  ) {}

  // ── Panel del revendedor ───────────────────────────────────────────────────

  async resumen(auth: ContextoAuth, ahora = new Date()): Promise<ResumenRevendedor> {
    const propio = await revendedorPropio(auth, this.prisma);
    const inicioMes = inicioMesVenezuela(ahora);
    const [revendedor, tasaVes, delMes, hoy, proximos] = await Promise.all([
      this.revendedores.obtener(propio.id),
      this.tasas.mapa().then((m) => m.get('VES') ?? null),
      this.prisma.compraRevendedor.aggregate({
        where: { revendedorId: propio.id, estado: 'completada', creadoEn: { gte: inicioMes } },
        _count: { _all: true },
        _sum: { precioUsd: true },
      }),
      this.comprasDeHoy(this.prisma, propio.id, ahora),
      this.prisma.suscripcion.findMany({
        where: {
          cliente: { revendedorId: propio.id },
          estado: { in: ['activa', 'en_gracia'] },
          venceEn: { lte: new Date(ahora.getTime() + 7 * DIA_MS) },
        },
        include: INCLUIR_SUSCRIPCION,
        orderBy: { venceEn: 'asc' },
        take: 8,
      }),
    ]);
    return {
      revendedor,
      tasaVes: tasaVes?.toFixed(2) ?? null,
      saldoVes: tasaVes ? redondear(propio.saldoUsd.mul(tasaVes), 'VES').toFixed(2) : null,
      comprasMes: delMes._count._all,
      gastoMesUsd: (delMes._sum.precioUsd ?? CERO).toFixed(2),
      comprasHoy: hoy,
      proximosVencimientos: proximos.map(suscripcionPublica),
    };
  }

  /** Planes que el revendedor puede comprar, con el precio de su nivel. */
  async catalogo(auth: ContextoAuth): Promise<CatalogoMayorista> {
    const r = await revendedorPropio(auth, this.prisma);
    const [nivel, tasaVes] = await Promise.all([
      r.nivelId
        ? this.prisma.nivelRevendedor.findUnique({
            where: { id: r.nivelId },
            select: { id: true, nombre: true },
          })
        : null,
      this.tasas.mapa().then((m) => m.get('VES') ?? null),
    ]);
    if (!nivel) return { nivel: null, planes: [], tasaVes: tasaVes?.toFixed(2) ?? null };
    const planes = await this.prisma.plan.findMany({
      where: { ...planRevendible, preciosMayoristas: { some: { nivelId: nivel.id } } },
      include: {
        servicio: { select: { id: true, nombre: true } },
        preciosMayoristas: { where: { nivelId: nivel.id } },
      },
      orderBy: [{ orden: 'asc' }, { precioUsd: 'asc' }],
    });
    return {
      nivel,
      tasaVes: tasaVes?.toFixed(2) ?? null,
      planes: planes.map((p) => {
        const precio = p.preciosMayoristas[0]!.precioUsd;
        return {
          id: p.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          servicio: p.servicio,
          duracionCantidad: p.duracionCantidad,
          duracionUnidad: p.duracionUnidad,
          beneficios: p.beneficios,
          renovable: p.renovable,
          precioPublicoUsd: p.precioUsd.toFixed(2),
          precioUsd: precio.toFixed(2),
          precioVes: tasaVes ? redondear(precio.mul(tasaVes), 'VES').toFixed(2) : null,
        };
      }),
    };
  }

  async cartera(auth: ContextoAuth, filtro: ListarCarteraEntrada): Promise<Pagina<ClienteCartera>> {
    const r = await revendedorPropio(auth, this.prisma);
    const where: Prisma.ClienteWhereInput = {
      revendedorId: r.id,
      ...(filtro.busqueda
        ? {
            OR: [
              { nombre: { contains: filtro.busqueda, mode: 'insensitive' } },
              { documento: { contains: filtro.busqueda, mode: 'insensitive' } },
              {
                contactos: {
                  some: { valor: { contains: filtro.busqueda, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.cliente.count({ where }),
      this.prisma.cliente.findMany({
        where,
        include: INCLUIR_CARTERA,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(clienteCartera),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async clienteDeCartera(auth: ContextoAuth, id: string): Promise<ClienteCartera> {
    const r = await revendedorPropio(auth, this.prisma);
    const c = await this.prisma.cliente.findFirst({
      where: { id, revendedorId: r.id },
      include: INCLUIR_CARTERA,
    });
    if (!c) throw Errores.noEncontrado('El cliente');
    return clienteCartera(c);
  }

  async misCompras(auth: ContextoAuth, filtro: ListarComprasEntrada) {
    const r = await revendedorPropio(auth, this.prisma);
    return this.listar(r.id, filtro);
  }

  /** Compras de un revendedor (para el equipo). */
  async compras(revendedorId: string, filtro: ListarComprasEntrada) {
    if (!(await this.prisma.revendedor.findUnique({ where: { id: revendedorId } }))) {
      throw Errores.noEncontrado('El revendedor');
    }
    return this.listar(revendedorId, filtro);
  }

  // ── Comprar ────────────────────────────────────────────────────────────────

  async comprar(
    auth: ContextoAuth,
    e: ComprarEntrada,
    cliente: InfoCliente,
  ): Promise<ResultadoCompra> {
    const propio = await revendedorPropio(auth, this.prisma);
    const previa = await this.buscarPorClave(this.prisma, propio.id, e);
    if (previa) return this.resultado(previa.id, true);
    let hecho: { id: string; repetida: boolean };
    try {
      hecho = await this.prisma.$transaction(async (tx) => {
        const r = await bloquearRevendedor(tx, propio.id);
        exigirOperativo(r);
        // Con la fila bloqueada, otra petición con la misma clave ya terminó o no empezó.
        const repetida = await this.buscarPorClave(tx, r.id, e);
        if (repetida) return { id: repetida.id, repetida: true };
        await this.exigirLimiteDiario(tx, r);
        const id =
          e.tipo === 'alta'
            ? await this.comprarAlta(tx, auth, r, e, cliente)
            : await this.comprarRenovacion(tx, auth, r, e, cliente);
        return { id, repetida: false };
      });
    } catch (error) {
      // Dos peticiones con la misma clave a la vez: la segunda devuelve la primera.
      if (!esUnicoDuplicado(error)) throw error;
      const ganadora = await this.buscarPorClave(this.prisma, propio.id, e);
      if (!ganadora) throw error;
      return this.resultado(ganadora.id, true);
    }
    return this.resultado(hecho.id, hecho.repetida);
  }

  private async comprarAlta(
    tx: Tx,
    auth: ContextoAuth,
    r: Revendedor,
    e: Extract<ComprarEntrada, { tipo: 'alta' }>,
    info: InfoCliente,
  ): Promise<string> {
    const plan = await this.planDelNivel(tx, r, e.planId);
    const precio = plan.precio;
    this.exigirSaldo(r, precio);
    let titular: Cliente;
    if (e.clienteId) {
      const existente = await tx.cliente.findFirst({
        where: { id: e.clienteId, revendedorId: r.id },
      });
      if (!existente) throw Errores.noEncontrado('El cliente');
      if (existente.estado !== 'activo') {
        throw new ErrorApp(409, 'CLIENTE_ARCHIVADO', 'Ese cliente está archivado.');
      }
      titular = existente;
    } else {
      const nuevo = e.cliente!;
      // El correo se guarda como contacto y no como correo de acceso: así la
      // ficha no se enlaza con una cuenta de NV si esa persona se registra.
      titular = await tx.cliente.create({
        data: {
          nombre: nuevo.nombre,
          documento: nuevo.documento ?? null,
          pais: nuevo.pais,
          monedaPreferida: 'VES',
          origen: 'revendedor',
          revendedorId: r.id,
          creadoPorId: auth.usuario.id,
          contactos: {
            create: [
              ...(nuevo.correo ? [{ tipo: 'correo' as const, valor: nuevo.correo }] : []),
              ...(nuevo.whatsapp ? [{ tipo: 'whatsapp' as const, valor: nuevo.whatsapp }] : []),
            ],
          },
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'cliente.creado',
          entidad: 'cliente',
          entidadId: titular.id,
          despues: { nombre: titular.nombre, revendedorId: r.id, origen: 'revendedor' },
          cliente: info,
        },
        tx,
      );
    }
    const s = await tx.suscripcion.create({
      data: {
        clienteId: titular.id,
        planId: plan.id,
        moneda: 'USD',
        revendedorId: r.id,
        creadoPorId: auth.usuario.id,
      },
    });
    await tx.eventoSuscripcion.create({
      data: {
        suscripcionId: s.id,
        tipo: 'alta',
        actorId: auth.usuario.id,
        datos: { planId: plan.id, revendedorId: r.id },
      },
    });
    const compra = await tx.compraRevendedor.create({
      data: {
        revendedorId: r.id,
        planId: plan.id,
        clienteId: titular.id,
        suscripcionId: s.id,
        tipo: 'alta',
        precioUsd: precio,
        claveIdempotencia: e.claveIdempotencia,
      },
    });
    await this.suscripciones.aplicarPeriodo(tx, s.id, 'alta', auth.usuario.id, {
      compraRevendedorId: compra.id,
    });
    await this.cobrar(tx, auth, r, compra, info);
    return compra.id;
  }

  private async comprarRenovacion(
    tx: Tx,
    auth: ContextoAuth,
    r: Revendedor,
    e: Extract<ComprarEntrada, { tipo: 'renovacion' }>,
    info: InfoCliente,
  ): Promise<string> {
    const visible = await tx.suscripcion.findFirst({
      where: { id: e.suscripcionId, cliente: { revendedorId: r.id } },
      select: { id: true },
    });
    if (!visible) throw Errores.noEncontrado('La suscripción');
    await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${e.suscripcionId}::uuid FOR UPDATE`;
    const s = await tx.suscripcion.findUniqueOrThrow({
      where: { id: e.suscripcionId },
      include: { plan: true, facturas: { where: { estado: 'emitida' }, select: { id: true } } },
    });
    if (!['activa', 'en_gracia', 'suspendida', 'vencida'].includes(s.estado)) {
      throw new ErrorApp(
        409,
        'TRANSICION_NO_PERMITIDA',
        s.estado === 'pausada'
          ? 'La suscripción está pausada: pide al equipo que la reanude antes de renovarla.'
          : 'Solo se renuevan suscripciones activas, en gracia, suspendidas o vencidas.',
      );
    }
    if (s.cancelarAlVencer) {
      throw new ErrorApp(
        409,
        'TRANSICION_NO_PERMITIDA',
        'Tiene una cancelación programada: no se puede renovar.',
      );
    }
    if (s.facturas.length > 0) {
      throw new ErrorApp(
        409,
        'FACTURA_ABIERTA',
        'Esta suscripción tiene una factura de NV pendiente. Escribe a soporte.',
      );
    }
    if (!s.plan.renovable || !s.plan.activo) {
      throw new ErrorApp(
        409,
        'PLAN_NO_RENOVABLE',
        'Este plan ya no se puede renovar. Compra un alta de otro plan.',
      );
    }
    const plan = await this.planDelNivel(tx, r, s.planId);
    this.exigirSaldo(r, plan.precio);
    const compra = await tx.compraRevendedor.create({
      data: {
        revendedorId: r.id,
        planId: plan.id,
        clienteId: s.clienteId,
        suscripcionId: s.id,
        tipo: 'renovacion',
        precioUsd: plan.precio,
        claveIdempotencia: e.claveIdempotencia,
      },
    });
    await this.suscripciones.aplicarPeriodo(tx, s.id, 'renovacion', auth.usuario.id, {
      compraRevendedorId: compra.id,
    });
    await this.cobrar(tx, auth, r, compra, info);
    return compra.id;
  }

  /** Débito en el libro mayor y auditoría de la compra. */
  private async cobrar(
    tx: Tx,
    auth: ContextoAuth,
    r: Revendedor,
    compra: CompraRevendedor,
    info: InfoCliente,
  ) {
    const { saldo } = await moverSaldo(tx, r, {
      tipo: 'compra',
      montoUsd: compra.precioUsd.neg(),
      compraId: compra.id,
      autorId: auth.usuario.id,
    });
    await this.auditoria.registrar(
      {
        actorId: auth.usuario.id,
        accion: 'compra_revendedor.realizada',
        entidad: 'compra_revendedor',
        entidadId: compra.id,
        despues: {
          tipo: compra.tipo,
          planId: compra.planId,
          clienteId: compra.clienteId,
          suscripcionId: compra.suscripcionId,
          precioUsd: compra.precioUsd.toFixed(2),
          saldoUsd: saldo.toFixed(2),
        },
        cliente: info,
      },
      tx,
    );
  }

  // ── Reembolso (administración) ─────────────────────────────────────────────

  /**
   * Devuelve el precio al saldo, marca la compra como reembolsada y cancela la
   * suscripción. Una compra se reembolsa una sola vez (también lo garantiza un
   * índice único del libro mayor).
   */
  async reembolsar(
    auth: ContextoAuth,
    id: string,
    motivo: string,
    info: InfoCliente,
  ): Promise<CompraPublica> {
    const inicial = await this.prisma.compraRevendedor.findUnique({ where: { id } });
    if (!inicial) throw Errores.noEncontrado('La compra');
    await this.prisma.$transaction(async (tx) => {
      const r = await bloquearRevendedor(tx, inicial.revendedorId);
      await tx.$queryRaw`SELECT id FROM compras_revendedor WHERE id = ${id}::uuid FOR UPDATE`;
      const compra = await tx.compraRevendedor.findUniqueOrThrow({ where: { id } });
      if (compra.estado !== 'completada') {
        throw new ErrorApp(409, 'COMPRA_YA_REEMBOLSADA', 'Esta compra ya se reembolsó.');
      }
      const ahora = new Date();
      await tx.compraRevendedor.update({
        where: { id },
        data: {
          estado: 'reembolsada',
          motivoReembolso: motivo,
          reembolsadaPorId: auth.usuario.id,
          reembolsadaEn: ahora,
        },
      });
      const { saldo } = await moverSaldo(tx, r, {
        tipo: 'reembolso',
        montoUsd: compra.precioUsd,
        compraId: id,
        motivo,
        autorId: auth.usuario.id,
      });
      await tx.$queryRaw`SELECT id FROM suscripciones WHERE id = ${compra.suscripcionId}::uuid FOR UPDATE`;
      const s = await tx.suscripcion.findUniqueOrThrow({ where: { id: compra.suscripcionId } });
      if (s.estado !== 'cancelada') {
        const detalle = `Reembolso de la compra al revendedor: ${motivo}`;
        await this.suscripciones.anularFacturasAbiertas(tx, s.id, detalle, auth.usuario.id);
        await tx.suscripcion.update({
          where: { id: s.id },
          data: { estado: 'cancelada', canceladaEn: ahora, cancelarAlVencer: false },
        });
        await tx.eventoSuscripcion.create({
          data: {
            suscripcionId: s.id,
            tipo: 'cancelacion',
            actorId: auth.usuario.id,
            motivo: detalle.slice(0, 500),
            datos: { compraRevendedorId: id, estadoAnterior: s.estado },
          },
        });
        await solicitarRevocacion(tx, s.id, detalle, ahora);
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'compra_revendedor.reembolsada',
          entidad: 'compra_revendedor',
          entidadId: id,
          antes: { estado: compra.estado, suscripcion: s.estado },
          despues: {
            estado: 'reembolsada',
            precioUsd: compra.precioUsd.toFixed(2),
            saldoUsd: saldo.toFixed(2),
            motivo,
          },
          cliente: info,
        },
        tx,
      );
    });
    return this.cargar(id);
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async listar(
    revendedorId: string,
    filtro: ListarComprasEntrada,
  ): Promise<Pagina<CompraPublica>> {
    const where: Prisma.CompraRevendedorWhereInput = {
      revendedorId,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.compraRevendedor.count({ where }),
      this.prisma.compraRevendedor.findMany({
        where,
        include: INCLUIR_COMPRA,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map(compraPublica),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  private async cargar(id: string): Promise<CompraPublica> {
    return compraPublica(
      await this.prisma.compraRevendedor.findUniqueOrThrow({
        where: { id },
        include: INCLUIR_COMPRA,
      }),
    );
  }

  private async resultado(id: string, repetida: boolean): Promise<ResultadoCompra> {
    const compra = await this.prisma.compraRevendedor.findUniqueOrThrow({
      where: { id },
      include: {
        ...INCLUIR_COMPRA,
        revendedor: { select: { id: true, nombreComercial: true, saldoUsd: true } },
      },
    });
    return {
      compra: compraPublica(compra),
      saldoUsd: compra.revendedor.saldoUsd.toFixed(2),
      repetida,
    };
  }

  /**
   * Compra anterior con la misma clave. Si la clave se reutiliza para otra
   * cosa, se rechaza en lugar de devolver una compra distinta a la pedida.
   */
  private async buscarPorClave(
    tx: Tx | PrismaClient,
    revendedorId: string,
    e: ComprarEntrada,
  ): Promise<CompraRevendedor | null> {
    const c = await tx.compraRevendedor.findUnique({
      where: {
        revendedorId_claveIdempotencia: { revendedorId, claveIdempotencia: e.claveIdempotencia },
      },
    });
    if (!c) return null;
    const misma =
      c.tipo === e.tipo &&
      (e.tipo === 'alta' ? c.planId === e.planId : c.suscripcionId === e.suscripcionId);
    if (!misma) {
      throw new ErrorApp(
        409,
        'CLAVE_REUTILIZADA',
        'Esta compra ya se usó para otra operación. Recarga la página e inténtalo de nuevo.',
      );
    }
    return c;
  }

  private async exigirLimiteDiario(tx: Tx, r: Revendedor) {
    if (r.limiteDiarioCompras === null) return;
    const hoy = await this.comprasDeHoy(tx, r.id);
    if (hoy >= r.limiteDiarioCompras) {
      throw new ErrorApp(
        409,
        'LIMITE_DIARIO',
        `Alcanzaste tu límite de ${r.limiteDiarioCompras} ${r.limiteDiarioCompras === 1 ? 'compra' : 'compras'} por día. Podrás comprar de nuevo mañana (hora de Venezuela) o pide al equipo que lo amplíe.`,
      );
    }
  }

  private comprasDeHoy(tx: Tx | PrismaClient, revendedorId: string, ahora = new Date()) {
    return tx.compraRevendedor.count({
      where: { revendedorId, estado: 'completada', creadoEn: { gte: inicioDiaVenezuela(ahora) } },
    });
  }

  /** Plan revendible con el precio del nivel del revendedor. */
  private async planDelNivel(tx: Tx, r: Revendedor, planId: string) {
    const plan = await tx.plan.findFirst({
      where: { id: planId, ...planRevendible },
      include: {
        preciosMayoristas: r.nivelId ? { where: { nivelId: r.nivelId } } : { take: 0 },
      },
    });
    if (!plan) {
      throw new ErrorApp(
        409,
        'PLAN_NO_REVENDIBLE',
        'Ese plan no está disponible para revendedores.',
      );
    }
    const precio = plan.preciosMayoristas[0]?.precioUsd;
    if (!precio) {
      throw new ErrorApp(
        409,
        'SIN_PRECIO_MAYORISTA',
        'Ese plan todavía no tiene precio mayorista para tu nivel. Escribe al equipo de NV.',
      );
    }
    // Defensa adicional: la tabla de precios ya impide quedar por debajo del costo.
    if (plan.costoUsd && precio.lt(plan.costoUsd)) {
      throw new ErrorApp(
        409,
        'SIN_PRECIO_MAYORISTA',
        'Ese plan no se puede vender ahora mismo. Escribe al equipo de NV.',
      );
    }
    return { id: plan.id, precio };
  }

  private exigirSaldo(r: Revendedor, precio: Dec) {
    if (r.saldoUsd.lt(precio)) {
      throw new ErrorApp(
        409,
        'SALDO_INSUFICIENTE',
        `Tu saldo (${usd(r.saldoUsd)}) no alcanza para esta compra (${usd(precio)}). Recarga saldo e inténtalo de nuevo.`,
      );
    }
  }
}
