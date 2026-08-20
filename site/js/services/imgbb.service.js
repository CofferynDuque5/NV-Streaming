/**
 * imgbb.service.js — Servicio de Persistencia de Imágenes (POO · SOLID).
 *
 * Responsabilidad ÚNICA (SRP): subir imágenes a ImgBB (https://api.imgbb.com,
 * plan gratuito sin caducidad) y devolver la URL pública para persistir en
 * PostgreSQL (logo_url, tarjeta_url, imagen_url, banner_url, comprobante…).
 *
 * ImgBB acepta el archivo como base64 en un `POST multipart/form-data` contra
 * `https://api.imgbb.com/1/upload?key=API_KEY`. Esta clase encapsula el armado
 * del payload, el manejo de la respuesta y los errores, sin acoplarse a la UI.
 *
 * La API key se lee de `window.NV_CONFIG.imgbb.apiKey` (NO se hardcodea ninguna
 * credencial). Si falta, `subir()` lanza un error claro para que el panel guíe
 * al administrador a configurarla. Sin datos ficticios ni URLs inventadas.
 */

const ENDPOINT = "https://api.imgbb.com/1/upload";

export class ServicioImagenes {
  /**
   * @param {object} opts
   * @param {string} [opts.apiKey]  API key de ImgBB (por defecto de NV_CONFIG).
   * @param {typeof fetch} [opts.fetchImpl]  Inyectable para pruebas (DIP).
   */
  constructor(opts = {}) {
    const cfg = (typeof window !== "undefined" && window.NV_CONFIG && window.NV_CONFIG.imgbb) || {};
    this._apiKey = opts.apiKey || cfg.apiKey || "";
    this._fetch = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  }

  get configurado() { return !!this._apiKey; }

  /** Convierte un File/Blob a base64 puro (sin el prefijo `data:...;base64,`). */
  static aBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result || ""); resolve(s.includes(",") ? s.split(",")[1] : s); };
      r.onerror = () => reject(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(file);
    });
  }

  /** Normaliza la entrada (File | dataURL | base64) a base64 puro. */
  async _normalizar(entrada) {
    if (typeof entrada === "string") return entrada.includes(",") ? entrada.split(",")[1] : entrada;
    if (entrada instanceof Blob) return ServicioImagenes.aBase64(entrada);
    throw new Error("Formato de imagen no soportado");
  }

  /**
   * Sube una imagen y devuelve un contrato homogéneo.
   * @param {File|Blob|string} entrada  Archivo, dataURL o base64.
   * @param {object} [meta]
   * @param {string} [meta.nombre]   Nombre lógico del asset.
   * @param {number} [meta.expira]   Segundos hasta autoborrado (0 = permanente).
   * @returns {Promise<{url:string, display_url:string, thumb:string, delete_url:string, id:string, size:number}>}
   */
  async subir(entrada, meta = {}) {
    if (!this._apiKey) throw new Error("Falta la API key de ImgBB. Configúrala en NV_CONFIG.imgbb.apiKey.");
    if (!this._fetch) throw new Error("fetch no disponible en este entorno.");

    const base64 = await this._normalizar(entrada);
    const form = new FormData();
    form.append("key", this._apiKey);
    form.append("image", base64);
    if (meta.nombre) form.append("name", meta.nombre);

    const url = ENDPOINT + (meta.expira ? "?expiration=" + Math.max(60, meta.expira) : "");
    let res;
    try {
      res = await this._fetch(url, { method: "POST", body: form });
    } catch (e) {
      throw new Error("Red no disponible al subir a ImgBB: " + (e && e.message));
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error("Respuesta inválida de ImgBB"); }
    if (!res.ok || !json || json.success !== true || !json.data) {
      const msg = (json && json.error && json.error.message) || ("HTTP " + res.status);
      throw new Error("ImgBB rechazó la subida: " + msg);
    }
    const d = json.data;
    return {
      url: d.url || (d.image && d.image.url) || "",
      display_url: d.display_url || d.url || "",
      thumb: (d.thumb && d.thumb.url) || d.url || "",
      delete_url: d.delete_url || "",
      id: d.id || "",
      size: Number(d.size) || 0,
    };
  }
}

/** Instancia única compartida. */
export const servicioImagenes = new ServicioImagenes();

export default ServicioImagenes;
