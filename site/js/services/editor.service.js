/**
 * editor.service.js — Persistencia del Editor/CMS (POO · SRP).
 *
 * Responsabilidad ÚNICA: guardar en PostgreSQL lo que el editor visual produce,
 * sin datos ficticios. Cubre:
 *   · Layout por página (secciones visibles, acento, fondo, componentes) →
 *     colección `paginas_layout` (1 documento por página, id estable).
 *   · Tokens de tema (acento/fondo) → `configuracion_sistema/tema_interfaz`.
 *   · Componentes sueltos (servicios, ofertas, combos, banners…) → CRUD genérico.
 *
 * Escribe en PostgreSQL cuando hay conexión; si está offline, refleja en el Store
 * para que el editor no pierda el trabajo (y avisa que no se persistió).
 */
import NVCore from "../core.js";

const { DB, Store } = NVCore;

export class EditorService {
  constructor(deps = {}) {
    this._db = deps.db || DB;
    this._store = deps.store || Store;
  }

  online() { return !!this._db.online; }

  _slug(s) {
    return (String(s == null ? "home" : s).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")) || "home";
  }

  /** Guarda el layout de una página (idempotente por id estable). */
  async guardarLayout(pagina, layout) {
    const id = "pagina_" + this._slug(pagina);
    const doc = Object.assign({ id_pagina: id, pagina: String(pagina || "Home") }, layout, { actualizadoEn: this._db.fx.serverTimestamp() });
    if (this._db.online) await this._db.setOne("paginas_layout", id, doc, true);
    // Refleja en el Store para consumo inmediato (y respaldo offline).
    const resto = (this._store.get("paginasLayout") || []).filter((p) => p.id !== id);
    this._store.set("paginasLayout", [Object.assign({ id }, doc), ...resto]);
    return { id, persistido: this._db.online };
  }

  /** Carga el layout guardado de una página (PostgreSQL o Store). */
  async cargarLayout(pagina) {
    const id = "pagina_" + this._slug(pagina);
    if (this._db.online) { try { const d = await this._db.getOne("paginas_layout", id); if (d) return d; } catch (_) {} }
    return (this._store.get("paginasLayout") || []).find((p) => p.id === id) || null;
  }

  /** Persiste tokens de tema (merge) y repinta en vivo. */
  async guardarTema(tokens) {
    if (this._db.online) await this._db.setOne("configuracion_sistema", "tema_interfaz", tokens, true);
    if (NVCore.aplicarTema) NVCore.aplicarTema(Object.assign({}, this._store.get("tema"), tokens));
    return this._db.online;
  }

  /** CRUD genérico de un componente/registro de cualquier colección. */
  async guardarComponente(coll, id, datos) {
    if (id) { if (this._db.online) await this._db.setOne(coll, id, datos, true); }
    else if (this._db.online) id = await this._db.add(coll, datos);
    // Reflejo optimista en el Store bajo la clave que use la app.
    return id;
  }

  async eliminarComponente(coll, id) {
    if (this._db.online) await this._db.remove(coll, id);
    return true;
  }
}

export const editorService = new EditorService();
export default EditorService;
