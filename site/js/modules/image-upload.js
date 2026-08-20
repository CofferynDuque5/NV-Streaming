/**
 * image-upload.js — Integración nativa de subida de imágenes con ImgBB.
 *
 * Expone `window.NV.imagenes` y engancha, de forma no intrusiva, cualquier
 * `<input type="file" data-imgbb>` del panel (admin/editor). Al elegir un
 * archivo lo sube con `ServicioImagenes` y coloca la URL pública resultante en
 * el destino indicado por `data-imgbb-target` (un selector CSS) o en el
 * siguiente input de texto, actualizando además una vista previa si existe.
 *
 * No interfiere con la captura de comprobantes de pago (esos inputs NO llevan
 * `data-imgbb`). No inventa URLs: si falta la API key, avisa al operador.
 */
import { servicioImagenes, ServicioImagenes } from "../services/imgbb.service.js";

function toast(msg, color) {
  if (window.NV && window.NV.toast) return window.NV.toast(msg, color);
  console.log("[imgbb]", msg);
}

async function subir(entrada, meta) {
  return servicioImagenes.subir(entrada, meta);
}

function resolverDestino(input) {
  const sel = input.getAttribute("data-imgbb-target");
  if (sel) return document.querySelector(sel);
  // Por defecto: el siguiente input de texto (campo de URL) del formulario.
  const cont = input.closest("form,[data-imgbb-field],div,section") || document;
  return cont.querySelector('input[type="text"],input[type="url"],textarea');
}

function resolverPreview(input) {
  const sel = input.getAttribute("data-imgbb-preview");
  return sel ? document.querySelector(sel) : null;
}

async function onChange(ev) {
  const input = ev.target;
  if (!input || input.type !== "file" || !input.hasAttribute("data-imgbb")) return;
  const file = input.files && input.files[0];
  if (!file) return;

  if (!servicioImagenes.configurado) {
    toast("Configura tu API key de ImgBB en NV_CONFIG.imgbb.apiKey", "rgba(255,176,32,0.5)");
    return;
  }
  const prev = resolverPreview(input);
  const destino = resolverDestino(input);
  toast("Subiendo imagen a ImgBB…", "rgba(0,207,255,0.5)");
  try {
    const res = await subir(file, { nombre: input.getAttribute("data-imgbb-name") || file.name });
    if (destino) { destino.value = res.url; destino.dispatchEvent(new Event("input", { bubbles: true })); }
    if (prev && prev.tagName === "IMG") prev.src = res.display_url || res.url;
    input.dataset.imgbbUrl = res.url;
    input.dataset.imgbbDelete = res.delete_url;
    if (window.NVSound) window.NVSound.reproducir("success");
    toast("Imagen subida ✓", "rgba(0,212,160,0.55)");
    if (window.NV && window.NV.core && window.NV.core.Bus) window.NV.core.Bus.emit("imgbb:subida", res);
  } catch (e) {
    if (window.NVSound) window.NVSound.reproducir("error");
    toast("Error al subir: " + (e && e.message || e), "rgba(255,68,102,0.5)");
  }
}

export function instalarSubidaImagenes() {
  if (typeof document === "undefined") return;
  document.addEventListener("change", onChange, true);
  window.NV = Object.assign(window.NV || {}, {
    imagenes: { subir, servicio: servicioImagenes, ServicioImagenes },
  });
}

export default { instalarSubidaImagenes };
