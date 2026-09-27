/**
 * mi-cuenta-accesos.js — "Mis accesos": la ENTREGA real de lo comprado.
 *
 * Fuente: GET /api/mis/accesos (backend). Devuelve, para el cliente con sesión:
 *   · accesos: suscripciones con la cuenta asignada; `credenciales` (correo,
 *     contraseña, perfil, PIN) solo si está activa, pagada y vigente.
 *   · pedidos: cada compra con su estado (pendiente/aprobado/rechazado) y su
 *     estado de aprovisionamiento (asignado / cola_espera / no_aplica…).
 *   · cola_espera: compras aprobadas que esperan stock.
 *
 * Pinta un panel propio en "Mi cuenta → Mis servicios" (marcado data-nv-ux para
 * que el runtime no lo pise) y guarda los datos en Store.accesos para que
 * bridge.decorateCuenta pinte la lista/estadísticas con datos reales. Se
 * refresca al entrar, al iniciar sesión y cada 20 s (así el cliente ve la
 * activación en cuanto el admin aprueba). Sin datos inventados.
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";
import { Catalogo } from "../services/data.service.js";

const { Store, Bus, Utils } = NVCore;
const POLL_MS = 20000;
let timer = null, cargando = false;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nombre = (id) => (Catalogo.porId(id) || {}).nombre_display || id;
const fecha = (v) => { try { return v ? Utils.fecha(v) : "—"; } catch (_) { return v ? String(v).slice(0, 10) : "—"; } };
const auth = () => (Store.get("sesion") || {}).estado === "autenticado";

export async function cargarAccesos() {
  if (!auth() || cargando) return null;
  cargando = true;
  try {
    const r = await NVApi.misAccesos();
    Store.set("accesos", r);
    pintar();
    return r;
  } catch (e) {
    if (!(e && e.status === 401)) { const prev = Store.get("accesos"); if (!prev) Store.set("accesos", { accesos: [], pedidos: [], cola_espera: [], error: (e && e.message) || "No se pudo cargar" }); pintar(); }
    return null;
  } finally { cargando = false; }
}

const PROVISION = {
  asignado: ["Cuenta asignada", "#00D4A0"],
  cola_espera: ["En lista de espera (sin stock)", "#FFB020"],
  sin_stock: ["Sin stock · saldo devuelto", "#FF3E6C"],
  no_aplica: ["Entrega manual por WhatsApp", "#00CFFF"],
  sin_plan: ["Entrega manual por WhatsApp", "#00CFFF"],
  error: ["Revisión manual", "#FFB020"],
};
const ESTADO_PEDIDO = { pendiente: ["Pendiente de validar el pago", "#FFB020"], aprobado: ["Pago aprobado", "#00D4A0"], rechazado: ["Rechazado", "#FF3E6C"], entregado: ["Entregado", "#00D4A0"] };
const MOTIVO = { suscripcion_vencida: "Venció. Renueva para recuperar el acceso.", pago_pendiente: "Pago pendiente.", suscripcion_pausada: "Pausada.", suscripcion_cancelada: "Cancelada.", suscripcion_no_activa: "No activa." };

function tarjetaAcceso(a) {
  const c = a.credenciales;
  const activo = a.estado === "activa" && a.vigente;
  const chip = activo ? ["Activo", "#00D4A0"] : [MOTIVO[a.motivo] ? "Inactivo" : a.estado, "#FF3E6C"];
  return `
    <div data-nv-acceso="${esc(a.id)}" style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;background:rgba(255,255,255,0.025);display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-size:14px;font-weight:600;color:#EEF2FF;">${esc(nombre(a.plataforma_id))}</div>
          <div style="font-size:11.5px;color:rgba(240,240,250,0.45);margin-top:2px;">${esc(a.plan || "")} · Perfil <b style="color:rgba(240,240,250,0.75)">${esc(a.perfil || "—")}</b> · Vence ${esc(fecha(a.vence))}</div>
        </div>
        <span style="padding:4px 10px;border-radius:100px;font-size:11.5px;font-weight:500;color:${chip[1]};background:${chip[1]}1a;border:1px solid ${chip[1]}55;">${esc(chip[0])}</span>
      </div>
      ${c ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;">
        <div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;"><div style="font-size:10.5px;color:rgba(240,240,250,0.4);text-transform:uppercase;letter-spacing:.06em;">Correo</div><div style="display:flex;align-items:center;gap:6px;"><span data-nv-copiar="${esc(c.correo)}" style="font-family:'JetBrains Mono',monospace;color:#EEF2FF;word-break:break-all;">${esc(c.correo)}</span><button data-nv-copiar-btn="${esc(c.correo)}" title="Copiar" style="border:none;background:rgba(0,207,255,0.12);color:#00CFFF;border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;">Copiar</button></div></div>
        <div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;"><div style="font-size:10.5px;color:rgba(240,240,250,0.4);text-transform:uppercase;letter-spacing:.06em;">Contraseña</div><div style="display:flex;align-items:center;gap:6px;"><span data-nv-pass="${esc(c.contrasena)}" data-oculta="1" style="font-family:'JetBrains Mono',monospace;color:#EEF2FF;">••••••••</span><button data-nv-ver-pass="1" style="border:none;background:rgba(255,255,255,0.08);color:rgba(240,240,250,0.8);border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;">Mostrar</button><button data-nv-copiar-btn="${esc(c.contrasena)}" title="Copiar" style="border:none;background:rgba(0,207,255,0.12);color:#00CFFF;border-radius:6px;padding:2px 7px;font-size:11px;cursor:pointer;">Copiar</button></div></div>
        <div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;"><div style="font-size:10.5px;color:rgba(240,240,250,0.4);text-transform:uppercase;letter-spacing:.06em;">Perfil</div><div style="color:#EEF2FF;">${esc(c.perfil || "—")}</div></div>
        <div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;"><div style="font-size:10.5px;color:rgba(240,240,250,0.4);text-transform:uppercase;letter-spacing:.06em;">PIN</div><div style="font-family:'JetBrains Mono',monospace;color:#EEF2FF;">${esc(c.pin || "Sin PIN")}</div></div>
      </div>
      <div style="font-size:11.5px;color:rgba(240,240,250,0.4);">Usa solo el perfil asignado y no cambies la contraseña. ¿Problemas? Escríbenos por WhatsApp.</div>`
      : `<div style="font-size:12.5px;color:#FFB020;">${esc(MOTIVO[a.motivo] || "Acceso no disponible.")} ${a.motivo === "suscripcion_vencida" ? `<a href="detalles.html?id=${encodeURIComponent(a.plataforma_id)}" style="color:#00CFFF;text-decoration:none;">Renovar →</a>` : ""}</div>`}
    </div>`;
}

function filaPedido(p) {
  const e = ESTADO_PEDIDO[p.estado] || [p.estado, "rgba(240,240,250,0.6)"];
  const prov = p.estado === "aprobado" || p.estado === "entregado" ? (PROVISION[p.provision_estado] || null) : null;
  let detalle = "";
  if (p.estado === "pendiente") detalle = "Estamos validando tu pago. Te avisamos por WhatsApp y aquí aparecerá tu acceso.";
  else if (p.estado === "rechazado") detalle = "Si crees que es un error, escríbenos por WhatsApp con tu comprobante.";
  else if (prov) detalle = prov[0] === "Cuenta asignada" ? "Tus datos de acceso están arriba, en Mis accesos." : prov[0];
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;">
      <div style="min-width:0;">
        <div style="font-size:13px;color:#EEF2FF;font-weight:500;">${esc(nombre(p.id_servicio))} <span style="color:rgba(240,240,250,0.4);font-weight:400;">· ${esc(fecha(p.creado_en))} · ${esc(p.metodo_pago || "—")}</span></div>
        <div style="font-size:11.5px;color:rgba(240,240,250,0.45);margin-top:2px;">${esc(detalle)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#00CFFF;">$${Number(p.precio || 0).toFixed(2)}</span>
        <span style="padding:3px 9px;border-radius:100px;font-size:11px;font-weight:500;color:${e[1]};background:${e[1]}1a;border:1px solid ${e[1]}55;white-space:nowrap;">${esc(prov && prov[0] !== "Cuenta asignada" ? prov[0] : e[0])}</span>
      </div>
    </div>`;
}

function html(d) {
  const accesos = (d && d.accesos) || [];
  const pedidos = (d && d.pedidos) || [];
  const abiertos = pedidos.filter((p) => !(p.estado === "aprobado" && p.provision_estado === "asignado") && p.estado !== "entregado");
  return `
    <div style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;">
      <span style="font-family:'Syne',sans-serif;font-size:14px;font-weight:600;color:#EEF2FF;">Mis accesos</span>
      <button data-nv-accesos-recargar style="padding:5px 11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:6px;color:rgba(240,240,250,0.5);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;">↻ Actualizar</button>
    </div>
    <div style="padding:14px 20px;display:flex;flex-direction:column;gap:10px;">
      ${d && d.error ? `<div style="font-size:12.5px;color:#FFB020;">${esc(d.error)}</div>` : ""}
      ${accesos.length ? accesos.map(tarjetaAcceso).join("") : `<div style="font-size:12.5px;color:rgba(240,240,250,0.45);padding:6px 0;">Todavía no tienes cuentas asignadas. Cuando tu pago se valide, tus datos de acceso aparecerán aquí.</div>`}
      ${abiertos.length ? `<div style="margin-top:6px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:rgba(240,240,250,0.35);">Estado de tus pedidos</div>${abiertos.map(filaPedido).join("")}` : ""}
    </div>`;
}

function contenedorSubs() {
  const t = document.querySelector('[data-nv-slot="acc.subs.title"]');
  if (!t) return null;
  // La tarjeta es el ancestro con border-radius 14px (el runtime normaliza el
  // atributo style, así que no se puede buscar por texto del atributo).
  let n = t;
  for (let i = 0; i < 6 && n; i++) { if (n.style && /14px/.test(n.style.borderRadius || "")) return n; n = n.parentElement; }
  return t.parentElement && t.parentElement.parentElement;
}

export function pintar() {
  if (!auth()) { const p = document.getElementById("nv-accesos"); if (p) p.remove(); return; }
  const card = contenedorSubs(); if (!card || !card.parentElement) return;
  let p = document.getElementById("nv-accesos");
  if (!p) {
    p = document.createElement("div"); p.id = "nv-accesos"; p.setAttribute("data-nv-ux", "1");
    p.style.cssText = "background:#07071A;border:1px solid rgba(0,207,255,0.18);border-radius:14px;overflow:hidden;margin-bottom:24px;";
    card.parentElement.insertBefore(p, card);
  } else if (p.nextElementSibling !== card) { card.parentElement.insertBefore(p, card); }
  const d = Store.get("accesos");
  const h = d ? html(d) : `<div style="padding:16px 20px;font-size:12.5px;color:rgba(240,240,250,0.45);">Cargando tus accesos…</div>`;
  if (p.dataset.html !== h) { p.innerHTML = h; p.dataset.html = h; }
}

function onClick(ev) {
  const t = ev.target;
  const r = t.closest("[data-nv-accesos-recargar]"); if (r) { ev.preventDefault(); cargarAccesos(); return; }
  const v = t.closest("[data-nv-ver-pass]");
  if (v) {
    ev.preventDefault();
    const span = v.parentElement.querySelector("[data-nv-pass]");
    const oculta = span.dataset.oculta === "1";
    span.textContent = oculta ? span.getAttribute("data-nv-pass") : "••••••••"; span.dataset.oculta = oculta ? "0" : "1"; v.textContent = oculta ? "Ocultar" : "Mostrar";
    return;
  }
  const c = t.closest("[data-nv-copiar-btn]");
  if (c) {
    ev.preventDefault();
    const val = c.getAttribute("data-nv-copiar-btn");
    navigator.clipboard.writeText(val).then(() => { if (window.NV && window.NV.toast) window.NV.toast("Copiado", "rgba(0,207,255,0.5)"); }).catch(() => window.prompt("Copia:", val));
  }
}

export function instalarAccesos() {
  const page = (typeof window !== "undefined" && window.__NV_PAGE) || (document.body && document.body.getAttribute("data-nv-page"));
  if (!/cuenta/.test(String(page || ""))) return;
  document.addEventListener("click", onClick, true);
  Bus.on && Bus.on("app:ready", () => { cargarAccesos(); pintar(); });
  Bus.on && Bus.on("user:login", () => cargarAccesos());
  Bus.on && Bus.on("user:logout", () => { Store.set("accesos", null); pintar(); });
  // El runtime repinta la página (morph) en cada cambio del Store y puede
  // descartar el panel: se vuelve a insertar en cuanto desaparece del DOM.
  let pendiente = false;
  const reinsertar = () => { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; if (!document.getElementById("nv-accesos")) pintar(); }); };
  new MutationObserver(reinsertar).observe(document.body, { childList: true, subtree: true });
  Bus.on && Bus.on("store:changed", () => { requestAnimationFrame(() => requestAnimationFrame(pintar)); });
  timer = setInterval(() => { if (document.visibilityState === "visible") cargarAccesos(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cargarAccesos(); });
  window.NVAccesos = { cargar: cargarAccesos, pintar };
}

export default { instalarAccesos, cargarAccesos, pintar };
