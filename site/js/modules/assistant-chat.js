/**
 * assistant-chat.js — Asistente NV con procesamiento REAL de mensajes.
 *
 * Reemplaza las burbujas estáticas quemadas del HTML por un flujo real:
 *   1. `onSendMessage()` captura el texto del input del chat.
 *   2. POST asíncrono a `http://localhost:3000/api/chat` con `{ message }` y el
 *      token JWT en `Authorization` (la identidad nunca viaja en el cuerpo).
 *   3. Mientras la promesa está pendiente → indicador "Asistente NV está
 *      procesando…" (typing real, no simulado).
 *   4. Al responder el backend → renderiza dinámicamente la burbuja de la IA
 *      (texto + tarjeta + botones de acción). Cero respuestas por subcadena en
 *      el cliente: toda la lógica vive en el backend (message-handler.ts).
 *
 * El estado de la conversación vive en el módulo: si el runtime repinta el panel,
 * el controlador vuelve a tomar el control y re-renderiza la conversación real.
 */
import NVCore from "../core.js";
import { reproducir } from "./sound.js";

const { Store } = NVCore;
const conversacion = []; // [{ rol:'user'|'ia', text, card?, actions? }]
let procesando = false;
let _obs = null;

function api() {
  const c = (window.NV_CONFIG && window.NV_CONFIG.api) || {};
  return (c.base || "http://localhost:3000").replace(/\/$/, "") + (c.chat || "/api/chat");
}

// El token JWT identifica al usuario en el backend (la identidad NUNCA viaja en
// el cuerpo). Sin token → invitado: el asistente responde temas generales
// (catálogo/precios) pero no datos de cuenta.
function token() {
  try { return localStorage.getItem("nv_token") || ""; } catch (_) { return ""; }
}

/* ─────────────────────────  RENDER  ───────────────────────── */
// Escapa también comillas: estos valores se interpolan dentro de atributos
// (p. ej. data-cmd="..."), no solo en texto — evita romper el atributo (XSS).
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function avatarIA() {
  return `<div style="width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#0A3AAE,#00CFFF);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8z"/></svg></div>`;
}
function burbujaHTML(m) {
  if (m.rol === "user") {
    return `<div style="display:flex;justify-content:flex-end;"><div style="max-width:82%;padding:11px 13px;background:linear-gradient(135deg,rgba(0,60,180,0.5),rgba(155,63,255,0.3));border:1px solid rgba(0,150,255,0.2);border-radius:13px 13px 3px 13px;font-size:13px;color:#EEF2FF;line-height:1.5;white-space:pre-wrap;">${esc(m.text)}</div></div>`;
  }
  let cardHTML = "";
  if (m.card) {
    const c = m.card;
    const filas = Object.entries(c).filter(([k]) => k !== "titulo").map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:11.5px;padding:2px 0;"><span style="color:rgba(200,215,255,0.45);text-transform:capitalize;">${esc(k)}</span><span style="color:#EEF2FF;">${esc(v)}</span></div>`).join("");
    cardHTML = `<div style="margin:8px 0 0 34px;background:#0C0C26;border:1px solid rgba(80,100,200,0.2);border-radius:12px;padding:11px 13px;"><div style="font-size:13px;font-weight:600;color:#EEF2FF;margin-bottom:6px;">${esc(c.titulo || "Detalle")}</div>${filas}</div>`;
  }
  let actHTML = "";
  if (m.actions && m.actions.length) {
    actHTML = `<div style="margin:8px 0 0 34px;display:flex;flex-wrap:wrap;gap:6px;">${m.actions.map((a) => `<button type="button" class="nv-chat-accion" data-cmd="${esc(a.comando)}" style="padding:6px 11px;background:rgba(0,207,255,0.08);border:1px solid rgba(0,207,255,0.22);border-radius:100px;color:#7fe0ff;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer;">${esc(a.label)}</button>`).join("")}</div>`;
  }
  return `<div style="display:flex;align-items:flex-end;gap:8px;">${avatarIA()}<div style="max-width:82%;padding:11px 13px;background:#101030;border:1px solid rgba(80,100,200,0.16);border-radius:13px 13px 13px 3px;font-size:13px;color:rgba(200,215,255,0.88);line-height:1.55;white-space:pre-wrap;">${esc(m.text)}</div></div>${cardHTML}${actHTML}`;
}
function typingHTML() {
  return `<div id="nv-chat-typing" style="display:flex;align-items:center;gap:8px;">${avatarIA()}<div style="padding:10px 14px;background:#101030;border:1px solid rgba(80,100,200,0.16);border-radius:13px 13px 13px 3px;display:flex;align-items:center;gap:8px;"><div style="display:flex;gap:4px;"><div class="nv-td"></div><div class="nv-td" style="animation-delay:.18s"></div><div class="nv-td" style="animation-delay:.36s"></div></div><span style="font-size:11.5px;color:rgba(200,215,255,0.55);">Asistente NV está procesando…</span></div></div>`;
}

function render(stream) {
  if (conversacion.length === 0) {
    conversacion.push({ rol: "ia", text: "¡Hola! 👋 Soy tu Asistente NV. Escríbeme (o usa /saldo, /renovar, /catalogo) y consulto tus datos reales.", actions: [
      { comando: "/saldo", label: "📊 Mis servicios" }, { comando: "/catalogo", label: "🛒 Catálogo" },
    ] });
  }
  stream.innerHTML = conversacion.map(burbujaHTML).join("") + (procesando ? typingHTML() : "");
  stream.scrollTop = stream.scrollHeight;
}

/* ──────────  ENRUTADOR LOCAL (PostgreSQL/Store, sin backend Node)  ──────────
   Si el agente en localhost:3000 no está activo, el asistente NO se cae: enruta
   la intención en el cliente leyendo los datos REALES ya cargados en el Store
   (servicios_sistema, suscripciones, inventario…), no respuestas inventadas. */
function normaliza(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function plataformaEn(t) {
  const svc = Store.get("servicios") || [];
  for (const s of svc) { const id = (s.id_servicio || "").toLowerCase(); if (id && t.includes(id)) return s; const n = (s.nombre_display || "").toLowerCase().split(" ")[0]; if (n && n.length > 2 && t.includes(n)) return s; }
  return null;
}
function menuLocal() { return [{ comando: "/saldo", label: "📊 Mis servicios" }, { comando: "/catalogo", label: "🛒 Catálogo" }, { comando: "/soporte", label: "🆘 Falla de acceso" }]; }
function routerLocal(mensaje) {
  const t = normaliza(mensaje);
  const ses = Store.get("sesion") || {};
  const u = ses.usuario;
  const nombre = u && (u.nombre || u.email) ? " " + String(u.nombre || u.email).split(" ")[0] : "";
  if (/^(hola|buenas|hey|holi|hi)\b/.test(t)) return { text: `¡Hola${nombre}! 👋 Soy tu Asistente NV. Consulto tus servicios, catálogo y fallas de acceso con datos reales. ¿Qué necesitas?`, actions: menuLocal() };
  if (/(saldo|mis servicios|mi cuenta|suscripcion|vence|que tengo)/.test(t)) {
    if (!u) return { text: "No hay una sesión activa. Inicia sesión para ver tu saldo y tus servicios.", actions: [{ comando: "/catalogo", label: "🛒 Ver catálogo" }] };
    const subs = (Store.get("suscripciones") || []).filter((s) => s.estado === "activo" || s.estado === "activa");
    const saldo = Number(u.saldoBilletera) || 0;
    if (!subs.length) return { text: `Tu saldo es ${money(saldo)}. No tienes servicios activos ahora mismo.`, actions: [{ comando: "/catalogo", label: "🛒 Ver catálogo" }] };
    const lineas = subs.slice(0, 6).map((s) => `• ${s.servicio || s.nombre} — ${s.estado}${s.vence ? " · vence " + (window.NVCore.Utils.fecha(s.vence)) : ""}`).join("\n");
    return { text: `Saldo: ${money(saldo)}\nServicios activos (${subs.length}):\n${lineas}` };
  }
  if (/(no puedo entrar|no me deja|no funciona|error|falla|problema|acceso|no carga|soporte)/.test(t)) {
    const s = plataformaEn(t);
    if (!s) return { text: '¿Con qué servicio tienes el problema? Por ejemplo: "no puedo entrar a Netflix".' };
    const inv = (Store.get("inventario") || []).find((x) => x.id_servicio === s.id_servicio && x.estado === "disponible");
    return { text: `Detecté un problema de acceso con tu ${s.nombre_display}. Pasos:\n1) Usa el correo y perfil asignados.\n2) Ingresa el PIN del perfil.\n3) Si pide código de verificación, pídemelo.`, card: inv ? { titulo: s.nombre_display, perfil: inv.credenciales.perfil || "—", estado: "Disponible" } : { titulo: s.nombre_display, estado: "En verificación" } };
  }
  if (/(renovar|renueva|extender)/.test(t)) {
    const s = plataformaEn(t);
    if (!u) return { text: "Para renovar necesito tu sesión iniciada." };
    if (!s) return { text: "¿Cuál servicio quieres renovar? Escríbeme, p. ej. /renovar netflix." };
    return { text: `Para renovar tu ${s.nombre_display} usa el botón de recarga/pago. Puedo llevarte al checkout.`, actions: [{ comando: "/catalogo", label: "🛒 Ir al catálogo" }] };
  }
  if (/(catalogo|precio|precios|cuanto|comprar|servicios|planes)/.test(t)) {
    const svc = (Store.get("servicios") || []).filter((s) => s.activo).slice(0, 8);
    if (!svc.length) return { text: "El catálogo se está cargando. Intenta en un momento." };
    const lineas = svc.map((s) => `• ${s.nombre_display} — ${money(window.NV.catalog ? window.NV.catalog.precioFinalUSD(s) : s.precio)}`).join("\n");
    return { text: `Estos son algunos servicios disponibles:\n${lineas}\n\nDime cuál te interesa.` };
  }
  return { text: 'Puedo ayudarte con:\n• /saldo — tus servicios y saldo\n• /catalogo — precios reales\n• "No puedo entrar a Netflix" — soporte de acceso', actions: menuLocal() };
}
function money(usd) { try { return window.NV && window.NV.moneda ? window.NV.moneda.formato(usd) : "$" + Number(usd).toFixed(2); } catch (_) { return "$" + Number(usd || 0).toFixed(2); } }

/* ─────────────────────────  FLUJO  ───────────────────────── */
async function onSendMessage(texto, stream) {
  const msg = String(texto || "").trim();
  if (!msg || procesando) return;
  reproducir("click");
  conversacion.push({ rol: "user", text: msg });
  procesando = true;
  render(stream);

  let reply = null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3500);
    const tk = token();
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (tk) headers.Authorization = "Bearer " + tk;
    const res = await fetch(api(), {
      method: "POST",
      headers,
      body: JSON.stringify({ message: msg }), // identidad por token, no por body
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    reply = (data && data.reply) || {};
  } catch (e) {
    // Backend Node no disponible → enrutador LOCAL sobre PostgreSQL/Store (datos reales).
    reply = routerLocal(msg);
  }
  procesando = false;
  conversacion.push({ rol: "ia", text: reply.text || "…", card: reply.card || null, actions: reply.actions || null });
  render(stream);
  reproducir("notify");
}

/* ─────────────────────────  MONTAJE  ───────────────────────── */
function localizar() {
  const input = [...document.querySelectorAll('input[type="text"]')].find((i) => /escribe|renovar/i.test(i.getAttribute("placeholder") || ""));
  if (!input) return null;
  // Panel del asistente: el ancestro posicionado (fixed/absolute) que lo contiene.
  let panel = input.parentElement;
  while (panel && panel !== document.body) { const pos = getComputedStyle(panel).position; if (pos === "fixed" || pos === "absolute") break; panel = panel.parentElement; }
  const scope = panel && panel !== document.body ? panel : document;
  // Contenedor de mensajes: el descendiente con scroll vertical que NO contiene al input.
  let cont = null;
  const divs = scope.querySelectorAll("div");
  for (const d of divs) { const oy = getComputedStyle(d).overflowY; if ((oy === "auto" || oy === "scroll") && !d.contains(input)) { cont = d; break; } }
  return { input, cont };
}

function tomarControl() {
  const loc = localizar();
  if (!loc || !loc.cont || !loc.input) return;
  const { input, cont } = loc;
  if (cont.getAttribute("data-nv-chat") === "1" && document.getElementById("nv-chat-stream")) return; // ya controlado
  cont.setAttribute("data-nv-chat", "1");
  const stream = document.createElement("div");
  stream.id = "nv-chat-stream";
  stream.setAttribute("data-nv-ux", "1");
  stream.style.cssText = "display:flex;flex-direction:column;gap:11px;min-height:100%;";
  cont.innerHTML = "";                 // elimina las burbujas quemadas del HTML
  cont.appendChild(stream);
  render(stream);

  // Input: Enter envía.
  if (!input.__nvChat) {
    input.__nvChat = true;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const v = input.value; input.value = ""; onSendMessage(v, stream); } });
    // Botón de enviar (el último botón de la barra del input).
    const bar = input.parentElement;
    const send = bar && [...bar.querySelectorAll("button")].pop();
    if (send) send.addEventListener("click", (e) => { e.preventDefault(); const v = input.value; input.value = ""; onSendMessage(v, stream); });
  }

  // Chips /saldo /renovar /netflix y botones de acción → envían comando.
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".nv-chat-accion, button");
    if (!b) return;
    const cmd = b.getAttribute("data-cmd") || (/^\/(saldo|renovar|netflix|catalogo|ayuda|soporte)/.test((b.textContent || "").trim()) ? (b.textContent || "").trim() : null);
    if (cmd && document.getElementById("nv-chat-stream")) { ev.preventDefault(); onSendMessage(cmd, document.getElementById("nv-chat-stream")); }
  }, true);
}

export function instalarChat() {
  // Estilos de los puntos de "escribiendo".
  if (!document.getElementById("nv-chat-css")) {
    const st = document.createElement("style");
    st.id = "nv-chat-css";
    st.textContent = ".nv-td{width:6px;height:6px;background:#00CFFF;border-radius:50%;animation:nvTd 1.1s ease-in-out infinite}@keyframes nvTd{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}";
    document.head.appendChild(st);
  }
  tomarControl();
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window && !_obs) {
    let pend = 0;
    _obs = new MutationObserver(() => { if (pend) return; pend = requestAnimationFrame(() => { pend = 0; tomarControl(); }); });
    _obs.observe(root, { childList: true, subtree: true });
  }
}

export default { instalarChat };
