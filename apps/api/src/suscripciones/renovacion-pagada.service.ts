import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type { Moneda, RenovarPagadaEntrada } from '@nv/shared';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { DESFASE_CARACAS_MS } from '../automatizaciones/horario.js';
import { FacturacionService } from '../cobros/facturacion.service.js';
import { PagosService } from '../cobros/pagos.service.js';
import type { ContextoAuth, InfoCliente } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { exigirGestionDelCliente } from './canal-revendedor.js';
import { baseRenovacion, SuscripcionesService } from './suscripciones.service.js';

const DIA_MS = 24 * 3600_000;
/** Un mes promedio, para saber cuántos meses cobrar al renovar hasta una fecha. */
const MES_MS = 30.4375 * DIA_MS;

export interface ResultadoRenovacionPagada {
  factura: { id: string; numero: string; total: string; moneda: Moneda };
  venceEn: string;
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', mensaje, { [campo]: [mensaje] });

/**
 * «Renovar» desde Vencimientos y Cortes (como en el Gestor): en un paso emite la
 * factura de renovación por los meses elegidos, la deja pagada con el método
 * indicado (entra en Caja y Balance) y extiende el vencimiento. Con una fecha
 * exacta, la renovación termina ese día (se cobran los meses que cubre).
 * Si tenía una factura de renovación pendiente, se anula y la reemplaza esta.
 */
@Injectable()
export class RenovacionPagadaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(FacturacionService) private readonly facturacion: FacturacionService,
    @Inject(PagosService) private readonly pagos: PagosService,
    @Inject(SuscripcionesService) private readonly suscripciones: SuscripcionesService,
  ) {}

  async renovar(
    auth: ContextoAuth,
    id: string,
    e: RenovarPagadaEntrada,
    cliente: InfoCliente,
    ahora = new Date(),
  ): Promise<ResultadoRenovacionPagada> {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.suscripciones.bloquear(tx, auth, id);
      exigirGestionDelCliente(auth, s);
      const plan = await tx.plan.findUniqueOrThrow({
        where: { id: s.planId },
        select: { duracionCantidad: true, duracionUnidad: true },
      });
      const mensual = plan.duracionUnidad === 'mes';

      // Fecha exacta: termina ese día, a la misma hora (Caracas) que ya tenía.
      let fechaFinal: Date | null = null;
      let periodos: number;
      if (e.venceEn) {
        const [a, m, d] = e.venceEn.split('-').map(Number) as [number, number, number];
        const horaDelDia = s.venceEn
          ? (((s.venceEn.getTime() + DESFASE_CARACAS_MS) % DIA_MS) + DIA_MS) % DIA_MS
          : DIA_MS - 1000;
        fechaFinal = new Date(Date.UTC(a, m - 1, d) - DESFASE_CARACAS_MS + horaDelDia);
        if (fechaFinal <= ahora) {
          throw invalido('venceEn', 'La fecha nueva tiene que ser después de hoy.');
        }
        const base = baseRenovacion(
          s.venceEn,
          plan.duracionCantidad,
          plan.duracionUnidad,
          ahora,
          false,
        );
        const meses = Math.max(1, Math.round((fechaFinal.getTime() - base.getTime()) / MES_MS));
        periodos = mensual ? Math.max(1, Math.ceil(meses / plan.duracionCantidad)) : 1;
      } else {
        const meses = e.meses ?? 1;
        if (!mensual || meses % plan.duracionCantidad !== 0) {
          throw invalido(
            'meses',
            mensual
              ? `Este plan es de ${plan.duracionCantidad} meses: elige un múltiplo o una fecha.`
              : 'Este plan no es mensual: renuévalo hasta una fecha.',
          );
        }
        periodos = meses / plan.duracionCantidad;
      }

      // La renovación pendiente (p. ej. la que emitió el aviso automático) se reemplaza.
      const abierta = await tx.factura.findFirst({
        where: { suscripcionId: s.id, estado: 'emitida' },
      });
      if (abierta) {
        if (abierta.concepto !== 'renovacion') {
          throw new ErrorApp(
            409,
            'FACTURA_PENDIENTE',
            'Tiene la factura del alta sin pagar: regístrala primero.',
          );
        }
        const enRevision = await tx.pago.count({
          where: { facturaId: abierta.id, estado: 'en_revision' },
        });
        if (enRevision > 0) {
          throw new ErrorApp(
            409,
            'PAGO_EN_REVISION',
            'Esa factura tiene un pago en revisión: confírmalo o recházalo en Pagos.',
          );
        }
        const motivo = 'Reemplazada por la renovación pagada desde Vencimientos';
        await tx.factura.update({
          where: { id: abierta.id },
          data: {
            estado: 'anulada',
            anuladaEn: ahora,
            motivoAnulacion: motivo,
            anuladaPorId: auth.usuario.id,
          },
        });
        await this.facturacion.liberarCupon(tx, abierta.id);
        await this.auditoria.registrar(
          {
            actorId: auth.usuario.id,
            accion: 'factura.anulada',
            entidad: 'factura',
            entidadId: abierta.id,
            antes: { estado: 'emitida', total: abierta.total.toFixed(2), moneda: abierta.moneda },
            despues: { estado: 'anulada', motivo },
            cliente,
          },
          tx,
        );
      }

      const factura = await this.suscripciones.facturarRenovacion(
        tx,
        s,
        s.moneda,
        auth.usuario.id,
        cliente,
        { periodos, desdeHoy: false },
      );
      if (factura.estado === 'emitida') {
        await this.pagos.registrarCobrado(
          tx,
          auth.usuario.id,
          factura,
          { metodoCobroId: e.metodoCobroId, referenciaExterna: e.referenciaExterna },
          cliente,
          'renovacion_pagada',
        );
      }
      await this.suscripciones.aplicarPago(tx, factura, auth.usuario.id);

      let venceEn = (await tx.suscripcion.findUniqueOrThrow({ where: { id: s.id } })).venceEn;
      if (fechaFinal && venceEn?.getTime() !== fechaFinal.getTime()) {
        await tx.suscripcion.update({
          where: { id: s.id },
          data: { venceEn: fechaFinal, estado: 'activa' },
        });
        await this.suscripciones.evento(
          tx,
          s.id,
          'ajuste_vencimiento',
          auth.usuario.id,
          'Renovada hasta una fecha exacta',
          { venceAntes: venceEn?.toISOString() ?? null, venceEn: fechaFinal.toISOString() },
        );
        venceEn = fechaFinal;
      }
      await this.auditoria.registrar(
        {
          actorId: auth.usuario.id,
          accion: 'suscripcion.renovada_pagada',
          entidad: 'suscripcion',
          entidadId: s.id,
          antes: { estado: s.estado, venceEn: s.venceEn?.toISOString() ?? null },
          despues: {
            estado: 'activa',
            venceEn: venceEn?.toISOString() ?? null,
            facturaId: factura.id,
            periodos,
            ...(e.venceEn ? { fechaExacta: e.venceEn } : { meses: e.meses }),
            facturaReemplazada: abierta?.id ?? null,
          },
          cliente,
        },
        tx,
      );
      return {
        factura: {
          id: factura.id,
          numero: numeroFactura(factura.numero),
          total: factura.total.toFixed(2),
          moneda: factura.moneda,
        },
        venceEn: (venceEn ?? ahora).toISOString(),
      };
    });
  }
}
