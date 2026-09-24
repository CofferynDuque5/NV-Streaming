import { Inject, Injectable } from '@nestjs/common';
import { ENTORNO } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import { AdaptadorNoDisponible } from '../adaptador.js';

/** Adaptador de Mercado Pago. Pendiente de implementar. */
@Injectable()
export class AdaptadorMercadoPago extends AdaptadorNoDisponible {
  constructor(@Inject(ENTORNO) entorno: Entorno) {
    super('mercadopago', entorno.MERCADOPAGO_MODO);
  }
}
