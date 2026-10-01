import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  actualizarAutomatizacionSchema,
  avisoPruebaSchema,
  filtroNotificacionesSchema,
  preferenciasAvisosSchema,
  probarTasaSchema,
  TIPOS_AUTOMATIZACION,
} from '@nv/shared';
import { z } from 'zod';
import { ClientesService } from '../clientes/clientes.service.js';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { PanelAutomatizacionesService } from './panel.service.js';

const tipoValido = validar(z.enum(TIPOS_AUTOMATIZACION, { error: 'Automatización desconocida.' }));
const paginaSchema = z.object({
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

@ApiTags('Automatizaciones')
@Controller('automatizaciones')
export class AutomatizacionesController {
  constructor(
    @Inject(PanelAutomatizacionesService) private readonly panel: PanelAutomatizacionesService,
  ) {}

  @Get()
  @RequierePermiso('automatizaciones.ver')
  listar() {
    return this.panel.panel();
  }

  /** Consulta la fuente de la tasa sin guardar nada. */
  @Post('tasa/probar')
  @RequierePermiso('automatizaciones.configurar')
  @HttpCode(200)
  @DocCuerpo(probarTasaSchema)
  probarTasa(
    @Auth() auth: ContextoAuth,
    @Body(validar(probarTasaSchema)) cuerpo: z.output<typeof probarTasaSchema>,
  ) {
    return this.panel.probarTasa(auth, cuerpo.fuente);
  }

  @Patch(':tipo')
  @RequierePermiso('automatizaciones.configurar')
  @DocCuerpo(actualizarAutomatizacionSchema)
  actualizar(
    @Auth() auth: ContextoAuth,
    @Param('tipo', tipoValido) tipo: (typeof TIPOS_AUTOMATIZACION)[number],
    @Body(validar(actualizarAutomatizacionSchema))
    cuerpo: z.output<typeof actualizarAutomatizacionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.panel.actualizar(auth, tipo, cuerpo, cliente);
  }

  /** "Ejecutar ahora": encola una ejecución manual (202). Solo las programadas. */
  @Post(':tipo/ejecutar')
  @RequierePermiso('automatizaciones.configurar')
  @HttpCode(202)
  ejecutar(
    @Auth() auth: ContextoAuth,
    @Param('tipo', tipoValido) tipo: (typeof TIPOS_AUTOMATIZACION)[number],
    @Cliente() cliente: InfoCliente,
  ) {
    return this.panel.ejecutarAhora(auth, tipo, cliente);
  }

  @Get(':tipo/ejecuciones')
  @RequierePermiso('automatizaciones.ver')
  @DocConsulta(paginaSchema)
  ejecuciones(
    @Param('tipo', tipoValido) tipo: (typeof TIPOS_AUTOMATIZACION)[number],
    @Query(validar(paginaSchema)) q: z.output<typeof paginaSchema>,
  ) {
    return this.panel.ejecuciones(tipo, q.pagina);
  }
}

@ApiTags('Automatizaciones')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    @Inject(PanelAutomatizacionesService) private readonly panel: PanelAutomatizacionesService,
  ) {}

  /** Avisos enviados, omitidos y fallidos. Los destinos se muestran parcialmente ocultos. */
  @Get()
  @RequierePermiso('automatizaciones.ver')
  @DocConsulta(filtroNotificacionesSchema)
  listar(
    @Query(validar(filtroNotificacionesSchema)) f: z.output<typeof filtroNotificacionesSchema>,
  ) {
    return this.panel.notificaciones(f);
  }

  @Post('prueba')
  @RequierePermiso('automatizaciones.configurar')
  @HttpCode(200)
  @DocCuerpo(avisoPruebaSchema)
  prueba(
    @Auth() auth: ContextoAuth,
    @Body(validar(avisoPruebaSchema)) cuerpo: z.output<typeof avisoPruebaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.panel.enviarPrueba(auth, cuerpo, cliente);
  }
}

/**
 * Preferencias de avisos del cliente. Se publica en /autoservicio/preferencias
 * y, por coherencia con el resto del autoservicio, también en /mi/preferencias.
 */
@ApiTags('Autoservicio del cliente')
@Controller(['autoservicio', 'mi'])
export class PreferenciasAvisosController {
  constructor(@Inject(ClientesService) private readonly clientes: ClientesService) {}

  @Get('preferencias')
  @RequierePermiso('autoservicio.usar')
  async obtener(@Auth() auth: ContextoAuth) {
    const c = await this.clientes.deUsuario(auth.usuario);
    return { recibirRecordatorios: c.recibirRecordatorios };
  }

  @Put('preferencias')
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(preferenciasAvisosSchema)
  async guardar(
    @Auth() auth: ContextoAuth,
    @Body(validar(preferenciasAvisosSchema)) cuerpo: z.output<typeof preferenciasAvisosSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    const c = await this.clientes.deUsuario(auth.usuario);
    if (c.recibirRecordatorios !== cuerpo.recibirRecordatorios) {
      await this.clientes.guardarPreferenciasAvisos(c.id, cuerpo.recibirRecordatorios, {
        actorId: auth.usuario.id,
        antes: c.recibirRecordatorios,
        cliente,
      });
    }
    return { recibirRecordatorios: cuerpo.recibirRecordatorios };
  }
}
