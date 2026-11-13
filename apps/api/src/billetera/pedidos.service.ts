import { Inject, Injectable } from '@nestjs/common';
import type { Cliente, Moneda, PrismaClient } from '@nv/db';
import {
  type CotizacionPedido,
  type CotizarPedidoEntrada,
  type CrearPedidoEntrada,
  type LineaCotizacionPedido,
  type Pagina,
  type PedidoPublico,
  datosDelPlan,
  revisarDatos,
} from '@nv/shared';
import { datosDeServicio, type PlanCompleto } from '../catalogo/catalogo.service.js';
import { Cifrador } from '../comun/cripto.js';
import { cifrarDatosSecretos } from '../comun/datos-cliente.js';
import { CombosService, combosDelCarrito, repartirDescuento } from '../catalogo/combos.service.js';
import { TasasService } from '../dinero/tasas.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import {
  type CalculoFactura,
  CUPON_SIN_SUMAR,
  FacturacionService,
} from '../cobros/facturacion.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { PRISMA } from '../comun/tokens.js';
import { LIMITES, LimitesService } from '../limites/limites.service.js';
import { CERO, type Dec } from '../dinero/dinero.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { BilleteraService } from './billetera.service.js';
import { bloquearCliente, exigirBilleteraDisponible, type Tx, usd } from './libro.js';
import { INCLUIR_PEDIDO, numeroPedido, pedidoPublico } from './presentacion.js';

interface LineaCalculada {
  plan: PlanCompleto;
  calculo: CalculoFactura;
  /** Combo que agrupa esta línea (su descuento ya está en `calculo`). */
  combo: string | null;
}

interface Calculo {
  lineas: LineaCalculada[];
  /** Plan al que se aplica el cupón (solo uno: el de mayor descuento en USD). */
  planConCupon: string | null;
  /** Código del cupón tal como está guardado. */
  codigoCupon: string | null;
  totalUsd: Dec;
}

/**
 * Carrito: varios planes en un solo pedido. Cada plan es una suscripción con
 * su propia factura (así cada una se renueva, se cancela y se entrega por su
 * cuenta); el pedido las agrupa para pagarlas juntas con la billetera.
 */
@Injectable()
export class PedidosService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(BilleteraService) private readonly billetera: BilleteraService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(CombosService) private readonly combos: CombosService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
  ) {}

  /** Precio del carrito completo, sin guardar nada. */
  async cotizar(auth: ContextoAuth, e: CotizarPedidoEntrada): Promise<CotizacionPedido> {
    await this.limites.consumir(`pedido:cotizar:${auth.usuario.id}`, LIMITES.cotizarPedidoUsuario);
    return this.prisma.$transaction(async (tx) => {
      const c = await this.clientes.deUsuario(auth.usuario, tx);
      exigirBilleteraDisponible(c);
      const calculo = await this.calcular(tx, auth, c.id, e.planes, e.moneda, e.cupon ?? null);
      const lineas: LineaCotizacionPedido[] = calculo.lineas.map(({ plan, calculo: l, combo }) => ({
        planId: plan.id,
        plan: plan.nombre,
        servicio: plan.servicio.nombre,
        combo,
        descuentoCombo: l.descuentoCombo.toFixed(2),
        subtotal: l.subtotal.toFixed(2),
        descuento: l.descuento.toFixed(2),
        total: l.total.toFixed(2),
        totalUsd: l.totalUsd.toFixed(2),
      }));
      const suma = (f: (l: CalculoFactura) => Dec) =>
        calculo.lineas.reduce((a, l) => a.add(f(l.calculo)), CERO).toFixed(2);
      const faltante = calculo.totalUsd.sub(c.saldoUsd);
      return {
        moneda: e.moneda,
        lineas,
        subtotal: suma((l) => l.subtotal),
        descuento: suma((l) => l.descuento),
        total: suma((l) => l.total),
        totalUsd: calculo.totalUsd.toFixed(2),
        cupon: calculo.codigoCupon,
        saldoUsd: c.saldoUsd.toFixed(2),
        faltanteUsd: (faltante.isNegative() ? CERO : faltante).toFixed(2),
      };
    });
  }

  /**
   * Crea el pedido: una suscripción pendiente de pago y su factura por cada
   * plan. Con `pago: 'billetera'` las paga ya con el saldo (o no crea nada si
   * no alcanza); con `'recarga'` quedan esperando la próxima recarga
   * confirmada; con `'facturas'` se pagan una a una por los medios de siempre.
   *
   * Con `claveIdempotencia`, repetir la petición (doble clic, reintento tras un
   * corte de red) devuelve el pedido ya creado sin crear ni cobrar otro. El
   * bloqueo del cliente serializa las peticiones simultáneas.
   */
  async crear(
    auth: ContextoAuth,
    e: CrearPedidoEntrada,
    cliente: InfoCliente,
  ): Promise<PedidoPublico> {
    await this.limites.consumir(`pedido:crear:${auth.usuario.id}`, LIMITES.crearPedidoUsuario);
    const { pedidoId, pagos } = await this.prisma.$transaction(async (tx) => {
      const propio = await this.clientes.deUsuario(auth.usuario, tx);
      const c = await bloquearCliente(tx, propio.id);
      const repetido = e.claveIdempotencia
        ? await this.buscarPorClave(tx, c.id, e, e.claveIdempotencia)
        : null;
      if (repetido) return { pedidoId: repetido, pagos: [] as string[] };
      exigirBilleteraDisponible(c);
      const abierto = await tx.pedido.findFirst({
        where: { clienteId: c.id, facturas: { some: { estado: 'emitida' } } },
        select: { numero: true },
      });
      if (abierto) {
        throw new ErrorApp(
          409,
          'PEDIDO_PENDIENTE',
          `El pedido ${numeroPedido(abierto.numero)} sigue esperando pago. Págalo o cancélalo antes de hacer otro.`,
        );
      }
      const calculo = await this.calcular(tx, auth, c.id, e.planes, e.moneda, e.cupon ?? null);
      // Lo que pide cada servicio (ID de jugador…) tiene que venir completo antes de cobrar.
      const datosPorPlan = new Map<string, Record<string, string>>();
      const erroresDatos: Record<string, string[]> = {};
      for (const { plan } of calculo.lineas) {
        const pedidos = datosDelPlan(datosDeServicio(plan.servicio.datosRequeridos), plan);
        const { limpios, errores } = revisarDatos(pedidos, e.datos?.[plan.id]);
        // La contraseña de su cuenta (activación en su correo) nunca se guarda en claro.
        datosPorPlan.set(plan.id, cifrarDatosSecretos(this.cifrador, c.id, pedidos, limpios));
        for (const [clave, m] of Object.entries(errores)) {
          erroresDatos[`datos.${plan.id}.${clave}`] = [m];
        }
      }
      const faltan = Object.keys(erroresDatos);
      if (faltan.length > 0) {
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'Faltan datos para entregar tu compra. Complétalos en el carrito.',
          erroresDatos,
        );
      }
      if (e.pago === 'billetera') this.exigirSaldo(c, calculo.totalUsd);
      const pedido = await tx.pedido.create({
        data: {
          clienteId: c.id,
          moneda: e.moneda,
          pagarAlRecargar: e.pago === 'recarga',
          creadoPorId: auth.usuario.id,
          claveIdempotencia: e.claveIdempotencia ?? null,
        },
      });
      const facturas = [];
      for (const { plan, calculo: l } of calculo.lineas) {
        facturas.push(
          await this.suscripciones.altaDePedido(tx, auth, {
            clienteId: c.id,
            planId: plan.id,
            moneda: e.moneda,
            cupon: plan.id === calculo.planConCupon ? (e.cupon ?? null) : null,
            pedidoId: pedido.id,
            cliente,
            datosCliente: datosPorPlan.get(plan.id) ?? null,
            descuentoCombo: l.descuentoCombo,
          }),
        );
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pedido.creado',
          entidad: 'pedido',
          entidadId: pedido.id,
          despues: {
            numero: numeroPedido(pedido.numero),
            clienteId: c.id,
            planes: e.planes,
            moneda: e.moneda,
            pago: e.pago,
            totalUsd: calculo.totalUsd.toFixed(2),
            cupon: calculo.codigoCupon,
          },
          cliente,
        },
        tx,
      );
      const pendientes = facturas.filter((f) => f.estado === 'emitida');
      const pagos =
        e.pago === 'billetera'
          ? await this.billetera.pagarConSaldo(tx, c, pendientes, auth.usuario.id, cliente)
          : [];
      return { pedidoId: pedido.id, pagos };
    });
    await this.billetera.avisar(pagos);
    return this.cargar(pedidoId);
  }

  /**
   * Pedido anterior del cliente con la misma clave. Si la clave se reutiliza
   * para otro carrito, se rechaza en lugar de devolver un pedido distinto.
   */
  private async buscarPorClave(
    tx: Tx,
    clienteId: string,
    e: CrearPedidoEntrada,
    clave: string,
  ): Promise<string | null> {
    const previo = await tx.pedido.findUnique({
      where: { clienteId_claveIdempotencia: { clienteId, claveIdempotencia: clave } },
      select: {
        id: true,
        moneda: true,
        pagarAlRecargar: true,
        facturas: { select: { suscripcion: { select: { planId: true } } } },
      },
    });
    if (!previo) return null;
    const planes = previo.facturas.map((f) => f.suscripcion?.planId).filter(Boolean);
    const mismo =
      previo.moneda === e.moneda &&
      previo.pagarAlRecargar === (e.pago === 'recarga') &&
      planes.length === e.planes.length &&
      e.planes.every((id) => planes.includes(id));
    if (!mismo) {
      throw new ErrorApp(
        409,
        'CLAVE_REUTILIZADA',
        'Este pedido ya se envió con otro carrito. Recarga la página e inténtalo de nuevo.',
      );
    }
    return previo.id;
  }

  async listar(
    auth: ContextoAuth,
    filtro: { pagina: number; porPagina: number },
  ): Promise<Pagina<PedidoPublico>> {
    const c = await this.clientes.deUsuario(auth.usuario);
    const where = { clienteId: c.id };
    const [total, filas] = await Promise.all([
      this.prisma.pedido.count({ where }),
      this.prisma.pedido.findMany({
        where,
        include: INCLUIR_PEDIDO,
        orderBy: { numero: 'desc' },
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((p) => pedidoPublico(p)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  async obtener(auth: ContextoAuth, id: string): Promise<PedidoPublico> {
    const c = await this.clientes.deUsuario(auth.usuario);
    const p = await this.prisma.pedido.findFirst({
      where: { id, clienteId: c.id },
      include: INCLUIR_PEDIDO,
    });
    if (!p) throw Errores.noEncontrado('El pedido');
    return pedidoPublico(p);
  }

  /** Paga con el saldo lo que falte del pedido (todo o nada). */
  async pagar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<PedidoPublico> {
    const pagos = await this.prisma.$transaction(async (tx) => {
      const propio = await this.clientes.deUsuario(auth.usuario, tx);
      const c = await bloquearCliente(tx, propio.id);
      exigirBilleteraDisponible(c);
      const pedido = await tx.pedido.findFirst({ where: { id, clienteId: c.id } });
      if (!pedido) throw Errores.noEncontrado('El pedido');
      const pendientes = await tx.factura.findMany({
        where: { pedidoId: id, estado: 'emitida' },
        orderBy: { numero: 'asc' },
      });
      if (pendientes.length === 0) {
        throw new ErrorApp(409, 'PEDIDO_NO_PENDIENTE', 'Este pedido ya no espera pago.');
      }
      this.exigirSaldo(
        c,
        pendientes.reduce((a, f) => a.add(f.totalUsd), CERO),
      );
      return this.billetera.pagarConSaldo(tx, c, pendientes, auth.usuario.id, cliente);
    });
    await this.billetera.avisar(pagos);
    return this.cargar(id);
  }

  /** Cancela las suscripciones del pedido que siguen pendientes de pago. */
  async cancelar(auth: ContextoAuth, id: string, cliente: InfoCliente): Promise<PedidoPublico> {
    const c = await this.clientes.deUsuario(auth.usuario);
    const pedido = await this.prisma.pedido.findFirst({
      where: { id, clienteId: c.id },
      include: {
        facturas: {
          where: { estado: 'emitida', suscripcion: { estado: 'pendiente_pago' } },
          select: { suscripcionId: true },
        },
      },
    });
    if (!pedido) throw Errores.noEncontrado('El pedido');
    const ids = pedido.facturas.map((f) => f.suscripcionId).filter((s): s is string => !!s);
    if (ids.length === 0) {
      throw new ErrorApp(409, 'PEDIDO_NO_PENDIENTE', 'Este pedido ya no tiene nada por pagar.');
    }
    for (const suscripcionId of ids) {
      await this.suscripciones.cancelar(
        auth,
        suscripcionId,
        {
          motivo: `Pedido ${numeroPedido(pedido.numero)} cancelado por el cliente`,
          inmediata: true,
        },
        cliente,
      );
    }
    return this.cargar(id);
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  /**
   * Calcula cada línea del carrito. Si el carrito tiene todos los planes de un
   * combo, el ahorro del combo se reparte entre esas líneas. El cupón vale para
   * un solo plan fuera de los combos: el que obtiene el mayor descuento en USD.
   * Si no aplica a ninguno, se informa el motivo del primero.
   */
  private async calcular(
    tx: Tx,
    auth: ContextoAuth,
    clienteId: string,
    planes: string[],
    moneda: Moneda,
    cupon: string | null,
  ): Promise<Calculo> {
    const lineas: LineaCalculada[] = [];
    for (const planId of planes) {
      const plan = await this.suscripciones.planContratable(tx, auth, planId);
      const calculo = await this.facturacion.calcular(tx, {
        plan,
        moneda,
        concepto: 'alta',
        clienteId,
      });
      lineas.push({ plan, calculo, combo: null });
    }
    // Combos: el ahorro se reparte entre sus líneas según el precio de cada una.
    const descuentoCombo = new Map<number, Dec>();
    if (lineas.length >= 2) {
      const tasas = await this.tasas.mapa(tx);
      const aplicados = combosDelCarrito(await this.combos.activos(tx), planes, moneda, tasas);
      for (const { combo, precio } of aplicados) {
        const indices = combo.planes.map((cp) => lineas.findIndex((l) => l.plan.id === cp.planId));
        const subtotales = indices.map((i) => lineas[i]!.calculo.subtotal);
        const suma = subtotales.reduce((a, x) => a.add(x), CERO);
        const partes = repartirDescuento(subtotales, suma.sub(precio), moneda);
        for (const [k, i] of indices.entries()) {
          descuentoCombo.set(i, partes[k]!);
          lineas[i]!.combo = combo.nombre;
        }
      }
      for (const [i, parte] of descuentoCombo) {
        const l = lineas[i]!;
        l.calculo = await this.facturacion.calcular(tx, {
          plan: l.plan,
          moneda,
          concepto: 'alta',
          clienteId,
          descuentoCombo: parte,
        });
      }
    }
    let planConCupon: string | null = null;
    let codigoCupon: string | null = null;
    if (cupon) {
      let mejor: { i: number; calculo: CalculoFactura; ahorroUsd: Dec } | null = null;
      let primerError: unknown = null;
      for (const [i, { plan, calculo: base, combo }] of lineas.entries()) {
        if (combo || base.descuentoOferta.gt(0)) continue;
        try {
          const con = await this.facturacion.calcular(tx, {
            plan,
            moneda,
            concepto: 'alta',
            cupon,
            clienteId,
          });
          const ahorroUsd = base.totalUsd.sub(con.totalUsd);
          if (!mejor || ahorroUsd.gt(mejor.ahorroUsd)) mejor = { i, calculo: con, ahorroUsd };
        } catch (err) {
          if (!(err instanceof ErrorApp) || !err.codigo.startsWith('CUPON_')) throw err;
          primerError ??= err;
        }
      }
      if (!mejor) {
        if (primerError) throw primerError;
        throw new ErrorApp(409, 'CUPON_NO_VALIDO', CUPON_SIN_SUMAR, { cupon: [CUPON_SIN_SUMAR] });
      }
      lineas[mejor.i] = { ...lineas[mejor.i]!, calculo: mejor.calculo };
      planConCupon = lineas[mejor.i]!.plan.id;
      codigoCupon = mejor.calculo.cupon?.codigo ?? null;
    }
    const totalUsd = lineas.reduce((a, l) => a.add(l.calculo.totalUsd), CERO);
    return { lineas, planConCupon, codigoCupon, totalUsd };
  }

  private exigirSaldo(c: Cliente, totalUsd: Dec): void {
    if (c.saldoUsd.lt(totalUsd)) {
      throw new ErrorApp(
        409,
        'SALDO_INSUFICIENTE',
        `Tu saldo (${usd(c.saldoUsd)}) no alcanza para ${usd(totalUsd)}: te faltan ${usd(totalUsd.sub(c.saldoUsd))}. Recarga tu billetera o elige otra forma de pago.`,
      );
    }
  }

  private async cargar(id: string): Promise<PedidoPublico> {
    const p = await this.prisma.pedido.findUniqueOrThrow({
      where: { id },
      include: INCLUIR_PEDIDO,
    });
    return pedidoPublico(p);
  }
}
