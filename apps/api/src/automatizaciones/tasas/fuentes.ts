/**
 * Fuentes de la tasa del bolívar: descarga segura y lectores de la página del
 * BCV y de un JSON. Todo lo de aquí es puro salvo `descargar`, para poder
 * probarlo con archivos guardados (en las pruebas no hay red).
 */

/** Error de una fuente de tasa, con un mensaje en español para el panel. */
export class ErrorFuenteTasa extends Error {}

export interface OpcionesDescarga {
  tiempoMs: number;
  maxBytes: number;
  aceptar: string;
  maxRedirecciones?: number;
  pedir?: typeof fetch;
}

/**
 * Descarga un texto por https con tiempo máximo y tamaño máximo. Solo sigue
 * redirecciones dentro del mismo host (y siempre por https).
 */
export async function descargar(url: string, o: OpcionesDescarga): Promise<string> {
  const pedir = o.pedir ?? fetch;
  let actual = new URL(url);
  for (let saltos = 0; saltos <= (o.maxRedirecciones ?? 3); saltos += 1) {
    if (actual.protocol !== 'https:') {
      throw new ErrorFuenteTasa('La fuente de la tasa debe usar https.');
    }
    let r: Response;
    try {
      r = await pedir(actual, {
        redirect: 'manual',
        signal: AbortSignal.timeout(o.tiempoMs),
        headers: { accept: o.aceptar, 'user-agent': 'NV-Streaming/1.0 (tasa automatica)' },
      });
    } catch (e) {
      const tiempo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new ErrorFuenteTasa(
        tiempo
          ? `La fuente de la tasa (${actual.hostname}) no respondió a tiempo.`
          : `No se pudo conectar con la fuente de la tasa (${actual.hostname}).`,
      );
    }
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get('location');
      if (!destino) throw new ErrorFuenteTasa('La fuente de la tasa redirigió sin destino.');
      const siguiente = new URL(destino, actual);
      if (siguiente.hostname !== actual.hostname) {
        throw new ErrorFuenteTasa(
          `La fuente de la tasa redirigió a otro sitio (${siguiente.hostname}); no se siguió.`,
        );
      }
      actual = siguiente;
      continue;
    }
    if (!r.ok) {
      throw new ErrorFuenteTasa(`La fuente de la tasa respondió con el estado ${r.status}.`);
    }
    const largo = Number(r.headers.get('content-length') ?? '0');
    if (largo > o.maxBytes)
      throw new ErrorFuenteTasa('La respuesta de la fuente es demasiado grande.');
    return leerConLimite(r, o.maxBytes);
  }
  throw new ErrorFuenteTasa('La fuente de la tasa redirigió demasiadas veces.');
}

async function leerConLimite(r: Response, maxBytes: number): Promise<string> {
  if (!r.body) return '';
  const lector = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel().catch(() => undefined);
      throw new ErrorFuenteTasa('La respuesta de la fuente es demasiado grande.');
    }
    partes.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(partes));
}

/**
 * Convierte un número escrito a mano en texto decimal con punto: "36,5014"
 * → "36.5014", "1.036,50" → "1036.50", "1,036.50" → "1036.50". El último
 * separador es el decimal; los demás son de miles.
 */
export function normalizarNumero(texto: string): string | null {
  const v = texto.replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(v)) return null;
  const ultimo = Math.max(v.lastIndexOf(','), v.lastIndexOf('.'));
  let entero = v;
  let decimales = '';
  if (ultimo >= 0) {
    const sep = v[ultimo]!;
    const otro = sep === ',' ? '.' : ',';
    const cola = v.slice(ultimo + 1);
    // Un único separador siempre es decimal ("36.501" = 36,501 Bs.). Si el mismo
    // se repite y no hay otro ("1.036.501"), son separadores de miles.
    if (v.split(sep).length > 2 && !v.includes(otro)) {
      entero = v.split(sep).join('');
    } else {
      entero = v.slice(0, ultimo).replace(/[.,]/g, '');
      decimales = cola;
    }
  }
  if (!/^\d+$/.test(entero) || (decimales && !/^\d+$/.test(decimales))) return null;
  const limpio = `${entero.replace(/^0+(?=\d)/, '')}${decimales ? `.${decimales}` : ''}`;
  return Number(limpio) > 0 ? limpio : null;
}

/** Límite de cordura: una tasa fuera de este rango es un error de lectura. */
const TASA_MAXIMA = 10_000_000;

function validarTasa(texto: string | null, origen: string): string {
  if (!texto || !(Number(texto) > 0) || Number(texto) >= TASA_MAXIMA) {
    throw new ErrorFuenteTasa(`${origen} no trae un valor de tasa válido.`);
  }
  return texto;
}

/**
 * Lee el dólar de la página del BCV. El valor está en el bloque
 * `<div id="dolar">`, dentro de un `<strong>`, con coma decimal
 * (p. ej. "36,50140000"). Solo se mira dentro de ese bloque (hasta el
 * siguiente elemento con id) para no confundirlo con el euro u otra moneda.
 */
export function leerTasaBcv(html: string): string {
  const inicio = html.search(/\bid\s*=\s*["']?dolar["'\s>]/i);
  if (inicio < 0) {
    throw new ErrorFuenteTasa('No se encontró el bloque del dólar en la página del BCV.');
  }
  const resto = html.slice(inicio + 8);
  const fin = resto.search(/\bid\s*=/i);
  const bloque = resto.slice(0, fin >= 0 ? Math.min(fin, 4000) : 4000);
  const m = /<strong[^>]*>([^<]{1,60})<\/strong>/i.exec(bloque);
  if (!m) {
    throw new ErrorFuenteTasa('La página del BCV cambió: no se encontró el valor del dólar.');
  }
  return validarTasa(normalizarNumero(m[1]!), 'La página del BCV');
}

/**
 * Valor de un JSON siguiendo una ruta con puntos ("datos.usd.valor",
 * "tasas.0.valor"). Solo sigue propiedades propias (nunca el prototipo).
 */
export function extraerPorRuta(datos: unknown, ruta: string): unknown {
  let actual: unknown = datos;
  for (const parte of ruta.split('.')) {
    if (Array.isArray(actual) && /^\d+$/.test(parte)) {
      actual = actual[Number(parte)];
    } else if (actual !== null && typeof actual === 'object' && Object.hasOwn(actual, parte)) {
      actual = (actual as Record<string, unknown>)[parte];
    } else {
      throw new ErrorFuenteTasa(`El campo "${ruta}" no está en la respuesta de la fuente.`);
    }
    if (actual === undefined) {
      throw new ErrorFuenteTasa(`El campo "${ruta}" no está en la respuesta de la fuente.`);
    }
  }
  return actual;
}

/** Lee la tasa de un JSON con la ruta configurada. Acepta número o texto ("36,50"). */
export function leerTasaJson(texto: string, ruta: string): string {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorFuenteTasa('La fuente JSON no devolvió un JSON válido.');
  }
  const valor = extraerPorRuta(datos, ruta);
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor))
      throw new ErrorFuenteTasa('La fuente JSON trae un número no válido.');
    return validarTasa(normalizarNumero(String(valor)), 'La fuente JSON');
  }
  if (typeof valor === 'string') return validarTasa(normalizarNumero(valor), 'La fuente JSON');
  throw new ErrorFuenteTasa(`El campo "${ruta}" no es un número.`);
}
