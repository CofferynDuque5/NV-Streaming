import {
  HERRAMIENTAS,
  NOMBRES_HERRAMIENTA,
  type NombreHerramienta,
  PARAMETROS_HERRAMIENTA,
} from '@nv/shared';
import { z } from 'zod';
import type { HerramientaOfrecida } from '../proveedores/proveedor.js';

/** Quita lo que solo añade ruido para el modelo (el patrón largo de los UUID, `$schema`). */
function limpiar(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(limpiar);
  if (!nodo || typeof nodo !== 'object') return nodo;
  const o = { ...(nodo as Record<string, unknown>) };
  delete o['$schema'];
  if (o['format'] === 'uuid') delete o['pattern'];
  for (const [k, v] of Object.entries(o)) o[k] = limpiar(v);
  return o;
}

/** JSON Schema (entrada) de los parámetros de una herramienta, generado desde su esquema zod. */
export function esquemaJson(nombre: NombreHerramienta): Record<string, unknown> {
  const js = limpiar(
    z.toJSONSchema(PARAMETROS_HERRAMIENTA[nombre], { io: 'input', unrepresentable: 'any' }),
  ) as Record<string, unknown>;
  // Los motores exigen un objeto con propiedades, aunque no haya parámetros.
  return { ...js, type: 'object', properties: js['properties'] ?? {} };
}

/** Definición que se envía al motor, calculada una vez. */
export const HERRAMIENTAS_MODELO: Record<NombreHerramienta, HerramientaOfrecida> =
  Object.fromEntries(
    NOMBRES_HERRAMIENTA.map((n) => [
      n,
      {
        nombre: n,
        descripcion:
          HERRAMIENTAS[n].tipo === 'accion'
            ? `${HERRAMIENTAS[n].descripcion} Solo crea una propuesta: no se ejecuta hasta que la persona la confirme.`
            : HERRAMIENTAS[n].descripcion,
        esquemaJson: esquemaJson(n),
      },
    ]),
  ) as Record<NombreHerramienta, HerramientaOfrecida>;
