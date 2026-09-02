/**
 * cache.ts — Caché en memoria con expiración (TTL) para lecturas calientes.
 *
 * Reduce viajes a PostgreSQL en datos que cambian poco (catálogo/CMS, parámetros).
 * Interfaz mínima (`obtenerO`) para poder sustituir el motor por Redis sin tocar
 * a los llamadores. Es por-instancia: en multi-réplica, cambiar el backend.
 */
export interface AlmacenCache {
  get<T>(clave: string): T | undefined;
  set<T>(clave: string, valor: T, ttlMs?: number): void;
  invalidar(prefijo?: string): void;
}

interface Entrada<T> { valor: T; expira: number; }

export class CacheTTL implements AlmacenCache {
  private readonly almacen = new Map<string, Entrada<unknown>>();

  constructor(private readonly ttlPorDefectoMs = 30_000) {}

  get<T>(clave: string): T | undefined {
    const entrada = this.almacen.get(clave);
    if (!entrada) return undefined;
    if (entrada.expira <= Date.now()) { this.almacen.delete(clave); return undefined; }
    return entrada.valor as T;
  }

  set<T>(clave: string, valor: T, ttlMs = this.ttlPorDefectoMs): void {
    this.almacen.set(clave, { valor, expira: Date.now() + ttlMs });
  }

  /** Devuelve el valor cacheado o lo calcula con `cargar` y lo guarda (memoize async). */
  async obtenerO<T>(clave: string, cargar: () => Promise<T>, ttlMs?: number): Promise<T> {
    const enCache = this.get<T>(clave);
    if (enCache !== undefined) return enCache;
    const valor = await cargar();
    this.set(clave, valor, ttlMs);
    return valor;
  }

  invalidar(prefijo?: string): void {
    if (!prefijo) { this.almacen.clear(); return; }
    for (const clave of this.almacen.keys()) if (clave.startsWith(prefijo)) this.almacen.delete(clave);
  }
}

/** Instancia compartida para el contenido de tienda (CMS). */
export const cacheCms = new CacheTTL(30_000);
