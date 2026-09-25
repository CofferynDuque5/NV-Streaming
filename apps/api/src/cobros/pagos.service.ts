import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Factura, Pago, Prisma, PrismaClient } from '@nv/db';
import {
  type ConfirmarPagoEntrada,
  formatearMonto,
  type ListarPagosEntrada,
  type Pagina,
  type PagoPublico,
  type RegistrarPagoEntrada,
  type ReportarPagoEntrada,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { D } from '../dinero/dinero.js';
import { LimitesService } from '../limites/limites.service.js';
import { SuscripcionesService } from '../suscripciones/suscripciones.service.js';
import { FacturasService } from './facturas.service.js';
import { INCLUIR_PAGO, pagoPublico } from './presentacion.js';

type Tx = Prisma.TransactionClient;

/** Sin 0/O ni 1/I/L, para que se pueda dictar por teléfono. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function nuevaReferencia(): string {
  let r = 'P-';
  for (let i = 0; i < 8; i += 1) r += ALFABETO[randomInt(ALFABETO.length)];
  return r;
}

/** Límite de pagos reportados por cliente y hora (evita llenar el almacén de archivos). */
const LIMITE_REPORTES = { maximo: 10, ventanaSegundos: 3600 };

/**
 * Pagos manuales: el cliente reporta un pago con su comprobante y el equipo lo
 * concilia (confirma o rechaza). Confirmar paga la factura y activa o renueva
 * la suscripción en la misma transacción.
 */
@Injectable()
export class PagosService {
  private readonly logger = new Logger('Pagos');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
    @Inject(FacturasService) private readonly facturas: FacturasService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
    @Inject(LimitesService) private readonly limites: LimitesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  async listar(auth: ContextoAuth, filtro: ListarPagosEntrada): Promise<Pagina<PagoPublico>> {
    const where: Prisma.PagoWhereInput = {
      cliente: alcanceClientes(auth),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
    };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.pago.count({ where }),
      this.prisma.pago.findMany({
        where,
        include: INCLUIR_PAGO,
        // La cola de conciliación atiende primero lo más antiguo.
        orderBy: filtro.estado === 'en_revision' ? [{ creadoEn: 'asc' }] : [{ creadoEn: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.porPagina,
        take: filtro.porPagina,
      }),
    ]);
    const equipo = auth.usuario.rol !== 'cliente';
    return {
      elementos: filas.map((p) => pagoPublico(p, equipo)),
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
    };
  }

  /** El cliente reporta que pagó una factura. Queda en revisión. */
  async reportar(
    auth: ContextoAuth,
    facturaId: string,
    e: ReportarPagoEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<PagoPublico> {
    if (!archivo) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Adjunta el comprobante del pago.', {
        comprobante: ['Adjunta el comprobante del pago (foto o PDF).'],
      });
    }
    await this.limites.consumir(`pago:reporte:${auth.usuario.id}`, LIMITE_REPORTES);
    return this.crear(auth, facturaId, e, archivo, cliente, false);
  }

  /** El equipo registra un pago que ya recibió: queda confirmado. */
  async registrar(
    auth: ContextoAuth,
    facturaId: string,
    e: RegistrarPagoEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
  ): Promise<PagoPublico> {
    return this.crear(auth, facturaId, e, archivo, cliente, true);
  }

  async confirmar(
    auth: ContextoAuth,
    id: string,
    e: ConfirmarPagoEntrada,
    cliente: InfoCliente,
  ): Promise<PagoPublico> {
    const pago = await this.prisma.$transaction(async (tx) => {
      const p = await this.bloquearEnRevision(tx, id);
      const factura = await tx.factura.findUniqueOrThrow({ where: { id: p.facturaId } });
      const recibido = D(e.montoRecibido);
      await this.cerrarFactura(
        tx,
        auth.usuario.id,
        factura,
        recibido,
        p.id,
        e.notas ?? null,
        cliente,
      );
      return p;
    });
    await this.avisar(pago.id, 'confirmado');
    return this.obtener(auth, pago.id);
  }

  async rechazar(auth: ContextoAuth, id: string, motivo: string, cliente: InfoCliente) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.bloquearEnRevision(tx, id);
      await tx.pago.update({
        where: { id },
        data: {
          estado: 'rechazado',
          motivoRechazo: motivo,
          revisadoPorId: auth.usuario.id,
          revisadoEn: new Date(),
        },
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'pago.rechazado',
          entidad: 'pago',
          entidadId: id,
          antes: { estado: p.estado },
          despues: { estado: 'rechazado', motivo },
          cliente,
        },
        tx,
      );
    });
    await this.avisar(id, 'rechazado');
    return this.obtener(auth, id);
  }

  async obtener(auth: ContextoAuth, id: string): Promise<PagoPublico> {
    const p = await this.prisma.pago.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: INCLUIR_PAGO,
    });
    if (!p) throw Errores.noEncontrado('El pago');
    return pagoPublico(p, auth.usuario.rol !== 'cliente');
  }

  async comprobante(auth: ContextoAuth, id: string, cliente: InfoCliente) {
    const p = await this.prisma.pago.findFirst({
      where: { id, cliente: alcanceClientes(auth) },
      include: { comprobante: true },
    });
    if (!p?.comprobante) throw Errores.noEncontrado('El comprobante');
    const contenido = await this.almacen.leer(p.comprobante);
    if (auth.usuario.rol !== 'cliente') {
      await this.auditoria.registrar({
        actorId: auth.usuario.id,
        accion: 'pago.comprobante_consultado',
        entidad: 'pago',
        entidadId: id,
        cliente,
      });
    }
    return { archivo: p.comprobante, contenido };
  }

  private async crear(
    auth: ContextoAuth,
    facturaId: string,
    e: ReportarPagoEntrada | RegistrarPagoEntrada,
    archivo: ArchivoRecibido | null,
    cliente: InfoCliente,
    confirmarYa: boolean,
  ): Promise<PagoPublico> {
    const creado = await this.prisma.$transaction(async (tx) => {
      const factura = await this.facturas.bloquear(tx, auth, facturaId);
      if (factura.estado !== 'emitida') {
        throw new ErrorApp(409, 'FACTURA_CERRADA', 'Esta factura ya no está pendiente de pago.');
      }
      const metodo = await tx.metodoCobro.findUnique({ where: { id: e.metodoCobroId } });
      if (!metodo || !metodo.activo) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige un método de pago disponible.', {
          metodoCobroId: ['Elige un método de pago disponible.'],
        });
      }
      if (metodo.tipo === 'pasarela') {
        // Los pagos en línea los registra la pasarela, nunca un reporte manual.
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'Ese método es de pago en línea: paga desde la factura con "Pagar en línea".',
          { metodoCobroId: ['Elige un método de pago manual.'] },
        );
      }
      if (metodo.moneda !== factura.moneda) {
        throw new ErrorApp(
          400,
          'DATOS_INVALIDOS',
          'Ese método no cobra en la moneda de la factura.',
          {
            metodoCobroId: [`Elige un método que cobre en ${factura.moneda}.`],
          },
        );
      }
      if (metodo.requiereReferencia && !e.referenciaExterna) {
        throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Escribe el número de referencia del pago.', {
          referenciaExterna: [
            'Escribe el número de referencia que te dio el banco o la billetera.',
          ],
        });
      }
      const enRevision = await tx.pago.count({ where: { facturaId, estado: 'en_revision' } });
      if (enRevision > 0) {
        throw new ErrorApp(
          409,
          'PAGO_EN_REVISION',
          'Ya hay un pago de esta factura en revisión. Espera a que lo confirmemos.',
        );
      }
      if (e.referenciaExterna) await this.exigirReferenciaNueva(tx, metodo.id, e.referenciaExterna);
      const comprobante = archivo ? await this.almacen.guardar(tx, archivo, auth.usuario.id) : null;
      const monto = D(e.monto);
      const pago = await this.insertarConReferencia(tx, {
        facturaId,
        clienteId: factura.clienteId,
        metodoCobroId: metodo.id,
        moneda: factura.moneda,
        montoDeclarado: monto,
        referenciaExterna: e.referenciaExterna ?? null,
        fechaPago: e.fechaPago,
        comprobanteId: comprobante?.id ?? null,
        creadoPorId: auth.usuario.id,
      });
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: confirmarYa ? 'pago.registrado' : 'pago.reportado',
          entidad: 'pago',
          entidadId: pago.id,
          despues: {
            referencia: pago.referencia,
            facturaId,
            monto: monto.toFixed(2),
            moneda: factura.moneda,
            metodo: metodo.nombre,
            comprobante: comprobante ? comprobante.sha256 : null,
          },
          cliente,
        },
        tx,
      );
      if (confirmarYa) {
        const notas = 'notas' in e ? (e.notas ?? null) : null;
        await this.cerrarFactura(tx, auth.usuario.id, factura, monto, pago.id, notas, cliente);
      }
      return pago;
    });
    if (confirmarYa) await this.avisar(creado.id, 'confirmado');
    return this.obtener(auth, creado.id);
  }

  /**
   * Registra un pago cobrado por una pasarela, dentro de la transacción de quien
   * llama (que ya bloqueó su intento o cobro). Si `revision` es nulo, lo confirma
   * con el MISMO camino que una conciliación manual (factura pagada, suscripción
   * activada o renovada, auditoría); si no, lo deja en revisión con ese motivo
   * para que el equipo lo concilie o lo devuelva.
   */
  async registrarDePasarela(
    tx: Tx,
    e: {
      facturaId: string;
      metodoCobroId: string;
      pasarela: string;
      idCobro: string;
      moneda: Factura['moneda'];
      montoDeclarado: Prisma.Decimal;
      recibido: Prisma.Decimal;
      revision: string | null;
      /** Usuario que la originó (el cliente en su pago en línea); nulo = el sistema. */
      creadoPorId: string | null;
      cliente?: InfoCliente;
    },
  ): Promise<Pago> {
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${e.facturaId}::uuid FOR UPDATE`;
    const factura = await tx.factura.findUniqueOrThrow({ where: { id: e.facturaId } });
    const ahora = new Date();
    const pago = await this.insertarConReferencia(tx, {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      metodoCobroId: e.metodoCobroId,
      moneda: e.moneda,
      montoDeclarado: e.montoDeclarado,
      montoRecibido: e.recibido,
      referenciaExterna: e.idCobro.slice(0, 80),
      fechaPago: ahora,
      origen: 'pasarela',
      pasarela: e.pasarela,
      idExterno: e.idCobro,
      notasConciliacion: e.revision?.slice(0, 500) ?? null,
      creadoPorId: e.creadoPorId,
    });
    await this.auditoria.registrar(
      {
        actorTipo: 'sistema',
        accion: e.revision ? 'pago.en_linea_en_revision' : 'pago.en_linea_recibido',
        entidad: 'pago',
        entidadId: pago.id,
        despues: {
          referencia: pago.referencia,
          facturaId: factura.id,
          pasarela: e.pasarela,
          idCobro: e.idCobro,
          recibido: e.recibido.toFixed(2),
          moneda: e.moneda,
          ...(e.revision ? { revision: e.revision } : {}),
        },
        ...(e.cliente ? { cliente: e.cliente } : {}),
      },
      tx,
    );
    if (!e.revision) {
      await this.cerrarFactura(tx, null, factura, e.recibido, pago.id, null, e.cliente);
    }
    return tx.pago.findUniqueOrThrow({ where: { id: pago.id } });
  }

  /** Confirma el pago, marca la factura pagada y aplica el pago a la suscripción. */
  private async cerrarFactura(
    tx: Tx,
    actorId: string | null,
    factura: Factura,
    recibido: Prisma.Decimal,
    pagoId: string,
    notas: string | null,
    cliente: InfoCliente | undefined,
  ) {
    await tx.$queryRaw`SELECT id FROM facturas WHERE id = ${factura.id}::uuid FOR UPDATE`;
    const actual = await tx.factura.findUniqueOrThrow({ where: { id: factura.id } });
    if (actual.estado !== 'emitida') {
      throw new ErrorApp(409, 'FACTURA_CERRADA', 'La factura ya no está pendiente de pago.');
    }
    if (recibido.lt(actual.total)) {
      throw new ErrorApp(
        409,
        'MONTO_INSUFICIENTE',
        `Lo recibido no cubre la factura (${formatearMonto(actual.total.toFixed(2), actual.moneda)}). Recházalo indicando la diferencia.`,
        { montoRecibido: ['Es menor que el total de la factura.'] },
      );
    }
    const diferencia = recibido.sub(actual.total);
    const ahora = new Date();
    await tx.pago.update({
      where: { id: pagoId },
      data: {
        estado: 'confirmado',
        montoRecibido: recibido,
        notasConciliacion: notas,
        revisadoPorId: actorId,
        revisadoEn: ahora,
      },
    });
    await tx.factura.update({
      where: { id: actual.id },
      data: { estado: 'pagada', pagadaEn: ahora },
    });
    await this.suscripciones.aplicarPago(tx, actual, actorId);
    await this.auditoria.registrar(
      {
        actorId,
        accion: 'pago.confirmado',
        entidad: 'pago',
        entidadId: pagoId,
        despues: {
          facturaId: actual.id,
          total: actual.total.toFixed(2),
          recibido: recibido.toFixed(2),
          diferencia: diferencia.toFixed(2),
          moneda: actual.moneda,
          notas,
        },
        ...(cliente ? { cliente } : {}),
      },
      tx,
    );
  }

  private async bloquearEnRevision(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM pagos WHERE id = ${id}::uuid FOR UPDATE`;
    const p = await tx.pago.findUnique({ where: { id } });
    if (!p) throw Errores.noEncontrado('El pago');
    if (p.estado !== 'en_revision') {
      throw new ErrorApp(409, 'PAGO_YA_REVISADO', 'Este pago ya se revisó.');
    }
    return p;
  }

  /** La misma referencia bancaria no puede usarse dos veces en el mismo método. */
  private async exigirReferenciaNueva(tx: Tx, metodoCobroId: string, referencia: string) {
    const repetido = await tx.pago.findFirst({
      where: {
        metodoCobroId,
        referenciaExterna: { equals: referencia, mode: 'insensitive' },
        estado: { in: ['en_revision', 'confirmado'] },
      },
      select: { id: true },
    });
    if (repetido) {
      throw new ErrorApp(409, 'REFERENCIA_REPETIDA', 'Esa referencia ya se reportó en otro pago.', {
        referenciaExterna: ['Esa referencia ya se reportó en otro pago.'],
      });
    }
  }

  private async insertarConReferencia(
    tx: Tx,
    data: Omit<Prisma.PagoUncheckedCreateInput, 'referencia'>,
  ) {
    for (let intento = 0; intento < 5; intento += 1) {
      try {
        return await tx.pago.create({ data: { ...data, referencia: nuevaReferencia() } });
      } catch (e) {
        if (!esUnicoDuplicado(e)) throw e;
      }
    }
    throw new Error('No se pudo generar una referencia de pago única.');
  }

  /** Aviso al cliente de un pago confirmado o rechazado. Nunca lanza. */
  async avisar(pagoId: string, resultado: 'confirmado' | 'rechazado') {
    try {
      const p = await this.prisma.pago.findUniqueOrThrow({
        where: { id: pagoId },
        include: { factura: true, cliente: { include: { usuario: true } } },
      });
      const destino = p.cliente.usuario?.correo ?? p.cliente.correo;
      if (!destino) return;
      const numero = numeroFactura(p.factura.numero);
      if (resultado === 'confirmado') {
        await this.correo.enviar(
          destino,
          'pagoConfirmado',
          Plantillas.pagoConfirmado(
            p.cliente.nombre,
            numero,
            formatearMonto((p.montoRecibido ?? p.montoDeclarado).toFixed(2), p.moneda),
            this.correo.urlWeb('/cuenta'),
          ),
        );
      } else {
        await this.correo.enviar(
          destino,
          'pagoRechazado',
          Plantillas.pagoRechazado(
            p.cliente.nombre,
            numero,
            p.motivoRechazo ?? '',
            this.correo.urlWeb(`/cuenta/facturas/${p.facturaId}`),
          ),
        );
      }
    } catch (e) {
      // El aviso no debe deshacer una conciliación ya guardada.
      this.logger.warn({ err: e, pagoId }, 'No se pudo enviar el aviso de pago');
    }
  }
}
