import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@nv/db';
import {
  type AjusteSaldoEntrada,
  type ConfirmarRecargaEntrada,
  type ListarRecargasEntrada,
  type MovimientoSaldoPublico,
  type Pagina,
  type RecargaPublica,
  type ReportarRecargaEntrada,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { aUsd, D } from '../dinero/dinero.js';
import { TasasService } from '../dinero/tasas.service.js';
import { LimitesService } from '../limites/limites.service.js';
import {
  bloquearRevendedor,
  exigirOperativo,
  moverSaldo,
  revendedorPropio,
  type Tx,
  usd,
} from './libro-mayor.js';
import {
  INCLUIR_MOVIMIENTO,
  INCLUIR_RECARGA,
  movimientoPublico,
  recargaPublica,
} from './presentacion.js';

/** Sin 0/O ni 1/I/L, para que se pueda dictar por teléfono. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function nuevaReferenciaRecarga(): string {
  let r = 'R-';
  for (let i = 0; i < 8; i += 1) r += ALFABETO[randomInt(ALFABETO.length)];
  return r;
}

/** Recargas reportadas por revendedor y hora (evita llenar el almacén de archivos). */
const LIMITE_REPORTES = { maximo: 10, ventanaSegundos: 3600 };

type FiltroPagina = { pagina: number; porPagina: number };

/**
 * Saldo prepagado de los revendedores: recargas manuales con comprobante que
 * concilia el equipo, ajustes y el libro mayor (solo inserción).
 */
@Injectable()
export class SaldoService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(LimitesService) private readonly limites: LimitesService,
  ) {}

  // ── Revendedor ─────────────────────────────────────────────────────────────

  /** El revendedor reporta un pago para recargar saldo. La tasa queda fijada ahora. */
  async reportarRecarga(
    auth: ContextoAuth,
    e: ReportarRecargaEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<RecargaPublica> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Adjunta el comprobante del pago.', {
        comprobante: ['Adjunta el comprobante del pago (foto o PDF).'],
      });
    }
    exigirOperativo(await revendedorPropio(auth, this.prisma));
    await this.limites.consumir(`recarga:reporte:${auth.usuario.id}`, LIMITE_REPORTES);
    const creada = await this.prisma.$transaction(async (tx) => {
      const r = await revendedorPropio(auth, tx);
      exigirOperativo(r);
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
      if (e.referenciaExterna) await this.exigirReferenciaNueva(tx, metodo.id, e.referenciaExterna);
      const tasa = e.moneda === 'USD' ? D(1) : await this.tasas.tasaDe(e.moneda, tx);
      const comprobante = await this.almacen.guardar(tx, archivo, auth.usuario.id);
      const monto = D(e.monto);
      const recarga = await this.insertarConReferencia(tx, {
        revendedorId: r.id,
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
          accion: 'recarga.reportada',
          entidad: 'recarga_saldo',
          entidadId: recarga.id,
          despues: {
            referencia: recarga.referencia,
            revendedorId: r.id,
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

  async misRecargas(auth: ContextoAuth, filtro: ListarRecargasEntrada) {
    const r = await revendedorPropio(auth, this.prisma);
    return this.paginaRecargas({ ...filtro, revendedorId: r.id }, false);
  }

  async comprobantePropio(auth: ContextoAuth, id: string) {
    const r = await revendedorPropio(auth, this.prisma);
    const recarga = await this.prisma.recargaSaldo.findFirst({
      where: { id, revendedorId: r.id },
      include: { comprobante: true },
    });
    if (!recarga?.comprobante) throw Errores.noEncontrado('El comprobante');
    return {
      archivo: recarga.comprobante,
      contenido: await this.almacen.leer(recarga.comprobante),
    };
  }

  async misMovimientos(
    auth: ContextoAuth,
    filtro: FiltroPagina,
  ): Promise<Pagina<MovimientoSaldoPublico>> {
    const r = await revendedorPropio(auth, this.prisma);
    return this.paginaMovimientos(r.id, filtro, false);
  }

  // ── Equipo ─────────────────────────────────────────────────────────────────

  listarRecargas(filtro: ListarRecargasEntrada): Promise<Pagina<RecargaPublica>> {
    return this.paginaRecargas(filtro, true);
  }

  async confirmarRecarga(
    auth: ContextoAuth,
    id: string,
    e: ConfirmarRecargaEntrada,
    cliente: InfoCliente,
  ): Promise<RecargaPublica> {
    await this.prisma.$transaction(async (tx) => {
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
      const r = await bloquearRevendedor(tx, recarga.revendedorId);
      await tx.recargaSaldo.update({
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
      const { saldo } = await moverSaldo(tx, r, {
        tipo: 'recarga',
        montoUsd,
        recargaId: id,
        autorId: auth.usuario.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'recarga.confirmada',
          entidad: 'recarga_saldo',
          entidadId: id,
          antes: { estado: recarga.estado },
          despues: {
            referencia: recarga.referencia,
            revendedorId: r.id,
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
    });
    return this.cargarRecarga(id, true);
  }

  async rechazarRecarga(
    auth: ContextoAuth,
    id: string,
    motivo: string,
    cliente: InfoCliente,
  ): Promise<RecargaPublica> {
    await this.prisma.$transaction(async (tx) => {
      const recarga = await this.bloquearEnRevision(tx, id);
      await tx.recargaSaldo.update({
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
          accion: 'recarga.rechazada',
          entidad: 'recarga_saldo',
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
    const recarga = await this.prisma.recargaSaldo.findUnique({
      where: { id },
      include: { comprobante: true },
    });
    if (!recarga?.comprobante) throw Errores.noEncontrado('El comprobante');
    const contenido = await this.almacen.leer(recarga.comprobante);
    await this.auditoria.registrar({
      actorId: auth.usuario.id,
      accion: 'recarga.comprobante_consultado',
      entidad: 'recarga_saldo',
      entidadId: id,
      cliente,
    });
    return { archivo: recarga.comprobante, contenido };
  }

  async movimientos(revendedorId: string, filtro: FiltroPagina) {
    if (!(await this.prisma.revendedor.findUnique({ where: { id: revendedorId } }))) {
      throw Errores.noEncontrado('El revendedor');
    }
    return this.paginaMovimientos(revendedorId, filtro, true);
  }

  /** Ajuste manual del equipo (positivo o negativo). Nunca deja el saldo por debajo de cero. */
  async ajustar(
    auth: ContextoAuth,
    revendedorId: string,
    e: AjusteSaldoEntrada,
    cliente: InfoCliente,
  ): Promise<MovimientoSaldoPublico> {
    const movimientoId = await this.prisma.$transaction(async (tx) => {
      const r = await bloquearRevendedor(tx, revendedorId);
      if (r.estado !== 'aprobado' && r.estado !== 'suspendido') {
        throw new ErrorApp(
          409,
          'REVENDEDOR_NO_APROBADO',
          'Solo se ajusta el saldo de revendedores aprobados o suspendidos.',
        );
      }
      const monto = D(e.montoUsd);
      const antes = r.saldoUsd;
      if (antes.add(monto).isNegative()) {
        throw new ErrorApp(
          409,
          'SALDO_INSUFICIENTE',
          `El ajuste dejaría el saldo en negativo: el saldo actual es ${usd(antes)}.`,
          { montoUsd: [`Como mucho puedes restar ${usd(antes)}.`] },
        );
      }
      const { movimiento, saldo } = await moverSaldo(tx, r, {
        tipo: 'ajuste',
        montoUsd: monto,
        motivo: e.motivo,
        autorId: auth.usuario.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'revendedor.saldo_ajustado',
          entidad: 'revendedor',
          entidadId: r.id,
          antes: { saldoUsd: antes.toFixed(2) },
          despues: {
            montoUsd: monto.toFixed(2),
            saldoUsd: saldo.toFixed(2),
            motivo: e.motivo,
          },
          cliente,
        },
        tx,
      );
      return movimiento.id;
    });
    const m = await this.prisma.movimientoSaldo.findUniqueOrThrow({
      where: { id: movimientoId },
      include: INCLUIR_MOVIMIENTO,
    });
    return movimientoPublico(m, true);
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private async paginaRecargas(
    filtro: ListarRecargasEntrada,
    equipo: boolean,
  ): Promise<Pagina<RecargaPublica>> {
    const where: Prisma.RecargaSaldoWhereInput = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.revendedorId ? { revendedorId: filtro.revendedorId } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.recargaSaldo.count({ where }),
      this.prisma.recargaSaldo.findMany({
        where,
        include: INCLUIR_RECARGA,
        // La cola de conciliación atiende primero lo más antiguo.
        orderBy: filtro.estado === 'en_revision' ? [{ creadoEn: 'asc' }] : [{ creadoEn: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((r) => recargaPublica(r, equipo)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  private async paginaMovimientos(
    revendedorId: string,
    filtro: FiltroPagina,
    equipo: boolean,
  ): Promise<Pagina<MovimientoSaldoPublico>> {
    const where = { revendedorId };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.movimientoSaldo.count({ where }),
      this.prisma.movimientoSaldo.findMany({
        where,
        include: INCLUIR_MOVIMIENTO,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    return {
      elementos: filas.map((m) => movimientoPublico(m, equipo)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  private async cargarRecarga(id: string, equipo: boolean): Promise<RecargaPublica> {
    const r = await this.prisma.recargaSaldo.findUniqueOrThrow({
      where: { id },
      include: INCLUIR_RECARGA,
    });
    return recargaPublica(r, equipo);
  }

  private async bloquearEnRevision(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM recargas_saldo WHERE id = ${id}::uuid FOR UPDATE`;
    const r = await tx.recargaSaldo.findUnique({ where: { id } });
    if (!r) throw Errores.noEncontrado('La recarga');
    if (r.estado !== 'en_revision') {
      throw new ErrorApp(409, 'RECARGA_YA_REVISADA', 'Esta recarga ya se revisó.');
    }
    return r;
  }

  /**
   * La misma referencia bancaria no puede usarse dos veces en el mismo método,
   * ni en otra recarga ni en el pago de una factura.
   */
  private async exigirReferenciaNueva(tx: Tx, metodoCobroId: string, referencia: string) {
    const filtro = {
      metodoCobroId,
      referenciaExterna: { equals: referencia, mode: 'insensitive' as const },
    };
    // En serie: una transacción usa una sola conexión.
    const recarga = await tx.recargaSaldo.findFirst({
      where: { ...filtro, estado: { in: ['en_revision', 'confirmada'] } },
      select: { id: true },
    });
    const pago = await tx.pago.findFirst({
      where: { ...filtro, estado: { in: ['en_revision', 'confirmado'] } },
      select: { id: true },
    });
    if (recarga || pago) {
      throw new ErrorApp(409, 'REFERENCIA_REPETIDA', 'Esa referencia ya se reportó en otro pago.', {
        referenciaExterna: ['Esa referencia ya se reportó en otro pago.'],
      });
    }
  }

  private async insertarConReferencia(
    tx: Tx,
    data: Omit<Prisma.RecargaSaldoUncheckedCreateInput, 'referencia'>,
  ) {
    for (let intento = 0; intento < 5; intento += 1) {
      try {
        return await tx.recargaSaldo.create({
          data: { ...data, referencia: nuevaReferenciaRecarga() },
        });
      } catch (e) {
        if (!esUnicoDuplicado(e)) throw e;
      }
    }
    throw new Error('No se pudo generar una referencia de recarga única.');
  }
}
