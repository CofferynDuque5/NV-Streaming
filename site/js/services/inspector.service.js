/**
 * inspector.service.js — Inspector de Estructura de Datos (POO · SRP).
 *
 * Responsabilidad ÚNICA: mapear dinámicamente TODAS las colecciones reales de
 * PostgreSQL, inferir sus campos y el tipo de dato PostgreSQL de cada uno a partir
 * de los documentos vivos (los que ya están sincronizados en el Store por
 * `onSnapshot`, o el seed canónico si se está offline). No inventa campos: solo
 * reporta lo que existe en los documentos reales.
 *
 * Salida: un objeto de reporte homogéneo consumible por la UI y por el PDF.
 * Modo `vivo`: refresca la muestra leyendo directamente de PostgreSQL (DB.getAll)
 * para las colecciones que lo permitan.
 */

import NVCore from "../core.js";

const { Store, DB } = NVCore;

// Mapa canónico  colección PostgreSQL → clave del Store (fuente de verdad real).
// Refleja las 24 colecciones auditadas + los 3 documentos de configuración.
const COLECCIONES = [
  { coll: "servicios_sistema", key: "servicios", grupo: "Catálogo" },
  { coll: "ofertas", key: "ofertas", grupo: "Catálogo" },
  { coll: "combos_suscripciones", key: "combos", grupo: "Catálogo" },
  { coll: "carteleras_estrenos", key: "carteleras", grupo: "Catálogo" },
  { coll: "tarjetas_header", key: "tarjetasHeader", grupo: "Catálogo" },
  { coll: "metodos_pago_config", key: "metodosPago", grupo: "Pagos" },
  { coll: "pedidos", key: "pedidos", grupo: "Ventas" },
  { coll: "recargas", key: "recargas", grupo: "Ventas" },
  { coll: "recargas_billetera", key: "recargasBilletera", grupo: "Ventas" },
  { coll: "historial_movimientos", key: "movimientos", grupo: "Ventas" },
  { coll: "suscripciones", key: "suscripciones", grupo: "Operación" },
  { coll: "renovaciones_pendientes", key: "renovaciones", grupo: "Operación" },
  { coll: "inventario", key: "inventario", grupo: "Operación" },
  { coll: "usuarios", key: "usuarios", grupo: "Usuarios" },
  { coll: "comentarios", key: "comentarios", grupo: "Contenido" },
  { coll: "preguntas_frecuentes", key: "faqs", grupo: "Contenido" },
  { coll: "chats_soporte", key: "chats", grupo: "Soporte" },
  { coll: "tickets_soporte", key: "tickets", grupo: "Soporte" },
  { coll: "respuestas_rapidas", key: "respuestasRapidas", grupo: "Soporte" },
  { coll: "notificaciones_admin", key: "notifAdmin", grupo: "Sistema" },
  { coll: "flyers_revendedores", key: "flyers", grupo: "Revendedores" },
  { coll: "paginas_layout", key: "paginasLayout", grupo: "Editor / CMS" },
  { coll: "plataformas", key: "plataformas", grupo: "Módulo OTP" },
  { coll: "codigos_verificacion", key: "codigos", grupo: "Módulo OTP" },
  { coll: "plantillas_permisos", key: "permisos", grupo: "Módulo OTP" },
  // Documentos fijos de configuración_sistema (cada uno con su propio esquema).
  { coll: "configuracion_sistema/parametros", key: "parametros", grupo: "Configuración", doc: true },
  { coll: "configuracion_sistema/plantillas_mensajes", key: "plantillas", grupo: "Configuración", doc: true },
  { coll: "configuracion_sistema/tema_interfaz", key: "tema", grupo: "Configuración", doc: true },
];

const IGNORAR = new Set(["id", "_id"]);

export class InspectorDatosService {
  /** @param {{store?:object, db?:object}} [deps] Inyección para pruebas (DIP). */
  constructor(deps = {}) {
    this._store = deps.store || Store;
    this._db = deps.db || DB;
  }

  /** Tipo de dato PostgreSQL de un valor. */
  tipoDe(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "number") return "number";
    if (typeof v === "string") return "string";
    if (Array.isArray(v)) return "array";
    if (v instanceof Date) return "timestamp";
    if (typeof v === "object") {
      if (typeof v.toDate === "function" || typeof v.seconds === "number") return "timestamp";
      return "map";
    }
    return typeof v;
  }

  /** Vista previa corta y segura de un valor de ejemplo. */
  ejemploDe(v) {
    const t = this.tipoDe(v);
    if (t === "null") return "—";
    if (t === "timestamp") { const d = v instanceof Date ? v : (v.toDate ? v.toDate() : new Date((v.seconds || 0) * 1000)); return isNaN(d) ? "timestamp" : d.toISOString().slice(0, 10); }
    if (t === "array") return "[" + v.length + " ítems]";
    if (t === "map") return "{" + Object.keys(v).length + " campos}";
    let s = String(v);
    if (t === "string" && s.length > 46) s = s.slice(0, 44) + "…";
    return s;
  }

  /** Documentos reales de una colección (Store; el seed ya vive ahí si offline). */
  _docsDe(entry) {
    const val = this._store.get(entry.key);
    if (entry.doc) return val && typeof val === "object" ? [val] : [];
    return Array.isArray(val) ? val : [];
  }

  /** Infiere el esquema (campos + tipos) de una lista de documentos. */
  _esquema(docs) {
    const campos = new Map();
    for (const d of docs) {
      if (!d || typeof d !== "object") continue;
      for (const [k, v] of Object.entries(d)) {
        if (IGNORAR.has(k)) continue;
        let c = campos.get(k);
        if (!c) { c = { nombre: k, tipos: new Set(), presentes: 0, ejemplo: undefined }; campos.set(k, c); }
        c.tipos.add(this.tipoDe(v));
        c.presentes++;
        if (c.ejemplo === undefined && v !== undefined && v !== null && v !== "") c.ejemplo = this.ejemploDe(v);
      }
    }
    return [...campos.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((c) => ({
        nombre: c.nombre,
        tipo: [...c.tipos].join(" | "),
        tipos: [...c.tipos],
        siemprePresente: c.presentes === docs.length,
        cobertura: docs.length ? Math.round((c.presentes / docs.length) * 100) : 0,
        ejemplo: c.ejemplo != null ? c.ejemplo : "—",
      }));
  }

  /**
   * Ejecuta la inspección completa sobre los datos reales del Store.
   * @returns {{generadoEn:Date, entorno:string, marca:string, totalColecciones:number, totalDocumentos:number, totalCampos:number, colecciones:Array}}
   */
  inspeccionar() {
    const colecciones = COLECCIONES.map((entry) => {
      const docs = this._docsDe(entry);
      const campos = this._esquema(docs);
      return {
        nombre: entry.coll,
        storeKey: entry.key,
        grupo: entry.grupo,
        esDocumento: !!entry.doc,
        totalDocs: docs.length,
        totalCampos: campos.length,
        campos,
      };
    });
    const totalDocumentos = colecciones.reduce((a, c) => a + c.totalDocs, 0);
    const totalCampos = colecciones.reduce((a, c) => a + c.totalCampos, 0);
    return {
      generadoEn: this._ahora(),
      entorno: this._db && this._db.online ? "firestore (en vivo)" : "seed local",
      marca: "NV STREAMING",
      totalColecciones: colecciones.length,
      totalDocumentos,
      totalCampos,
      colecciones,
    };
  }

  /**
   * Inspección "en vivo": refresca la muestra leyendo de PostgreSQL directamente
   * (para colecciones planas). Cae con elegancia al Store si algo falla.
   */
  async inspeccionarVivo() {
    if (!this._db || !this._db.online) return this.inspeccionar();
    await Promise.all(COLECCIONES.filter((e) => !e.doc).map(async (e) => {
      try {
        const docs = await this._db.getAll(e.coll);
        if (Array.isArray(docs)) this._store.set(e.key, docs);
      } catch (_) { /* conserva lo que haya en el Store */ }
    }));
    return this.inspeccionar();
  }

  _ahora() {
    // new Date() sin argumentos está permitido en el navegador (no en workflows).
    try { return new Date(); } catch (_) { return null; }
  }
}

export const inspectorDatos = new InspectorDatosService();
export default InspectorDatosService;
