import type { z } from 'zod';

type Crudo = Record<string, string | string[] | undefined>;

/**
 * Valida los parámetros de la URL con un esquema compartido; si no son válidos,
 * usa los valores por defecto. Devuelve también la consulta para la API.
 */
export function leerFiltro<S extends z.ZodType>(
  esquema: S,
  crudo: Crudo,
  extra: Record<string, unknown> = {},
): {
  filtro: z.output<S>;
  consulta: URLSearchParams;
  parametros: Record<string, string | undefined>;
} {
  const limpio = Object.fromEntries(
    Object.entries(crudo).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
    ),
  );
  const r = esquema.safeParse({ ...limpio, ...extra });
  const filtro = (r.success ? r.data : esquema.parse(extra)) as z.output<S>;
  const parametros: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(filtro as Record<string, unknown>)) {
    if (v === undefined || v === null || k === 'pagina' || k === 'porPagina') continue;
    parametros[k] = v instanceof Date ? v.toISOString() : String(v);
  }
  const consulta = new URLSearchParams(
    Object.entries({
      ...parametros,
      pagina: String((filtro as { pagina?: number }).pagina ?? 1),
      porPagina: String((filtro as { porPagina?: number }).porPagina ?? 20),
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  return { filtro, consulta, parametros };
}
