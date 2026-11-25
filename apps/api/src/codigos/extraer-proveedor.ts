import type { AccionProveedor, EnlaceCodigo } from '@nv/shared';
import { codigoDe, textoDeHtml } from './extraer.js';

/**
 * Lee lo que respondió el panel del proveedor al pulsar un botón: el aviso
 * («Código 4 dígitos: 5090»), una ventana o la respuesta JSON de su API.
 * Funciones puras: no tocan la red ni la base.
 */

/** Claves de una respuesta JSON que pueden traer el código, el enlace o el mensaje. */
const CLAVES_UTILES =
  /^(code|codigo|código|otp|pin|token_?code|link|url|enlace|href|message|mensaje|msg|text|texto|result|resultado|data|detail|error)$/i;

/** Valores de texto de un JSON, solo bajo claves útiles (no listas de cuentas, fechas ni precios). */
export function textosDeJson(cuerpo: string): string[] {
  let datos: unknown;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  const salida: string[] = [];
  const visitar = (v: unknown, clave: string | null, profundidad: number) => {
    if (profundidad > 6 || salida.length > 40) return;
    if (typeof v === 'string' || typeof v === 'number') {
      if (clave && CLAVES_UTILES.test(clave)) salida.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      // Una lista larga es un listado (cuentas…), no la respuesta del botón.
      if (v.length > 5) return;
      for (const x of v) visitar(x, clave, profundidad + 1);
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) visitar(x, k, profundidad + 1);
    }
  };
  visitar(datos, null, 0);
  return salida;
}

const ARCHIVO_ESTATICO = /\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?)(\?|$)/i;

/** Enlaces https útiles, sin los del propio panel ni archivos estáticos. */
export function enlacesExternos(texto: string, hostPanel: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(/https:\/\/[^\s"'<>]+/gi)) {
    const url = m[0].replace(/[).,;>\]]+$/, '');
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host === hostPanel || host.endsWith(`.${hostPanel}`) || ARCHIVO_ESTATICO.test(url)) {
      continue;
    }
    vistos.add(url);
  }
  return [...vistos];
}

const SIN_CODIGO =
  /no (se )?(encontr|hay|lleg)|sin c[oó]digo|no disponible|intenta (de nuevo|m[aá]s tarde)|error|fall[oó]|not found|no code/i;

export interface LecturaProveedor {
  codigo: string | null;
  enlace: EnlaceCodigo | null;
  /** Texto corto del aviso cuando no hay código ni enlace. */
  mensaje: string | null;
}

/** Busca «código … 1234». Si la acción es code6, exige 6 dígitos. */
function codigoDeTexto(texto: string, accion: AccionProveedor): string | null {
  const limpio = texto.replace(/\b(\d{3})[\s-](\d{3})\b/g, '$1$2');
  const largo = accion === 'code6' ? '6' : '4,8';
  const tras = new RegExp(
    `(?:c[oó]digo|code|otp|pin)[^\\n]{0,40}?(?<![\\d])(\\d{${largo}})(?![\\d])`,
    'i',
  ).exec(limpio)?.[1];
  if (tras) return tras;
  const solo = new RegExp(`^\\s*(\\d{${largo}})\\s*$`, 'm').exec(limpio)?.[1];
  if (solo) return solo;
  const c = codigoDe('', limpio);
  if (c && (accion !== 'code6' || c.length === 6)) return c;
  return null;
}

const tipoEnlace = (accion: AccionProveedor): EnlaceCodigo['tipo'] =>
  accion === 'link' ? 'restablecer' : accion === 'hogar' ? 'hogar' : 'verificar';

/** Mensaje corto para mostrar: sin enlaces, sin HTML, máximo 200 letras. */
export function mensajeCorto(texto: string): string {
  const plano = (/<[a-z][\s\S]*>/i.test(texto) ? textoDeHtml(texto) : texto)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plano.length > 200 ? `${plano.slice(0, 199).trimEnd()}…` : plano;
}

/** Interpreta los textos capturados tras pulsar el botón. Los más nuevos van al final. */
export function leerRespuestaProveedor(
  accion: AccionProveedor,
  textos: string[],
  hostPanel: string,
): LecturaProveedor {
  const lista = textos.map((t) => t.trim()).filter(Boolean);
  const todo = lista.join('\n');
  const enlaces = enlacesExternos(todo, hostPanel);
  // «Link» siempre es un enlace; Hogar y sobre pueden traer código o enlace.
  if (accion === 'link') {
    return enlaces[0]
      ? { codigo: null, enlace: { url: enlaces[0], tipo: 'restablecer' }, mensaje: null }
      : { codigo: null, enlace: null, mensaje: aviso(lista) };
  }
  // Del más nuevo al más viejo: el último aviso es la respuesta al botón.
  for (const t of [...lista].reverse()) {
    const codigo = codigoDeTexto(/<[a-z][\s\S]*>/i.test(t) ? textoDeHtml(t) : t, accion);
    if (codigo) return { codigo, enlace: null, mensaje: null };
  }
  if (enlaces[0] && accion !== 'code' && accion !== 'code6') {
    return { codigo: null, enlace: { url: enlaces[0], tipo: tipoEnlace(accion) }, mensaje: null };
  }
  return { codigo: null, enlace: null, mensaje: aviso(lista) };
}

function aviso(lista: string[]): string | null {
  const conAviso = [...lista].reverse().find((t) => SIN_CODIGO.test(t));
  const t = conAviso ?? null;
  return t ? mensajeCorto(t) : null;
}

/** ¿Ya hay respuesta (código, enlace o aviso de que no hay)? Para dejar de esperar. */
export const hayRespuesta = (l: LecturaProveedor) => Boolean(l.codigo || l.enlace || l.mensaje);

/** Tapa números largos y enlaces, para guardar lo que se vio sin datos sensibles. */
export const tapar = (t: string) =>
  mensajeCorto(t)
    .replace(/\d{3,}/g, '•••')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '•••@•••')
    .slice(0, 160);
