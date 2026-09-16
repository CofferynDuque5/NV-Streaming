/**
 * imgbb.service.js — Servicio de Persistencia de Imágenes (POO · SOLID).
 *
 * Responsabilidad ÚNICA (SRP): subir imágenes y devolver la URL pública para
 * persistir en PostgreSQL (logo_url, tarjeta_url, imagen_url, banner_url…).
 *
 * La subida la hace el BACKEND (`POST /api/admin/medios`): el navegador manda
 * la imagen en base64 y el servidor la reenvía a ImgBB con la clave guardada en
 * su `.env` (IMGBB_API_KEY). Así la API key nunca viaja al cliente ni se
 * versiona, y cada imagen queda registrada en la biblioteca de medios (tabla
 * `medios`) para verla, reutilizarla o quitarla desde el editor.
 *
 * Si el servidor no tiene clave responde 503 `imgbb_no_configurado` y este
 * servicio lo traduce a un mensaje claro para el operador. No inventa URLs.
 */
import { NVApi } from "./nv-api.js";

export class ServicioImagenes {
  /**
   * @param {object} opts
   * @param {object} [opts.api]  Cliente REST inyectable (DIP) con subirMedio/medios/borrarMedio.
   */
  constructor(opts = {}) {
    this._api = opts.api || NVApi;
    this._estado = null; // { configurado } cacheado tras la primera consulta
  }

  /** ¿Sabemos ya que el backend tiene IMGBB_API_KEY? (null = aún no consultado) */
  get configurado() { return this._estado ? !!this._estado.configurado : null; }

  /** Consulta al backend si ImgBB está configurado (y cachea). */
  async estado() {
    try { const r = await this._api.medios(); this._estado = { configurado: !!(r && r.configurado) }; }
    catch (_) { this._estado = null; }
    return this._estado ? this._estado.configurado : false;
  }

  /** Convierte un File/Blob a dataURL (`data:<mime>;base64,...`). */
  static aDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(file);
    });
  }

  /** Normaliza la entrada (File | dataURL | base64) a dataURL o base64 puro. */
  async _normalizar(entrada) {
    if (typeof entrada === "string") return entrada.trim();
    if (entrada instanceof Blob) {
      if (entrada.size > 8 * 1024 * 1024) throw new Error("La imagen pesa más de 8 MB.");
      if (entrada.type && !/^image\//.test(entrada.type)) throw new Error("Solo se admiten imágenes.");
      return ServicioImagenes.aDataURL(entrada);
    }
    throw new Error("Formato de imagen no soportado");
  }

  /**
   * Sube una imagen (vía backend → ImgBB) y devuelve un contrato homogéneo.
   * @param {File|Blob|string} entrada  Archivo, dataURL o base64.
   * @param {object} [meta]
   * @param {string} [meta.nombre]  Nombre lógico del asset.
   * @param {string} [meta.uso]     logo | servicio | combo | banner | cartelera | general.
   * @returns {Promise<{id:string,url:string,display_url:string,thumb:string,delete_url:string,size:number,medio:object}>}
   */
  async subir(entrada, meta = {}) {
    const imagen = await this._normalizar(entrada);
    let medio;
    try {
      medio = await this._api.subirMedio({ imagen, nombre: meta.nombre || "imagen", uso: meta.uso || "general" });
    } catch (e) {
      const code = e && e.data && e.data.error;
      if (e && e.status === 503 && code === "imgbb_no_configurado") {
        this._estado = { configurado: false };
        throw new Error("El servidor no tiene IMGBB_API_KEY. Añádela en whatsapp-agent/.env (o en el .env raíz con Docker) y reinicia el backend.");
      }
      if (e && e.status === 401) throw new Error("Inicia sesión como administrador para subir imágenes.");
      if (e && e.status === 413) throw new Error("La imagen es demasiado grande (máximo 8 MB).");
      throw new Error((e && e.message) || "No se pudo subir la imagen.");
    }
    if (!medio || !medio.url) throw new Error("El servidor no devolvió la URL de la imagen.");
    this._estado = { configurado: true };
    return {
      id: medio.id || "",
      url: medio.url,
      display_url: medio.display_url || medio.url,
      thumb: medio.thumb_url || medio.url,
      delete_url: medio.delete_url || "",
      size: Number(medio.tamano) || 0,
      medio,
    };
  }

  /** Lista la biblioteca real (orden: más reciente primero). */
  async listar() {
    const r = await this._api.medios();
    this._estado = { configurado: !!(r && r.configurado) };
    return (r && Array.isArray(r.medios)) ? r.medios : [];
  }

  /** Quita un medio de la biblioteca. Devuelve { ok, medio, delete_url, nota }. */
  async borrar(id) { return this._api.borrarMedio(id); }
}

/** Instancia única compartida. */
export const servicioImagenes = new ServicioImagenes();

export default ServicioImagenes;
