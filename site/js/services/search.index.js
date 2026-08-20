/**
 * search.index.js — Índice de Búsqueda en memoria (POO · SOLID).
 *
 * Responsabilidad ÚNICA (SRP): indexar el catálogo y resolver consultas en
 * tiempo casi constante, SIN escanear linealmente todas las tarjetas ni el DOM.
 *
 * Estructuras:
 *   · `_tokenMap`  — tabla hash  token → Set(id_servicio)   → coincidencia exacta O(1)
 *   · `_prefijos`  — tabla hash  prefijo(1..N) → Set(id)     → búsqueda por prefijo O(k)
 *   · `_docs`      — Map id → texto plano para desempate/ranking
 *
 * Una consulta se tokeniza y se intersecan los conjuntos de cada término
 * (búsqueda AND por prefijo). Complejidad ≈ O(long_consulta), independiente del
 * tamaño del catálogo. El índice se reconstruye SOLO cuando cambia el catálogo
 * (evento `store:servicios`), no en cada tecleo. No usa skeletons ni lazy-load:
 * la optimización es puramente algorítmica.
 */

const MAX_PREFIJO = 12; // longitud máxima de prefijo indexado

function tokenizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos (diacriticos combinados)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export class IndiceBusqueda {
  constructor() {
    this._tokenMap = new Map();  // token completo → Set(id)
    this._prefijos = new Map();  // prefijo → Set(id)
    this._docs = new Map();      // id → { servicio, texto }
    this._size = 0;
  }

  get tamano() { return this._size; }

  _add(mapa, clave, id) {
    let set = mapa.get(clave);
    if (!set) { set = new Set(); mapa.set(clave, set); }
    set.add(id);
  }

  /** (Re)construye el índice a partir de la lista de servicios normalizados. */
  construir(servicios) {
    this._tokenMap.clear();
    this._prefijos.clear();
    this._docs.clear();
    for (const s of servicios || []) {
      const id = s.id_servicio || s.id;
      if (!id) continue;
      const campos = [s.nombre_display, s.categoria, s.mundo, s.descripcion, (s.tags || []).join(" ")];
      const texto = campos.join(" ");
      this._docs.set(id, { servicio: s, texto: texto.toLowerCase() });
      const tokens = tokenizar(texto);
      for (const tok of tokens) {
        this._add(this._tokenMap, tok, id);
        const lim = Math.min(tok.length, MAX_PREFIJO);
        for (let n = 1; n <= lim; n++) this._add(this._prefijos, tok.slice(0, n), id);
      }
    }
    this._size = this._docs.size;
    return this;
  }

  /** Conjunto de ids que coinciden con UN término (por prefijo). */
  _idsDeTermino(termino) {
    if (termino.length <= MAX_PREFIJO) return this._prefijos.get(termino) || new Set();
    // Términos largos: usa el prefijo indexado y filtra por texto completo.
    const base = this._prefijos.get(termino.slice(0, MAX_PREFIJO)) || new Set();
    const out = new Set();
    for (const id of base) { const d = this._docs.get(id); if (d && d.texto.includes(termino)) out.add(id); }
    return out;
  }

  /**
   * Devuelve el conjunto de ids que satisfacen TODOS los términos (AND).
   * Consulta vacía → null (equivale a "sin filtro").
   */
  idsCoincidentes(consulta) {
    const terminos = tokenizar(consulta);
    if (!terminos.length) return null;
    let acc = null;
    for (const t of terminos) {
      const ids = this._idsDeTermino(t);
      if (acc === null) acc = new Set(ids);
      else for (const id of [...acc]) if (!ids.has(id)) acc.delete(id);
      if (acc.size === 0) break;
    }
    return acc || new Set();
  }

  /** Servicios coincidentes (ordenados: nombre que empieza por la consulta primero). */
  buscar(consulta) {
    const ids = this.idsCoincidentes(consulta);
    if (ids === null) return [...this._docs.values()].map((d) => d.servicio);
    const q = tokenizar(consulta)[0] || "";
    return [...ids]
      .map((id) => this._docs.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        const an = a.servicio.nombre_display.toLowerCase();
        const bn = b.servicio.nombre_display.toLowerCase();
        const ap = an.startsWith(q) ? 0 : 1;
        const bp = bn.startsWith(q) ? 0 : 1;
        return ap - bp || an.localeCompare(bn);
      })
      .map((d) => d.servicio);
  }
}

/** Instancia única compartida. */
export const indiceBusqueda = new IndiceBusqueda();

export default IndiceBusqueda;
