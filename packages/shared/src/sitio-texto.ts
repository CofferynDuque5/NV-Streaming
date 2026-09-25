/**
 * Marcado seguro del editor visual: párrafos, **negrita**, *cursiva*, listas
 * (líneas que empiezan por "- " o "1. ") y enlaces [texto](/ruta o https://…).
 *
 * Se analiza a un árbol que la web pinta con elementos de React. Nunca se
 * interpreta HTML: cualquier etiqueta queda como texto literal.
 */

export type NodoEnLinea =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'salto' }
  | { tipo: 'negrita'; hijos: NodoEnLinea[] }
  | { tipo: 'cursiva'; hijos: NodoEnLinea[] }
  | { tipo: 'enlace'; href: string; hijos: NodoEnLinea[] };

export type NodoTexto =
  | { tipo: 'parrafo'; hijos: NodoEnLinea[] }
  | { tipo: 'lista'; ordenada: boolean; elementos: NodoEnLinea[][] };

const LONGITUD_MAXIMA_ENLACE = 300;
/** https:// + dominio (sin usuario ni contraseña) + puerto y ruta opcionales. */
const DIRECCION_HTTPS =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/**
 * Enlace admitido en el sitio: una ruta interna que empieza por una sola "/"
 * o una dirección https://. Rechaza javascript:, data:, http:, "//otro-sitio",
 * barras invertidas, espacios y caracteres de control.
 */
export function esEnlaceSeguro(url: string): boolean {
  if (url.length === 0 || url.length > LONGITUD_MAXIMA_ENLACE) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return false;
  if (url.startsWith('/')) return !url.startsWith('//');
  return DIRECCION_HTTPS.test(url);
}

/** Enlaces escritos con la forma [texto](destino), para validarlos antes de guardar. */
export function enlacesDelTexto(fuente: string): string[] {
  return [...fuente.matchAll(/\[[^\]\n]*\]\(([^)\n]*)\)/g)].map((m) => (m[1] ?? '').trim());
}

const PROFUNDIDAD_MAXIMA = 4;

function enLinea(fuente: string, permitirEnlaces: boolean, profundidad = 0): NodoEnLinea[] {
  const nodos: NodoEnLinea[] = [];
  let texto = '';
  const volcar = () => {
    if (texto) nodos.push({ tipo: 'texto', texto });
    texto = '';
  };
  const anidar = (s: string, enlaces = permitirEnlaces) =>
    profundidad >= PROFUNDIDAD_MAXIMA
      ? [{ tipo: 'texto' as const, texto: s }]
      : enLinea(s, enlaces, profundidad + 1);

  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i]!;
    if (c === '\\' && i + 1 < fuente.length && '*[]()\\'.includes(fuente[i + 1]!)) {
      texto += fuente[i + 1];
      i += 2;
      continue;
    }
    if (fuente.startsWith('**', i)) {
      const cierre = fuente.indexOf('**', i + 2);
      if (cierre > i + 2) {
        volcar();
        nodos.push({ tipo: 'negrita', hijos: anidar(fuente.slice(i + 2, cierre)) });
        i = cierre + 2;
        continue;
      }
    } else if (c === '*') {
      const cierre = fuente.indexOf('*', i + 1);
      if (cierre > i + 1) {
        volcar();
        nodos.push({ tipo: 'cursiva', hijos: anidar(fuente.slice(i + 1, cierre)) });
        i = cierre + 1;
        continue;
      }
    } else if (c === '[' && permitirEnlaces) {
      const finEtiqueta = fuente.indexOf(']', i + 1);
      if (finEtiqueta > i && fuente[finEtiqueta + 1] === '(') {
        const finDestino = fuente.indexOf(')', finEtiqueta + 2);
        if (finDestino > finEtiqueta) {
          const etiqueta = fuente.slice(i + 1, finEtiqueta);
          const destino = fuente.slice(finEtiqueta + 2, finDestino).trim();
          volcar();
          if (esEnlaceSeguro(destino)) {
            nodos.push({ tipo: 'enlace', href: destino, hijos: anidar(etiqueta, false) });
          } else {
            // Un enlace no permitido se queda en su texto, sin destino.
            nodos.push(...anidar(etiqueta, false));
          }
          i = finDestino + 1;
          continue;
        }
      }
    }
    texto += c;
    i += 1;
  }
  volcar();
  return nodos;
}

const ELEMENTO_SIN_ORDEN = /^\s*[-•]\s+(.*)$/;
const ELEMENTO_ORDENADO = /^\s*\d{1,3}[.)]\s+(.*)$/;

/** Convierte el texto con marcado en un árbol de párrafos y listas. */
export function analizarTexto(fuente: string): NodoTexto[] {
  const bloques: NodoTexto[] = [];
  let parrafo: string[] = [];
  let lista: { ordenada: boolean; elementos: string[] } | null = null;

  const cerrarParrafo = () => {
    if (parrafo.length === 0) return;
    const hijos: NodoEnLinea[] = [];
    parrafo.forEach((linea, n) => {
      if (n > 0) hijos.push({ tipo: 'salto' });
      hijos.push(...enLinea(linea, true));
    });
    bloques.push({ tipo: 'parrafo', hijos });
    parrafo = [];
  };
  const cerrarLista = () => {
    if (!lista) return;
    bloques.push({
      tipo: 'lista',
      ordenada: lista.ordenada,
      elementos: lista.elementos.map((e) => enLinea(e, true)),
    });
    lista = null;
  };

  for (const cruda of fuente.replace(/\r\n?/g, '\n').split('\n')) {
    const linea = cruda.trimEnd();
    if (linea.trim() === '') {
      cerrarParrafo();
      cerrarLista();
      continue;
    }
    const sinOrden = ELEMENTO_SIN_ORDEN.exec(linea);
    const ordenado = sinOrden ? null : ELEMENTO_ORDENADO.exec(linea);
    const elemento = sinOrden ?? ordenado;
    if (elemento) {
      cerrarParrafo();
      const esOrdenada = ordenado !== null;
      if (lista && lista.ordenada !== esOrdenada) cerrarLista();
      lista ??= { ordenada: esOrdenada, elementos: [] };
      lista.elementos.push(elemento[1]!.trim());
      continue;
    }
    cerrarLista();
    parrafo.push(linea.trim());
  }
  cerrarParrafo();
  cerrarLista();
  return bloques;
}
