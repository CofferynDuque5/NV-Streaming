/**
 * nv-layout.js — Renderiza en el sitio público lo que el editor visual PUBLICA.
 *
 * Cierra el ciclo del constructor visual: el editor guarda en la colección
 * `paginas_layout` (1 documento por página, id `pagina_<slug>`) los textos de
 * cada sección y qué bloques se muestran. Este módulo, al cargar una página de
 * la tienda, lee el documento PUBLICADO de esa página y aplica los cambios sobre
 * los anclajes `data-nv-slot` del HTML estático.
 *
 * El runtime (nv-runtime) repinta el árbol cuando llegan datos reales (catálogo,
 * config), lo que reescribe el HTML estático a su valor de plantilla. Igual que
 * ux-fixes.js, re-aplicamos tras cada repintado (evento + MutationObserver) con
 * escrituras IDEMPOTENTES (solo escribimos si el valor difiere), de modo que el
 * observador se aquieta en cuanto el estado deseado ya está en el DOM.
 *
 * Contrato honesto:
 *   · Solo se aplican documentos con `publicado === true` (los borradores no
 *     salen al público; el backend además filtra por sesión).
 *   · Un texto solo se sobrescribe si el editor guardó un valor NO vacío para esa
 *     sección; si no, se conserva el contenido de diseño original.
 *   · Un bloque solo se OCULTA si el editor lo apagó explícitamente (`=== false`).
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";

const { Bus, Store } = NVCore;

// Mapa página (data-nv-page) → layout persistido por el editor.
//   slug     : sufijo del id del documento (`pagina_<slug>`), igual que EditorService._slug.
//   texto    : { índiceDeSección: { campoDelEditor: nombreDeSlot } }
//   toggles  : { flagDelEditor: nombreDeSlot }  (el flag en false oculta el slot)
//
// Los índices de sección espejan el array PAGES['Home'] del editor:
//   0 Header · 1 Hero · 2 Servicios Populares · 3 Feature Split · 4 Bundles ·
//   5 Trust Bar · 6 CTA Final · 7 Footer
const PAGINAS = {
  index: {
    slug: "home",
    texto: {
      1: { title: "hero.title", subtitle: "hero.subtitle", eyebrow: "hero.eyebrow" },
      2: { title: "s2.title" },
      3: { title: "s3.title" },
      4: { title: "s4.title" },
      6: { title: "s6.title" },
    },
    toggles: {
      showStats: "hero.stats",
      showFloating: "hero.floating",
      showEyebrow: "hero.eyebrow.box",
    },
  },
};

let mapaActual = null;   // entrada de PAGINAS de la página en curso
let layoutActual = null; // documento publicado (o null si no aplica)

function paginaActual() {
  return (typeof window !== "undefined" && window.__NV_PAGE) ||
    (document.body && document.body.getAttribute("data-nv-page")) || "";
}
function slot(nombre) { return document.querySelector('[data-nv-slot="' + nombre + '"]'); }
function tiene(v) { return v != null && String(v).trim() !== ""; }

/** Sustituye el texto de un slot (seguro: textContent). Idempotente. */
function setTexto(nombre, valor) {
  const el = slot(nombre);
  if (!el || !tiene(valor)) return;
  const nuevo = String(valor);
  if ((el.textContent || "").trim() === nuevo.trim() && el.getAttribute("data-nv-editado") === "1") return;
  el.textContent = nuevo;
  el.setAttribute("data-nv-editado", "1");
}

/** El H1 del hero lleva su gradiente en spans hijos; al sobrescribirlo,
 *  reconstruimos un único span con el mismo estilo. Idempotente. */
function setHeroTitle(valor) {
  const el = slot("hero.title");
  if (!el || !tiene(valor)) return;
  const nuevo = String(valor);
  if ((el.textContent || "").trim() === nuevo.trim() && el.getAttribute("data-nv-editado") === "1") return;
  el.textContent = "";
  const span = document.createElement("span");
  span.style.cssText = "display:block;font-size:78px;background:linear-gradient(120deg,#00CFFF 0%,#00DFFF 40%,#9B3FFF 80%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;";
  span.textContent = nuevo;
  el.appendChild(span);
  el.setAttribute("data-nv-editado", "1");
}

/** Muestra u oculta un bloque (usa `hidden`). Idempotente. */
function setVisible(nombre, visible) {
  const el = slot(nombre);
  if (!el || el.hidden === !visible) return;
  el.hidden = !visible;
}

/** Aplica (o re-aplica) el layout actual sobre el DOM. Seguro de llamar N veces. */
function reaplicar() {
  const mapa = mapaActual, layout = layoutActual;
  if (!mapa || !layout) return;
  try {
    const comp = layout.componentes || {};
    for (const [idx, campos] of Object.entries(mapa.texto || {})) {
      const c = comp[idx] || comp[String(idx)] || {};
      for (const [campo, nombreSlot] of Object.entries(campos)) {
        if (!tiene(c[campo])) continue;
        if (nombreSlot === "hero.title") setHeroTitle(c[campo]);
        else setTexto(nombreSlot, c[campo]);
      }
    }
    for (const [flag, nombreSlot] of Object.entries(mapa.toggles || {})) {
      if (layout[flag] === false) setVisible(nombreSlot, false);
    }
  } catch (_) { /* nunca romper el storefront por el editor */ }
}

/** Punto de entrada: carga el layout publicado y lo mantiene aplicado. */
export async function instalarLayout() {
  if (typeof document === "undefined") return;
  mapaActual = PAGINAS[paginaActual()] || null;
  if (!mapaActual) return; // esta página no participa del editor visual (aún)

  let layout = null;
  try {
    layout = await NVApi.doc("paginas_layout", "pagina_" + mapaActual.slug);
  } catch (_) {
    return; // 404 (sin publicar / inexistente) o sin conexión: se conserva el diseño base
  }
  if (!layout || layout.publicado !== true) return;
  layoutActual = layout;

  reaplicar(); // primera aplicación

  // El runtime repinta el árbol al llegar datos reales → re-aplicamos.
  if (Bus && Bus.on) { Bus.on("app:ready", reaplicar); Bus.on("catalogo:real", reaplicar); }
  if (Store && Store.subscribe) { Store.subscribe("servicios", reaplicar); Store.subscribe("combos", reaplicar); }

  // Red de seguridad: cualquier repintado del árbol (con antirrebote). Las
  // escrituras son idempotentes, así que el observador se aquieta enseguida.
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window) {
    let pend = 0;
    const obs = new MutationObserver(() => {
      if (pend) return;
      pend = requestAnimationFrame(() => { pend = 0; reaplicar(); });
    });
    obs.observe(root, { childList: true, subtree: true, characterData: true });
  }
}

export default { instalarLayout };
