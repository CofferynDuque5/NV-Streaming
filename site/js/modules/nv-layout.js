/**
 * nv-layout.js — Renderiza en el sitio público lo que el editor visual PUBLICA.
 *
 * Modelo unificado por SLOTS (independiente de la página):
 *   layout = {
 *     slug, publicado,
 *     slots:  { "hero.title": "…", "hero.subtitle": "…", … },   // texto por ancla
 *     hidden: { "hero.stats": true, … },                         // bloques ocultos
 *   }
 * Cada ancla del HTML lleva `data-nv-slot="nombre"` (texto editable) y/o
 * `data-nv-toggle="nombre"` (bloque que se puede mostrar/ocultar).
 *
 * Aplica el documento PUBLICADO de la página actual sobre esas anclas. Es
 * idempotente y se re-aplica tras cada repintado del runtime (MutationObserver),
 * de modo que sobrevive a los re-render por datos reales.
 *
 * También exporta helpers (aplicarLayout, textoDeSlots, estadoToggles) que
 * reutiliza el modo editor (editor-bridge.js) para el preview en vivo.
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";

const { Bus, Store } = NVCore;

// data-nv-page → slug del documento (`pagina_<slug>`). Igual que EditorService._slug.
const SLUG_POR_PAGINA = {
  index: "home", catalogo: "catalogo", detalles: "detalle",
  "mi-cuenta": "mi_cuenta", pagos: "checkout", billetera: "billetera",
};

// Compatibilidad con el formato viejo (componentes por índice) del primer editor.
const COMPAT_INDEX = {
  1: { title: "hero.title", subtitle: "hero.subtitle", eyebrow: "hero.eyebrow" },
  2: { title: "s2.title" }, 3: { title: "s3.title" }, 4: { title: "s4.title" }, 6: { title: "s6.title" },
};
const COMPAT_TOGGLE = { showStats: "hero.stats", showFloating: "hero.floating", showEyebrow: "hero.eyebrow.box" };

function paginaActual() {
  return (typeof window !== "undefined" && window.__NV_PAGE) ||
    (document.body && document.body.getAttribute("data-nv-page")) || "";
}
export function slugDePagina(p) { return SLUG_POR_PAGINA[p || paginaActual()] || null; }
function tiene(v) { return v != null && String(v).trim() !== ""; }
function elSlot(nombre) { return document.querySelector('[data-nv-slot="' + CSS.escape(nombre) + '"]'); }
function elToggle(nombre) {
  return document.querySelector('[data-nv-toggle="' + CSS.escape(nombre) + '"]') || elSlot(nombre);
}

/** Sustituye el texto de un slot (seguro: textContent). El H1 del hero mantiene
 *  su gradiente reconstruyendo un único span. Idempotente. */
export function aplicarTextoSlot(nombre, valor) {
  const el = elSlot(nombre);
  if (!el || !tiene(valor)) return;
  const nuevo = String(valor);
  if ((el.textContent || "").trim() === nuevo.trim() && el.getAttribute("data-nv-editado") === "1") return;
  if (nombre === "hero.title") {
    el.textContent = "";
    const span = document.createElement("span");
    span.style.cssText = "display:block;font-size:78px;background:linear-gradient(120deg,#00CFFF 0%,#00DFFF 40%,#9B3FFF 80%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;";
    span.textContent = nuevo;
    el.appendChild(span);
  } else {
    el.textContent = nuevo;
  }
  el.setAttribute("data-nv-editado", "1");
}

/** Muestra u oculta un bloque (usa `hidden`). Idempotente. */
export function ocultarSlot(nombre, oculto) {
  const el = elToggle(nombre);
  if (!el || el.hidden === !!oculto) return;
  el.hidden = !!oculto;
}

/** Aplica un layout {slots, hidden} sobre el DOM. Acepta el formato viejo. */
export function aplicarLayout(layout) {
  if (!layout) return;
  try {
    const slots = layout.slots || {};
    for (const [n, v] of Object.entries(slots)) if (tiene(v)) aplicarTextoSlot(n, v);
    const hidden = layout.hidden || {};
    for (const [n, h] of Object.entries(hidden)) ocultarSlot(n, !!h);
    // ── Compat formato viejo (solo si no vino en el nuevo) ──
    if (!layout.slots && layout.componentes) {
      for (const [idx, campos] of Object.entries(COMPAT_INDEX)) {
        const c = layout.componentes[idx] || layout.componentes[String(idx)] || {};
        for (const [campo, nombre] of Object.entries(campos)) if (tiene(c[campo])) aplicarTextoSlot(nombre, c[campo]);
      }
    }
    if (!layout.hidden) {
      for (const [flag, nombre] of Object.entries(COMPAT_TOGGLE)) if (layout[flag] === false) ocultarSlot(nombre, true);
    }
  } catch (_) { /* nunca romper el storefront por el editor */ }
}

/** Lee el texto actual de todos los slots del DOM → { nombre: texto }. */
export function textoDeSlots() {
  const out = {};
  document.querySelectorAll("[data-nv-slot]").forEach((el) => {
    const n = el.getAttribute("data-nv-slot");
    if (n) out[n] = (el.textContent || "").trim();
  });
  return out;
}

/** Lee qué bloques están ocultos → { nombre: true } (slots y toggles). */
export function estadoToggles() {
  const out = {};
  document.querySelectorAll("[data-nv-toggle],[data-nv-slot]").forEach((el) => {
    const n = el.getAttribute("data-nv-toggle") || el.getAttribute("data-nv-slot");
    if (n && el.hidden) out[n] = true;
  });
  return out;
}

/* ─────────────────────────  RENDER PÚBLICO  ───────────────────────── */
let layoutActual = null;

/** Punto de entrada público: carga el layout PUBLICADO y lo mantiene aplicado. */
export async function instalarLayout() {
  if (typeof document === "undefined") return;
  // En modo editor (dentro del iframe) NO renderizamos el publicado: manda el editor.
  try { if (window.parent !== window && new URLSearchParams(location.search).has("nved")) return; } catch (_) {}
  const slug = slugDePagina();
  if (!slug) return;

  let layout = null;
  try { layout = await NVApi.doc("paginas_layout", "pagina_" + slug); } catch (_) { return; }
  if (!layout || layout.publicado !== true) return;
  layoutActual = layout;

  const reaplicar = () => aplicarLayout(layoutActual);
  reaplicar();
  if (Bus && Bus.on) { Bus.on("app:ready", reaplicar); Bus.on("catalogo:real", reaplicar); }
  if (Store && Store.subscribe) { Store.subscribe("servicios", reaplicar); Store.subscribe("combos", reaplicar); }
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window) {
    let pend = 0;
    const obs = new MutationObserver(() => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; reaplicar(); }); });
    obs.observe(root, { childList: true, subtree: true, characterData: true });
  }
}

export default { instalarLayout };
