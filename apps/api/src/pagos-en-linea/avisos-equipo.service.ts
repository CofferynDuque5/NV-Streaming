import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import { equipoConPermiso } from '../automatizaciones/recuento.js';
import { NotificacionesService } from '../avisos/notificaciones.service.js';
import { numeroFactura } from '../comun/formato.js';
import { PRISMA } from '../comun/tokens.js';
import { CorreoService } from '../correo/correo.service.js';
import { Plantillas } from '../correo/plantillas.js';

/** Avisos al equipo por pagos en línea que necesitan una persona. */
@Injectable()
export class AvisosEquipoPagosService {
  private readonly logger = new Logger('PagosEnLinea');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  /** Un pago en línea quedó en revisión (monto distinto, factura cerrada…). Nunca lanza. */
  async revision(pagoId: string, detalle: string): Promise<void> {
    try {
      const p = await this.prisma.pago.findUniqueOrThrow({
        where: { id: pagoId },
        include: { factura: { select: { numero: true } }, cliente: { select: { nombre: true } } },
      });
      const url = this.correo.urlWeb('/admin/cobros');
      const numero = numeroFactura(p.factura.numero);
      for (const u of await equipoConPermiso(this.prisma, 'pagos.gestionar')) {
        await this.avisos.avisar({
          plantilla: 'pagoEnLineaEnRevision',
          destinatario: { usuarioId: u.id },
          claveUnica: `pago_en_linea_revision:${pagoId}:${u.id}`,
          automatizacion: null,
          entidad: { tipo: 'pago', id: pagoId },
          contenido: (nombre) => ({
            correo: Plantillas.pagoEnLineaEnRevision(
              nombre,
              p.cliente.nombre,
              numero,
              detalle,
              url,
            ),
          }),
        });
      }
    } catch (e) {
      this.logger.warn(
        `Aviso de revisión del pago ${pagoId} no enviado: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** El cliente declaró un pago por Binance y no llegó el correo que lo confirme. Nunca lanza. */
  async binanceSinConfirmar(intentoId: string): Promise<void> {
    try {
      const i = await this.prisma.intentoPago.findUniqueOrThrow({
        where: { id: intentoId },
        include: { factura: { select: { numero: true } }, cliente: { select: { nombre: true } } },
      });
      const url = this.correo.urlWeb('/admin/finanzas');
      const numero = numeroFactura(i.factura.numero);
      for (const u of await equipoConPermiso(this.prisma, 'pagos.gestionar')) {
        await this.avisos.avisar({
          plantilla: 'binanceSinConfirmar',
          destinatario: { usuarioId: u.id },
          claveUnica: `binance_sin_confirmar:${intentoId}:${u.id}`,
          automatizacion: null,
          entidad: { tipo: 'intento_pago', id: intentoId },
          contenido: (nombre) => ({
            correo: Plantillas.binanceSinConfirmar(
              nombre,
              i.cliente.nombre,
              numero,
              i.pagadorDeclarado ?? '—',
              i.montoDeclarado?.toFixed(2) ?? '—',
              url,
            ),
          }),
        });
      }
    } catch (e) {
      this.logger.warn(
        `Aviso de Binance sin confirmar ${intentoId} no enviado: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** El cliente dijo que pagó por PayPal y no llegó el aviso que lo confirme. Nunca lanza. */
  async paypalSinConfirmar(intentoId: string): Promise<void> {
    try {
      const i = await this.prisma.intentoPago.findUniqueOrThrow({
        where: { id: intentoId },
        include: { factura: { select: { numero: true } }, cliente: { select: { nombre: true } } },
      });
      const url = this.correo.urlWeb('/admin/pagos-en-linea');
      const numero = numeroFactura(i.factura.numero);
      for (const u of await equipoConPermiso(this.prisma, 'pagos.gestionar')) {
        await this.avisos.avisar({
          plantilla: 'paypalSinConfirmar',
          destinatario: { usuarioId: u.id },
          claveUnica: `paypal_sin_confirmar:${intentoId}:${u.id}`,
          automatizacion: null,
          entidad: { tipo: 'intento_pago', id: intentoId },
          contenido: (nombre) => ({
            correo: Plantillas.paypalSinConfirmar(
              nombre,
              i.cliente.nombre,
              numero,
              i.pagadorDeclarado ?? '—',
              i.monto.toFixed(2),
              url,
              i.transaccionDeclarada,
            ),
          }),
        });
      }
    } catch (e) {
      this.logger.warn(
        `Aviso de PayPal sin confirmar ${intentoId} no enviado: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
