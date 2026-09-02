/**
 * reseller-api.js — Carga los datos REALES del panel de revendedor desde el
 * backend (/api/reseller/*) y los deja en el Store para que el bridge
 * (decorateRevendedor) los pinte. También cablea el botón de retiro.
 *
 * Sin datos inventados: si no hay sesión, no carga nada (el panel muestra ceros
 * y estados vacíos honestos).
 */
import NVCore from "../core.js";
import NVApi from "../services/nv-api.js";

const { Store, Bus, Utils } = NVCore;
let _cargando = false;
let _obs = null;

/* ── Tabla "Mis Clientes": el <sc-for> dentro de <tbody> lo reubica el parser
   HTML (foster-parenting), así que pintamos el cuerpo desde JS con los clientes
   referidos REALES y lo re-pintamos si el runtime lo limpia. ── */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toFixed(2);
const fecha = (d) => { try { return d ? Utils.fecha(d) : "—"; } catch (_) { return "—"; } };
const bordes = "border-bottom:1px solid rgba(80,100,200,0.08);border-right:1px solid rgba(80,100,200,0.06);";

function filaCliente(c) {
  const nombre = c.nombre || (c.email || "Cliente").split("@")[0];
  const initials = (String(nombre).trim().slice(0, 2) || "C").toUpperCase();
  const activo = Number(c.activas) > 0;
  const col = activo ? "#00D4A0" : "#00CFFF";
  const bg = activo ? "rgba(0,212,160,0.12)" : "rgba(0,207,255,0.10)";
  const estado = activo ? "Activo" : "Referido";
  const products = Number(c.pedidos) ? `${c.pedidos} pedido(s)` : "Sin compras";
  return `<tr class="best-row" style="transition:background 0.1s;">
    <td style="padding:10px;text-align:center;${bordes}"><div style="width:15px;height:15px;border-radius:4px;border:1.5px solid rgba(160,185,240,0.25);margin:0 auto;"></div></td>
    <td style="padding:9px 13px;${bordes}"><div style="display:flex;align-items:center;gap:9px;"><div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#0A3AAE,#1A8FFF);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:10px;font-weight:700;color:white;flex-shrink:0;">${esc(initials)}</div><div style="min-width:0;"><div style="font-size:12.5px;color:#EEF2FF;font-weight:500;white-space:nowrap;">${esc(nombre)}</div><div style="font-size:10.5px;color:rgba(160,185,240,0.42);white-space:nowrap;">${esc(c.email || "")}</div></div></div></td>
    <td style="padding:9px 13px;${bordes}font-family:'JetBrains Mono',monospace;font-size:11.5px;color:rgba(200,215,255,0.62);white-space:nowrap;">${esc(c.whatsapp || "—")}</td>
    <td style="padding:9px 13px;${bordes}font-size:12px;color:rgba(200,215,255,0.68);white-space:nowrap;">${esc(products)}</td>
    <td style="padding:9px 13px;text-align:right;${bordes}font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#00D4A0;font-weight:500;white-space:nowrap;">${esc(money(c.total))}</td>
    <td style="padding:9px 13px;${bordes}"><span style="display:inline-flex;padding:2px 9px;background:${bg};border:1px solid ${col}44;border-radius:100px;font-size:10.5px;color:${col};font-weight:500;white-space:nowrap;">${estado}</span></td>
    <td style="padding:9px 13px;${bordes}font-size:11.5px;color:rgba(200,215,255,0.55);white-space:nowrap;">${esc(fecha(c.ultimo))}</td>
    <td style="padding:9px 13px;${bordes}font-size:11.5px;color:rgba(200,215,255,0.55);white-space:nowrap;">${esc(fecha(c.proximoVence))}</td>
    <td style="padding:9px 13px;border-bottom:1px solid rgba(80,100,200,0.08);font-size:11.5px;color:rgba(160,185,240,0.5);white-space:nowrap;">—</td>
  </tr>`;
}

function pintarClientes() {
  const tb = document.querySelector("[data-nv-clientes-body]");
  if (!tb) return;
  const cl = Store.get("resellerClients") || [];
  const firma = cl.length + ":" + cl.map((c) => c.id).join(",");
  if (tb.getAttribute("data-firma") === firma && tb.children.length) return;   // ya pintado
  tb.innerHTML = cl.length
    ? cl.slice(0, 50).map(filaCliente).join("")
    : `<tr><td colspan="9" style="padding:26px 20px;text-align:center;color:rgba(160,185,240,0.6);font-size:13px;">Aún no tienes referidos. Comparte tu enlace para empezar a ganar comisiones.</td></tr>`;
  tb.setAttribute("data-firma", firma);
  const cnt = document.querySelector("[data-nv-clientes-count]");
  if (cnt) cnt.textContent = cl.length ? `${cl.length} cliente${cl.length === 1 ? "" : "s"} referido${cl.length === 1 ? "" : "s"}` : "Sin referidos todavía";
  const foot = document.querySelector("[data-nv-clientes-foot]");
  if (foot) foot.textContent = cl.length ? `Mostrando ${Math.min(cl.length, 50)} de ${cl.length}` : "—";
}

function enPanel() { return (window.__NV_PAGE || "") === "revendedor"; }
function haySesion() { const s = Store.get("sesion") || {}; return s.estado === "autenticado"; }

export async function cargarReseller() {
  if (!enPanel() || !haySesion() || _cargando) return;
  _cargando = true;
  try {
    const [overview, clients, commissions] = await Promise.all([
      NVApi.resellerOverview().catch(() => null),
      NVApi.resellerClients().catch(() => []),
      NVApi.resellerCommissions().catch(() => []),
    ]);
    Store.set("resellerOverview", overview || null);
    Store.set("resellerClients", clients || []);
    Store.set("resellerCommissions", commissions || []);
    if (window.NV && window.NV.rerender) window.NV.rerender();
    else if (window.__NV_RERENDER) window.__NV_RERENDER();
    pintarClientes();
  } finally { _cargando = false; }
}

// Re-pinta la tabla de clientes cuando el runtime la limpia (tras cada render).
function armarObserver() {
  if (_obs || typeof MutationObserver === "undefined") return;
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (!root) return;
  let pend = 0;
  _obs = new MutationObserver(() => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; pintarClientes(); }); });
  _obs.observe(root, { childList: true, subtree: true });
}

async function retirar() {
  const NVUI = window.NVUI;
  const ov = Store.get("resellerOverview");
  const disp = ov ? Number(ov.disponible) || 0 : 0;
  if (disp <= 0) {
    if (NVUI) NVUI.info("Sin comisiones", "No tienes comisiones disponibles para retirar todavía.");
    return;
  }
  const ok = NVUI ? await NVUI.confirmar("Retirar comisiones", `Se abonarán $${disp.toFixed(2)} a tu billetera. ¿Continuar?`, "Retirar") : true;
  if (!ok) return;
  try {
    const r = await NVApi.resellerWithdraw("billetera");
    if (window.NVSound) { /* opcional */ }
    if (NVUI) await NVUI.exito("Retiro realizado", `Abonamos $${Number(r.retirado || 0).toFixed(2)} a tu billetera.`);
    await cargarReseller();
  } catch (e) {
    if (NVUI) NVUI.error("No se pudo retirar", (e && e.message) || "Inténtalo de nuevo.");
  }
}

async function copiarEnlace() {
  const ov = Store.get("resellerOverview");
  const code = ov && ov.codigo;
  if (!code) return;
  const url = "nvstreaming.com/?ref=" + code;
  try { await navigator.clipboard.writeText(url); } catch (_) {}
  if (window.NV && window.NV.toast) window.NV.toast("Enlace copiado: " + url, "rgba(0,207,255,0.5)");
}

export function instalarReseller() {
  // Nos suscribimos SIEMPRE (aunque __NV_PAGE aún no esté fijado): cargarReseller
  // se autolimita a la página del panel y a sesiones autenticadas.
  cargarReseller();
  armarObserver();
  if (Bus.on) { Bus.on("user:login", cargarReseller); Bus.on("app:ready", () => { cargarReseller(); armarObserver(); }); }
  Store.subscribe && Store.subscribe("sesion", () => cargarReseller());
  Store.subscribe && Store.subscribe("resellerClients", () => pintarClientes());
  if (typeof window !== "undefined") window.addEventListener("nv:runtime-ready", () => { cargarReseller(); armarObserver(); });
  setInterval(cargarReseller, 20000);
  // Botones (delegación): retiro y copiar enlace/código.
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-nv-withdraw]");
    if (b) { ev.preventDefault(); retirar(); return; }
    const c = ev.target.closest("[data-nv-copyref]");
    if (c) { ev.preventDefault(); copiarEnlace(); }
  }, true);
}

export default { instalarReseller, cargarReseller };
