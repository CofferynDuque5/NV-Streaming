import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cliente, Factura, Prisma, PrismaClient } from '@nv/db';
import {
  type AjusteSaldoEntrada,
  type BilleteraPublica,
  type ConfirmarRecargaEntrada,
  type EstadoRecarga,
  type ListarMovimientosBilleteraEntrada,
  type ListarRecargasBilleteraEntrada,
  type MovimientoBilleteraPublico,
  type Pagina,
  type RecargaBilleteraPublica,
  type ReportarRecargaBilleteraEntrada,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { PagosService } from '../cobros/pagos.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, numeroFactura } from '../comun/formato.js';
import { exigirReferenciaNueva } from '../comun/referencias.js';
import { PRISMA } from '../comun/tokens.js';
import { aUsd, D } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';
import { LimitesService } from '../limites/limites.service.js';
import { exigirGestionDelCliente } from '../suscripciones/canal-revendedor.js';
import {
  bloquearCliente,
  exigirBilleteraDisponible,
  moverBilletera,
  type Tx,
  usd,
} from './libro.js';
import {
  INCLUIR_MOVIMIENTO_BILLETERA,
  INCLUIR_PEDIDO,
  INCLUIR_RECARGA_BILLETERA,
  movimientoBilleteraPublico,
  pedidoPublico,
  recargaBilleteraPublica,
} from './presentacion.js';

/** Sin 0/O ni 1/I/L, para que se pueda dictar por teléfono. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function nuevaReferenciaBilletera(): string {
  let r = 'B-';
  for (let i = 0; i < 8; i += 1) r += ALFABETO[randomInt(ALFABETO.length)];
  return r;
}

/** Recargas reportadas por cliente y hora (evita llenar el almacén de archivos). */
const LIMITE_REPORTES = { maximo: 10, ventanaSegundos: 3600 };

type FiltroPagina = { pagina: number; porPagina: number };

/**
 * Billetera del cliente: saldo en USD que se recarga con un pago manual
 * (comprobante que concilia el equipo) y que paga facturas al instante. Todo
 * movimiento queda en un libro mayor de solo inserción.
 */
@Injectable()
export class BilleteraService {
  private readonly logger = new Logger('Billetera');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(ClientesService) private readonly clientes: ClientesService,
    @Inject(PagosService) private readonly pagos: PagosService,
  ) {}

  // ── Cliente ────────────────────────────────────────────────────────────────

  async resumen(auth: ContextoAuth): Promise<BilleteraPublica> {
    const c = await this.clientes.deUsuario(auth.usuario);
    const desde = new Date(Date.now() - 30 * 24 * 3600_000);
    const recientes = { clienteId: c.id, creadoEn: { gte: desde } };
    const [porEstado, pedido, totalMovimientos, entradas, salidas] = await Promise.all([
      this.prisma.recargaBilletera.groupBy({
        by: ['estado'],
        where: { clienteId: c.id },
        _count: { _all: true },
      }),
      this.prisma.pedido.findFirst({
        where: { clienteId: c.id, facturas: { some: { estado: 'emitida' } } },
        include: INCLUIR_PEDIDO,
        orderBy: { creadoEn: 'desc' },
      }),
      this.prisma.movimientoBilletera.count({ where: { clienteId: c.id } }),
      this.prisma.movimientoBilletera.aggregate({
        where: { ...recientes, montoUsd: { gt: 0 } },
        _sum: { montoUsd: true },
      }),
      this.prisma.movimientoBilletera.aggregate({
        where: { ...recientes, montoUsd: { lt: 0 } },
        _sum: { montoUsd: true },
      }),
    ]);
    const recargasPorEstado: Record<EstadoRecarga, number> = {
      en_revision: 0,
      confirmada: 0,
      rechazada: 0,
    };
    for (const g of porEstado) recargasPorEstado[g.estado] = g._count._all;
    return {
      saldoUsd: c.saldoUsd.toFixed(2),
      recargasEnRevision: recargasPorEstado.en_revision,
      recargasPorEstado,
      totalMovimientos,
      ultimos30Dias: {
        entradasUsd: (entradas._sum.montoUsd ?? D(0)).toFixed(2),
        salidasUsd: (salidas._sum.montoUsd ?? D(0)).abs().toFixed(2),
      },
      pedidoPendiente: pedido ? pedidoPublico(pedido) : null,
    };
  }

  async misMovimientos(
    auth: ContextoAuth,
    filtro: ListarMovimientosBilleteraEntrada,
  ): Promise<Pagina<MovimientoBilleteraPublico>> {
    const c = await this.clientes.deUsuario(auth.usuario);
    return this.paginaMovimientos(c.id, filtro, false);
  }

  async misRecargas(
    auth: ContextoAuth,
    filtro: ListarRecargasBilleteraEntrada,
  ): Promise<Pagina<RecargaBilleteraPublica>> {
    const c = await this.clientes.deUsuario(auth.usuario);
    return this.paginaRecargas({ ...filtro, clienteId: c.id }, false);
  }

  async comprobantePropio(auth: ContextoAuth, id: string) {
    const c = await this.clientes.deUsuario(auth.usuario);
    const r = await this.prisma.recargaBilletera.findFirst({
      where: { id, clienteId: c.id },
      include: { comprobante: true },
    });
    if (!r?.comprobante) throw Errores.noEncontrado('El comprobante');
    return { archivo: r.comprobante, contenido: await this.almacen.leer(r.comprobante) };
  }

  /** El cliente reporta un pago para recargar su billetera. La tasa queda fijada ahora. */
  async reportarRecarga(
    auth: ContextoAuth,
    e: ReportarRecargaBilleteraEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<RecargaBilleteraPublica> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Adjunta el comprobante del pago.', {
        comprobante: ['Adjunta el comprobante del pago (foto o PDF).'],
      });
    }
    exigirBilleteraDisponible(await this.clientes.deUsuario(auth.usuario));
    await this.limites.consumir(`billetera:reporte:${auth.usuario.id}`, LIMITE_REPORTES);
    const creada = await this.prisma.$transaction(async (tx) => {
      const propio = await this.clientes.deUsuario(auth.usuario, tx);
      const c = await bloquearCliente(tx, propio.id);
      exigirBilleteraDisponible(c);
      if (e.pedidoId) {
        const pedido = await tx.pedido.findFirst({
          where: { id: e.pedidoId, clienteId: c.id, facturas: { some: { estado: 'emitida' } } },
        });
        if (!pedido) {
          throw new ErrorApp(409, 'PEDIDO_NO_PENDIENTE', 'Ese pedido ya no espera pago.');
        }
        // Al confirmarse la recarga, el saldo paga este pedido.
        if (!pedido.pagarAlRecargar) {
          await tx.pedido.update({ where: { id: pedido.id }, data: { pagarAlRecargar: true } });
        }
      }
      const metodo = await tx.metodoCobro.findUnique({ where: { id: e.metodoCobroId } });
      if (!metodo || !metodo.activo || metodo.tipo !== 'manual') {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige un método de pago disponible.', {
          metodoCobroId: ['Elige un método de pago disponible.'],
        });
      }
      if (metodo.moneda !== e.moneda) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Ese método no cobra en la moneda elegida.', {
          metodoCobroId: [`Elige un método que cobre en ${e.moneda}.`],
        });
      }
      if (metodo.requiereReferencia && !e.referenciaExterna) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Escribe el número de referencia del pago.', {
          referenciaExterna: [
            'Escribe el número de referencia que te dio el banco o la billetera.',
          ],
        });
      }
      if (e.referenciaExterna) await exigirReferenciaNueva(tx, metodo.id, e.referenciaExterna);
      const tasa = e.moneda === 'USD' ? D(1) : await this.tasas.tasaDe(e.moneda, tx);
      const comprobante = await this.almacen.guardar(tx, archivo, auth.usuario.id);
      const monto = D(e.monto);
      const recarga = await this.insertarConReferencia(tx, {
        clienteId: c.id,
        pedidoId: e.pedidoId ?? null,
        metodoCobroId: metodo.id,
        moneda: e.moneda,
        montoDeclarado: monto,
        tasa,
        referenciaExterna: e.referenciaExterna ?? null,
        fechaPago: e.fechaPago,
        comprobanteId: comprobante.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'billetera.recarga_reportada',
          entidad: 'recarga_billetera',
          entidadId: recarga.id,
          despues: {
            referencia: recarga.referencia,
            clienteId: c.id,
            pedidoId: e.pedidoId ?? null,
            monto: monto.toFixed(2),
            moneda: e.moneda,
            tasa: tasa.toFixed(6),
            metodo: metodo.nombre,
            comprobante: comprobante.sha256,
          },
          cliente,
        },
        tx,
      );
      return recarga;
    });
    return this.cargarRecarga(creada.id, false);
  }

  /** El cliente paga una de sus facturas pendientes con el saldo de la billetera. */
  async pagarFactura(auth: ContextoAuth, facturaId: string, cliente: InfoCliente) {
    const { pagos, saldo } = await this.prisma.$transaction(async (tx) => {
      const propio = await this.clientes.deUsuario(auth.usuario, tx);
      const c = await bloquearCliente(tx, propio.id);
      exigirBilleteraDisponible(c);
      const encontrada = await tx.factura.findFirst({
        where: { id: facturaId, clienteId: c.id },
        include: { suscripcion: { select: { revendedorId: true } } },
      });
      if (!encontrada) throw Errores.noEncontrado('La factura');
      const { suscripcion, ...factura } = encontrada;
      // Lo que activó su revendedor lo paga el revendedor, nunca el saldo del cliente.
      exigirGestionDelCliente(auth, suscripcion);
      const pagos = await this.pagarConSaldo(tx, c, [factura], auth.usuario.id, cliente);
      return { pagos, saldo: c.saldoUsd };
    });
    await this.avisar(pagos);
    return { saldoUsd: saldo.toFixed(2) };
  }

  // ── Equipo ─────────────────────────────────────────────────────────────────

  listarRecargas(filtro: ListarRecargasBilleteraEntrada) {
    return this.paginaRecargas(filtro, true);
  }

  async confirmarRecarga(
    auth: ContextoAuth,
    id: string,
    e: ConfirmarRecargaEntrada,
    cliente: InfoCliente,
  ): Promise<RecargaBilleteraPublica> {
    const clienteId = await this.prisma.$transaction(async (tx) => {
      const recarga = await this.bloquearEnRevision(tx, id);
      const recibido = D(e.montoRecibido);
      const montoUsd = aUsd(recibido, recarga.tasa);
      if (!montoUsd.gt(0)) {
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'El monto recibido equivale a menos de 0,01 USD.',
          { montoRecibido: ['El monto recibido equivale a menos de 0,01 USD.'] },
        );
      }
      const c = await bloquearCliente(tx, recarga.clienteId);
      await tx.recargaBilletera.update({
        where: { id },
        data: {
          estado: 'confirmada',
          montoRecibido: recibido,
          montoUsd,
          notas: e.notas ?? null,
          revisadoPorId: auth.usuario.id,
          revisadoEn: new Date(),
        },
      });
      const { saldo } = await moverBilletera(tx, c, {
        tipo: 'recarga',
        montoUsd,
        recargaId: id,
        autorId: auth.usuario.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'billetera.recarga_confirmada',
          entidad: 'recarga_billetera',
          entidadId: id,
          antes: { estado: recarga.estado },
          despues: {
            referencia: recarga.referencia,
            clienteId: c.id,
            declarado: recarga.montoDeclarado.toFixed(2),
            recibido: recibido.toFixed(2),
            moneda: recarga.moneda,
            tasa: recarga.tasa.toFixed(6),
            montoUsd: montoUsd.toFixed(2),
            saldoUsd: saldo.toFixed(2),
            notas: e.notas ?? null,
          },
          cliente,
        },
        tx,
      );
      return c.id;
    });
    // Pedidos que esperaban esta recarga: se pagan con el saldo en su propia
    // transacción, para que un problema con una factura no deshaga la recarga.
    await this.pagarPedidosEnEspera(clienteId);
    return this.cargarRecarga(id, true);
  }

  async rechazarRecarga(
    auth: ContextoAuth,
    id: string,
    motivo: string,
    cliente: InfoCliente,
  ): Promise<RecargaBilleteraPublica> {
    await this.prisma.$transaction(async (tx) => {
      const recarga = await this.bloquearEnRevision(tx, id);
      await tx.recargaBilletera.update({
        where: { id },
        data: {
          estado: 'rechazada',
          motivoRechazo: motivo,
          revisadoPorId: auth.usuario.id,
          revisadoEn: new Date(),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'billetera.recarga_rechazada',
          entidad: 'recarga_billetera',
          entidadId: id,
          antes: { estado: recarga.estado },
          despues: { estado: 'rechazada', referencia: recarga.referencia, motivo },
          cliente,
        },
        tx,
      );
    });
    return this.cargarRecarga(id, true);
  }

  async comprobante(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    const r = await this.prisma.recargaBilletera.findUnique({
      where: { id },
      include: { comprobante: true },
    });
    if (!r?.comprobante) throw Errores.noEncontrado('El comprobante');
    const contenido = await this.almacen.leer(r.comprobante);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'billetera.comprobante_consultado',
      entidad: 'recarga_billetera',
      entidadId: id,
      cliente,
    });
    return { archivo: r.comprobante, contenido };
  }

  /** Saldo y movimientos de la billetera de un cliente (dentro del alcance de quien consulta). */
  async deCliente(auth: ContextoAuth, clienteId: string, filtro: FiltroPagina) {
    const c = await this.prisma.cliente.findFirst({
      where: { id: clienteId, AND: [alcanceClientes(auth)] },
    });
    if (!c) throw Errores.noEncontrado('El cliente');
    return {
      saldoUsd: c.saldoUsd.toFixed(2),
      movimientos: await this.paginaMovimientos(c.id, filtro, true),
    };
  }

  /** Ajuste manual del equipo (positivo o negativo), con motivo. Nunca deja el saldo en negativo. */
  async ajustar(
    auth: ContextoAuth,
    clienteId: string,
    e: AjusteSaldoEntrada,
    cliente: InfoCliente,
  ): Promise<MovimientoBilleteraPublico> {
    const movimientoId = await this.prisma.$transaction(async (tx) => {
      const visible = await tx.cliente.findFirst({
        where: { id: clienteId, AND: [alcanceClientes(auth)] },
        select: { id: true },
      });
      if (!visible) throw Errores.noEncontrado('El cliente');
      const c = await bloquearCliente(tx, clienteId);
      const monto = D(e.montoUsd);
      const antes = c.saldoUsd;
      if (antes.add(monto).isNegative()) {
        throw new ErrorApp(
          409,
          'SALDO_INSUFICIENTE',
          `El ajuste dejaría el saldo en negativo: el saldo actual es ${usd(antes)}.`,
          { montoUsd: [`Como mucho puedes restar ${usd(antes)}.`] },
        );
      }
      const { movimiento, saldo } = await moverBilletera(tx, c, {
        tipo: 'ajuste',
        montoUsd: monto,
        motivo: e.motivo,
        autorId: auth.usuario.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'billetera.saldo_ajustado',
          entidad: 'cliente',
          entidadId: c.id,
          antes: { saldoUsd: antes.toFixed(2) },
          despues: { montoUsd: monto.toFixed(2), saldoUsd: saldo.toFixed(2), motivo: e.motivo },
          cliente,
        },
        tx,
      );
      return movimiento.id;
    });
    const m = await this.prisma.movimientoBilletera.findUniqueOrThrow({
      where: { id: movimientoId },
      include: INCLUIR_MOVIMIENTO_BILLETERA,
    });
    return movimientoBilleteraPublico(m, true);
  }

  // ── Pagar con saldo ────────────────────────────────────────────────────────

  /**
   * Paga facturas con el saldo, dentro de la transacción de quien llama y con
   * la fila del cliente ya bloqueada. Cada factura descuenta su total en USD
   * del libro mayor y se confirma por el mismo camino que un pago conciliado.
   * Devuelve los ids de los pagos creados (para avisar tras confirmar).
   */
  async pagarConSaldo(
    tx: Tx,
    c: Cliente,
    facturas: Factura[],
    autorId: string | null,
    cliente?: InfoCliente,
  ): Promise<string[]> {
    const pagos: string[] = [];
    for (const f of facturas) {
      await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${f.id}::uuid FOR UPDATE`;
      const factura = await tx.factura.findUniqueOrThrow({ where: { id: f.id } });
      if (factura.clienteId !== c.id) throw Errores.noEncontrado('La factura');
      if (factura.estado !== 'emitida') {
        throw new ErrorApp(409, 'FACTURA_CERRADA', 'Esta factura ya no está pendiente de pago.');
      }
      const enRevision = await tx.pago.count({
        where: { facturaId: factura.id, estado: 'en_revision' },
      });
      if (enRevision > 0) {
        throw new ErrorApp(
          409,
          'PAGO_EN_REVISION',
          `Ya reportaste un pago de la factura ${numeroFactura(factura.numero)}: espera a que lo revisemos.`,
        );
      }
      const antes = c.saldoUsd;
      const { saldo } = await moverBilletera(tx, c, {
        tipo: 'pago',
        montoUsd: factura.totalUsd.neg(),
        facturaId: factura.id,
        autorId,
      });
      const pago = await this.pagos.registrarDeBilletera(tx, {
        factura,
        creadoPorId: autorId,
        ...(cliente ? { cliente } : {}),
      });
      await this.auditoria.registrar(
        {
          ...(autorId ? { actorId: autorId } : { actorTipo: 'sistema' as const }),
          accion: 'billetera.factura_pagada',
          entidad: 'factura',
          entidadId: factura.id,
          antes: { saldoUsd: antes.toFixed(2) },
          despues: {
            pagoId: pago.id,
            montoUsd: factura.totalUsd.toFixed(2),
            saldoUsd: saldo.toFixed(2),
          },
          ...(cliente ? { cliente } : {}),
        },
        tx,
      );
      pagos.push(pago.id);
    }
    return pagos;
  }

  /**
   * Paga con el saldo las facturas de los pedidos que esperaban una recarga
   * ("recargar y pagar"), de la más antigua a la más nueva, mientras alcance.
   * Cada factura va en su propia transacción; un fallo se registra y se sigue.
   */
  async pagarPedidosEnEspera(clienteId: string): Promise<number> {
    const facturas = await this.prisma.factura.findMany({
      where: { clienteId, estado: 'emitida', pedido: { pagarAlRecargar: true } },
      orderBy: [{ pedido: { creadoEn: 'asc' } }, { numero: 'asc' }],
      select: { id: true },
    });
    let pagadas = 0;
    for (const { id } of facturas) {
      try {
        const pagos = await this.prisma.$transaction(async (tx) => {
          const c = await bloquearCliente(tx, clienteId);
          const f = await tx.factura.findUniqueOrThrow({ where: { id } });
          if (f.estado !== 'emitida' || c.saldoUsd.lt(f.totalUsd)) return [];
          const hayRevision = await tx.pago.count({
            where: { facturaId: id, estado: 'en_revision' },
          });
          if (hayRevision > 0) return [];
          return this.pagarConSaldo(tx, c, [f], null);
        });
        await this.avisar(pagos);
        pagadas += pagos.length;
      } catch (err) {
        this.logger.warn(`No se pudo pagar con saldo la factura ${id}: ${String(err)}`);
      }
    }
    return pagadas;
  }

  /** Avisos de pago confirmado (tras la transacción). Nunca lanza. */
  async avisar(pagos: string[]): Promise<void> {
    for (const id of pagos) await this.pagos.avisar(id, 'confirmado');
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async paginaRecargas(
    filtro: ListarRecargasBilleteraEntrada,
    equipo: boolean,
  ): Promise<Pagina<RecargaBilleteraPublica>> {
    const where: Prisma.RecargaBilleteraWhereInput = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.recargaBilletera.count({ where }),
      this.prisma.recargaBilletera.findMany({
        where,
        include: INCLUIR_RECARGA_BILLETERA,
        // La cola de conciliación atiende primero lo más antiguo.
        orderBy: filtro.estado === 'en_revision' ? [{ creadoEn: 'asc' }] : [{ creadoEn: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((r) => recargaBilleteraPublica(r, equipo)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  private async paginaMovimientos(
    clienteId: string,
    filtro: FiltroPagina & Pick<ListarMovimientosBilleteraEntrada, 'tipo'>,
    equipo: boolean,
  ): Promise<Pagina<MovimientoBilleteraPublico>> {
    const where: Prisma.MovimientoBilleteraWhereInput = {
      clienteId,
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.movimientoBilletera.count({ where }),
      this.prisma.movimientoBilletera.findMany({
        where,
        include: INCLUIR_MOVIMIENTO_BILLETERA,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((m) => movimientoBilleteraPublico(m, equipo)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  private async cargarRecarga(id: string, equipo: boolean): Promise<RecargaBilleteraPublica> {
    const r = await this.prisma.recargaBilletera.findUniqueOrThrow({
      where: { id },
      include: INCLUIR_RECARGA_BILLETERA,
    });
    return recargaBilleteraPublica(r, equipo);
  }

  private async bloquearEnRevision(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM recargas_billetera WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.recargaBilletera.findUnique({ where: { id } });
    if (!r) throw Errores.noEncontrado('La recarga');
    if (r.estado !== 'en_revision') {
      throw new ErrorApp(409, 'RECARGA_YA_REVISADA', 'Esta recarga ya se revisó.');
    }
    return r;
  }

  private async insertarConReferencia(
    tx: Tx,
    data: Omit<Prisma.RecargaBilleteraUncheckedCreateInput, 'referencia'>,
  ) {
    for (let intento = 0; intento < 5; intento += 1) {
      try {
        return await tx.recargaBilletera.create({
          data: { ...data, referencia: nuevaReferenciaBilletera() },
        });
      } catch (e) {
        if (!esUnicoDuplicado(e)) throw e;
      }
    }
    throw new Error('No se pudo generar una referencia de recarga única.');
  }
}
