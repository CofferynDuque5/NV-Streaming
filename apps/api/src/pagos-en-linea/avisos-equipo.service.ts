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
}
