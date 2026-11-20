import { createRequire } from 'node:module';
import path from 'node:path';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';

const requerir = createRequire(import.meta.url);
/** Datos de idioma empaquetados con la API: nada se descarga ni sale del servidor. */
const rutaIdioma = (paquete: string) =>
  path.join(path.dirname(requerir.resolve(`${paquete}/package.json`)), '4.0.0_best_int');

const TIEMPO_LIMITE_MS = 20_000;
/** Sin lecturas por este tiempo, se apaga el trabajador para no ocupar memoria en el VPS. */
const APAGAR_INACTIVO_MS = 5 * 60_000;

/** Tipos de imagen que se leen, por sus primeros bytes (no por el nombre del archivo). */
export function esImagenLegible(b: Buffer): boolean {
  if (b.length < 12) return false;
  const png = b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG';
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return png || jpg || webp;
}

/**
 * Reconoce el texto de una captura (OCR) en el propio servidor con Tesseract, en español.
 * La imagen no se guarda ni se envía a ningún servicio externo, y
 * el texto leído nunca va a los registros. Un solo trabajador, una imagen a la vez.
 * En las pruebas se reemplaza por uno falso.
 */
@Injectable()
export class LectorOcr implements OnModuleDestroy {
  private readonly logger = new Logger('LectorOcr');
  private trabajador: Promise<Worker> | null = null;
  private cola: Promise<unknown> = Promise.resolve();
  private inactivo: NodeJS.Timeout | undefined;

  private obtener(): Promise<Worker> {
    // El modelo en español también lee los textos en inglés de PayPal (cifras, «USD», códigos).
    this.trabajador ??= createWorker('spa', 1, {
      langPath: rutaIdioma('@tesseract.js-data/spa'),
      cacheMethod: 'none',
      gzip: true,
    });
    return this.trabajador;
  }

  /** Texto de la imagen, o null si no se pudo leer a tiempo. */
  texto(imagen: Buffer): Promise<string | null> {
    const tarea = this.cola.then(async () => {
      let reloj: NodeJS.Timeout | undefined;
      try {
        const w = await this.obtener();
        const limite = new Promise<null>((r) => {
          reloj = setTimeout(() => r(null), TIEMPO_LIMITE_MS);
        });
        const r = await Promise.race([w.recognize(imagen).then((x) => x.data.text), limite]);
        if (r === null) {
          // Un trabajador colgado se descarta para que la siguiente lectura empiece limpia.
          this.descartar();
        }
        return r;
      } catch (e) {
        this.logger.warn(`No se pudo leer una captura: ${(e as Error).name}`);
        this.descartar();
        return null;
      } finally {
        clearTimeout(reloj);
        clearTimeout(this.inactivo);
        this.inactivo = setTimeout(() => this.descartar(), APAGAR_INACTIVO_MS);
        this.inactivo.unref();
      }
    });
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  private descartar() {
    const w = this.trabajador;
    this.trabajador = null;
    void w?.then((x) => x.terminate()).catch(() => undefined);
  }

  async onModuleDestroy() {
    clearTimeout(this.inactivo);
    this.descartar();
  }
}
