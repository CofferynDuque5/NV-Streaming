import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';

/** Cuerpo máximo de un webhook de pasarela (los reales pesan unos pocos KB). */
export const LIMITE_WEBHOOK_BYTES = 256 * 1024;

const RUTA_WEBHOOK = /^\/api\/v1\/pasarelas\/[a-z]{1,30}\/webhook\/?(\?.*)?$/;

declare module 'fastify' {
  interface FastifyRequest {
    /** Bytes exactos del cuerpo (solo en los webhooks de pasarela, para verificar la firma). */
    cuerpoCrudo?: Buffer;
  }
}

/**
 * Guarda los bytes exactos del cuerpo de los webhooks de pasarela antes de que
 * se interprete el JSON: la firma se calcula sobre ellos y cualquier
 * normalización la rompería. El resto de rutas no se toca (el gancho devuelve
 * el flujo tal cual) y su análisis de JSON sigue siendo el de Fastify.
 */
export function instalarCuerpoCrudo(fastify: FastifyInstance): void {
  fastify.addHook('preParsing', async (peticion, _respuesta, flujo) => {
    if (peticion.method !== 'POST' || !RUTA_WEBHOOK.test(peticion.url)) return flujo;
    const partes: Buffer[] = [];
    let total = 0;
    for await (const parte of flujo) {
      const b = Buffer.isBuffer(parte) ? parte : Buffer.from(parte as string);
      total += b.length;
      if (total > LIMITE_WEBHOOK_BYTES) {
        throw Object.assign(new Error('El aviso es demasiado grande.'), { statusCode: 413 });
      }
      partes.push(b);
    }
    const cuerpo = Buffer.concat(partes);
    peticion.cuerpoCrudo = cuerpo;
    const copia = Readable.from([cuerpo]) as Readable & { receivedEncodedLength?: number };
    copia.receivedEncodedLength = cuerpo.length;
    return copia;
  });
}
