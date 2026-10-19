import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DosPasosService } from './dos-pasos.service.js';
import { SesionesService } from './sesiones.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SesionesService, TokensService, DosPasosService],
  exports: [SesionesService, TokensService, DosPasosService],
})
export class AuthModule {}
