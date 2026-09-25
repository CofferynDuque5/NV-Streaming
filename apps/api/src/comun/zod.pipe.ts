import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ErrorApp } from './errores.js';

/** Valida y transforma la entrada con un esquema Zod compartido con la web. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly esquema: S) {}

  transform(valor: unknown): z.output<S> {
    const r = this.esquema.safeParse(valor ?? {});
    if (r.success) return r.data;
    const campos: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const clave = issue.path.length ? issue.path.join('.') : '_';
      (campos[clave] ??= []).push(issue.message);
    }
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Revisa los datos del formulario.', campos);
  }
}

export const validar = <S extends z.ZodType>(esquema: S) => new ZodPipe(esquema);
