import { Inject, Injectable } from '@nestjs/common';
import type { Pasarela } from '@nv/shared';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { AdaptadorNoDisponible, type AdaptadorPasarela } from './adaptador.js';
import { esPasarela } from './pasarelas.js';
import { AdaptadorMercadoPago } from './mercadopago/mercadopago.adaptador.js';
import { AdaptadorPaypal } from './paypal/paypal.adaptador.js';
import { AdaptadorSandbox } from './sandbox/sandbox.adaptador.js';

/**
 * Elige el adaptador de cada pasarela. Cada adaptador dice si está
 * configurado (tiene sus credenciales en el entorno).
 */
@Injectable()
export class RegistroPasarelas {
  private readonly adaptadores: Record<Pasarela, AdaptadorPasarela>;

  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(AdaptadorSandbox) sandbox: AdaptadorSandbox,
    @Inject(AdaptadorPaypal) paypal: AdaptadorPaypal,
    @Inject(AdaptadorMercadoPago) mercadopago: AdaptadorMercadoPago,
  ) {
    this.adaptadores = {
      paypal,
      mercadopago,
      sandbox: entorno.PASARELA_SANDBOX_HABILITADA ? sandbox : new AdaptadorNoDisponible('sandbox'),
    };
  }

  /** El adaptador de una pasarela, esté o no configurado. */
  adaptador(pasarela: Pasarela): AdaptadorPasarela {
    return this.adaptadores[pasarela];
  }

  /** El adaptador listo para usar, o un error 409 legible. */
  exigir(pasarela: string): AdaptadorPasarela {
    const a = esPasarela(pasarela) ? this.adaptadores[pasarela] : null;
    if (!a || !a.configurada()) {
      throw new ErrorApp(
        409,
        'PASARELA_NO_DISPONIBLE',
        'Ese medio de pago en línea no está disponible ahora. Elige otro o paga a mano.',
      );
    }
    return a;
  }

  disponible(pasarela: string): boolean {
    return esPasarela(pasarela) && this.adaptadores[pasarela].configurada();
  }

  /** URL que hay que registrar en la pasarela para sus webhooks. */
  urlWebhook(pasarela: Pasarela): string {
    const base = this.entorno.API_URL_PUBLICA || this.entorno.WEB_ORIGEN;
    return `${base}/api/v1/pasarelas/${pasarela}/webhook`;
  }
}
