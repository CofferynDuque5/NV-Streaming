/**
 * admin-crud.js — Gestor de contenido real (CRUD) para el panel de administración.
 *
 * Permite CREAR, EDITAR y BORRAR los componentes del storefront directamente en
 * PostgreSQL (vía EditorService), para reemplazar los datos de demostración por
 * los reales del negocio: servicios, métodos de pago, cartelera, ofertas y combos.
 * Las imágenes se suben a ImgBB. Los cambios se reflejan solos por onSnapshot.
 *
 * Estado inicial limpio, sin skeletons. Integrado con sonidos, modales y toasts.
 */
import NVCore from "../core.js";
import { editorService } from "../services/editor.service.js";
import { reproducir } from "./sound.js";

const { Store } = NVCore;
let _obs = null;

/* ───────────────────────────  ESQUEMAS  ─────────────────────────── */
const CATS = ["STREAMING", "MUSICA", "IA", "SOFTWARE", "CLOUD", "JUEGOS"];
const ESQUEMAS = {
  servicios_sistema: {
    titulo: "Servicios", storeKey: "servicios", icono: "🎬",
    resumen: (d) => `${d.nombre_display || d.id} · $${d.precio ?? "?"}`,
    campos: [
      { k: "id_servicio", label: "ID (slug, ej. netflix)", tipo: "text", req: true },
      { k: "nombre_display", label: "Nombre", tipo: "text", req: true },
      { k: "categoria", label: "Categoría", tipo: "select", opciones: CATS },
      { k: "descripcion", label: "Descripción", tipo: "text" },
      { k: "precio", label: "Precio USD", tipo: "number" },
      { k: "precio_rev", label: "Precio revendedor USD", tipo: "number" },
      { k: "stock", label: "Stock", tipo: "number" },
      { k: "tipo_entrega", label: "Tipo de entrega", tipo: "text" },
      { k: "tags", label: "Tags (separa con comas)", tipo: "tags" },
      { k: "tarjeta_url", label: "Imagen de tarjeta", tipo: "imagen" },
      { k: "logo_url", label: "Logo", tipo: "imagen" },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
      { k: "destacado", label: "Destacado (Top)", tipo: "bool" },
      { k: "nuevo", label: "Nuevo", tipo: "bool" },
    ],
  },
  metodos_pago_config: {
    titulo: "Métodos de pago", storeKey: "metodosPago", icono: "💳",
    resumen: (d) => `${d.tipo_banco || d.id_pago} · ${d.titular || ""}`,
    campos: [
      { k: "id_pago", label: "ID (ej. pago_movil_bdv)", tipo: "text", req: true },
      { k: "tipo_banco", label: "Nombre / Banco", tipo: "text", req: true },
      { k: "titular", label: "Titular", tipo: "text" },
      { k: "documento_identidad", label: "Cédula / RIF", tipo: "text" },
      { k: "telefono_pago", label: "Teléfono", tipo: "text" },
      { k: "correo_zelle", label: "Correo Zelle", tipo: "text" },
      { k: "correo_paypal", label: "Correo PayPal", tipo: "text" },
      { k: "correo_binance", label: "Binance", tipo: "text" },
      { k: "instrucciones", label: "Instrucciones", tipo: "text" },
      { k: "orden", label: "Orden", tipo: "number" },
      { k: "estado_activo", label: "Activo", tipo: "bool", def: true },
    ],
  },
  carteleras_estrenos: {
    titulo: "Cartelera / Estrenos", storeKey: "carteleras", icono: "🎞️",
    resumen: (d) => `${d.titulo_banner || d.id_estreno} · ${d.plataforma || ""}`,
    campos: [
      { k: "id_estreno", label: "ID (ej. estreno_netflix_001)", tipo: "text", req: true },
      { k: "titulo_banner", label: "Título", tipo: "text", req: true },
      { k: "plataforma", label: "Plataforma", tipo: "text" },
      { k: "llamado_accion", label: "Texto del botón (CTA)", tipo: "text" },
      { k: "imagen_background", label: "Imagen de fondo", tipo: "imagen" },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
    ],
  },
  ofertas: {
    titulo: "Ofertas", storeKey: "ofertas", icono: "🔥",
    resumen: (d) => `${d.nombre} · -${d.descuento_pct || 0}%`,
    campos: [
      { k: "id_servicio", label: "ID del servicio", tipo: "text", req: true },
      { k: "nombre", label: "Nombre", tipo: "text", req: true },
      { k: "etiqueta", label: "Etiqueta", tipo: "text", def: "OFERTA" },
      { k: "descuento_pct", label: "Descuento %", tipo: "number" },
      { k: "precio_normal", label: "Precio normal USD", tipo: "number" },
      { k: "precio_oferta", label: "Precio oferta USD", tipo: "number" },
      { k: "logo_url", label: "Imagen", tipo: "imagen" },
      { k: "orden", label: "Orden", tipo: "number" },
      { k: "activo", label: "Activa", tipo: "bool", def: true },
    ],
  },
  combos_suscripciones: {
    titulo: "Combos", storeKey: "combos", icono: "📦",
    resumen: (d) => `${d.nombre_combo} · $${d.precio_publico_combo ?? "?"}`,
    campos: [
      { k: "nombre_combo", label: "Nombre del combo", tipo: "text", req: true },
      { k: "descripcion", label: "Descripción", tipo: "text" },
      { k: "precio_publico_combo", label: "Precio público USD", tipo: "number" },
      { k: "precio_revendedor_combo", label: "Precio revendedor USD", tipo: "number" },
      { k: "servicios_included", label: "Servicios incluidos (comas)", tipo: "tags" },
      { k: "banner_url", label: "Banner", tipo: "imagen" },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
    ],
  },
};
const ORDEN = ["servicios_sistema", "metodos_pago_config", "carteleras_estrenos", "ofertas", "combos_suscripciones"];

const estado = { coll: "servicios_sistema" };

/* ───────────────────────────  HELPERS  ─────────────────────────── */
function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
function docs(coll) { return Store.get(ESQUEMAS[coll].storeKey) || []; }

/* ───────────────────────────  FORMULARIO  ─────────────────────────── */
function campoHTML(c, val) {
  const id = "crf_" + c.k;
  if (c.tipo === "bool") {
    return `<label class="nv-crud-check"><input type="checkbox" id="${id}" ${val ? "checked" : ""}> ${esc(c.label)}</label>`;
  }
  if (c.tipo === "select") {
    return `<div class="nv-crud-f"><span>${esc(c.label)}</span><select id="${id}">${c.opciones.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  }
  if (c.tipo === "imagen") {
    return `<div class="nv-crud-f"><span>${esc(c.label)}</span>
      <div class="nv-crud-img">
        <input type="text" id="${id}" value="${esc(val || "")}" placeholder="URL de la imagen">
        <label class="nv-crud-up">Subir<input type="file" accept="image/*" data-imgbb data-imgbb-target="#${id}" hidden></label>
      </div></div>`;
  }
  const v = c.tipo === "tags" && Array.isArray(val) ? val.join(", ") : (val != null ? val : "");
  const t = c.tipo === "number" ? "number" : "text";
  return `<div class="nv-crud-f"><span>${esc(c.label)}${c.req ? " *" : ""}</span><input type="${t}" id="${id}" value="${esc(v)}" step="any"></div>`;
}

function leerCampo(c) {
  const n = document.getElementById("crf_" + c.k);
  if (!n) return undefined;
  if (c.tipo === "bool") return n.checked;
  if (c.tipo === "number") { const x = parseFloat(n.value); return isNaN(x) ? 0 : x; }
  if (c.tipo === "tags") return n.value.split(",").map((s) => s.trim()).filter(Boolean);
  return n.value.trim();
}

function abrirForm(coll, item) {
  const esq = ESQUEMAS[coll];
  const editando = !!item;
  const ov = el("div", "nv-crud-ov"); ov.setAttribute("data-nv-ux", "1");
  ov.innerHTML = `<div class="nv-crud-modal">
    <div class="nv-crud-mhead"><b>${esq.icono} ${editando ? "Editar" : "Nuevo"} · ${esc(esq.titulo)}</b><button class="nv-crud-x" title="Cerrar">✕</button></div>
    <div class="nv-crud-body">${esq.campos.map((c) => campoHTML(c, item ? item[c.k] : c.def)).join("")}</div>
    <div class="nv-crud-foot">
      <button class="nv-crud-btn ghost" data-x>Cancelar</button>
      <button class="nv-crud-btn primary" data-save>${editando ? "Guardar cambios" : "Crear"}</button>
    </div></div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest(".nv-crud-x") || e.target.closest("[data-x]")) cerrar(); });
  ov.querySelector("[data-save]").addEventListener("click", async () => {
    const datos = {};
    for (const c of esq.campos) { const v = leerCampo(c); if (v !== undefined) datos[c.k] = v; }
    // Validación mínima de requeridos.
    const faltan = esq.campos.filter((c) => c.req && !datos[c.k]);
    if (faltan.length) { if (window.NV && window.NV.toast) window.NV.toast("Completa: " + faltan.map((c) => c.label).join(", "), "rgba(255,176,32,0.5)"); return; }
    reproducir("click");
    const btn = ov.querySelector("[data-save]"); btn.disabled = true; btn.textContent = "Guardando…";
    try {
      if (!NVCore.online) throw new Error("Backend no conectado: no se puede guardar en PostgreSQL.");
      const id = editando ? (item.id || item._id) : null;
      await editorService.guardarComponente(coll, id, datos);
      reproducir("success");
      if (window.NV && window.NV.toast) window.NV.toast(editando ? "Componente actualizado ✓" : "Componente creado ✓", "rgba(0,212,160,0.55)");
      cerrar();
    } catch (e) {
      reproducir("error");
      btn.disabled = false; btn.textContent = editando ? "Guardar cambios" : "Crear";
      if (window.NVUI) window.NVUI.error("No se pudo guardar", (e && e.message) || "Revisa conexión/permisos de PostgreSQL.");
    }
  });
}

async function borrar(coll, item) {
  const esq = ESQUEMAS[coll];
  const ok = window.NVUI ? await window.NVUI.confirmar("Borrar componente", `¿Eliminar "${esq.resumen(item)}" de ${esq.titulo}? Esta acción no se puede deshacer.`, "Sí, borrar") : true;
  if (!ok) return;
  reproducir("click");
  try {
    if (!NVCore.online) throw new Error("Backend no conectado.");
    await editorService.eliminarComponente(coll, item.id || item._id);
    reproducir("success");
    if (window.NV && window.NV.toast) window.NV.toast("Componente borrado ✓", "rgba(255,120,80,0.5)");
  } catch (e) {
    reproducir("error");
    if (window.NVUI) window.NVUI.error("No se pudo borrar", (e && e.message) || "Revisa conexión/permisos.");
  }
}

async function vaciarColeccion(coll) {
  const esq = ESQUEMAS[coll];
  const lista = docs(coll).slice();
  if (!lista.length) return;
  const ok = window.NVUI
    ? await window.NVUI.confirmar("Vaciar sección", `Se borrarán los ${lista.length} documentos de "${esq.titulo}" en tu PostgreSQL. Úsalo para eliminar la demo antes de cargar tus datos reales. ¿Continuar?`, "Sí, vaciar todo")
    : true;
  if (!ok) return;
  if (!NVCore.online) { if (window.NVUI) window.NVUI.error("Backend no conectado", "Conéctate para borrar en PostgreSQL."); return; }
  reproducir("click");
  if (window.NVUI) window.NVUI.spinner(true, `Borrando ${esq.titulo}…`);
  let n = 0;
  for (const item of lista) { try { await editorService.eliminarComponente(coll, item.id || item._id); n++; } catch (_) {} }
  if (window.NVUI) window.NVUI.spinner(false);
  reproducir("success");
  if (window.NV && window.NV.toast) window.NV.toast(`Sección vaciada: ${n} borrados`, "rgba(255,120,80,0.5)");
}

/* ───────────────────────────  RENDER LISTA  ─────────────────────────── */
function render(panel) {
  const cont = panel.querySelector(".nv-crud-lista");
  const esq = ESQUEMAS[estado.coll];
  const lista = docs(estado.coll);
  // Tabs activas
  panel.querySelectorAll(".nv-crud-tab").forEach((t) => t.classList.toggle("activa", t.getAttribute("data-c") === estado.coll));
  cont.innerHTML = "";
  const cab = el("div", "nv-crud-cab");
  cab.innerHTML = `<span>${esq.icono} ${esc(esq.titulo)} · <b>${lista.length}</b> en tu base de datos</span>`;
  const acciones = el("div", "nv-crud-cabacc");
  if (lista.length) {
    const vaciar = el("button", "nv-crud-btn ghost", "🧹 Vaciar demo");
    vaciar.title = "Borra TODOS los documentos de esta sección en PostgreSQL";
    vaciar.addEventListener("click", () => vaciarColeccion(estado.coll));
    acciones.appendChild(vaciar);
  }
  const nuevo = el("button", "nv-crud-btn primary", "＋ Nuevo");
  nuevo.addEventListener("click", () => abrirForm(estado.coll, null));
  acciones.appendChild(nuevo);
  cab.appendChild(acciones);
  cont.appendChild(cab);

  if (!lista.length) {
    cont.appendChild(el("div", "nv-crud-vacio", `Aún no hay ${esc(esq.titulo.toLowerCase())} en tu base de datos. Pulsa <b>＋ Nuevo</b> para crear el primero.`));
    return;
  }
  const grid = el("div", "nv-crud-items");
  for (const item of lista) {
    const row = el("div", "nv-crud-item");
    row.innerHTML = `<div class="nv-crud-r">${esc(esq.resumen(item))}</div>`;
    const acc = el("div", "nv-crud-acc");
    const bE = el("button", "nv-crud-mini", "✎"); bE.title = "Editar"; bE.addEventListener("click", () => abrirForm(estado.coll, item));
    const bD = el("button", "nv-crud-mini del", "🗑"); bD.title = "Borrar"; bD.addEventListener("click", () => borrar(estado.coll, item));
    acc.appendChild(bE); acc.appendChild(bD); row.appendChild(acc);
    grid.appendChild(row);
  }
  cont.appendChild(grid);
}

/* ───────────────────────────  MONTAJE  ─────────────────────────── */
function construir() {
  const panel = el("section", "nv-crud"); panel.id = "nv-crud"; panel.setAttribute("data-nv-ux", "1");
  panel.innerHTML = `
    <div class="nv-crud-top">
      <div class="nv-crud-titulo"><span class="nv-crud-ico">🗂️</span>
        <div><h2>Gestor de Contenido</h2><p>Crea, edita y borra tus datos reales en PostgreSQL — reemplaza la demo por tu negocio.</p></div>
      </div>
      <div class="nv-crud-tabs">${ORDEN.map((c) => `<button class="nv-crud-tab ${c === estado.coll ? "activa" : ""}" data-c="${c}">${ESQUEMAS[c].icono} ${ESQUEMAS[c].titulo}</button>`).join("")}</div>
    </div>
    <div class="nv-crud-lista"></div>`;
  panel.querySelectorAll(".nv-crud-tab").forEach((t) => t.addEventListener("click", () => { estado.coll = t.getAttribute("data-c"); reproducir("click"); render(panel); }));
  render(panel);
  return panel;
}

function objetivo() {
  const root = document.querySelector("[data-nv-root]");
  if (!root) return document.body;
  const insp = document.getElementById("nv-inspector");
  if (insp && insp.parentElement) return insp.parentElement;
  const aside = root.querySelector("aside");
  if (aside && aside.nextElementSibling) return aside.nextElementSibling;
  return root;
}
function montar() {
  if (document.getElementById("nv-crud")) { const p = document.getElementById("nv-crud"); render(p); return; }
  const destino = objetivo();
  if (!destino) return;
  const insp = document.getElementById("nv-inspector");
  const panel = construir();
  if (insp && insp.nextSibling) destino.insertBefore(panel, insp.nextSibling);
  else destino.insertBefore(panel, destino.firstChild);
}

export function instalarCrud() {
  const esAdmin = (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "admin";
  if (!esAdmin) return;
  montar();
  // Re-render cuando cambien los datos reales (onSnapshot → Store).
  for (const c of ORDEN) { const k = ESQUEMAS[c].storeKey; Store.subscribe && Store.subscribe(k, () => { const p = document.getElementById("nv-crud"); if (p && estado.coll === c) render(p); }); }
  // Re-monta si el runtime repinta el árbol.
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window && !_obs) {
    let pend = 0;
    _obs = new MutationObserver(() => { if (pend || document.getElementById("nv-crud")) return; pend = requestAnimationFrame(() => { pend = 0; montar(); }); });
    _obs.observe(root, { childList: true, subtree: true });
  }
}

export default { instalarCrud };
