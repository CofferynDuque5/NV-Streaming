/**
 * admin-inventory.js — Gestión del INVENTARIO de streaming (Back Office).
 *
 * Cierra el hueco de la Etapa 2: el admin ya puede cargar STOCK (cuentas de
 * streaming) y PLANES sin tocar la base de datos a mano. Consume los endpoints
 * /api/admin/cuentas y /api/admin/planes (solo admin). El aprovisionamiento de
 * compras asigna precisamente estas cuentas.
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";

const { Bus } = NVCore;
let _obs = null;
const st = { cuentas: [], planes: [], resumen: [], cola: [], cargando: false };

const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const money = (v) => "$" + (Number(v) || 0).toFixed(2);
const toast = (m, c) => { if (window.NV && window.NV.toast) window.NV.toast(m, c); };
const OK = "rgba(0,212,160,0.5)", BAD = "rgba(255,68,102,0.5)";

async function cargar() {
  st.cargando = true;
  try {
    const [cuentas, planes, resumen, cola] = await Promise.all([
      NVApi.cuentas(), NVApi.planes(), NVApi.stockResumen(), NVApi.colaEspera(),
    ]);
    st.cuentas = cuentas; st.planes = planes; st.resumen = resumen; st.cola = cola;
  } catch (e) {
    // Sin sesión admin, los endpoints devuelven 401/403.
    st.cuentas = []; st.planes = []; st.resumen = []; st.cola = [];
  }
  st.cargando = false;
  const p = document.getElementById("nv-inventario"); if (p) render(p);
}

/* ── Estilos (una vez) ── */
function css() {
  if (document.getElementById("nv-inv-css")) return;
  const s = document.createElement("style"); s.id = "nv-inv-css";
  s.textContent = `
    #nv-inventario{background:#0b0b18;border:1px solid rgba(0,207,255,.14);border-radius:16px;padding:22px;margin:18px 0;color:#EEF2FF;font-family:'DM Sans',sans-serif;}
    #nv-inventario h2{font-family:'Syne',sans-serif;font-size:19px;margin:0;}
    #nv-inventario h3{font-family:'Syne',sans-serif;font-size:14px;margin:0 0 10px;color:#00CFFF;}
    #nv-inventario p.sub{color:rgba(200,215,255,.55);font-size:13px;margin:2px 0 0;}
    .nv-inv-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;}
    @media(max-width:900px){.nv-inv-grid{grid-template-columns:1fr;}}
    .nv-inv-card{background:rgba(255,255,255,.03);border:1px solid rgba(80,100,200,.16);border-radius:12px;padding:16px;}
    .nv-inv-form{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
    .nv-inv-form input{flex:1;min-width:90px;background:rgba(255,255,255,.05);border:1px solid rgba(0,207,255,.25);border-radius:8px;padding:9px 11px;color:#EEF2FF;font-size:13px;font-family:inherit;outline:none;}
    .nv-inv-form button{padding:9px 14px;background:linear-gradient(135deg,#0A3AAE,#1A8FFF);color:#fff;border:none;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;}
    .nv-inv-list{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto;}
    .nv-inv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;background:rgba(255,255,255,.03);border:1px solid rgba(80,100,200,.12);border-radius:8px;font-size:12.5px;}
    .nv-inv-badge{padding:2px 8px;border-radius:100px;font-size:11px;font-family:'JetBrains Mono',monospace;}
    .e-disponible{background:rgba(0,212,160,.12);color:#00D4A0;}
    .e-asignada{background:rgba(0,207,255,.12);color:#00CFFF;}
    .e-caida,.e-renovacion{background:rgba(255,176,32,.12);color:#FFB020;}
    .nv-inv-del{background:transparent;border:1px solid rgba(255,68,102,.4);color:#FF4466;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;}
    .nv-inv-stock{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
    .nv-inv-chip{padding:5px 10px;background:rgba(0,207,255,.06);border:1px solid rgba(0,207,255,.18);border-radius:8px;font-size:12px;font-family:'JetBrains Mono',monospace;}
    .nv-inv-vacio{color:rgba(200,215,255,.4);font-size:12.5px;padding:10px;text-align:center;}`;
  document.head.appendChild(s);
}

function filaCuenta(c) {
  return `<div class="nv-inv-row"><span><b>${esc(c.plataforma_id)}</b> · ${esc(c.correo)} · ${esc(c.perfil)}</span>
    <span style="display:flex;gap:8px;align-items:center;"><span class="nv-inv-badge e-${esc(String(c.estado).toLowerCase())}">${esc(c.estado)}</span>
    <button class="nv-inv-del" data-tipo="cuenta" data-id="${esc(c.id)}">Borrar</button></span></div>`;
}
function filaPlan(p) {
  return `<div class="nv-inv-row"><span><b>${esc(p.plataforma_id)}</b> · ${esc(p.nombre)} · ${money(p.precio)} · ${esc(p.duracion_dias)}d ${p.activo ? "" : "(inactivo)"}</span>
    <button class="nv-inv-del" data-tipo="plan" data-id="${esc(p.id)}">Borrar</button></div>`;
}

function render(panel) {
  const stock = st.resumen.filter((r) => r.estado === "disponible");
  const chips = stock.length ? stock.map((r) => `<span class="nv-inv-chip">${esc(r.plataforma_id)}: ${r.n} libre(s)</span>`).join("") : `<span class="nv-inv-vacio">Sin stock disponible</span>`;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="font-size:22px;">📦</span>
      <div><h2>Inventario de Streaming</h2><p class="sub">Carga cuentas (stock) y planes. El aprovisionamiento de compras asigna estas cuentas.</p></div>
    </div>
    <div class="nv-inv-stock">${chips}${st.cola.length ? `<span class="nv-inv-chip" style="border-color:rgba(255,176,32,.3);color:#FFB020;">⏳ ${st.cola.length} en cola de espera</span>` : ""}</div>
    <div class="nv-inv-grid">
      <div class="nv-inv-card">
        <h3>Cuentas (stock)</h3>
        <form class="nv-inv-form" data-form="cuenta">
          <input name="plataforma_id" placeholder="plataforma (ej: netflix)" required />
          <input name="correo" placeholder="correo de la cuenta" required />
          <input name="contrasena" placeholder="contraseña" required />
          <input name="perfil" placeholder="perfil (ej: P1)" />
          <input name="pin" placeholder="PIN (opc)" />
          <button type="submit">+ Añadir cuenta</button>
        </form>
        <div class="nv-inv-list">${st.cuentas.length ? st.cuentas.map(filaCuenta).join("") : `<div class="nv-inv-vacio">No hay cuentas. Añade stock arriba.</div>`}</div>
      </div>
      <div class="nv-inv-card">
        <h3>Planes</h3>
        <form class="nv-inv-form" data-form="plan">
          <input name="plataforma_id" placeholder="plataforma (ej: netflix)" required />
          <input name="nombre" placeholder="nombre del plan" required />
          <input name="precio" type="number" step="0.01" placeholder="precio USD" required />
          <input name="duracion_dias" type="number" placeholder="días (ej: 30)" required />
          <button type="submit">+ Añadir plan</button>
        </form>
        <div class="nv-inv-list">${st.planes.length ? st.planes.map(filaPlan).join("") : `<div class="nv-inv-vacio">No hay planes. Añade uno arriba.</div>`}</div>
      </div>
    </div>`;
}

async function onSubmit(ev) {
  const form = ev.target.closest("form[data-form]"); if (!form) return;
  ev.preventDefault();
  const tipo = form.getAttribute("data-form");
  const data = {}; new FormData(form).forEach((v, k) => { if (String(v).trim()) data[k] = String(v).trim(); });
  const btn = form.querySelector("button[type=submit]"); if (btn) { btn.disabled = true; btn.style.opacity = ".5"; }
  try {
    if (tipo === "cuenta") { await NVApi.crearCuenta(data); toast("Cuenta añadida al stock ✓", OK); }
    else { data.precio = Number(data.precio); data.duracion_dias = Number(data.duracion_dias); await NVApi.crearPlan(data); toast("Plan creado ✓", OK); }
    form.reset();
    await cargar();
  } catch (e) {
    toast("No se pudo: " + ((e && (e.data && (e.data.mensaje || e.data.error)) || e.message) || "error"), BAD);
    if (btn) { btn.disabled = false; btn.style.opacity = "1"; }
  }
}
async function onClick(ev) {
  const del = ev.target.closest(".nv-inv-del"); if (!del) return;
  ev.preventDefault();
  const tipo = del.getAttribute("data-tipo"), id = del.getAttribute("data-id");
  try {
    if (tipo === "cuenta") await NVApi.borrarCuenta(id); else await NVApi.borrarPlan(id);
    toast("Eliminado ✓", OK); await cargar();
  } catch (e) {
    // 409 (en uso) trae un mensaje claro del backend.
    toast((e && e.data && e.data.mensaje) || "No se pudo eliminar (¿en uso?)", BAD);
  }
}

function objetivo() {
  const tbl = document.getElementById("nv-tablas");
  if (tbl && tbl.parentElement) return { parent: tbl.parentElement, after: tbl };
  const crud = document.getElementById("nv-crud");
  if (crud && crud.parentElement) return { parent: crud.parentElement, after: crud };
  const root = document.querySelector("[data-nv-root]");
  return { parent: root || document.body, after: null };
}
function montar() {
  if (document.getElementById("nv-inventario")) return;
  css();
  const panel = document.createElement("section"); panel.id = "nv-inventario"; panel.setAttribute("data-nv-ux", "1");
  const { parent, after } = objetivo(); if (!parent) return;
  if (after && after.nextSibling) parent.insertBefore(panel, after.nextSibling); else parent.appendChild(panel);
  panel.addEventListener("submit", onSubmit);
  panel.addEventListener("click", onClick);
  render(panel);
  cargar();
}

export function instalarInventario() {
  const esAdmin = (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "admin";
  if (!esAdmin) return;
  montar();
  // Recargar el inventario cuando la sesión cambia (para que use el token admin).
  Bus.on && Bus.on("user:login", cargar);
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window && !_obs) {
    let pend = 0;
    _obs = new MutationObserver(() => { if (pend || document.getElementById("nv-inventario")) return; pend = requestAnimationFrame(() => { pend = 0; montar(); }); });
    _obs.observe(root, { childList: true, subtree: true });
  }
}

export default { instalarInventario };
