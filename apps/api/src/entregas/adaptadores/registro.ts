import { Inject, Injectable } from '@nestjs/common';
import type { AdaptadorEntrega } from '@nv/shared';
import { Cifrador } from '../../comun/cripto.js';
import { ENTORNO } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import { AdaptadorCodigos } from './codigos.js';
import { AdaptadorManual } from './manual.js';
import type { Adaptador } from './tipos.js';
import { AdaptadorWebhook } from './webhook.js';

/** Los tres adaptadores de entrega, por nombre. */
@Injectable()
export class AdaptadoresEntrega {
  readonly manual: AdaptadorManual;
  readonly codigos: AdaptadorCodigos;
  readonly webhook: AdaptadorWebhook;

  constructor(@Inject(ENTORNO) entorno: Entorno, @Inject(Cifrador) cifrador: Cifrador) {
    this.manual = new AdaptadorManual();
    this.codigos = new AdaptadorCodigos(cifrador);
    this.webhook = new AdaptadorWebhook({ permitirLocal: entorno.ENTREGAS_WEBHOOK_RED_LOCAL });
  }

  de(nombre: string): Adaptador {
    switch (nombre as AdaptadorEntrega) {
      case 'manual':
        return this.manual;
      case 'codigos':
        return this.codigos;
      case 'webhook':
        return this.webhook;
      default:
        throw new Error(`Adaptador de entrega desconocido: ${nombre}`);
    }
  }
}
