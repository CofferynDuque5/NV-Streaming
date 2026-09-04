/**
 * admin-panel.js — Back office: el "Centro de módulos" es la cara real y CADA
 * tarjeta abre algo REAL (no maquetas con datos inventados).
 *
 *   · Herramientas de datos (CRUD, Tablas, Inventario) → se abren como panel
 *     superpuesto, con datos reales de PostgreSQL.
 *   · Dashboard / Estadísticas / Billetera / Roles → overlay "Dashboard
 *     Ejecutivo" con KPIs, serie de 14 días, top de servicios, roles y actividad
 *     REALES (GET /api/admin/overview → Store.adminOverview).
 *   · CMS Visual / Gestión del Home / Tema → abren el editor visual real.
 *   · Módulos sin backend todavía → estado honesto "en preparación" (nunca datos
 *     falsos). Ninguna tarjeta abre ya el panel de demostración del runtime.
 */
const NVCore = (typeof window !== "undefined" && window.NVCore) || {};

// Herramientas inyectadas (datos reales) → id del contenedor + pestaña opcional.
const ACCION = {
  "Dashboard Ejecutivo": { tipo: "dash" },
  "Estadísticas": { tipo: "dash" },
  "Billetera": { tipo: "dash" },
  "Roles & Permisos": { tipo: "dash" },
  "Órdenes": { tipo: "tool", id: "nv-tablas", tab: "pedidos" },
  "Control de Vencimientos": { tipo: "tool", id: "nv-tablas", tab: "suscripciones" },
  "Recargas": { tipo: "tool", id: "nv-tablas", tab: "recargasBilletera" },
  "Usuarios": { tipo: "tool", id: "nv-tablas", tab: "usuarios" },
  "Revendedores": { tipo: "tool", id: "nv-tablas", tab: "usuarios" },
  "Catálogo de Servicios": { tipo: "tool", id: "nv-crud", tab: "servicios_sistema" },
  "Combos": { tipo: "tool", id: "nv-crud", tab: "combos_suscripciones" },
  "Categorías": { tipo: "tool", id: "nv-crud", tab: "servicios_sistema" },
  "Métodos de Pago": { tipo: "tool", id: "nv-crud", tab: "metodos_pago_config" },
  "Cartelera Digital": { tipo: "tool", id: "nv-crud", tab: "carteleras_estrenos" },
  "Promociones": { tipo: "tool", id: "nv-crud", tab: "ofertas" },
  "Inventario": { tipo: "tool", id: "nv-inventario", tab: null },
  "CMS Visual": { tipo: "link", url: "editor.html" },
  "Gestión del Home": { tipo: "link", url: "editor.html" },
  "Tema de la Plataforma": { tipo: "link", url: "editor.html" },
  "Auditoría": { tipo: "tool", id: "nv-inspector", tab: null },
};
// Todos los nombres de módulo (para reconocer la tarjeta y, si no hay acción,
// mostrar el estado honesto en vez del panel de demostración).
const NOMBRES = [
  ...Object.keys(ACCION),
  "Banners", "Blog / Noticias", "Archivos", "Configuración General",
  "Seguridad", "Automatizaciones", "Respaldos", "Notificaciones",
];

function esAdmin() {
  return (typeof window !== "undefined" && (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page")))) === "admin";
}
function ov() { return (NVCore.Store && NVCore.Store.get("adminOverview")) || null; }
function money(n) { return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function haceCuanto(iso) { const t = Date.parse(iso); if (!t) return ""; const s = Math.max(1, (Date.now() - t) / 1000); if (s < 3600) return "hace " + Math.floor(s / 60) + " min"; if (s < 86400) return "hace " + Math.floor(s / 3600) + " h"; return "hace " + Math.floor(s / 86400) + " d"; }

function inyectarEstilos() {
  if (document.getElementById("nv-admin-panel-css")) return;
  const s = document.createElement("style");
  s.id = "nv-admin-panel-css";
  s.textContent = `
    #nv-inspector,#nv-crud,#nv-tablas,#nv-inventario,#nv-admin-overlay{ display:none; }
    body.nv-tool-open::before{ content:'';position:fixed;inset:0;background:rgba(2,3,12,0.82);backdrop-filter:blur(3px);z-index:99990; }
    body[data-nv-tool="nv-inspector"] #nv-inspector,
    body[data-nv-tool="nv-crud"] #nv-crud,
    body[data-nv-tool="nv-tablas"] #nv-tablas,
    body[data-nv-tool="nv-inventario"] #nv-inventario,
    body[data-nv-tool="overlay"] #nv-admin-overlay{
      display:block;position:fixed;top:56px;left:50%;transform:translateX(-50%);
      width:min(1120px,95vw);max-height:calc(100vh - 84px);overflow:auto;margin:0;
      z-index:99991;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,30,0.7);
      border:1px solid rgba(0,207,255,0.18);background:#06061A;
    }
    #nv-tool-close{ display:none;position:fixed;top:18px;right:24px;z-index:99992;
      width:40px;height:40px;border-radius:11px;border:1px solid rgba(255,255,255,0.16);
      background:rgba(10,12,28,0.9);color:#EEF2FF;cursor:pointer;align-items:center;justify-content:center;
      font-size:20px;line-height:1;box-shadow:0 10px 30px rgba(0,0,25,0.6); }
    body.nv-tool-open #nv-tool-close{ display:flex; }
    .nvd-wrap{ padding:26px 28px;font-family:'DM Sans',system-ui,sans-serif;color:#EEF2FF; }
    .nvd-h{ font-family:'Syne','DM Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.01em; }
    .nvd-sub{ font-size:12.5px;color:rgba(200,215,255,0.45);margin-top:3px;margin-bottom:20px; }
    .nvd-kpis{ display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px; }
    .nvd-kpi{ background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:12px;padding:14px 15px; }
    .nvd-kpi .l{ font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(200,215,255,0.5); }
    .nvd-kpi .v{ font-family:'Syne',sans-serif;font-size:24px;font-weight:800;margin-top:6px; }
    .nvd-grid2{ display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-bottom:16px; }
    @media(max-width:760px){ .nvd-grid2{ grid-template-columns:1fr; } }
    .nvd-card{ background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:14px;padding:16px 18px; }
    .nvd-card h4{ font-family:'Syne',sans-serif;font-size:14px;font-weight:700;margin-bottom:14px; }
    .nvd-bars{ display:flex;align-items:flex-end;gap:5px;height:130px; }
    .nvd-bar{ flex:1;background:linear-gradient(180deg,#00CFFF,#5510BB);border-radius:4px 4px 0 0;min-height:2px;opacity:0.9; }
    .nvd-row{ display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(80,100,200,0.1);font-size:13px; }
    .nvd-row:last-child{ border-bottom:0; }
    .nvd-tag{ font-size:10px;padding:2px 8px;border-radius:5px;background:rgba(0,207,255,0.1);color:#00CFFF;font-family:'JetBrains Mono',monospace; }
    .nvd-empty{ font-size:12.5px;color:rgba(200,215,255,0.4);padding:8px 0; }
    .nvd-prep{ padding:46px 30px;text-align:center; }
    .nvd-prep .ic{ width:64px;height:64px;border-radius:18px;margin:0 auto 16px;background:rgba(0,207,255,0.08);border:1px solid rgba(0,207,255,0.2);display:flex;align-items:center;justify-content:center;font-size:28px; }
  `;
  document.head.appendChild(s);
}

function botonCerrar() {
  let b = document.getElementById("nv-tool-close");
  if (b) return b;
  b = document.createElement("button");
  b.id = "nv-tool-close"; b.setAttribute("data-nv-ux", "1"); b.setAttribute("aria-label", "Cerrar"); b.innerHTML = "✕";
  b.addEventListener("click", cerrar);
  document.body.appendChild(b);
  return b;
}
function overlayHost() {
  let d = document.getElementById("nv-admin-overlay");
  if (d) return d;
  d = document.createElement("div"); d.id = "nv-admin-overlay"; d.setAttribute("data-nv-ux", "1");
  document.body.appendChild(d);
  return d;
}
function cerrar() { document.body.classList.remove("nv-tool-open"); document.body.removeAttribute("data-nv-tool"); }
function cuandoExista(sel, cb, n = 20) { const el = document.querySelector(sel); if (el) return cb(el); if (n > 0) setTimeout(() => cuandoExista(sel, cb, n - 1), 100); }

function abrirTool(idTool, pestana) {
  inyectarEstilos(); botonCerrar();
  document.body.setAttribute("data-nv-tool", idTool);
  document.body.classList.add("nv-tool-open");
  cuandoExista("#" + idTool, (el) => { el.scrollTop = 0; if (pestana) { const sel = idTool === "nv-crud" ? `.nv-crud-tab[data-c="${pestana}"]` : `.nv-tbl-tab[data-t="${pestana}"]`; cuandoExista("#" + idTool + " " + sel, (t) => t.click()); } });
}

function abrirOverlay(html) {
  inyectarEstilos(); botonCerrar();
  overlayHost().innerHTML = html;
  document.body.setAttribute("data-nv-tool", "overlay");
  document.body.classList.add("nv-tool-open");
  overlayHost().scrollTop = 0;
}

function htmlDashboard(o) {
  if (!o) return `<div class="nvd-wrap"><div class="nvd-h">Dashboard Ejecutivo</div><div class="nvd-sub">Cargando datos del negocio…</div></div>`;
  const k = o.kpis || {};
  const kpi = (l, v) => `<div class="nvd-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const serie = Array.isArray(o.serie) ? o.serie : [];
  const maxV = Math.max(1, ...serie.map((s) => s.ventas));
  const bars = serie.map((s) => `<div class="nvd-bar" style="height:${Math.round((s.ventas / maxV) * 100)}%" title="${s.dia}: ${money(s.ventas)}"></div>`).join("");
  const top = (o.topServicios || []).map((t) => `<div class="nvd-row"><span>${esc(t.servicio)}</span><span><span class="nvd-tag">${t.ventas} ventas</span> &nbsp;<b>${money(t.ingresos)}</b></span></div>`).join("") || `<div class="nvd-empty">Sin ventas registradas todavía.</div>`;
  const roles = (o.roles || []).map((r) => `<div class="nvd-row"><span>${esc(r.rol)}</span><b>${r.total}</b></div>`).join("") || `<div class="nvd-empty">Sin usuarios.</div>`;
  const act = (o.actividad || []).map((a) => `<div class="nvd-row"><span>${esc(a.actor)} · ${esc(a.accion)}</span><span style="color:rgba(200,215,255,0.4);font-size:11.5px;">${esc(a.estado)} · ${haceCuanto(a.cuando)}</span></div>`).join("") || `<div class="nvd-empty">Sin actividad reciente.</div>`;
  return `<div class="nvd-wrap">
    <div class="nvd-h">Dashboard Ejecutivo</div>
    <div class="nvd-sub">Datos en vivo del negocio · PostgreSQL</div>
    <div class="nvd-kpis">
      ${kpi("Ventas aprobadas", money(k.ventasAprobadas))}
      ${kpi("Pedidos pendientes", k.pedidosPendientes || 0)}
      ${kpi("Usuarios", k.usuarios || 0)}
      ${kpi("Suscripciones activas", k.suscripcionesActivas || 0)}
      ${kpi("Recargas pendientes", k.recargasPendientes || 0)}
      ${kpi("Cuentas en stock", k.cuentasStock || 0)}
      ${kpi("Planes", k.planes || 0)}
    </div>
    <div class="nvd-grid2">
      <div class="nvd-card"><h4>Ventas · últimos 14 días</h4><div class="nvd-bars">${bars}</div></div>
      <div class="nvd-card"><h4>Top servicios por ingresos</h4>${top}</div>
    </div>
    <div class="nvd-grid2">
      <div class="nvd-card"><h4>Actividad reciente</h4>${act}</div>
      <div class="nvd-card"><h4>Roles de usuarios</h4>${roles}</div>
    </div>
  </div>`;
}

function abrirDashboard() {
  abrirOverlay(htmlDashboard(ov()));
  // Si el resumen aún no llegó, repinta cuando el Store lo tenga.
  if (!ov() && NVCore.Store && NVCore.Store.subscribe) {
    const un = NVCore.Store.subscribe("adminOverview", () => { if (document.getElementById("nv-admin-overlay") && document.body.getAttribute("data-nv-tool") === "overlay") overlayHost().innerHTML = htmlDashboard(ov()); if (un) un(); });
  }
}

function abrirPreparacion(nombre) {
  abrirOverlay(`<div class="nvd-wrap nvd-prep"><div class="ic">🧩</div>
    <div class="nvd-h">${esc(nombre)}</div>
    <div class="nvd-sub" style="margin-top:8px;max-width:420px;margin-left:auto;margin-right:auto;">Este módulo todavía no está conectado a datos reales. Lo dejamos listo para cuando definas su fuente — sin inventar información.</div>
  </div>`);
}

function nombreDeTarjeta(tile) {
  for (const div of tile.querySelectorAll("div")) {
    const t = (div.textContent || "").trim();
    if (NOMBRES.indexOf(t) !== -1) return t;
  }
  return null;
}

export function instalarAdminPanel() {
  if (typeof document === "undefined" || !esAdmin() || window.__NV_ADMIN_PANEL) return;
  window.__NV_ADMIN_PANEL = true;
  inyectarEstilos();
  botonCerrar();

  // Intercepta el clic en CUALQUIER tarjeta de módulo ANTES que el runtime, para
  // que NUNCA se abra el panel de demostración: enruta a algo real u honesto.
  document.addEventListener("click", (ev) => {
    const tile = ev.target.closest(".mod-tile");
    if (!tile) return;
    const nombre = nombreDeTarjeta(tile);
    if (!nombre) return; // no es una tarjeta de módulo reconocida
    ev.preventDefault(); ev.stopPropagation();
    const a = ACCION[nombre];
    if (!a) return abrirPreparacion(nombre);
    if (a.tipo === "tool") abrirTool(a.id, a.tab);
    else if (a.tipo === "dash") abrirDashboard();
    else if (a.tipo === "link") window.location.href = a.url;
  }, true);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("nv-tool-open")) return;
    const id = document.body.getAttribute("data-nv-tool") === "overlay" ? "nv-admin-overlay" : (document.body.getAttribute("data-nv-tool") || "x");
    const tool = document.getElementById(id);
    if (tool && !tool.contains(e.target) && e.target.id !== "nv-tool-close" && !e.target.closest(".mod-tile")) cerrar();
  }, false);
}

export default { instalarAdminPanel };
