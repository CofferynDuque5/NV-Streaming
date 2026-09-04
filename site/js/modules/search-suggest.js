/**
 * search-suggest.js — Autocompletado en vivo para las cajas de búsqueda.
 *
 * El filtro del catálogo ya funciona (índice en memoria + bridge), pero al
 * teclear no había respuesta visible junto a la caja: parecía "que no sirve".
 * Este módulo muestra, bajo cualquier input "Buscar…", una lista de servicios
 * que coinciden (nombre · categoría · precio), con teclado y clic. Reutiliza el
 * índice real (Catalogo.buscar), sin datos inventados: si no hay coincidencias,
 * lo dice; y "Ver todos" abre el catálogo filtrado.
 */
import NVCore from "../core.js";
import { Catalogo } from "../services/data.service.js";

const MAX = 6;
const money = (s) => { try { return "$" + Number(Catalogo.precioFinalUSD(s) || 0).toFixed(2); } catch (_) { return ""; } };
const inicial = (n) => (String(n || "?").trim()[0] || "?").toUpperCase();
const catColor = (c) => ({ STREAMING: "#9B3FFF", IA: "#00CFFF", SOFTWARE: "#00D4A0", CLOUD: "#FFB020", MUSICA: "#1DB954" }[String(c || "").toUpperCase()] || "#5B7CFF");

let box = null;        // el dropdown (uno solo, reutilizado)
let inputActivo = null;
let idx = -1;          // fila resaltada (teclado)
let filas = [];        // servicios de la sugerencia actual

function crearBox() {
  if (box) return box;
  box = document.createElement("div");
  box.id = "nv-search-suggest";
  box.setAttribute("data-nv-ux", "1");
  box.style.cssText = "position:fixed;z-index:100000;display:none;background:#0a0b1e;border:1px solid rgba(0,207,255,0.22);border-radius:12px;box-shadow:0 24px 60px rgba(0,0,25,0.6);overflow:hidden;font-family:'DM Sans',system-ui,sans-serif;";
  document.body.appendChild(box);
  // Mantener abierto al hacer clic dentro (el clic se procesa antes del blur).
  box.addEventListener("mousedown", (e) => e.preventDefault());
  return box;
}

function ocultar() { if (box) box.style.display = "none"; inputActivo = null; idx = -1; filas = []; }

function posicionar(inp) {
  const r = inp.getBoundingClientRect();
  box.style.left = r.left + "px";
  box.style.top = (r.bottom + 6) + "px";
  box.style.width = Math.max(260, r.width) + "px";
}

function irA(q) { if (q) location.href = "catalogo.html?q=" + encodeURIComponent(q); }

function pintar(inp, q) {
  crearBox();
  const activos = filas;
  const rows = activos.map((s, i) => {
    const nombre = s.nombre_display || s.id_servicio || "Servicio";
    const cat = s.categoria || "";
    const col = catColor(cat);
    return `<div class="nv-sg-row" data-i="${i}" style="display:flex;align-items:center;gap:11px;padding:10px 13px;cursor:pointer;border-bottom:1px solid rgba(80,100,200,0.08);${i === idx ? "background:rgba(0,207,255,0.10);" : ""}">
      <div style="width:30px;height:30px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:12px;color:#fff;background:linear-gradient(135deg,${col},#0a0a22);">${inicial(nombre)}</div>
      <div style="min-width:0;flex:1;"><div style="font-size:13px;color:#EEF2FF;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nombre}</div>
      <div style="font-size:11px;color:rgba(200,215,255,0.45);">${cat}</div></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#00CFFF;flex-shrink:0;">${money(s)}</div>
    </div>`;
  }).join("");
  const footer = activos.length
    ? `<div class="nv-sg-all" style="padding:9px 13px;font-size:12px;color:#00CFFF;cursor:pointer;background:rgba(0,207,255,0.05);">Ver todos los resultados de “${q}” →</div>`
    : `<div style="padding:14px 13px;font-size:12.5px;color:rgba(200,215,255,0.5);">Sin resultados para “${q}”. Prueba con otro nombre.</div>`;
  box.innerHTML = rows + footer;
  posicionar(inp);
  box.style.display = "block";
  // Clic en filas / "ver todos".
  box.querySelectorAll(".nv-sg-row").forEach((el) => el.addEventListener("click", () => {
    const s = activos[Number(el.getAttribute("data-i"))];
    if (s) irA(s.nombre_display || s.id_servicio);
  }));
  const all = box.querySelector(".nv-sg-all");
  if (all) all.addEventListener("click", () => irA(q));
}

let timer = 0;
function alTeclear(inp) {
  const q = (inp.value || "").trim();
  clearTimeout(timer);
  if (q.length < 2) { ocultar(); return; }
  timer = setTimeout(() => {
    inputActivo = inp;
    let res = [];
    try { res = (Catalogo.buscar(q) || []).filter((s) => s && s.activo !== false); } catch (_) { res = []; }
    // Sin duplicados por nombre (el catálogo puede traer el mismo servicio repetido).
    const vistos = new Set();
    res = res.filter((s) => { const k = String(s.nombre_display || s.id_servicio || "").toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
    filas = res.slice(0, MAX);
    idx = -1;
    pintar(inp, q);
  }, 110);
}

function alTecla(inp, e) {
  if (!box || box.style.display === "none") return;
  if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, filas.length - 1); pintar(inp, (inp.value || "").trim()); }
  else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, -1); pintar(inp, (inp.value || "").trim()); }
  else if (e.key === "Enter" && idx >= 0 && filas[idx]) { e.preventDefault(); e.stopPropagation(); irA(filas[idx].nombre_display || filas[idx].id_servicio); }
  else if (e.key === "Escape") { ocultar(); }
}

function enganchar(inp) {
  if (inp.__nvSuggest) return;
  inp.__nvSuggest = true;
  inp.setAttribute("autocomplete", "off");
  inp.addEventListener("input", () => alTeclear(inp));
  inp.addEventListener("focus", () => { if ((inp.value || "").trim().length >= 2) alTeclear(inp); });
  inp.addEventListener("keydown", (e) => alTecla(inp, e), true); // captura: antes del Enter de wireBuscador
  inp.addEventListener("blur", () => setTimeout(() => { if (inputActivo === inp) ocultar(); }, 160));
}

function escanear() {
  document.querySelectorAll('input[placeholder*="Buscar"],input[placeholder*="buscar"]').forEach(enganchar);
}

export function instalarSearchSuggest() {
  if (typeof document === "undefined" || window.__NV_SUGGEST) return;
  window.__NV_SUGGEST = true;
  escanear();
  // Reescanear tras cada render (el runtime repinta cajas), y reposicionar.
  if (NVCore.Bus && NVCore.Bus.on) { NVCore.Bus.on("app:ready", escanear); NVCore.Bus.on("catalogo:real", escanear); }
  document.addEventListener("focusin", escanear, true);
  window.addEventListener("scroll", () => { if (inputActivo) posicionar(inputActivo); }, true);
  window.addEventListener("resize", () => { if (inputActivo) posicionar(inputActivo); });
  document.addEventListener("click", (e) => { if (box && !box.contains(e.target) && e.target !== inputActivo) ocultar(); }, true);
}

export default { instalarSearchSuggest };
