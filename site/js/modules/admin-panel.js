/**
 * admin-panel.js — Hace del "Centro de módulos" (el panel bonito) la cara real
 * del back office, y conecta sus tarjetas con las herramientas REALES.
 *
 * Antes, las herramientas funcionales (Gestor de Contenido, Tablas, Inventario,
 * Auditoría) se inyectaban ENCIMA del panel y lo tapaban. Ahora:
 *   · Se ocultan por defecto (CSS) → el panel de administración es lo que se ve.
 *   · Al pulsar una tarjeta de módulo, se abre la herramienta real que le
 *     corresponde como panel superpuesto (con su pestaña ya seleccionada).
 * Las herramientas siguen siendo las mismas (datos reales de PostgreSQL); solo
 * cambia cómo se presentan.
 */
const HERRAMIENTAS = ["nv-inspector", "nv-crud", "nv-tablas", "nv-inventario"];

// Nombre de la tarjeta del panel → [id de herramienta, pestaña opcional].
const MAPA = {
  "Catálogo de Servicios": ["nv-crud", "servicios_sistema"],
  "Combos": ["nv-crud", "combos_suscripciones"],
  "Categorías": ["nv-crud", "servicios_sistema"],
  "Métodos de Pago": ["nv-crud", "metodos_pago_config"],
  "Cartelera Digital": ["nv-crud", "carteleras_estrenos"],
  "Promociones": ["nv-crud", "ofertas"],
  "Inventario": ["nv-inventario", null],
  "Órdenes": ["nv-tablas", "pedidos"],
  "Recargas": ["nv-tablas", "recargasBilletera"],
  "Usuarios": ["nv-tablas", "usuarios"],
  "Suscripciones": ["nv-tablas", "suscripciones"],
};

function esAdmin() {
  return (typeof window !== "undefined" && (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page")))) === "admin";
}

function inyectarEstilos() {
  if (document.getElementById("nv-admin-panel-css")) return;
  const s = document.createElement("style");
  s.id = "nv-admin-panel-css";
  s.textContent = `
    #nv-inspector,#nv-crud,#nv-tablas,#nv-inventario{ display:none; }
    body.nv-tool-open::before{ content:'';position:fixed;inset:0;background:rgba(2,3,12,0.80);backdrop-filter:blur(3px);z-index:99990; }
    body[data-nv-tool="nv-inspector"] #nv-inspector,
    body[data-nv-tool="nv-crud"] #nv-crud,
    body[data-nv-tool="nv-tablas"] #nv-tablas,
    body[data-nv-tool="nv-inventario"] #nv-inventario{
      display:block;position:fixed;top:64px;left:50%;transform:translateX(-50%);
      width:min(1120px,95vw);max-height:calc(100vh - 92px);overflow:auto;margin:0;
      z-index:99991;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,30,0.7);
      border:1px solid rgba(0,207,255,0.18);
    }
    #nv-tool-close{ display:none;position:fixed;top:22px;right:26px;z-index:99992;
      width:40px;height:40px;border-radius:11px;border:1px solid rgba(255,255,255,0.16);
      background:rgba(10,12,28,0.9);color:#EEF2FF;cursor:pointer;align-items:center;justify-content:center;
      font-size:20px;line-height:1;box-shadow:0 10px 30px rgba(0,0,25,0.6); }
    body.nv-tool-open #nv-tool-close{ display:flex; }
  `;
  document.head.appendChild(s);
}

function botonCerrar() {
  let b = document.getElementById("nv-tool-close");
  if (b) return b;
  b = document.createElement("button");
  b.id = "nv-tool-close";
  b.setAttribute("data-nv-ux", "1");
  b.setAttribute("aria-label", "Cerrar herramienta");
  b.innerHTML = "✕";
  b.addEventListener("click", cerrar);
  document.body.appendChild(b);
  return b;
}

function cerrar() {
  document.body.classList.remove("nv-tool-open");
  document.body.removeAttribute("data-nv-tool");
}

// Espera (poll breve) a que exista un elemento y lo devuelve al callback.
function cuandoExista(sel, cb, intentos = 20) {
  const el = document.querySelector(sel);
  if (el) return cb(el);
  if (intentos > 0) setTimeout(() => cuandoExista(sel, cb, intentos - 1), 100);
}

function abrir(idTool, pestana) {
  inyectarEstilos(); botonCerrar();
  document.body.setAttribute("data-nv-tool", idTool);
  document.body.classList.add("nv-tool-open");
  cuandoExista("#" + idTool, (el) => {
    el.scrollTop = 0;
    if (pestana) {
      const sel = idTool === "nv-crud" ? `.nv-crud-tab[data-c="${pestana}"]` : `.nv-tbl-tab[data-t="${pestana}"]`;
      cuandoExista("#" + idTool + " " + sel, (tab) => tab.click());
    }
  });
}

function nombreDeTarjeta(tile) {
  for (const div of tile.querySelectorAll("div")) {
    const t = (div.textContent || "").trim();
    if (MAPA[t]) return t;
  }
  return null;
}

export function instalarAdminPanel() {
  if (typeof document === "undefined" || !esAdmin() || window.__NV_ADMIN_PANEL) return;
  window.__NV_ADMIN_PANEL = true;
  inyectarEstilos();
  botonCerrar();

  // Intercepta el clic en una tarjeta de módulo ANTES que el runtime: si esa
  // tarjeta tiene herramienta real, la abrimos (en vez del panel de demostración).
  document.addEventListener("click", (ev) => {
    const tile = ev.target.closest(".mod-tile");
    if (!tile) return;
    const nombre = nombreDeTarjeta(tile);
    if (!nombre) return; // sin herramienta real → deja el comportamiento original
    const [idTool, pestana] = MAPA[nombre];
    ev.preventDefault(); ev.stopPropagation();
    abrir(idTool, pestana);
  }, true);

  // Cerrar con Escape (además del botón ✕ y el backdrop).
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  document.addEventListener("click", (e) => {
    // Clic en el backdrop (fuera de la herramienta abierta) → cerrar.
    if (!document.body.classList.contains("nv-tool-open")) return;
    const tool = document.querySelector('body[data-nv-tool] #' + (document.body.getAttribute("data-nv-tool") || "x"));
    if (tool && !tool.contains(e.target) && e.target.id !== "nv-tool-close" && !e.target.closest(".mod-tile")) cerrar();
  }, false);
}

export default { instalarAdminPanel };
