import type { FastifyRequest } from 'fastify';
import type { ArchivoRecibido } from '../almacen/almacen.service.js';
import { ErrorApp } from './errores.js';

export interface Formulario {
  campos: Record<string, string>;
  archivo: ArchivoRecibido | null;
}

/**
 * Lee un formulario multipart con, como mucho, un archivo en el campo `campoArchivo`.
 * Los límites de tamaño los aplica @fastify/multipart (ver aplicacion.ts).
 */
export async function leerFormulario(
  peticion: FastifyRequest,
  campoArchivo: string,
): Promise<Formulario> {
  if (!peticion.isMultipart()) {
    throw new ErrorApp(415, 'TIPO_NO_ADMITIDO', 'Envía el formulario como multipart/form-data.');
  }
  const campos: Record<string, string> = {};
  let archivo: ArchivoRecibido | null = null;
  for await (const parte of peticion.parts()) {
    if (parte.type === 'file') {
      const buffer = await parte.toBuffer();
      if (parte.fieldname !== campoArchivo || archivo) continue;
      if (buffer.length > 0) archivo = { buffer, nombre: parte.filename };
    } else if (typeof parte.value === 'string') {
      campos[parte.fieldname] = parte.value;
    }
  }
  return { campos, archivo };
}
