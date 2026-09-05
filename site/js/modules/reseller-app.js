/**
 * reseller-app.js — Panel de Revendedor REAL (rediseño).
 *
 * Reemplaza la maqueta de 30 módulos (de los cuales solo el Dashboard y "Mis
 * Clientes" eran reales; el resto eran datos inventados) por un panel limpio con
 * navegación lateral y SOLO secciones reales, conectadas a /api/reseller/*:
 *
 *   · Dashboard  → identidad, enlace de referido, comisiones, KPIs, nivel, gráfico.
 *   · Mis Clientes → tus referidos reales (nombre, pedidos, total, estado).
 *   · Comisiones → el libro de comisiones REAL (antes se calculaba y se tiraba).
 *   · Retiros    → comisión disponible + retirar a tu billetera (acción real).
 *   · Enlaces    → tu código y enlace de referido para compartir.
 *
 * Mismo lenguaje visual que el Back Office. Sin datos inventados: si algo está
 * vacío se muestra un estado honesto.
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";

const { Store } = NVCore;

const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
function toast(m, c) { try { if (window.NV && window.NV.toast) window.NV.toast(m, c); } catch (_) {} }
const OK = "rgba(0,212,160,0.55)";
function fechaCorta(v) { if (!v) return "—"; const t = Date.parse(v); if (!t) return String(v).slice(0, 10); return new Date(t).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }); }
function haceCuanto(iso) { const t = Date.parse(iso); if (!t) return ""; const s = Math.max(1, (Date.now() - t) / 1000); if (s < 3600) return "hace " + Math.floor(s / 60) + " min"; if (s < 86400) return "hace " + Math.floor(s / 3600) + " h"; return "hace " + Math.floor(s / 86400) + " d"; }
const ESTADO_TAG = { pendiente: "#FFB000", disponible: "#00C896", pagada: "#00CFFF", anulada: "#FF5B7A", activo: "#00C896", referido: "#00CFFF" };
function tag(v) { const c = ESTADO_TAG[String(v || "").toLowerCase()] || "rgba(200,215,255,0.6)"; return `<span class="nv-rs-tag" style="color:${c};border-color:${c}55;background:${c}14;">${esc(v || "—")}</span>`; }

const SECCIONES = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "clientes", label: "Mis Clientes", icon: "👥" },
  { id: "comisiones", label: "Comisiones", icon: "💵" },
  { id: "retiros", label: "Retiros", icon: "🏦" },
  { id: "enlaces", label: "Enlaces de venta", icon: "🔗" },
];
const porId = (id) => SECCIONES.find((s) => s.id === id);

/* ── datos (cache simple; refrescado por cargar()) ── */
let cache = { overview: null, clients: [], commissions: [] };
async function cargar() {
  const [o, cl, co] = await Promise.all([
    NVApi.resellerOverview().catch(() => null),
    NVApi.resellerClients().catch(() => []),
    NVApi.resellerCommissions().catch(() => []),
  ]);
  cache = { overview: o, clients: cl || [], commissions: co || [] };
  return cache;
}

function inyectarEstilos() {
  if (document.getElementById("nv-rs-css")) return;
  const s = el("style"); s.id = "nv-rs-css";
  s.textContent = `
  #nv-rs{position:fixed;inset:0;display:flex;background:#04040C;color:#EEF2FF;font-family:'DM Sans',system-ui,sans-serif;z-index:10;}
  #nv-rs *{box-sizing:border-box;}
  .nv-rs-side{width:236px;flex-shrink:0;height:100%;overflow-y:auto;border-right:1px solid rgba(80,100,200,0.14);background:#06061A;padding:14px 10px 30px;}
  .nv-rs-brand{display:flex;align-items:center;gap:10px;padding:8px 10px 16px;}
  .nv-rs-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(150deg,#16205e,#0a0a22 55%,#241046);border:1px solid rgba(110,130,255,0.28);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;color:#9fe9ff;}
  .nv-rs-brand b{font-family:'Syne',sans-serif;font-size:15px;}
  .nv-rs-brand span{display:block;font-size:8.5px;letter-spacing:0.18em;color:rgba(155,63,255,0.7);}
  .nv-rs-nav{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 12px;border-radius:9px;border:1px solid transparent;background:transparent;color:rgba(230,236,255,0.72);font-size:13.5px;cursor:pointer;font-family:inherit;text-decoration:none;}
  .nv-rs-nav:hover{background:rgba(255,255,255,0.04);color:#fff;}
  .nv-rs-nav.on{background:rgba(0,207,255,0.1);border-color:rgba(0,207,255,0.25);color:#EAF6FF;}
  .nv-rs-nav .ic{width:20px;text-align:center;}
  .nv-rs-main{flex:1;height:100%;overflow-y:auto;padding:26px 30px 60px;}
  .nv-rs-h{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;}
  .nv-rs-sub{font-size:13px;color:rgba(200,215,255,0.5);margin:3px 0 22px;}
  .nv-rs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px;}
  .nv-rs-kpi{background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:13px;padding:15px 16px;}
  .nv-rs-kpi .l{font-size:10.5px;letter-spacing:0.07em;text-transform:uppercase;color:rgba(200,215,255,0.5);}
  .nv-rs-kpi .v{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;margin-top:6px;}
  .nv-rs-card{background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:14px;padding:18px 20px;margin-bottom:16px;}
  .nv-rs-card h4{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;margin-bottom:12px;}
  .nv-rs-grid2{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px;}
  @media(max-width:900px){.nv-rs-grid2{grid-template-columns:1fr;}}
  .nv-rs-bars{display:flex;align-items:flex-end;gap:6px;height:130px;}
  .nv-rs-bar{flex:1;background:linear-gradient(180deg,#00CFFF,#5510BB);border-radius:4px 4px 0 0;min-height:2px;}
  .nv-rs-link{display:flex;align-items:center;gap:10px;background:rgba(0,207,255,0.06);border:1px solid rgba(0,207,255,0.2);border-radius:10px;padding:12px 14px;}
  .nv-rs-link code{font-family:'JetBrains Mono',monospace;color:#9fe9ff;font-size:13.5px;word-break:break-all;flex:1;}
  .nv-rs-btn{border:1px solid rgba(0,207,255,0.3);background:rgba(0,207,255,0.1);color:#9fe9ff;border-radius:9px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
  .nv-rs-btn:hover{background:rgba(0,207,255,0.18);}
  .nv-rs-btn.primary{background:linear-gradient(135deg,#0A3AAE,#1A8FFF);border:none;color:#fff;}
  .nv-rs-btn:disabled{opacity:0.5;cursor:default;}
  .nv-rs-tblwrap{background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:14px;overflow:hidden;}
  table.nv-rs-tbl{width:100%;border-collapse:collapse;font-size:13px;}
  .nv-rs-tbl th{text-align:left;padding:11px 16px;font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(200,215,255,0.4);border-bottom:1px solid rgba(80,100,200,0.16);}
  .nv-rs-tbl td{padding:11px 16px;border-bottom:1px solid rgba(80,100,200,0.08);color:rgba(230,236,255,0.85);}
  .nv-rs-tbl tr:last-child td{border-bottom:0;}
  .nv-rs-tag{font-size:11px;padding:2px 9px;border-radius:100px;border:1px solid;font-weight:600;white-space:nowrap;}
  .nv-rs-empty{padding:36px 20px;text-align:center;color:rgba(200,215,255,0.45);font-size:13.5px;}
  .nv-rs-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(80,100,200,0.1);font-size:13px;}
  .nv-rs-row:last-child{border-bottom:0;}
  .nv-rs-lvl{height:8px;border-radius:100px;background:rgba(255,255,255,0.06);overflow:hidden;margin:10px 0 6px;}
  .nv-rs-lvl > i{display:block;height:100%;background:linear-gradient(90deg,#00CFFF,#9B3FFF);}
  `;
  document.head.appendChild(s);
}

let root = null, main = null, actual = "dashboard";

function pintarSidebar(side) {
  side.innerHTML = `<div class="nv-rs-brand"><div class="nv-rs-logo">NV</div><div><b>Revendedor</b><span>NV STREAMING</span></div></div>`;
  for (const s of SECCIONES) {
    const b = el("button", "nv-rs-nav" + (s.id === actual ? " on" : ""), `<span class="ic">${s.icon}</span><span>${esc(s.label)}</span>`);
    b.setAttribute("data-sec", s.id);
    b.addEventListener("click", () => ir(s.id));
    side.appendChild(b);
  }
  const pie = el("a", "nv-rs-nav", `<span class="ic">↩</span><span>Ver tienda</span>`);
  pie.href = "index.html"; pie.style.marginTop = "18px";
  side.appendChild(pie);
}

function ir(id) {
  const s = porId(id); if (!s) return;
  actual = id;
  try { location.hash = "#" + id; } catch (_) {}
  root.querySelectorAll(".nv-rs-nav").forEach((n) => n.classList.toggle("on", n.getAttribute("data-sec") === id));
  render(s);
}

async function render(s) {
  main.scrollTop = 0;
  main.innerHTML = `<div class="nv-rs-h">${esc(s.label)}</div><div class="nv-rs-sub">Datos reales de tu actividad como revendedor.</div><div class="nv-rs-empty">Cargando…</div>`;
  try {
    if (!cache.overview && !cache.clients.length && !cache.commissions.length) await cargar();
    if (actual !== s.id) return;
    main.querySelector(".nv-rs-empty")?.remove();
    if (s.id === "dashboard") return vistaDashboard();
    if (s.id === "clientes") return vistaClientes();
    if (s.id === "comisiones") return vistaComisiones();
    if (s.id === "retiros") return vistaRetiros();
    if (s.id === "enlaces") return vistaEnlaces();
  } catch (e) {
    main.querySelector(".nv-rs-empty")?.remove();
    main.appendChild(el("div", "nv-rs-empty", "No se pudieron cargar los datos: " + esc((e && e.message) || "error")));
  }
}

function enlaceHTML(o) {
  const code = (o && o.codigo) || "";
  const url = "nvstreaming.com/?ref=" + code;
  return `<div class="nv-rs-link"><code>${esc(url)}</code><button class="nv-rs-btn" data-copy="${esc(url)}">Copiar</button></div>`;
}

function vistaDashboard() {
  const o = cache.overview || {};
  const niv = o.nivel || {};
  const kpi = (l, v) => `<div class="nv-rs-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const serie = Array.isArray(o.serie) ? o.serie : [];
  const maxV = Math.max(1, ...serie.map((x) => Number(x.ventas) || Number(x.total) || 0));
  const bars = serie.map((x) => { const v = Number(x.ventas) || Number(x.total) || 0; return `<div class="nv-rs-bar" style="height:${Math.round((v / maxV) * 100)}%" title="${esc(x.mes || x.dia || "")}: ${money(v)}"></div>`; }).join("") || `<div class="nv-rs-empty" style="padding:10px 0;">Sin ventas todavía.</div>`;
  const act = (cache.commissions || []).slice(0, 6).map((c) => `<div class="nv-rs-row"><span>${esc(c.servicio || "Comisión")} · ${esc(c.clienteNombre || c.clienteEmail || "")}</span><span><b>${money(c.monto)}</b> · ${tag(c.estadoUI || c.estado)}</span></div>`).join("") || `<div class="nv-rs-empty" style="padding:10px 0;">Sin comisiones todavía.</div>`;
  main.appendChild(el("div", null, `
    <div class="nv-rs-card">
      <h4>Tu enlace de referido${o.codigo ? " · código " + esc(o.codigo) : ""}</h4>
      ${enlaceHTML(o)}
    </div>
    <div class="nv-rs-kpis">
      ${kpi("Comisión total", money(o.comisionTotal))}
      ${kpi("Pendiente", money(o.pendiente))}
      ${kpi("Disponible", money(o.disponible))}
      ${kpi("Pagada (mes)", money(o.pagadaMes))}
    </div>
    <div class="nv-rs-kpis">
      ${kpi("Ventas", o.ventas || 0)}
      ${kpi("Ingresos generados", money(o.ingresos))}
      ${kpi("Clientes", o.clientes || 0)}
      ${kpi("Saldo billetera", money(o.saldo))}
    </div>
    <div class="nv-rs-grid2">
      <div class="nv-rs-card"><h4>Ventas · por periodo</h4><div class="nv-rs-bars">${bars}</div></div>
      <div class="nv-rs-card"><h4>Nivel: ${esc(niv.nombre || "—")}</h4>
        <div class="nv-rs-lvl"><i style="width:${Math.max(0, Math.min(100, Number(niv.pct) || 0))}%"></i></div>
        <div style="font-size:12.5px;color:rgba(200,215,255,0.55);">${niv.siguiente ? "Faltan " + money(niv.faltante) + " para " + esc(niv.siguiente) : "Nivel máximo"}</div>
        <div style="margin-top:12px;font-size:12.5px;color:rgba(200,215,255,0.55);">Tu comisión: <b style="color:#9fe9ff;">${Math.round((Number(o.comisionPct) || 0) * 100)}%</b></div>
      </div>
    </div>
    <div class="nv-rs-card"><h4>Actividad reciente</h4>${act}</div>`));
}

function tabla(cols, filas, vacio) {
  if (!filas.length) return `<div class="nv-rs-tblwrap"><div class="nv-rs-empty">${esc(vacio)}</div></div>`;
  const th = cols.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const rows = filas.map((r) => `<tr>${cols.map((c) => `<td>${c.fmt(r)}</td>`).join("")}</tr>`).join("");
  return `<div class="nv-rs-tblwrap"><table class="nv-rs-tbl"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function vistaClientes() {
  const filas = cache.clients || [];
  main.appendChild(el("div", null, tabla([
    { label: "Cliente", fmt: (r) => esc(r.nombre || (r.email || "Cliente").split("@")[0]) },
    { label: "Email", fmt: (r) => esc(r.email || "—") },
    { label: "WhatsApp", fmt: (r) => esc(r.whatsapp || "—") },
    { label: "Pedidos", fmt: (r) => (r.pedidos || 0) },
    { label: "Total", fmt: (r) => money(r.total) },
    { label: "Estado", fmt: (r) => tag(Number(r.activas) > 0 ? "activo" : "referido") },
    { label: "Desde", fmt: (r) => fechaCorta(r.desde) },
  ], filas, "Aún no tienes referidos. Comparte tu enlace para empezar a ganar comisiones.")));
}

function vistaComisiones() {
  const filas = cache.commissions || [];
  main.appendChild(el("div", null, tabla([
    { label: "Servicio", fmt: (r) => esc(r.servicio || "—") },
    { label: "Cliente", fmt: (r) => esc(r.clienteNombre || r.clienteEmail || "—") },
    { label: "Venta", fmt: (r) => money(r.montoVenta) },
    { label: "Comisión", fmt: (r) => money(r.monto) },
    { label: "%", fmt: (r) => Math.round((Number(r.pct) || 0) * 100) + "%" },
    { label: "Estado", fmt: (r) => tag(r.estadoUI || r.estado) },
    { label: "Fecha", fmt: (r) => fechaCorta(r.creadoEn) },
  ], filas, "Aún no tienes comisiones. Se generan cuando un referido tuyo compra.")));
}

function vistaRetiros() {
  const o = cache.overview || {};
  const disp = Number(o.disponible) || 0;
  const card = el("div", "nv-rs-card");
  card.style.maxWidth = "520px";
  card.innerHTML = `
    <h4>Retirar comisiones a tu billetera</h4>
    <div class="nv-rs-kpis" style="margin-bottom:14px;">
      <div class="nv-rs-kpi"><div class="l">Disponible para retirar</div><div class="v" style="color:#00E6A8;">${money(disp)}</div></div>
      <div class="nv-rs-kpi"><div class="l">Pendiente (aún no liberado)</div><div class="v" style="color:#FFB000;">${money(o.pendiente)}</div></div>
    </div>
    <p style="font-size:12.5px;color:rgba(200,215,255,0.55);margin-bottom:14px;">Al retirar, tu comisión disponible se abona como saldo en tu billetera NV.</p>
    <button class="nv-rs-btn primary" data-withdraw ${disp <= 0 ? "disabled" : ""}>Retirar ${money(disp)}</button>`;
  main.appendChild(card);
  const b = card.querySelector("[data-withdraw]");
  if (b && disp > 0) b.addEventListener("click", async () => {
    const ok = window.NVUI && window.NVUI.confirmar ? await window.NVUI.confirmar("Retirar comisiones", `Se abonarán ${money(disp)} a tu billetera. ¿Continuar?`, "Retirar") : confirm("¿Retirar " + money(disp) + "?");
    if (!ok) return;
    b.disabled = true; b.textContent = "Procesando…";
    try {
      const r = await NVApi.resellerWithdraw("billetera");
      toast("Retiro realizado: " + money(r && r.retirado), OK);
      await cargar(); ir("retiros");
    } catch (e) { b.disabled = false; b.textContent = "Retirar " + money(disp); toast((e && e.message) || "No se pudo retirar", "rgba(255,120,80,0.55)"); }
  });
}

function vistaEnlaces() {
  const o = cache.overview || {};
  main.appendChild(el("div", "nv-rs-card", `
    <h4>Tu código de revendedor</h4>
    <div style="font-family:'JetBrains Mono',monospace;font-size:22px;color:#9fe9ff;margin-bottom:16px;">${esc(o.codigo || "—")}</div>
    <h4>Enlace de referido</h4>
    <p style="font-size:12.5px;color:rgba(200,215,255,0.55);margin-bottom:10px;">Comparte este enlace: quien se registre por él quedará asociado a ti y sus compras te generan comisión.</p>
    ${enlaceHTML(o)}`));
}

function montar() {
  if (document.getElementById("nv-rs")) return;
  inyectarEstilos();
  root = el("div"); root.id = "nv-rs"; root.setAttribute("data-nv-ux", "1");
  const side = el("aside", "nv-rs-side");
  main = el("main", "nv-rs-main");
  root.appendChild(side); root.appendChild(main);
  document.body.appendChild(root);
  const boot = document.getElementById("nv-rs-boot"); if (boot) boot.remove();
  pintarSidebar(side);
  // copiar enlace (delegación)
  root.addEventListener("click", async (ev) => {
    const c = ev.target.closest("[data-copy]"); if (!c) return;
    try { await navigator.clipboard.writeText(c.getAttribute("data-copy")); toast("Enlace copiado ✓", "rgba(0,207,255,0.5)"); } catch (_) { toast("Copia manual: " + c.getAttribute("data-copy")); }
  });
  const h = (location.hash || "").replace("#", "");
  if (h && porId(h)) actual = h;
  ir(actual);
}

export function instalarResellerApp() {
  const esRev = (typeof window !== "undefined") && ((window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "revendedor");
  if (!esRev || window.__NV_RESELLER_APP) return;
  window.__NV_RESELLER_APP = true;
  const arranca = () => montar();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arranca);
  else arranca();
  // Cuando la sesión se resuelve (login/observador), recarga datos reales.
  Store.subscribe && Store.subscribe("sesion", async () => { if (document.getElementById("nv-rs")) { await cargar(); ir(actual); } });
}

export default { instalarResellerApp };
