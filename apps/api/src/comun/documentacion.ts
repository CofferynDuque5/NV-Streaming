import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

const aJsonSchema = (esquema: z.ZodType) =>
  z.toJSONSchema(esquema, { io: 'input', unrepresentable: 'any' }) as SchemaObject;

/** Documenta en OpenAPI el cuerpo que valida un esquema de zod. */
export const DocCuerpo = (esquema: z.ZodType) => ApiBody({ schema: aJsonSchema(esquema) });

/** Documenta en OpenAPI los parámetros de consulta de un esquema de objeto de zod. */
export const DocConsulta = (esquema: z.ZodObject) => {
  const js = aJsonSchema(esquema) as { properties?: Record<string, SchemaObject> };
  return applyDecorators(
    ...Object.entries(js.properties ?? {}).map(([name, schema]) =>
      ApiQuery({ name, schema, required: false }),
    ),
  );
};
