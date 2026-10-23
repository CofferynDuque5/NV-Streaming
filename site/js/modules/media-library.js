/**
 * media-library.js — Biblioteca de medios del editor (pestaña "Medios").
 *
 * Fuente de verdad: tabla `medios` de PostgreSQL (GET/POST/DELETE
 * /api/admin/medios). Las imágenes se alojan en ImgBB, subidas por el backend
 * con su propia clave. Este módulo mantiene una caché local de la lista y
 * expone `window.NVMedios` para que la plantilla del editor (renderVals) pinte
 * la biblioteca real: ver, subir, copiar URL, usar como logo y quitar.
 *
 * Sin datos inventados: si no hay imágenes se muestra el estado vacío; si el
 * backend no tiene IMGBB_API_KEY se avisa con el paso exacto para resolverlo.
 */
import NVCore from "../core.js";
import { servicioImagenes } from "../services/imgbb.service.js";
import { editorService } from "../services/editor.service.js";
import { reproducir } from "./sound.js";

const { Store, Bus } = NVCore;

const st = { lista: [], configurado: null, cargando: false, error: "", subiendo: false, cargado: false };
let inputFile = null;

function instancia() { return (typeof window !== "undefined" && window.__NV_INSTANCE) || null; }
function repintar() { const i = instancia(); if (i && i.setState) i.setState({ _mediosTick: Date.now() }); }
function toast(msg, color) { if (window.NV && window.NV.toast) window.NV.toast(msg, color); }
function ui() { return window.NVUI || null; }

async function cargar() {
  if (st.cargando) return;
  st.cargando = true; st.error = ""; repintar();
  try {
    st.lista = await servicioImagenes.listar();
    st.configurado = servicioImagenes.configurado;
  } catch (e) {
    st.error = (e && e.status === 401) ? "Inicia sesión como administrador para ver la biblioteca." : ((e && e.message) || "No se pudo cargar la biblioteca.");
  } finally {
    st.cargando = false; st.cargado = true; repintar();
  }
}

/** Sube un archivo (File) a la biblioteca. Devuelve el resultado del servicio o null. */
async function subirArchivo(file, uso) {
  if (!file) return null;
  st.subiendo = true; st.error = ""; repintar();
  toast("Subiendo imagen…", "rgba(0,207,255,0.5)");
  try {
    const r = await servicioImagenes.subir(file, { nombre: (file.name || "imagen").replace(/\.[a-z0-9]+$/i, ""), uso: uso || "general" });
    if (r && r.medio) st.lista = [r.medio].concat(st.lista.filter((m) => m.id !== r.medio.id));
    st.configurado = true;
    reproducir("success");
    toast("Imagen subida ✓", "rgba(0,212,160,0.55)");
    Bus && Bus.emit && Bus.emit("medios:subida", r);
    return r;
  } catch (e) {
    reproducir("error");
    st.error = (e && e.message) || "No se pudo subir la imagen.";
    if (/IMGBB_API_KEY/.test(st.error)) st.configurado = false;
    toast("Error al subir: " + st.error, "rgba(255,68,102,0.5)");
    return null;
  } finally {
    st.subiendo = false; repintar();
  }
}

/** Abre el selector de archivos del sistema y sube lo elegido. */
function elegirYSubir(uso) {
  if (!inputFile) {
    inputFile = document.createElement("input");
    inputFile.type = "file"; inputFile.accept = "image/*"; inputFile.id = "nv-medios-file"; inputFile.hidden = true;
    inputFile.setAttribute("data-nv-ux", "1");
    inputFile.addEventListener("change", async () => {
      const f = inputFile.files && inputFile.files[0];
      const u = inputFile.dataset.uso || "general";
      inputFile.value = "";
      await subirArchivo(f, u);
    });
    document.body.appendChild(inputFile);
  }
  inputFile.dataset.uso = uso || "general";
  inputFile.click();
}

async function usarComoLogo(m) {
  if (!m || !m.url) return;
  try {
    await editorService.guardarTema({ logo_url_img: m.url });
    reproducir("success");
    toast(editorService.online() ? "Logo guardado en la base de datos ✓" : "Logo aplicado (sin conexión: no se persistió)", "rgba(0,212,160,0.55)");
    repintar();
  } catch (e) { reproducir("error"); toast("No se pudo guardar el logo: " + ((e && e.message) || e), "rgba(255,68,102,0.5)"); }
}

async function copiarUrl(m) {
  if (!m || !m.url) return;
  try { await navigator.clipboard.writeText(m.url); toast("URL copiada", "rgba(0,207,255,0.5)"); }
  catch (_) { window.prompt("Copia la URL de la imagen:", m.url); }
}

async function borrar(m) {
  if (!m || !m.id) return;
  const U = ui();
  const ok = U ? await U.confirmar("Quitar de la biblioteca", `¿Quitar "${m.nombre}" de la biblioteca? Si está en uso (logo, tarjeta…) esa referencia dejará de mostrarse cuando la cambies.`, "Quitar")
               : window.confirm(`¿Quitar "${m.nombre}" de la biblioteca?`);
  if (!ok) return;
  try {
    const r = await servicioImagenes.borrar(m.id);
    st.lista = st.lista.filter((x) => x.id !== m.id);
    reproducir("success");
    toast("Quitado de la biblioteca", "rgba(0,212,160,0.55)");
    repintar();
    // ImgBB no permite borrar por API: ofrecemos su página de borrado.
    if (r && r.delete_url && U) {
      const abrir = await U.confirmar("Borrar también en ImgBB", "El archivo sigue alojado en ImgBB. ¿Abrir su página de borrado en una pestaña nueva?", "Abrir");
      if (abrir) window.open(r.delete_url, "_blank", "noopener");
    }
  } catch (e) {
    reproducir("error");
    toast("No se pudo quitar: " + ((e && e.message) || e), "rgba(255,68,102,0.5)");
  }
}

function logoActual() { const t = Store.get("tema") || {}; return t.logo_url_img || ""; }

/** Snapshot para la plantilla del editor (renderVals). */
function estado() {
  const logo = logoActual();
  return {
    lista: st.lista,
    configurado: st.configurado,
    cargando: st.cargando,
    subiendo: st.subiendo,
    error: st.error,
    cargado: st.cargado,
    logoUrl: logo,
  };
}

export function instalarBibliotecaMedios() {
  const page = (typeof window !== "undefined" && window.__NV_PAGE) || (document.body && document.body.getAttribute("data-nv-page"));
  if (page !== "editor") return;
  window.NVMedios = { estado, cargar, subirArchivo, elegirYSubir, usarComoLogo, copiarUrl, borrar, logoActual };
  Store.subscribe && Store.subscribe("tema", () => repintar());
  // Cuando otra parte del panel sube algo (p.ej. el panel del logo), refresca.
  Bus && Bus.on && Bus.on("imgbb:subida", () => cargar());
  // Carga inicial cuando la app está lista (sesión/token ya disponibles).
  const arranca = () => { cargar(); };
  if (Bus && Bus.on) Bus.on("app:ready", arranca);
  setTimeout(() => { if (!st.cargado && !st.cargando) arranca(); }, 1500);
}

export default { instalarBibliotecaMedios };
