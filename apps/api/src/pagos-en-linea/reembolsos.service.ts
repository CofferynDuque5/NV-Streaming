import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient, Reembolso } from '@nv/db';
import { formatearMonto, type ReembolsoResumen } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import { alcanceClientes } from '../comun/alcance.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp, Errores } from '../comun/errores.js';
import { esUnicoDuplicado, numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';
import { CERO, D } from '../dinero/dinero.js';
import type { ResultadoReembolso } from './adaptador.js';
import { INCLUIR_REEMBOLSO, reembolsoResumen } from './presentacion.js';
import { RegistroPasarelas } from './registro.service.js';

type Tx = Prisma.TransactionClient;

/** Clave de idempotencia válida que puede enviar la web (cabecera Idempotency-Key). */
const CLAVE_VALIDA = /^[A-Za-z0-9._:-]{8,100}$/;

/**
 * Devoluciones de pagos en línea a través de su pasarela, totales o parciales,
 * nunca por encima de lo recibido (se reserva el monto bajo bloqueo del pago
 * antes de llamar a la pasarela). La suscripción NO se cancela sola: si
 * corresponde, el equipo la cancela aparte.
 */
@Injectable()
export class ReembolsosService {
  private readonly logger = new Logger('Reembolsos');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  async listar(auth: ContextoAuth, pagoId: string): Promise<ReembolsoResumen[]> {
    await this.visible(auth, pagoId);
    const filas = await this.prisma.reembolso.findMany({
      where: { pagoId },
      include: INCLUIR_REEMBOLSO,
      orderBy: { creadoEn: 'desc' },
    });
    return filas.map(reembolsoResumen);
  }

  async solicitar(
    auth: ContextoAuth,
    pagoId: string,
    e: { monto?: string | undefined; motivo: string },
    claveCliente: string | undefined,
    cliente: InfoCliente,
  ): Promise<ReembolsoResumen> {
    await this.visible(auth, pagoId);
    if (claveCliente !== undefined && !CLAVE_VALIDA.test(claveCliente)) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'La clave de idempotencia no es válida.');
    }
    const clave = `reembolso:${pagoId}:${claveCliente ?? randomUUID()}`;
    const previo = await this.prisma.reembolso.findUnique({ where: { claveIdempotencia: clave } });
    if (previo) {
      if (previo.pagoId !== pagoId) throw Errores.noEncontrado('El pago');
      return this.continuar(previo.id, cliente);
    }
    // 1) Reserva el monto bajo el bloqueo del pago: nunca más de lo recibido.
    let reembolso: Reembolso;
    try {
      reembolso = await this.prisma.$transaction(async (tx) => {
        const p = await this.bloquearPago(tx, pagoId);
        // Doble envío con la misma clave: el segundo espera al primero y lo reutiliza.
        const mismo = await tx.reembolso.findUnique({ where: { claveIdempotencia: clave } });
        if (mismo) return mismo;
        if (p.origen !== 'pasarela' || !p.pasarela || !p.idExterno) {
          throw new ErrorApp(
            409,
            'REEMBOLSO_NO_PERMITIDO',
            'Solo se devuelven por aquí los pagos en línea. Un pago manual se devuelve por el mismo medio en que llegó.',
          );
        }
        if (!p.montoRecibido || p.estado === 'reembolsado') {
          throw new ErrorApp(
            409,
            'REEMBOLSO_NO_PERMITIDO',
            'Este pago ya no tiene nada que devolver.',
          );
        }
        const enCurso = await tx.reembolso.count({ where: { pagoId, estado: 'solicitado' } });
        if (enCurso > 0) {
          throw new ErrorApp(
            409,
            'REEMBOLSO_EN_CURSO',
            'Ya hay una devolución de este pago en curso. Espera a que termine.',
          );
        }
        const disponible = p.montoRecibido.sub(p.montoReembolsado);
        const monto = e.monto ? D(e.monto) : disponible;
        if (monto.lte(CERO)) {
          throw new ErrorApp(400, 'DATOS_INVALIDOS', 'El importe debe ser mayor que cero.', {
            monto: ['El importe debe ser mayor que cero.'],
          });
        }
        if (monto.gt(disponible)) {
          const max = formatearMonto(disponible.toFixed(2), p.moneda);
          throw new ErrorApp(409, 'REEMBOLSO_EXCEDE', `Como máximo puedes devolver ${max}.`, {
            monto: [`Como máximo ${max}.`],
          });
        }
        const r = await tx.reembolso.create({
          data: {
            pagoId,
            monto,
            moneda: p.moneda,
            motivo: e.motivo,
            claveIdempotencia: clave,
            solicitadoPorId: auth.usuario.id,
          },
        });
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'reembolso.solicitado',
            entidad: 'reembolso',
            entidadId: r.id,
            despues: {
              pagoId,
              monto: monto.toFixed(2),
              moneda: p.moneda,
              motivo: e.motivo,
              pasarela: p.pasarela,
            },
            cliente,
          },
          tx,
        );
        return r;
      });
    } catch (err) {
      if (!esUnicoDuplicado(err)) throw err;
      const otro = await this.prisma.reembolso.findUniqueOrThrow({
        where: { claveIdempotencia: clave },
      });
      return this.continuar(otro.id, cliente);
    }
    return this.continuar(reembolso.id, cliente);
  }

  /** Pide (o vuelve a pedir, con la misma clave) la devolución a la pasarela y aplica el resultado. */
  private async continuar(reembolsoId: string, cliente?: InfoCliente): Promise<ReembolsoResumen> {
    const r = await this.prisma.reembolso.findUniqueOrThrow({
      where: { id: reembolsoId },
      include: { pago: true },
    });
    if (r.estado === 'solicitado') {
      let resultado: ResultadoReembolso;
      try {
        resultado = await this.registro
          .exigir(r.pago.pasarela ?? '')
          .reembolsar(r.pago.idExterno ?? '', r.monto.toFixed(2), r.moneda, r.claveIdempotencia);
      } catch (e) {
        this.logger.warn(`La pasarela no respondió a la devolución ${r.id}: ${String(e)}`);
        await this.prisma.reembolso.update({
          where: { id: r.id },
          data: { error: 'La pasarela no respondió; se reintentará con la misma clave.' },
        });
        throw new ErrorApp(
          503,
          'PASARELA_NO_RESPONDE',
          'La pasarela no respondió. Vuelve a intentarlo: no se devolverá dos veces.',
        );
      }
      await this.aplicar(r.id, resultado, cliente);
    }
    const fila = await this.prisma.reembolso.findUniqueOrThrow({
      where: { id: reembolsoId },
      include: INCLUIR_REEMBOLSO,
    });
    return reembolsoResumen(fila);
  }

  /** Webhook "reembolso completado" (para pasarelas que devuelven de forma asíncrona). */
  async completarPorIdExterno(pasarela: string, idReembolso: string): Promise<boolean> {
    const r = await this.prisma.reembolso.findFirst({
      where: { idExterno: idReembolso, pago: { pasarela } },
    });
    if (!r) return false;
    if (r.estado === 'solicitado') {
      await this.aplicar(r.id, { estado: 'completado', idReembolso });
    }
    return true;
  }

  private async aplicar(
    reembolsoId: string,
    resultado: ResultadoReembolso,
    cliente?: InfoCliente,
  ): Promise<void> {
    const completado = await this.prisma.$transaction(async (tx) => {
      const r0 = await tx.reembolso.findUniqueOrThrow({ where: { id: reembolsoId } });
      const p = await this.bloquearPago(tx, r0.pagoId);
      const r = await tx.reembolso.findUniqueOrThrow({ where: { id: reembolsoId } });
      if (r.estado !== 'solicitado') return false;
      if (resultado.estado === 'pendiente') {
        await tx.reembolso.update({
          where: { id: r.id },
          data: { idExterno: resultado.idReembolso, error: null },
        });
        return false;
      }
      if (resultado.estado === 'fallido') {
        const error = resultado.mensaje ?? 'La pasarela rechazó la devolución.';
        await tx.reembolso.update({
          where: { id: r.id },
          data: { estado: 'fallido', idExterno: resultado.idReembolso, error: error.slice(0, 500) },
        });
        await this.auditoria.registrar(
          {
            actorTipo: 'sistema',
            accion: 'reembolso.fallido',
            entidad: 'reembolso',
            entidadId: r.id,
            despues: { pagoId: p.id, monto: r.monto.toFixed(2), error },
            ...(cliente ? { cliente } : {}),
          },
          tx,
        );
        return false;
      }
      const total = p.montoReembolsado.add(r.monto);
      const recibido = p.montoRecibido ?? CERO;
      const completo = total.gte(recibido);
      await tx.reembolso.update({
        where: { id: r.id },
        data: {
          estado: 'completado',
          idExterno: resultado.idReembolso,
          error: null,
          completadoEn: new Date(),
        },
      });
      await tx.pago.update({
        where: { id: p.id },
        data: { montoReembolsado: total, ...(completo ? { estado: 'reembolsado' } : {}) },
      });
      await this.auditoria.registrar(
        {
          actorTipo: 'sistema',
          accion: 'reembolso.completado',
          entidad: 'reembolso',
          entidadId: r.id,
          antes: { estadoPago: p.estado, montoReembolsado: p.montoReembolsado.toFixed(2) },
          despues: {
            pagoId: p.id,
            monto: r.monto.toFixed(2),
            moneda: r.moneda,
            montoReembolsado: total.toFixed(2),
            estadoPago: completo ? 'reembolsado' : p.estado,
            idExterno: resultado.idReembolso,
          },
          ...(cliente ? { cliente } : {}),
        },
        tx,
      );
      return true;
    });
    if (completado) await this.avisarCliente(reembolsoId);
  }

  private async avisarCliente(reembolsoId: string): Promise<void> {
    try {
      const r = await this.prisma.reembolso.findUniqueOrThrow({
        where: { id: reembolsoId },
        include: { pago: { include: { factura: { select: { id: true, numero: true } } } } },
      });
      const monto = formatearMonto(r.monto.toFixed(2), r.moneda);
      const numero = numeroFactura(r.pago.factura.numero);
      const url = this.correo.urlWeb(`/cuenta/facturas/${r.pago.factura.id}`);
      await this.avisos.avisar({
        plantilla: 'reembolsoRealizado',
        destinatario: { clienteId: r.pago.clienteId },
        claveUnica: `reembolso:${r.id}`,
        automatizacion: null,
        entidad: { tipo: 'pago', id: r.pagoId },
        contenido: (nombre) => ({
          correo: Plantillas.reembolsoRealizado(nombre, numero, monto, url),
        }),
      });
    } catch (e) {
      this.logger.warn(`Aviso de la devolución ${reembolsoId} no enviado: ${String(e)}`);
    }
  }

  private async visible(auth: ContextoAuth, pagoId: string): Promise<void> {
    const p = await this.prisma.pago.findFirst({
      where: { id: pagoId, cliente: alcanceClientes(auth) },
      select: { id: true },
    });
    if (!p) throw Errores.noEncontrado('El pago');
  }

  private async bloquearPago(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM pagos WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.pago.findUniqueOrThrow({ where: { id } });
  }
}
