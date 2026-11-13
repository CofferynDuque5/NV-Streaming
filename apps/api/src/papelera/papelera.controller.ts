import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequierePermiso } from '../comun/contexto.js';
import { PapeleraService } from './papelera.service.js';

@ApiTags('Papelera')
@Controller('papelera')
export class PapeleraController {
  constructor(@Inject(PapeleraService) private readonly papelera: PapeleraService) {}

  /** Clientes archivados, cuentas retiradas y plataformas apagadas, lo más reciente primero. */
  @Get()
  @RequierePermiso('auditoria.ver')
  listar() {
    return this.papelera.listar();
  }
}
