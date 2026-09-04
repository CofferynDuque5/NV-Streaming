/**
 * editor-bridge.js — Lado TIENDA del editor visual en vivo.
 *
 * Cuando una página de la tienda se abre DENTRO del editor (en un iframe con
 * `?nved=1`), este módulo la convierte en un lienzo editable REAL:
 *   · Resalta al pasar el ratón cada ancla `data-nv-slot` (texto editable).
 *   · Al hacer clic, el texto se vuelve editable en el sitio (contentEditable);
 *     cada cambio se comunica al editor (postMessage) para el guardado.
 *   · Aplica en vivo lo que el editor manda: cambiar un texto, mostrar/ocultar un
 *     bloque (`data-nv-toggle`), o el tema (acento/fondo).
 *   · Reporta al editor la lista REAL de secciones/bloques de ESTA página, con su
 *     texto actual — así el panel del editor se llena con tus datos reales.
 *
 * Protocolo (postMessage):
 *   tienda → editor: {source:'nv-store', type:'ready'|'edit'|'select', …}
 *   editor → tienda: {source:'nv-editor', type:'set-text'|'toggle'|'theme'|'collect'|'apply'|'highlight', …}
 */
import NVCore from "../core.js";
import { aplicarTextoSlot, ocultarSlot, aplicarLayout, textoDeSlots, estadoToggles } from "./nv-layout.js";

// Etiquetas legibles para el panel del editor (fallback: el propio nombre).
const ETIQUETAS = {
  "hero.eyebrow": "Hero · Etiqueta", "hero.title": "Hero · Título", "hero.subtitle": "Hero · Subtítulo",
  "hero.stats": "Hero · Estadísticas", "hero.floating": "Hero · Tarjetas flotantes", "hero.eyebrow.box": "Hero · Chip de etiqueta",
  "s2.title": "Servicios populares · Título", "s3.title": "Feature · Título", "s4.title": "Combos · Título", "s6.title": "CTA final · Título",
  "cat.title": "Catálogo · Título", "cat.subtitle": "Catálogo · Subtítulo",
};
function etiqueta(nombre) { return ETIQUETAS[nombre] || nombre; }

function enEditor() {
  try { return window.parent !== window && new URLSearchParams(location.search).has("nved"); } catch (_) { return false; }
}
function enviar(msg) { try { window.parent.postMessage(Object.assign({ source: "nv-store" }, msg), "*"); } catch (_) {} }

let seleccionado = null;

function inventario() {
  const slots = [];
  document.querySelectorAll("[data-nv-slot]").forEach((el) => {
    const n = el.getAttribute("data-nv-slot");
    if (!n) return;
    slots.push({ name: n, label: etiqueta(n), text: (el.textContent || "").trim(), multiline: (el.tagName === "P" || (el.textContent || "").length > 40) });
  });
  const toggles = [];
  document.querySelectorAll("[data-nv-toggle]").forEach((el) => {
    const n = el.getAttribute("data-nv-toggle");
    if (!n) return;
    toggles.push({ name: n, label: etiqueta(n), visible: !el.hidden });
  });
  return { slots, toggles };
}

function reportarListo() {
  const inv = inventario();
  enviar({ type: "ready", page: (document.body && document.body.getAttribute("data-nv-page")) || "", slots: inv.slots, toggles: inv.toggles });
}

function marcarEditables() {
  document.querySelectorAll("[data-nv-slot]").forEach((el) => {
    if (el.__nvEdit) return;
    el.__nvEdit = true;
    el.style.cursor = "text";
    el.setAttribute("data-nv-editable", "1");
    el.addEventListener("mouseenter", () => { if (el !== seleccionado) el.style.outline = "1.5px dashed rgba(123,102,255,0.6)"; el.style.outlineOffset = "3px"; });
    el.addEventListener("mouseleave", () => { if (el !== seleccionado) el.style.outline = "none"; });
    el.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); activar(el); }, true);
    el.addEventListener("input", () => enviar({ type: "edit", name: el.getAttribute("data-nv-slot"), value: (el.textContent || "").trim() }));
    el.addEventListener("blur", () => { el.removeAttribute("contenteditable"); });
  });
}

function activar(el) {
  if (seleccionado && seleccionado !== el) { seleccionado.style.outline = "none"; seleccionado.removeAttribute("contenteditable"); }
  seleccionado = el;
  el.style.outline = "2px solid #9B3FFF"; el.style.outlineOffset = "3px";
  el.setAttribute("contenteditable", "true");
  el.focus();
  enviar({ type: "select", name: el.getAttribute("data-nv-slot"), label: etiqueta(el.getAttribute("data-nv-slot")), text: (el.textContent || "").trim() });
}

function alMensaje(ev) {
  const d = ev.data;
  if (!d || d.source !== "nv-editor") return;
  if (d.type === "set-text") { aplicarTextoSlot(d.name, d.value); }
  else if (d.type === "toggle") { ocultarSlot(d.name, !d.visible); } // NO re-reportar 'ready' (evita bucle de mensajes)
  else if (d.type === "theme") { if (NVCore.aplicarTema) NVCore.aplicarTema(Object.assign({}, NVCore.Store.get("tema"), d.tokens || {})); }
  else if (d.type === "apply") { aplicarLayout({ slots: d.slots || {}, hidden: d.hidden || {} }); reportarListo(); }
  else if (d.type === "highlight") { const el = document.querySelector('[data-nv-slot="' + CSS.escape(d.name) + '"]'); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); activar(el); } }
  else if (d.type === "collect") { enviar({ type: "collected", slots: textoDeSlots(), hidden: estadoToggles() }); }
}

export function instalarEditorBridge() {
  if (typeof document === "undefined" || !enEditor() || window.__NV_EDITOR_BRIDGE) return;
  window.__NV_EDITOR_BRIDGE = true;
  document.documentElement.setAttribute("data-nv-editor-mode", "1");
  window.addEventListener("message", alMensaje);

  const arranque = () => { marcarEditables(); reportarListo(); };
  arranque();
  // El runtime repinta; re-marcamos y re-reportamos (con antirrebote).
  if (NVCore.Bus && NVCore.Bus.on) { NVCore.Bus.on("app:ready", arranque); NVCore.Bus.on("catalogo:real", arranque); }
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window) {
    let pend = 0;
    new MutationObserver(() => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; marcarEditables(); }); }).observe(root, { childList: true, subtree: true });
  }
  // Reintento de reporte por si el inventario cambia al llegar datos reales.
  setTimeout(reportarListo, 1200);
  setTimeout(reportarListo, 2600);
}

export default { instalarEditorBridge };
