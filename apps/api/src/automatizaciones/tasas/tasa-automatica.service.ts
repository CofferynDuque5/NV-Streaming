import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@nv/db';
import type { FuenteTasa, PruebaTasa } from '@nv/shared';
import { AuditoriaService } from '../../auditoria/auditoria.service.js';
import { NotificacionesService } from '../../avisos/notificaciones.service.js';
import { ENTORNO, PRISMA } from '../../comun/tokens.js';
import type { Entorno } from '../../config/entorno.js';
import { CorreoService } from '../../correo/correo.service.js';
import { Plantillas } from '../../correo/plantillas.js';
import { D, type Dec } from '../../dinero/dinero.js';
import { TasasService } from '../../dinero/tasas.service.js';
import type { ConfigAutomatizacion } from '../configuracion.service.js';
import { fechaCaracas } from '../horario.js';
import { equipoConPermiso, Recuento, type ResultadoTarea } from '../recuento.js';
import { descargar, ErrorFuenteTasa, leerTasaBcv, leerTasaJson } from './fuentes.js';

const TIEMPO_MS = 15_000;
const MAX_BYTES_HTML = 2 * 1024 * 1024;
const MAX_BYTES_JSON = 256 * 1024;

export interface TasaObtenida {
  valor: Dec;
  /** Lo que se guarda en `tasas_cambio.fuente`: "bcv" o "json:host". */
  fuente: string;
}

/** Adaptadores de las fuentes de la tasa (BCV y JSON). */
@Injectable()
export class FuentesTasaService {
  constructor(@Inject(ENTORNO) private readonly entorno: Entorno) {}

  configuradas(): { bcv: boolean; json: boolean } {
    return {
      bcv: Boolean(this.entorno.TASA_BCV_URL),
      json: Boolean(this.entorno.TASA_JSON_URL && this.entorno.TASA_JSON_CAMPO),
    };
  }

  /** Consulta la fuente. Lanza `ErrorFuenteTasa` con un mensaje para el panel. */
  async obtener(fuente: FuenteTasa): Promise<TasaObtenida> {
    if (fuente === 'bcv') {
      if (!this.entorno.TASA_BCV_URL)
        throw new ErrorFuenteTasa('Falta TASA_BCV_URL en el servidor.');
      const html = await descargar(this.entorno.TASA_BCV_URL, {
        tiempoMs: TIEMPO_MS,
        maxBytes: MAX_BYTES_HTML,
        aceptar: 'text/html',
      });
      return { valor: redondearTasa(leerTasaBcv(html)), fuente: 'bcv' };
    }
    const { TASA_JSON_URL: url, TASA_JSON_CAMPO: campo } = this.entorno;
    if (!url || !campo) {
      throw new ErrorFuenteTasa(
        'La fuente JSON no está configurada: define TASA_JSON_URL y TASA_JSON_CAMPO en el servidor.',
      );
    }
    const texto = await descargar(url, {
      tiempoMs: TIEMPO_MS,
      maxBytes: MAX_BYTES_JSON,
      aceptar: 'application/json',
    });
    return {
      valor: redondearTasa(leerTasaJson(texto, campo)),
      fuente: `json:${new URL(url).hostname}`.slice(0, 60),
    };
  }
}

/** Las tasas se guardan con 6 decimales (el BCV publica 8). */
const redondearTasa = (texto: string) => D(texto).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

const variacion = (nueva: Dec, vigente: Dec) => nueva.sub(vigente).abs().div(vigente).mul(100);

/**
 * Tasa del bolívar automática: consulta la fuente y registra la tasa VES con
 * origen "automatica". Si cambia más de lo permitido respecto de la vigente,
 * no la aplica y avisa a administración.
 */
@Injectable()
export class TasaAutomaticaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(FuentesTasaService) private readonly fuentes: FuentesTasaService,
    @Inject(TasasService) private readonly tasas: TasasService,
    @Inject(AuditoriaService) private readonly auditoria: AuditoriaService,
    @Inject(NotificacionesService) private readonly avisos: NotificacionesService,
    @Inject(CorreoService) private readonly correo: CorreoService,
  ) {}

  /** Consulta sin guardar (botón "Probar" del panel). */
  async probar(fuente: FuenteTasa): Promise<PruebaTasa> {
    const obtenida = await this.fuentes.obtener(fuente);
    const vigente = (await this.tasas.mapa()).get('VES') ?? null;
    return {
      fuente,
      valor: obtenida.valor.toFixed(6),
      vigente: vigente?.toFixed(6) ?? null,
      variacionPct: vigente ? variacion(obtenida.valor, vigente).toFixed(2) : null,
      obtenidaEn: new Date().toISOString(),
    };
  }

  async ejecutar(
    config: ConfigAutomatizacion<'tasa_automatica'>,
    ahora: Date,
  ): Promise<ResultadoTarea> {
    const r = new Recuento();
    const p = config.parametros;
    const { valor, fuente } = await this.fuentes.obtener(p.fuente);
    const vigente = (await this.tasas.mapa()).get('VES') ?? null;
    const bs = (v: Dec) => v.toFixed(2).replace('.', ',');

    if (vigente && vigente.eq(valor)) {
      r.omitidos += 1;
      return r.resultado(`La tasa no cambió: ${bs(valor)} Bs. por dólar (${fuente}).`);
    }
    if (vigente) {
      const cambio = variacion(valor, vigente);
      if (cambio.gt(p.variacionMaximaPct)) {
        const pct = cambio.toFixed(1).replace('.', ',');
        const admins = await equipoConPermiso(this.prisma, 'finanzas.configurar');
        const url = this.correo.urlWeb('/admin/finanzas');
        for (const u of admins) {
          await this.avisos.avisar({
            plantilla: 'tasaNoAplicada',
            destinatario: { usuarioId: u.id },
            claveUnica: `tasa_no_aplicada:${fechaCaracas(ahora)}:${valor.toFixed(6)}:${u.id}`,
            automatizacion: 'tasa_automatica',
            canales: ['correo'],
            contenido: (nombre) => ({
              correo: Plantillas.tasaNoAplicada(
                nombre,
                fuente,
                bs(valor),
                bs(vigente),
                pct,
                p.variacionMaximaPct,
                url,
              ),
            }),
          });
        }
        r.errores += 1;
        return r.resultado(
          `No se aplicó: ${fuente} trajo ${bs(valor)} Bs., un ${pct} % distinta de la vigente (${bs(vigente)} Bs.); el máximo es ${p.variacionMaximaPct} %. Se avisó a administración.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const fila = await tx.tasaCambio.create({
        data: { moneda: 'VES', valor, origen: 'automatica', fuente, autorId: null },
      });
      await this.auditoria.registrar(
        {
          actorTipo: 'sistema',
          accion: 'tasa.registrada',
          entidad: 'tasa_cambio',
          entidadId: fila.id,
          antes: vigente ? { moneda: 'VES', valor: vigente.toFixed(6) } : undefined,
          despues: { moneda: 'VES', valor: valor.toFixed(6), origen: 'automatica', fuente },
        },
        tx,
      );
    });
    r.procesados += 1;
    return r.resultado(
      `Tasa registrada: ${bs(valor)} Bs. por dólar (${fuente})${vigente ? `; antes ${bs(vigente)} Bs.` : ''}.`,
    );
  }
}

export { ErrorFuenteTasa };
