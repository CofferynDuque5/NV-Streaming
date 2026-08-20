/**
 * credentials.view.js — Vista del panel de Automatización de Credenciales (OTP).
 *
 * Página modular independiente del Back Office. Consume NVCore + el servicio
 * `credentials.service.js`. Muestra en tiempo real los códigos entrantes con su
 * estado (Pendiente/Usado/Expirado), un simulador de recepción (para probar el
 * parser sin bot) y la asignación masiva de credenciales/códigos.
 */

import NVCore from "../core.js";
import { iniciarCargaDatos } from "../services/data.service.js";
import Cred, { Permisos, procesarMensaje, asignarMasivo, marcarUsado, avisoDeCodigo, Codigos } from "../services/credentials.service.js";

const { Store, Bus, Utils } = NVCore;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (s) => String(s || "?").slice(0, 2).toUpperCase();

function platNombre(id) { const p = (Store.get("plataformas") || []).find((x) => x.id === id); return p ? p.nombre : (id || "—"); }
function cuentaLabel(id) { const c = (Store.get("inventario") || []).find((x) => x.id === id); return c && c.credenciales ? c.credenciales.usuario : "—"; }

function cuentaRestante(expira) {
  const d = Utils.toDate(expira); if (!d) return { txt: "—", warn: false, expirado: false };
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return { txt: "expirado", warn: false, expirado: true };
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return { txt: `${m}:${String(s).padStart(2, "0")}`, warn: ms < 120000, expirado: false };
}

/* ─────────────────────────────  RENDER  ───────────────────────────── */
function renderKPIs() {
  const c = Codigos.conteoPorEstado();
  const plats = (Store.get("plataformas") || []).filter((p) => p.estado === 1 || p.estado === true).length;
  const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
  set("k-pend", c.Pendiente || 0);
  set("k-usado", c.Usado || 0);
  set("k-exp", (c.Expirado || 0) + (c.Obsoleto || 0));
  set("k-plat", plats);
}

function renderTabla() {
  const tb = $("#otp-tbody"); if (!tb) return;
  const rows = Codigos.recientes(60);
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="7"><div class="empty">Sin códigos recibidos todavía. Usa el simulador o conecta tu bot de Telegram/WhatsApp.</div></td></tr>`; return; }
  tb.innerHTML = rows.map((c) => {
    const rem = cuentaRestante(c.expira_at);
    const estado = c.obsoleto ? "Obsoleto" : c.leido ? "Usado" : rem.expirado ? "Expirado" : "Pendiente";
    return `<tr data-id="${esc(c.id)}">
      <td><span class="code-pill">${esc(c.codigo)}</span></td>
      <td><span class="plat"><span class="pl-ic">${esc(short(platNombre(c.plataforma_id)))}</span>${esc(platNombre(c.plataforma_id))}</span></td>
      <td>${esc(cuentaLabel(c.cuenta_madre_id))}</td>
      <td><span class="via">${esc(c.recibido_via)}${c.remitente ? " · " + esc(c.remitente) : ""}</span></td>
      <td><span class="count ${rem.warn ? "warn" : ""}">${esc(rem.txt)}</span></td>
      <td><span class="badge b-${estado}">${estado}</span></td>
      <td><div class="row-act">
        <button class="mini act-notify" title="Notificar al cliente">Notificar</button>
        ${estado === "Pendiente" ? '<button class="mini ok act-used" title="Marcar como usado">Usado</button>' : ""}
      </div></td>
    </tr>`;
  }).join("");
}

function renderAll() { renderKPIs(); renderTabla(); }

/* ─────────────────────────────  ACCIONES  ───────────────────────────── */
function toast(msg, color) {
  let t = $("#otp-toast");
  if (!t) { t = document.createElement("div"); t.id = "otp-toast"; t.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:99;padding:12px 20px;border-radius:12px;font:600 13.5px 'DM Sans',sans-serif;color:#fff;background:rgba(10,14,30,.95);border:1px solid rgba(0,207,255,.4);box-shadow:0 12px 40px rgba(0,0,40,.6);opacity:0;transition:.3s;backdrop-filter:blur(10px)"; document.body.appendChild(t); }
  t.textContent = msg; t.style.borderColor = color || "rgba(0,207,255,.4)";
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(-50%) translateY(20px)"; }, 2400);
}

async function onSimular() {
  const texto = $("#sim-text").value.trim();
  const via = $("#sim-via").value;
  const box = $("#sim-result");
  if (!texto) { box.className = "result err"; box.style.display = "block"; box.textContent = "Escribe un mensaje para procesar."; return; }
  const r = await procesarMensaje({ texto, via });
  box.style.display = "block";
  if (!r.ok) { box.className = "result err"; box.textContent = "No procesado: " + r.motivo; return; }
  box.className = "result ok";
  const a = r.aviso;
  box.innerHTML = `<div><span class="kv">Código:</span> <b>${esc(r.registro.codigo)}</b> · <span class="kv">Plataforma:</span> <b>${esc(platNombre(r.registro.plataforma_id))}</b></div>
    <div><span class="kv">Cuenta madre:</span> ${esc(cuentaLabel(r.registro.cuenta_madre_id) || "—")} · <span class="kv">Vía:</span> ${esc(r.registro.recibido_via)}</div>
    ${a ? `<div class="section-gap"><span class="kv">Notificar a ${esc(a.destinatario || "cliente")}:</span> <a href="${esc(a.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a> · <a href="${esc(a.telegram)}" target="_blank" rel="noopener">Telegram</a></div>` : '<div class="kv section-gap">Sin cliente asignado a este perfil.</div>'}`;
  $("#sim-text").value = "";
  toast("Código registrado ✓", "rgba(0,212,160,.5)");
}

async function onMasivo() {
  const texto = $("#bulk-text").value.trim();
  const box = $("#bulk-result");
  if (!texto) { box.className = "result err"; box.style.display = "block"; box.textContent = "Pega credenciales o códigos, una por línea."; return; }
  const btn = $("#bulk-btn"); btn.disabled = true; btn.textContent = "Distribuyendo…";
  const r = await asignarMasivo(texto);
  btn.disabled = false; btn.textContent = "Distribuir";
  box.style.display = "block";
  if (!r.ok) { box.className = "result err"; box.textContent = "No autorizado: " + r.motivo; return; }
  box.className = "result ok";
  box.innerHTML = `<div><b>${r.credenciales}</b> credencial(es) · <b>${r.codigos}</b> código(s) procesado(s)${r.errores.length ? ` · <span style="color:#FFB020">${r.errores.length} error(es)</span>` : ""}</div>
    <div class="section-gap" style="max-height:140px;overflow:auto">${r.detalle.concat(r.errores).map((d) => `<div>${esc(d)}</div>`).join("")}</div>`;
  toast(`Asignación masiva: ${r.credenciales + r.codigos} ítems`, "rgba(0,212,160,.5)");
}

function onTableClick(ev) {
  const tr = ev.target.closest("tr[data-id]"); if (!tr) return;
  const id = tr.getAttribute("data-id");
  if (ev.target.closest(".act-notify")) {
    const a = avisoDeCodigo(id);
    if (a && a.whatsapp) { window.open(a.whatsapp, "_blank"); toast("Abriendo WhatsApp del cliente…"); }
    else toast("Este código no tiene cliente asignado", "rgba(255,176,32,.5)");
  }
  if (ev.target.closest(".act-used")) { marcarUsado(id); toast("Marcado como usado"); }
}

/* ─────────────────────────────  ARRANQUE  ───────────────────────────── */
async function boot() {
  await NVCore.init();
  iniciarCargaDatos();               // seed + snapshots (incluye codigos, plataformas…)
  Store.subscribe("codigos", renderAll);
  Store.subscribe("plataformas", renderKPIs);
  Bus.on("store:changed", () => { /* re-render ligero */ });

  $("#sim-btn").addEventListener("click", onSimular);
  $("#bulk-btn").addEventListener("click", onMasivo);
  $("#otp-tbody").addEventListener("click", onTableClick);
  $("#bulk-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { $("#bulk-text").value = r.result; toast("Archivo cargado — revisa y pulsa Distribuir"); }; r.readAsText(f);
  });

  // Gate de permisos (estricto solo con window.NV_ENFORCE).
  const gate = $("#otp-gate");
  const chequearGate = () => { const ver = Permisos.puede("puede_ver_global"); if (window.NV_ENFORCE && !ver) gate.classList.add("on"); else gate.classList.remove("on"); };
  Store.subscribe("sesion", chequearGate); Store.subscribe("permisos", chequearGate); chequearGate();

  // Rol visible.
  Store.subscribe("sesion", (s) => { const el = $("#otp-role"); if (el) el.textContent = "ROL · " + ((s && s.usuario && s.usuario.rol) || "demo").toUpperCase(); });

  renderAll();
  // Countdown en vivo: re-render de la tabla cada segundo.
  setInterval(renderAll, 1000);
  document.documentElement.setAttribute("data-otp-ready", "");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
