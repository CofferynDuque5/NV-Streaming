/**
 * admin-tables.js — Tablas de datos estilo Excel (datos 100% reales).
 *
 * Renderiza, en el panel de administración, las colecciones operativas como
 * tablas limpias tipo hoja de cálculo (bordes definidos, cabecera fija, scroll
 * horizontal, filas cebra). Itera SOLO sobre los datos reales del Store (que
 * vienen de PostgreSQL por onSnapshot); si no hay datos, muestra estado vacío.
 * Sin placeholders ni mock data.
 */
import NVCore from "../core.js";

const { Store, Utils } = NVCore;
let _obs = null;
const estado = { tabla: "pedidos" };

const fecha = (v) => { try { return Utils.fecha(v) || "—"; } catch (_) { return "—"; } };
const money = (v) => "$" + (Number(v) || 0).toFixed(2);
const flag = (v) => (v ? "Sí" : "No");

/* Definición de columnas por colección (clave del Store + columnas reales). */
const TABLAS = {
  pedidos: {
    titulo: "Ventas / Pedidos", storeKey: "pedidos",
    cols: [
      { h: "ID", g: (d) => d.id || "—" },
      { h: "Cliente", g: (d) => d.nombre_cliente || d.email_cliente || "—" },
      { h: "Servicio", g: (d) => d.id_servicio || d.nombre_item || "—" },
      { h: "Monto", g: (d) => money(d.precio), num: true },
      { h: "Estado", g: (d) => d.estado || "—", badge: true },
      { h: "Método", g: (d) => d.metodo_pago || "—" },
      { h: "Fecha", g: (d) => fecha(d.creadoEn) },
    ],
  },
  usuarios: {
    titulo: "Usuarios", storeKey: "usuarios",
    cols: [
      { h: "Nombre", g: (d) => d.nombre || "—" },
      { h: "Email", g: (d) => d.email || "—" },
      { h: "Rol", g: (d) => d.rol || "cliente", badge: true },
      { h: "Saldo", g: (d) => money(d.saldoBilletera), num: true },
      { h: "Teléfono", g: (d) => d.telefono || "—" },
      { h: "Activo", g: (d) => flag(d.activo) },
      { h: "Baneado", g: (d) => flag(d.baneado) },
    ],
  },
  suscripciones: {
    titulo: "Suscripciones", storeKey: "suscripciones",
    cols: [
      { h: "Cliente", g: (d) => d.nombre || "—" },
      { h: "Servicio", g: (d) => d.servicio || "—" },
      { h: "Correo cuenta", g: (d) => d.cuentaCorreo || d.correo || "—" },
      { h: "Perfil", g: (d) => d.perfil || "—" },
      { h: "Estado", g: (d) => d.estado || "—", badge: true },
      { h: "Precio", g: (d) => money(d.precioVenta), num: true },
      { h: "Vence", g: (d) => fecha(d.vence) },
    ],
  },
  inventario: {
    titulo: "Inventario", storeKey: "inventario",
    cols: [
      { h: "Servicio", g: (d) => d.id_servicio || "—" },
      { h: "Estado", g: (d) => d.estado || "—", badge: true },
      { h: "Usuario cuenta", g: (d) => (d.credenciales && d.credenciales.usuario) || "—" },
      { h: "Perfil", g: (d) => (d.credenciales && d.credenciales.perfil) || "—" },
      { h: "PIN", g: (d) => (d.credenciales && d.credenciales.pin) || "—" },
    ],
  },
  recargasBilletera: {
    titulo: "Recargas de billetera", storeKey: "recargasBilletera",
    cols: [
      { h: "Email", g: (d) => d.email || "—" },
      { h: "Monto", g: (d) => money(d.monto), num: true },
      { h: "Estado", g: (d) => d.estado || "—", badge: true },
      { h: "Método", g: (d) => d.metodo_pago || "—" },
      { h: "Aprobado por", g: (d) => d.aprobadoPor || "—" },
      { h: "Fecha", g: (d) => fecha(d.creadoEn) },
    ],
  },
};
const ORDEN = ["pedidos", "usuarios", "suscripciones", "inventario", "recargasBilletera"];
const esc = (s) => String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
function el(t, c, h) { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }

function render(panel) {
  const def = TABLAS[estado.tabla];
  const rows = Store.get(def.storeKey) || [];
  panel.querySelectorAll(".nv-tbl-tab").forEach((t) => t.classList.toggle("activa", t.getAttribute("data-t") === estado.tabla));
  const host = panel.querySelector(".nv-tbl-host");
  const cab = `${def.titulo} · ${rows.length} registro(s) reales`;
  panel.querySelector(".nv-tbl-cab").textContent = cab;
  if (!rows.length) {
    host.innerHTML = `<div class="nv-tbl-vacio">No hay registros en <b>${esc(def.storeKey)}</b>. Cuando existan en PostgreSQL, aparecerán aquí automáticamente.</div>`;
    return;
  }
  const thead = `<tr>${def.cols.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.h)}</th>`).join("")}</tr>`;
  const tbody = rows.map((d, i) => `<tr class="${i % 2 ? "impar" : ""}">${def.cols.map((c) => {
    const v = c.g(d);
    if (c.badge) return `<td><span class="nv-tbl-badge e-${esc(String(v).toLowerCase())}">${esc(v)}</span></td>`;
    return `<td class="${c.num ? "num" : ""}">${esc(v)}</td>`;
  }).join("")}</tr>`).join("");
  host.innerHTML = `<div class="nv-tbl-scroll"><table class="nv-tbl"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

function construir() {
  const panel = el("section", "nv-tbl-panel"); panel.id = "nv-tablas"; panel.setAttribute("data-nv-ux", "1");
  panel.innerHTML = `
    <div class="nv-tbl-top">
      <div class="nv-tbl-titulo"><span class="nv-tbl-ico">📊</span>
        <div><h2>Tablas de Datos</h2><p>Vista tipo hoja de cálculo de tus colecciones reales de PostgreSQL.</p></div>
      </div>
      <div class="nv-tbl-tabs">${ORDEN.map((t) => `<button class="nv-tbl-tab ${t === estado.tabla ? "activa" : ""}" data-t="${t}">${TABLAS[t].titulo}</button>`).join("")}</div>
    </div>
    <div class="nv-tbl-cab"></div>
    <div class="nv-tbl-host"></div>`;
  panel.querySelectorAll(".nv-tbl-tab").forEach((b) => b.addEventListener("click", () => { estado.tabla = b.getAttribute("data-t"); render(panel); }));
  render(panel);
  return panel;
}

function objetivo() {
  const crud = document.getElementById("nv-crud");
  if (crud && crud.parentElement) return { parent: crud.parentElement, after: crud };
  const insp = document.getElementById("nv-inspector");
  if (insp && insp.parentElement) return { parent: insp.parentElement, after: insp };
  const root = document.querySelector("[data-nv-root]");
  const aside = root && root.querySelector("aside");
  const col = aside && aside.nextElementSibling;
  return { parent: col || root || document.body, after: null };
}
function montar() {
  if (document.getElementById("nv-tablas")) { render(document.getElementById("nv-tablas")); return; }
  const { parent, after } = objetivo();
  if (!parent) return;
  const panel = construir();
  if (after && after.nextSibling) parent.insertBefore(panel, after.nextSibling);
  else parent.appendChild(panel);
}

export function instalarTablas() {
  const esAdmin = (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "admin";
  if (!esAdmin) return;
  montar();
  for (const t of ORDEN) { Store.subscribe && Store.subscribe(TABLAS[t].storeKey, () => { const p = document.getElementById("nv-tablas"); if (p && estado.tabla === t) render(p); }); }
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window && !_obs) {
    let pend = 0;
    _obs = new MutationObserver(() => { if (pend || document.getElementById("nv-tablas")) return; pend = requestAnimationFrame(() => { pend = 0; montar(); }); });
    _obs.observe(root, { childList: true, subtree: true });
  }
}

export default { instalarTablas };
