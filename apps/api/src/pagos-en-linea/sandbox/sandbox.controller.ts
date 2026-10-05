import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrismaClient } from '@nv/db';
import {
  type IntentoSandboxPublico,
  type ResultadoSimulacionSandbox,
  simularSandboxSchema,
  uuidSchema,
} from '@nv/shared';
import type { z } from 'zod';
import { Publica } from '../../comun/contexto.js';
import { DocCuerpo } from '../../comun/documentacion.js';
import { Errores } from '../../comun/errores.js';
import { PRISMA } from '../../comun/tokens.js';
import { validar } from '../../comun/zod.pipe.js';
import { CorreoService } from '../../correo/correo.service.js';
import { RegistroPasarelas } from '../registro.service.js';
import { WebhooksService } from '../webhooks.service.js';
import { AdaptadorSandbox } from './sandbox.adaptador.js';

const idValido = validar(uuidSchema);

/**
 * La "página de la pasarela" de pruebas (la dibuja la web en /pago-sandbox/<intento>).
 * Solo existe con PASARELA_SANDBOX_HABILITADA; si no, responde 404. Nunca mueve dinero.
 */
@ApiTags('Pagos en línea')
@Controller('pasarelas/sandbox')
export class SandboxController {
  private readonly logger = new Logger('Sandbox');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AdaptadorSandbox) private readonly sandbox: AdaptadorSandbox,
    @Inject(RegistroPasarelas) private readonly registro: RegistroPasarelas,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  @Get('intentos/:id')
  @Publica()
  async intento(@Param('id', idValido) id: string): Promise<IntentoSandboxPublico> {
    const { intento, orden } = await this.cargar(id);
    return {
      referencia: intento.referencia,
      monto: intento.monto.toFixed(2),
      moneda: intento.moneda,
      descripcion: orden.descripcion ?? `Pago ${intento.referencia}`,
      guardarMetodo: intento.guardarMetodo,
      estado: intento.estado,
    };
  }

  /** Quien prueba elige el resultado; la pasarela avisa por webhook (firmado) y devuelve al cliente. */
  @Post('intentos/:id/simular')
  @Publica()
  @HttpCode(200)
  @DocCuerpo(simularSandboxSchema)
  async simular(
    @Param('id', idValido) id: string,
    @Body(validar(simularSandboxSchema)) cuerpo: z.output<typeof simularSandboxSchema>,
  ): Promise<ResultadoSimulacionSandbox> {
    await this.cargar(id);
    const orden = await this.sandbox.simular(id, cuerpo.resultado);
    if (cuerpo.resultado !== 'cancelar') {
      // Como una pasarela real: además de devolver al cliente, envía un webhook firmado.
      const tipo = cuerpo.resultado === 'aprobar' ? 'orden.aprobada' : 'orden.rechazada';
      const texto = this.sandbox.cuerpoWebhook(tipo, orden.id);
      try {
        await this.webhooks.recibir('sandbox', this.sandbox.firmar(texto), Buffer.from(texto));
      } catch (e) {
        this.logger.warn(`Webhook de prueba no registrado: ${String(e)}`);
      }
    }
    const retorno = this.correo.urlWeb('/cuenta/pagos/retorno', { intento: id });
    return { urlRetorno: cuerpo.resultado === 'cancelar' ? `${retorno}&cancelado=1` : retorno };
  }

  private async cargar(id: string) {
    if (!this.registro.disponible('sandbox')) throw Errores.noEncontrado('El pago de prueba');
    const intento = await this.prisma.intentoPago.findUnique({ where: { id } });
    const orden = intento?.pasarela === 'sandbox' ? await this.sandbox.orden(id) : null;
    if (!intento || !orden) throw Errores.noEncontrado('El pago de prueba');
    return { intento, orden };
  }
}
