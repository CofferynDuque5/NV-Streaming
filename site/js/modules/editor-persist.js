/**
 * editor-persist.js — Conecta el Editor visual con la base de datos.
 *
 * Los botones "Guardar borrador" y "Publicar" del editor ya no son decorativos:
 * leen el estado real del editor (window.__NV_INSTANCE.state) y lo persisten en
 * PostgreSQL vía EditorService (layout de página + tokens de tema). Al abrir el
 * editor, carga el layout guardado y lo aplica, cerrando el ciclo edición↔BD.
 */
import NVCore from "../core.js";
import { editorService } from "../services/editor.service.js";
import { servicioImagenes } from "../services/imgbb.service.js";
import { reproducir } from "./sound.js";

const { Store } = NVCore;

function instancia() { return (typeof window !== "undefined" && window.__NV_INSTANCE) || null; }
function estado() { const i = instancia(); return i && i.state ? i.state : null; }

function statusEl() {
  return [...document.querySelectorAll("span")].find((s) => /sin guardar|guardado|publicado/i.test((s.textContent || "").trim()));
}
function marcar(txt, color) {
  const s = statusEl();
  if (s) { s.textContent = txt; s.style.color = color || "#00D4A0"; }
}

function construirLayout(st) {
  return {
    accent: st.accent,
    bgStart: st.bgStart,
    bgEnd: st.bgEnd,
    showStats: !!st.showStats,
    showFloating: !!st.showFloating,
    showEyebrow: !!st.showEyebrow,
    componentes: st.content || {},
  };
}

async function guardar(publicar) {
  const st = estado();
  if (!st) return;
  reproducir("click");
  const NVUI = window.NVUI;
  if (NVUI) NVUI.spinner(true, publicar ? "Publicando en la base de datos…" : "Guardando en la base de datos…");
  try {
    const layout = construirLayout(st);
    if (publicar) { layout.publicado = true; layout.publicadoEn = new Date().toISOString(); }
    const r = await editorService.guardarLayout(st.page || "Home", layout);
    // El acento y el fondo del editor se reflejan en el tema del storefront.
    await editorService.guardarTema({ neon_purple: st.accent, bg_space_dark: st.bgStart, bg_space_core: st.bgEnd });
    if (NVUI) NVUI.spinner(false);
    reproducir("success");
    marcar(publicar ? "Publicado ✓" : "Guardado ✓");
    if (window.NV && window.NV.toast) window.NV.toast(publicar ? "Publicado en la base de datos" : "Guardado en la base de datos", "rgba(0,212,160,0.55)");
    if (!r.persistido && NVUI) await NVUI.modal({ tipo: "ok", titulo: publicar ? "Publicado (local)" : "Guardado (local)", mensaje: "Sin conexión al backend se guardó en memoria. Conéctate para persistir en PostgreSQL." });
  } catch (e) {
    if (NVUI) NVUI.spinner(false);
    reproducir("error");
    if (NVUI) NVUI.error("No se pudo guardar", (e && e.message) || "Revisa la conexión o los permisos de escritura de PostgreSQL.");
  }
}

async function cargarInicial() {
  const i = instancia();
  if (!i || !i.state || !i.setState) return;
  try {
    const lay = await editorService.cargarLayout(i.state.page || "Home");
    if (!lay) return;
    i.setState({
      accent: lay.accent || i.state.accent,
      bgStart: lay.bgStart || i.state.bgStart,
      bgEnd: lay.bgEnd || i.state.bgEnd,
      showStats: lay.showStats !== false,
      showFloating: lay.showFloating !== false,
      showEyebrow: lay.showEyebrow !== false,
      content: lay.componentes || i.state.content,
    });
    marcar("Cargado desde BD", "rgba(0,207,255,0.8)");
  } catch (_) { /* conserva el estado por defecto */ }
}

/* ─────────────  IDENTIDAD: subida de logo → BD (rule 4)  ───────────── */
function logoActualUrl() {
  const tema = Store.get("tema") || {};
  return tema.logo_url_img || "";
}
function montarLogoPanel() {
  if (document.getElementById("nv-logo-panel")) { pintarLogoPanel(); return; }
  const card = document.createElement("div");
  card.id = "nv-logo-panel";
  card.setAttribute("data-nv-ux", "1");
  card.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:99997;width:280px;background:rgba(8,10,22,0.97);border:1px solid rgba(0,207,255,0.28);border-radius:14px;padding:14px;box-shadow:0 18px 46px rgba(0,0,30,0.55);font-family:'Lexend',system-ui,sans-serif;color:#e6ecff;backdrop-filter:blur(12px);";
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:18px;">🖼️</span>
      <b style="font-size:13.5px;font-family:'Orbitron',sans-serif;">Logo de la marca</b>
    </div>
    <div id="nv-logo-prev" style="height:56px;border-radius:9px;border:1px dashed rgba(120,140,220,0.3);display:flex;align-items:center;justify-content:center;margin-bottom:10px;background:rgba(255,255,255,0.02);overflow:hidden;"></div>
    <label style="display:block;text-align:center;padding:9px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;color:#02040c;background:linear-gradient(135deg,#00d2ff,#00ffcc);">
      Subir logo (ImgBB)
      <input id="nv-logo-file" type="file" accept="image/*" hidden>
    </label>
    <input id="nv-logo-url" type="text" placeholder="…o pega una URL de imagen" style="width:100%;margin-top:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(120,140,220,0.24);border-radius:8px;padding:8px 10px;color:#eaf3ff;font-size:12px;">
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button id="nv-logo-save" style="flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(135deg,#5510BB,#9B3FFF);">Guardar en BD</button>
      <button id="nv-logo-clear" style="padding:8px 10px;border-radius:8px;cursor:pointer;font-size:12px;color:#cfe6ff;background:rgba(255,255,255,0.05);border:1px solid rgba(120,140,220,0.28);">Quitar</button>
    </div>
    <div id="nv-logo-msg" style="font-size:11px;color:rgba(200,215,255,0.55);margin-top:8px;min-height:14px;"></div>`;
  document.body.appendChild(card);

  const msg = (t, c) => { const m = card.querySelector("#nv-logo-msg"); if (m) { m.textContent = t; m.style.color = c || "rgba(200,215,255,0.55)"; } };
  const guardar = async (url) => {
    if (!url) return;
    try {
      await editorService.guardarTema({ logo_url_img: url }); // → configuracion_sistema/tema_interfaz
      reproducir("success");
      msg(editorService.online() ? "Logo guardado en la base de datos ✓" : "Guardado local (conéctate para persistir)", "#00D4A0");
      if (window.NV && window.NV.toast) window.NV.toast("Logo actualizado", "rgba(0,212,160,0.55)");
      pintarLogoPanel();
    } catch (e) { reproducir("error"); msg("Error: " + ((e && e.message) || e), "#ff8ba0"); }
  };
  card.querySelector("#nv-logo-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!servicioImagenes.configurado) { msg("Configura tu API key de ImgBB en NV_CONFIG.imgbb.apiKey", "#ffb020"); return; }
    msg("Subiendo a ImgBB…", "#7fe0ff");
    try { const r = await servicioImagenes.subir(f, { nombre: "logo-nv" }); card.querySelector("#nv-logo-url").value = r.url; await guardar(r.url); }
    catch (err) { reproducir("error"); msg("Error al subir: " + ((err && err.message) || err), "#ff8ba0"); }
  });
  card.querySelector("#nv-logo-save").addEventListener("click", () => guardar(card.querySelector("#nv-logo-url").value.trim()));
  card.querySelector("#nv-logo-clear").addEventListener("click", () => guardar(""));
  pintarLogoPanel();
}
function pintarLogoPanel() {
  const prev = document.getElementById("nv-logo-prev");
  const url = logoActualUrl();
  if (prev) prev.innerHTML = url
    ? `<img src="${url}" alt="logo" style="max-height:100%;max-width:100%;object-fit:contain;">`
    : `<span style="font-size:11px;color:rgba(200,215,255,0.4);">Sin logo propio (usando el de la marca)</span>`;
  const inp = document.getElementById("nv-logo-url");
  if (inp && !inp.value) inp.value = url;
}

export function instalarEditorPersist() {
  const page = (typeof window !== "undefined" && window.__NV_PAGE) || (document.body && document.body.getAttribute("data-nv-page"));
  if (page !== "editor") return;
  montarLogoPanel();
  Store.subscribe && Store.subscribe("tema", () => pintarLogoPanel());

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const t = (b.textContent || "").trim().toLowerCase();
    if (/^guardar(\s|$)|guardar borrador/.test(t)) { ev.preventDefault(); guardar(false); }
    else if (/^publicar(\s|$)/.test(t)) { ev.preventDefault(); guardar(true); }
  }, true);

  // Carga el layout guardado cuando el editor ya montó su instancia.
  const intentar = (n) => { if (instancia()) cargarInicial(); else if (n > 0) setTimeout(() => intentar(n - 1), 250); };
  intentar(8);

  // Expone el servicio para la consola / otros módulos.
  window.NV = Object.assign(window.NV || {}, { editor: editorService });
}

export default { instalarEditorPersist };
