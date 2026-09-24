import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  consultaPaginaPublicaSchema,
  crearPaginaSchema,
  guardarBorradorSchema,
  publicarPaginaSchema,
  restaurarVersionSchema,
  subirMedioSchema,
  temaSitioSchema,
  uuidSchema,
} from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  Auth,
  Cliente,
  type ContextoAuth,
  type InfoCliente,
  Publica,
  RequierePermiso,
} from '../comun/contexto.js';
import { DocConsulta, DocCuerpo } from '../comun/documentacion.js';
import { leerFormulario } from '../comun/formulario.js';
import { validar, ZodPipe } from '../comun/zod.pipe.js';
import { MediosService } from './medios.service.js';
import { SitioService } from './sitio.service.js';

const idValido = validar(uuidSchema);

@ApiTags('Editor visual')
@Controller('sitio')
export class SitioController {
  constructor(
    @Inject(SitioService) private readonly sitio: SitioService,
    @Inject(MediosService) private readonly medios: MediosService,
  ) {}

  @Get('paginas')
  @RequierePermiso('sitio.editar')
  listar() {
    return this.sitio.listar();
  }

  @Post('paginas')
  @RequierePermiso('sitio.editar')
  @DocCuerpo(crearPaginaSchema)
  crear(
    @Auth() auth: ContextoAuth,
    @Body(validar(crearPaginaSchema)) cuerpo: z.output<typeof crearPaginaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.crear(auth, cuerpo, cliente);
  }

  @Get('paginas/:id')
  @RequierePermiso('sitio.editar')
  obtener(@Param('id', idValido) id: string) {
    return this.sitio.obtener(id);
  }

  /** Guarda el borrador. Responde 409 si otra persona lo guardó después de cargarlo. */
  @Put('paginas/:id/borrador')
  @RequierePermiso('sitio.editar')
  @DocCuerpo(guardarBorradorSchema)
  guardarBorrador(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(guardarBorradorSchema)) cuerpo: z.output<typeof guardarBorradorSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.guardarBorrador(auth, id, cuerpo, cliente);
  }

  @Post('paginas/:id/publicar')
  @RequierePermiso('sitio.publicar')
  @HttpCode(200)
  @DocCuerpo(publicarPaginaSchema)
  publicar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(publicarPaginaSchema)) cuerpo: z.output<typeof publicarPaginaSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.publicar(auth, id, cuerpo, cliente);
  }

  /** Copia una versión anterior al borrador; después hay que publicarla. */
  @Post('paginas/:id/restaurar')
  @RequierePermiso('sitio.publicar')
  @HttpCode(200)
  @DocCuerpo(restaurarVersionSchema)
  restaurar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Body(validar(restaurarVersionSchema)) cuerpo: z.output<typeof restaurarVersionSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.restaurar(auth, id, cuerpo.numero, cliente);
  }

  @Post('paginas/:id/archivar')
  @RequierePermiso('sitio.publicar')
  @HttpCode(200)
  archivar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.cambiarArchivada(auth, id, true, cliente);
  }

  @Post('paginas/:id/desarchivar')
  @RequierePermiso('sitio.publicar')
  @HttpCode(200)
  desarchivar(
    @Auth() auth: ContextoAuth,
    @Param('id', idValido) id: string,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.cambiarArchivada(auth, id, false, cliente);
  }

  @Get('medios')
  @RequierePermiso('sitio.editar')
  listarMedios() {
    return this.medios.listar();
  }

  /** Sube una imagen (multipart: `archivo` y `textoAlternativo`). JPG, PNG o WebP. */
  @Post('medios')
  @RequierePermiso('sitio.editar')
  @ApiConsumes('multipart/form-data')
  async subirMedio(
    @Auth() auth: ContextoAuth,
    @Req() peticion: FastifyRequest,
    @Cliente() cliente: InfoCliente,
  ) {
    const { campos, archivo } = await leerFormulario(peticion, 'archivo');
    const { textoAlternativo } = new ZodPipe(subirMedioSchema).transform(campos);
    return this.medios.subir(auth, archivo, textoAlternativo, cliente);
  }

  @Get('tema')
  @RequierePermiso('sitio.editar')
  tema() {
    return this.sitio.tema();
  }

  @Put('tema')
  @RequierePermiso('sitio.publicar')
  @DocCuerpo(temaSitioSchema)
  cambiarTema(
    @Auth() auth: ContextoAuth,
    @Body(validar(temaSitioSchema)) cuerpo: z.output<typeof temaSitioSchema>,
    @Cliente() cliente: InfoCliente,
  ) {
    return this.sitio.cambiarTema(auth, cuerpo.paleta, cliente);
  }
}

/** Lo que ve el público: solo versiones publicadas, imágenes de la biblioteca y el tema. */
@ApiTags('Sitio público')
@Controller('sitio/publico')
export class SitioPublicoController {
  constructor(
    @Inject(SitioService) private readonly sitio: SitioService,
    @Inject(MediosService) private readonly medios: MediosService,
  ) {}

  @Get('pagina')
  @Publica()
  @DocConsulta(consultaPaginaPublicaSchema)
  pagina(
    @Query(validar(consultaPaginaPublicaSchema))
    consulta: z.output<typeof consultaPaginaPublicaSchema>,
  ) {
    return this.sitio.publicada(consulta.ruta);
  }

  @Get('tema')
  @Publica()
  tema() {
    return this.sitio.temaPublico();
  }

  /** Imagen del sitio. Su contenido nunca cambia: se puede guardar en caché un año. */
  @Get('medios/:id')
  @Publica()
  async medio(@Param('id', idValido) id: string, @Res() respuesta: FastifyReply) {
    const { tipoMime, contenido } = await this.medios.contenido(id);
    void respuesta
      .header('content-type', tipoMime)
      .header('content-disposition', 'inline')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(contenido);
  }
}
