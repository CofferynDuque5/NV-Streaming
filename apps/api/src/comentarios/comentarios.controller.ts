import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { comentarioServicioSchema, moderarComentarioSchema, uuidSchema } from '@nv/shared';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocCuerpo } from '../comun/documentacion.js';
import { validar } from '../comun/zod.pipe.js';
import { ComentariosService } from './comentarios.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Comentarios: público')
@Controller('sitio/publico/servicios')
export class ComentariosPublicosController {
  constructor(@Inject(ComentariosService) private readonly comentarios: ComentariosService) {}

  /** Comentarios visibles de un servicio, con el promedio de estrellas. */
  @Get(':id/comentarios')
  @Publica()
  listar(@Param('id', idValido) id: string) {
    return this.comentarios.deServicio(id);
  }
}

@ApiTags('Comentarios: cliente')
@Controller('mi/comentarios')
export class MisComentariosController {
  constructor(@Inject(ComentariosService) private readonly comentarios: ComentariosService) {}

  /** Los comentarios del servicio marcando los propios (para poder borrarlos). */
  @Get(':servicioId')
  @RequierePermiso('autoservicio.usar')
  listar(@Auth() auth: ContextoAuth, @Param('servicioId', idValido) servicioId: string) {
    return this.comentarios.deServicio(servicioId, auth.usuario.id);
  }

  @Post()
  @RequierePermiso('autoservicio.usar')
  @DocCuerpo(comentarioServicioSchema)
  comentar(
    @Auth() auth: ContextoAuth,
    @Body(validar(comentarioServicioSchema)) cuerpo: z.output<typeof comentarioServicioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.comentarios.comentar(auth, cuerpo, cliente);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequierePermiso('autoservicio.usar')
  borrar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.comentarios.borrarPropio(auth, id, cliente);
  }
}

@ApiTags('Comentarios: moderación')
@Controller('catalogo')
export class ModerarComentariosController {
  constructor(@Inject(ComentariosService) private readonly comentarios: ComentariosService) {}

  @Get('servicios/:id/comentarios')
  @RequierePermiso('catalogo.gestionar')
  listar(@Param('id', idValido) id: string) {
    return this.comentarios.equipo(id);
  }

  @Patch('comentarios/:id')
  @HttpCode(204)
  @RequierePermiso('catalogo.gestionar')
  @DocCuerpo(moderarComentarioSchema)
  moderar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(moderarComentarioSchema)) cuerpo: z.output<typeof moderarComentarioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.comentarios.moderar(auth, id, cuerpo, cliente);
  }
}
