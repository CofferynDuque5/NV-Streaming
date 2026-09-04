/**
 * editor-live.js — Lado EDITOR del constructor visual en vivo.
 *
 * Sustituye el lienzo de MAQUETA por un iframe con la página REAL (con tus datos
 * reales). Sincroniza la barra del editor (página, acento, fondo, mostrar/ocultar
 * bloques) con el iframe por postMessage, y recoge lo editado para guardarlo.
 *
 * Expone `window.NVEditorLive`:
 *   · page()   → slug de la página actual del editor (home/catalogo/…)
 *   · pageName() → nombre para EditorService (Home/Catálogo/…)
 *   · apply(layout) → manda un layout {slots,hidden} al iframe (cargar publicado)
 *   · collect() → Promise<{slots,hidden}> con lo que hay ahora en el iframe
 */
const { Store, Bus } = (typeof window !== "undefined" && window.NVCore) ? window.NVCore : {};

// Nombre de página del editor → archivo real de la tienda + slug del documento.
const PAGINAS = {
  "Home": { url: "index.html", slug: "home" },
  "Catálogo": { url: "catalogo.html", slug: "catalogo" },
  "Detalle": { url: "detalles.html", slug: "detalle" },
  "Checkout": { url: "pagos.html", slug: "checkout" },
  "Mi Cuenta": { url: "mi-cuenta.html", slug: "mi_cuenta" },
  "404": { url: "index.html", slug: "error404" },
};

// Índice de sección del panel derecho → slots reales (para relevar el panel
// "Contenido" del editor hacia el iframe). Espeja el array PAGES del editor.
const SECCION_SLOTS = {
  "Home": {
    1: { title: "hero.title", subtitle: "hero.subtitle", eyebrow: "hero.eyebrow" },
    2: { title: "s2.title" }, 3: { title: "s3.title" }, 4: { title: "s4.title" }, 6: { title: "s6.title" },
  },
  "Catálogo": { 1: { title: "cat.title", subtitle: "cat.subtitle" } },
  "Detalle": {
    2: { title: "det.included.title" }, 3: { title: "det.plans.title" },
    4: { title: "det.reviews.title" }, 5: { title: "det.related.title" },
  },
  "Checkout": {
    1: { title: "co.summary.title" }, 2: { title: "co.contact.title" },
    3: { title: "co.payment.title" }, 5: { title: "co.submit.note" },
  },
  "Mi Cuenta": {
    2: { title: "acc.subs.title" }, 3: { title: "acc.tx.title" },
    4: { title: "acc.billing.title" }, 5: { title: "acc.security.title" },
  },
};

let iframe = null;
let paginaCargada = "";        // nombre de página que muestra el iframe
let paginaAplicada = false;    // ¿ya cargamos el layout publicado de esta carga?
let listoInv = { slots: [], toggles: [] };
const onReady = [];            // callbacks a ejecutar cuando el iframe reporte 'ready'

function inst() { return (typeof window !== "undefined" && window.__NV_INSTANCE) || null; }
function estado() { const i = inst(); return (i && i.state) || {}; }
function nombrePagina() { const p = estado().page; return PAGINAS[p] ? p : "Home"; }

function enviarIframe(msg) {
  if (!iframe || !iframe.contentWindow) return;
  try { iframe.contentWindow.postMessage(Object.assign({ source: "nv-editor" }, msg), "*"); } catch (_) {}
}

/* ── Montaje del iframe FLOTANDO sobre el lienzo ──
   El lienzo es parte de la plantilla DCLogic (se repinta y borraría un iframe
   inyectado dentro). Por eso el iframe vive en <body> con position:fixed y se
   posiciona encima del área del lienzo (reposicionar()). Así sobrevive a los
   re-render del editor. */
function montar() {
  const canvas = document.querySelector("[data-nv-canvas]");
  if (!canvas || document.getElementById("nv-live-frame")) return;
  if (!document.getElementById("nv-live-css")) {
    const s = document.createElement("style");
    s.id = "nv-live-css";
    s.textContent = "[data-nv-canvas] [data-nv-mock]{display:none!important;}";
    document.head.appendChild(s);
  }
  const wrap = document.createElement("div");
  wrap.id = "nv-live-wrap";
  wrap.setAttribute("data-nv-ux", "1");
  wrap.style.cssText = "position:fixed;z-index:5;border-radius:6px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);background:#04040C;";
  iframe = document.createElement("iframe");
  iframe.id = "nv-live-frame";
  iframe.style.cssText = "width:100%;height:100%;border:0;background:#04040C;display:block;";
  iframe.setAttribute("title", "Vista en vivo");
  wrap.appendChild(iframe);
  document.body.appendChild(wrap);
  reposicionar();
  cargarPagina(nombrePagina());
}

/** Coloca el iframe sobre el área visible del lienzo (respeta el ancho de device). */
function reposicionar() {
  const wrap = document.getElementById("nv-live-wrap");
  const canvas = document.querySelector("[data-nv-canvas]");
  if (!wrap || !canvas) return;
  const r = canvas.getBoundingClientRect();
  if (r.width < 40 || r.height < 40) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  const pad = 24;
  const maxW = estado().device === "mobile" ? 390 : 960;
  const w = Math.min(maxW, r.width - pad * 2);
  const left = r.left + (r.width - w) / 2;
  wrap.style.left = Math.round(left) + "px";
  wrap.style.top = Math.round(r.top + pad) + "px";
  wrap.style.width = Math.round(w) + "px";
  wrap.style.height = Math.round(r.height - pad * 2) + "px";
}

function cargarPagina(nombre) {
  const def = PAGINAS[nombre] || PAGINAS["Home"];
  paginaCargada = nombre;
  paginaAplicada = false;
  listoInv = { slots: [], toggles: [] };
  iframe.src = def.url + "?nved=1&t=" + Date.now();
}

/* ── Sincronización de la barra del editor → iframe (sondeo del estado DCLogic) ── */
let ultimo = {};
let ultimoContent = {};
function sincronizar() {
  if (!iframe || !document.getElementById("nv-live-frame")) { iframe = null; montar(); if (!iframe) return; }
  reposicionar();
  const st = estado();
  const pg = nombrePagina();
  if (pg !== paginaCargada && iframe) { cargarPagina(pg); ultimo = {}; return; }
  // tema
  if (st.accent !== ultimo.accent || st.bgStart !== ultimo.bgStart || st.bgEnd !== ultimo.bgEnd) {
    enviarIframe({ type: "theme", tokens: { neon_cyan: st.accent, neon_purple: st.accent, bg_space_dark: st.bgStart, bg_space_core: st.bgEnd } });
  }
  // toggles (Home): mostrar/ocultar bloques reales
  if (st.showStats !== ultimo.showStats) enviarIframe({ type: "toggle", name: "hero.stats", visible: st.showStats !== false });
  if (st.showFloating !== ultimo.showFloating) enviarIframe({ type: "toggle", name: "hero.floating", visible: st.showFloating !== false });
  if (st.showEyebrow !== ultimo.showEyebrow) enviarIframe({ type: "toggle", name: "hero.eyebrow.box", visible: st.showEyebrow !== false });
  ultimo = { accent: st.accent, bgStart: st.bgStart, bgEnd: st.bgEnd, showStats: st.showStats, showFloating: st.showFloating, showEyebrow: st.showEyebrow };
  // Panel "Contenido" del editor (content[sección].campo) → slot real del iframe.
  const mapa = SECCION_SLOTS[pg] || {};
  const cont = st.content || {};
  for (const [idx, campos] of Object.entries(mapa)) {
    const c = cont[idx] || {}, prev = ultimoContent[idx] || {};
    for (const [campo, nombreSlot] of Object.entries(campos)) {
      if (c[campo] != null && c[campo] !== prev[campo]) enviarIframe({ type: "set-text", name: nombreSlot, value: c[campo] });
    }
  }
  try { ultimoContent = JSON.parse(JSON.stringify(cont)); } catch (_) {}
}

/* ── Mensajes del iframe (tienda) → editor ── */
function alMensaje(ev) {
  const d = ev.data;
  if (!d || d.source !== "nv-store") return;
  if (d.type === "ready") {
    listoInv = { slots: d.slots || [], toggles: d.toggles || [] };
    // Al reportar listo, empujamos el estado actual de la barra al iframe.
    ultimo = {}; sincronizar();
    while (onReady.length) { try { onReady.shift()(); } catch (_) {} }
    Bus && Bus.emit && Bus.emit("editor:secciones", listoInv);
    // Una sola vez por carga: pedir a editor-persist que cargue el layout publicado.
    if (!paginaAplicada) { paginaAplicada = true; Bus && Bus.emit && Bus.emit("editor:pagina-montada", { pageName: paginaCargada, slug: (PAGINAS[paginaCargada] || {}).slug }); }
  } else if (d.type === "select") {
    Bus && Bus.emit && Bus.emit("editor:seleccion", { name: d.name, label: d.label, text: d.text });
  } else if (d.type === "edit") {
    Bus && Bus.emit && Bus.emit("editor:edit", { name: d.name, value: d.value });
  }
}

/* ── API pública para editor-persist (guardar/cargar) ── */
function collect() {
  return new Promise((resolve) => {
    let hecho = false;
    const h = (ev) => {
      const d = ev.data;
      if (!d || d.source !== "nv-store" || d.type !== "collected") return;
      hecho = true; window.removeEventListener("message", h);
      resolve({ slots: d.slots || {}, hidden: d.hidden || {} });
    };
    window.addEventListener("message", h);
    enviarIframe({ type: "collect" });
    setTimeout(() => { if (!hecho) { window.removeEventListener("message", h); resolve({ slots: {}, hidden: {} }); } }, 1500);
  });
}
function apply(layout) {
  if (!layout) return;
  const enviar = () => enviarIframe({ type: "apply", slots: layout.slots || {}, hidden: layout.hidden || {} });
  if (listoInv.slots.length) enviar(); else onReady.push(enviar);
}

export function instalarEditorLive() {
  const esEditor = (typeof window !== "undefined") && ((window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "editor");
  if (!esEditor || window.__NV_EDITOR_LIVE_ON) return;
  window.__NV_EDITOR_LIVE_ON = true;
  window.addEventListener("message", alMensaje);

  // El iframe se monta (y re-monta si hace falta) dentro del bucle de sincronía,
  // que reintenta hasta que el runtime pinta el lienzo.
  setInterval(sincronizar, 300);

  window.NVEditorLive = {
    page: () => (PAGINAS[nombrePagina()] || {}).slug || "home",
    pageName: () => nombrePagina(),
    apply, collect,
    secciones: () => listoInv,
  };
}

export default { instalarEditorLive };
