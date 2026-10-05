import { Inject, Injectable } from '@nestjs/common';
import type { CifrasPoliticas } from '@nv/shared';
import { ConfigAutomatizacionesService } from '../automatizaciones/configuracion.service.js';
import { LIMITE_REPORTES_BILLETERA } from '../billetera/billetera.service.js';
import { cookieSesionDe } from '../comun/cookie.js';
import { ENTORNO } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { LIMITE_REVELAR } from '../entregas/accesos.service.js';

/**
 * Lo que la API tiene configurado y que nombran las Políticas y términos
 * (/politicas): la cookie y la duración de la sesión, el tamaño de los
 * comprobantes, los límites de uso y los avisos y reintentos que están
 * encendidos. Así el texto nunca promete algo distinto de lo que se hace.
 */
@Injectable()
export class PoliticasService {
  constructor(
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
  ) {}

  async cifras(): Promise<CifrasPoliticas> {
    const [recordatorio, gracia, suspension, reactivacion, cobro] = await Promise.all([
      this.config.leer('recordatorio_vencimiento'),
      this.config.leer('aviso_gracia'),
      this.config.leer('aviso_suspension'),
      this.config.leer('aviso_recuperacion'),
      this.config.leer('cobro_automatico'),
    ]);
    const limite = (l: { maximo: number; ventanaSegundos: number }) => ({
      maximo: l.maximo,
      ventanaSegundos: l.ventanaSegundos,
    });
    return {
      cookieSesion: cookieSesionDe(this.entorno),
      sesionHoras: this.entorno.SESION_DURACION_HORAS,
      sesionInactividadMinutos: this.entorno.SESION_INACTIVIDAD_MINUTOS,
      comprobanteMaxMb: this.entorno.COMPROBANTE_MAX_MB,
      revelarCodigos: limite(LIMITE_REVELAR),
      reportarRecargas: limite(LIMITE_REPORTES_BILLETERA),
      recordatorioDias: recordatorio.activa ? [...recordatorio.parametros.diasAntes] : null,
      avisoGracia: gracia.activa,
      avisoSuspension: suspension.activa,
      avisoReactivacion: reactivacion.activa,
      reintentosCobroDias: cobro.activa ? [...cobro.parametros.reintentosDias] : null,
    };
  }
}
