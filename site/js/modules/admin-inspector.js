/**
 * admin-inspector.js — Módulo visual "Auditoría de Base de Datos" (panel admin).
 *
 * Monta, dentro del panel de administración y con la identidad de NV STREAMING,
 * un módulo limpio con DOS botones:
 *   1) "Revisar Estructura de Datos" → ejecuta `InspectorDatosService` en tiempo
 *      real y pinta un resumen visual ordenado (colecciones · campos · tipos).
 *   2) "Descargar Reporte PDF" → genera con `GeneradorPDF` (motor propio, sin
 *      dependencias) un PDF maquetado con el mapa completo y lo descarga.
 *
 * Estado inicial limpio (sin skeletons ni lazy-load). Spinner CSS ligero,
 * modal de confirmación para el PDF, y disparadores de sonido/animación de la
 * plataforma. El estado vive en el módulo: si el runtime repinta el panel, el
 * módulo se re-monta y restaura el último resumen sin recalcular.
 */

import { inspectorDatos } from "../services/inspector.service.js";
import { GeneradorPDF } from "../services/pdf.generator.js";
import { reproducir } from "./sound.js";

const estado = { reporte: null, cargando: false };
let _obs = null;

/* ───────────────────────────  UTILIDADES  ─────────────────────────── */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function fechaLarga(d) {
  try { return new Date(d).toLocaleString("es-VE", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (_) { return ""; }
}
function objetivoMontaje() {
  const root = document.querySelector("[data-nv-root]");
  if (!root) return document.body;
  const aside = root.querySelector("aside");
  if (aside && aside.nextElementSibling) return aside.nextElementSibling; // columna principal
  const inner = root.firstElementChild;
  if (inner && inner.children[1]) return inner.children[1];
  return root;
}

/* ───────────────────────────  RESUMEN VISUAL  ─────────────────────── */
function pillTipo(t) {
  const k = String(t).split(" ")[0];
  return `<span class="nv-insp-tipo t-${k}">${t}</span>`;
}
function renderResumen(cont, rep) {
  cont.innerHTML = "";
  const meta = el("div", "nv-insp-meta");
  meta.appendChild(el("div", "nv-insp-stat", `<b>${rep.totalColecciones}</b><span>colecciones</span>`));
  meta.appendChild(el("div", "nv-insp-stat", `<b>${rep.totalDocumentos}</b><span>documentos</span>`));
  meta.appendChild(el("div", "nv-insp-stat", `<b>${rep.totalCampos}</b><span>campos</span>`));
  meta.appendChild(el("div", "nv-insp-stat", `<b>${rep.entorno.split(" ")[0]}</b><span>fuente</span>`));
  cont.appendChild(meta);
  cont.appendChild(el("div", "nv-insp-fecha", `Inspección: ${fechaLarga(rep.generadoEn)} · entorno ${rep.entorno}`));

  // Agrupa por "grupo" para una lectura ordenada.
  const grupos = {};
  for (const c of rep.colecciones) (grupos[c.grupo] = grupos[c.grupo] || []).push(c);

  for (const [grupo, cols] of Object.entries(grupos)) {
    cont.appendChild(el("div", "nv-insp-grupo", grupo));
    for (const col of cols) {
      const card = el("div", "nv-insp-col");
      const head = el("div", "nv-insp-col-head");
      head.appendChild(el("div", "nv-insp-col-nombre", `${col.nombre}${col.esDocumento ? ' <em>(doc)</em>' : ''}`));
      head.appendChild(el("div", "nv-insp-col-badge", `${col.totalDocs} docs · ${col.totalCampos} campos`));
      card.appendChild(head);
      if (!col.campos.length) {
        card.appendChild(el("div", "nv-insp-vacio", "Sin documentos cargados."));
      } else {
        const tabla = el("div", "nv-insp-tabla");
        tabla.appendChild(el("div", "nv-insp-fila nv-insp-fila-head",
          `<span>Campo</span><span>Tipo</span><span>Cobertura</span><span>Ejemplo</span>`));
        for (const f of col.campos) {
          const fila = el("div", "nv-insp-fila");
          // Nombres/ejemplos vienen de datos inspeccionados → escapar por completo.
          const escI = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
          fila.innerHTML =
            `<span class="nv-insp-campo">${escI(f.nombre)}${f.siemprePresente ? "" : ' <i title="opcional">?</i>'}</span>` +
            `<span>${pillTipo(f.tipo)}</span>` +
            `<span class="nv-insp-cob"><i style="width:${f.cobertura}%"></i>${f.cobertura}%</span>` +
            `<span class="nv-insp-ej">${escI(f.ejemplo)}</span>`;
          tabla.appendChild(fila);
        }
        card.appendChild(tabla);
      }
      cont.appendChild(card);
    }
  }
}

/* ───────────────────────────  EXPORTAR PDF  ───────────────────────── */
function construirPDF(rep) {
  const g = new GeneradorPDF({ titulo: "Estructura de Datos" });
  g.texto("Reporte de Estructura de Base de Datos", { size: 16, bold: true, color: [0.05, 0.32, 0.6] });
  g.texto(`Generado: ${fechaLarga(rep.generadoEn)}`, { size: 9, color: [0.4, 0.43, 0.5] });
  g.salto(4); g.linea();
  g.filaKV("Entorno de datos", rep.entorno);
  g.filaKV("Colecciones", String(rep.totalColecciones));
  g.filaKV("Documentos muestreados", String(rep.totalDocumentos));
  g.filaKV("Campos mapeados", String(rep.totalCampos));
  g.salto(8);

  const anchos = [150, 95, 55, 150];
  for (const col of rep.colecciones) {
    g.seccion(`${col.nombre}  (${col.totalDocs} docs · ${col.totalCampos} campos)`);
    if (!col.campos.length) { g.texto("Sin documentos cargados.", { size: 9, color: [0.5, 0.5, 0.55] }); g.salto(4); continue; }
    g.filaTabla(["Campo", "Tipo", "Cobertura", "Ejemplo"], anchos, { bold: true, bg: [0.93, 0.97, 1], color: [0.05, 0.32, 0.6] });
    col.campos.forEach((f, i) => g.filaTabla(
      [f.nombre + (f.siemprePresente ? "" : " (opc)"), f.tipo, f.cobertura + "%", f.ejemplo],
      anchos, { bg: i % 2 ? [0.965, 0.978, 1] : null }));
    g.salto(8);
  }
  return g;
}

/* ───────────────────────────  ACCIONES  ───────────────────────────── */
async function onRevisar(btn, contResumen) {
  if (estado.cargando) return;
  estado.cargando = true;
  reproducir("click");
  btn.classList.add("cargando"); btn.disabled = true;
  const t0 = performance.now();
  try {
    // Inspección ultra rápida sobre datos reales ya sincronizados.
    const rep = inspectorDatos.inspeccionar();
    // Mínimo perceptible para que el spinner no parpadee.
    await new Promise((r) => setTimeout(r, Math.max(0, 260 - (performance.now() - t0))));
    estado.reporte = rep;
    renderResumen(contResumen, rep);
    contResumen.classList.add("visible");
    reproducir("success");
    if (window.NV && window.NV.toast) window.NV.toast(`Estructura mapeada: ${rep.totalColecciones} colecciones`, "rgba(0,212,160,0.5)");
    document.getElementById("nv-insp-pdf").disabled = false;
  } catch (e) {
    reproducir("error");
    if (window.NVUI) window.NVUI.error("No se pudo inspeccionar", (e && e.message) || "Inténtalo de nuevo.");
  } finally {
    estado.cargando = false;
    btn.classList.remove("cargando"); btn.disabled = false;
  }
}

async function onDescargar(btn) {
  let rep = estado.reporte;
  if (!rep) {
    // Si aún no se revisó, se inspecciona al vuelo antes de exportar.
    rep = inspectorDatos.inspeccionar();
    estado.reporte = rep;
  }
  const ok = window.NVUI
    ? await window.NVUI.confirmar("Descargar reporte PDF", `Se generará un PDF con ${rep.totalColecciones} colecciones y ${rep.totalCampos} campos reales de la base de datos.`, "Generar PDF")
    : true;
  if (!ok) return;

  reproducir("click");
  btn.classList.add("cargando"); btn.disabled = true;
  if (window.NVUI) window.NVUI.spinner(true, "Maquetando el PDF…");
  const t0 = performance.now();
  try {
    const g = construirPDF(rep);
    await new Promise((r) => setTimeout(r, Math.max(0, 320 - (performance.now() - t0))));
    const fecha = new Date().toISOString().slice(0, 10);
    g.descargar(`NV-Streaming-estructura-datos-${fecha}.pdf`);
    if (window.NVUI) window.NVUI.spinner(false);
    reproducir("success");
    if (window.NVUI) await window.NVUI.exito("PDF generado", "El reporte de estructura se descargó correctamente.");
  } catch (e) {
    if (window.NVUI) window.NVUI.spinner(false);
    reproducir("error");
    if (window.NVUI) window.NVUI.error("No se pudo generar el PDF", (e && e.message) || "Inténtalo de nuevo.");
  } finally {
    btn.classList.remove("cargando"); btn.disabled = false;
  }
}

/* ───────────────────────────  POBLAR BD (SEEDER)  ─────────────────────────── */
async function onPoblar(btn, contResumen) {
  if (estado.cargando) return;
  const NVUI = window.NVUI;
  // Requiere Firebase conectado (escritura real).
  if (!NVCore.online) {
    if (NVUI) NVUI.error("Backend no conectado", "El sembrado escribe en PostgreSQL. Abre la plataforma con conexión (no en modo offline) e inténtalo de nuevo.");
    return;
  }
  const ok = NVUI
    ? await NVUI.confirmar("Poblar base de datos", "Se crearán/actualizarán TODAS las colecciones canónicas en tu PostgreSQL (idempotente: no duplica). Luego podrás editarlas desde la plataforma. ¿Continuar?", "Sí, poblar")
    : true;
  if (!ok) return;

  estado.cargando = true;
  reproducir("click");
  btn.classList.add("cargando"); btn.disabled = true;
  const lbl = btn.querySelector(".nv-insp-lbl");
  const textoOrig = lbl ? lbl.textContent : "";
  try {
    const { sembrarTodo } = await import("../seeder.js");
    const res = await sembrarTodo((coll, n, tot) => { if (lbl) lbl.textContent = `Sembrando ${coll} (${n}/${tot})`; });
    const totalDocs = Object.values(res).reduce((a, b) => a + b, 0);
    const totalColl = Object.keys(res).length;
    reproducir("success");
    if (lbl) lbl.textContent = textoOrig;
    // Refresca la inspección para mostrar la BD ya poblada.
    const rep = inspectorDatos.inspeccionar();
    estado.reporte = rep;
    renderResumen(contResumen, rep);
    contResumen.classList.add("visible");
    const pdfBtn = document.getElementById("nv-insp-pdf"); if (pdfBtn) pdfBtn.disabled = false;
    if (NVUI) await NVUI.exito("Base de datos poblada", `Se escribieron ${totalDocs} documentos en ${totalColl} colecciones de PostgreSQL. Ya puedes editarlos desde el panel.`);
    if (window.NV && window.NV.toast) window.NV.toast(`PostgreSQL poblado: ${totalDocs} documentos`, "rgba(0,212,160,0.55)");
  } catch (e) {
    reproducir("error");
    if (lbl) lbl.textContent = textoOrig;
    if (NVUI) NVUI.error("No se pudo poblar", (e && e.message) || "Revisa las permisos del backend.");
  } finally {
    estado.cargando = false;
    btn.classList.remove("cargando"); btn.disabled = false;
  }
}

/* ───────────────────────────  MONTAJE  ─────────────────────────────── */
function construirPanel() {
  const panel = el("section", "nv-insp");
  panel.id = "nv-inspector";
  panel.setAttribute("data-nv-ux", "1");
  panel.innerHTML = `
    <div class="nv-insp-top">
      <div class="nv-insp-titulo">
        <span class="nv-insp-ico" aria-hidden="true">🛰️</span>
        <div>
          <h2>Auditoría de Base de Datos</h2>
          <p>Mapa en tiempo real de colecciones, campos y tipos — datos 100% reales.</p>
        </div>
      </div>
      <div class="nv-insp-acciones">
        <button type="button" id="nv-insp-revisar" class="nv-insp-btn primary">
          <span class="nv-insp-spin" aria-hidden="true"></span>
          <span class="nv-insp-lbl">Revisar Estructura de Datos</span>
        </button>
        <button type="button" id="nv-insp-pdf" class="nv-insp-btn ghost" disabled>
          <span class="nv-insp-spin" aria-hidden="true"></span>
          <span class="nv-insp-lbl">Descargar Reporte PDF</span>
        </button>
      </div>
    </div>
    <div class="nv-insp-resumen" id="nv-insp-resumen">
      <div class="nv-insp-inicial">Pulsa <b>Revisar Estructura de Datos</b> para inspeccionar las colecciones reales de PostgreSQL.</div>
    </div>`;
  const contResumen = panel.querySelector("#nv-insp-resumen");
  panel.querySelector("#nv-insp-revisar").addEventListener("click", (e) => onRevisar(e.currentTarget, contResumen));
  panel.querySelector("#nv-insp-pdf").addEventListener("click", (e) => onDescargar(e.currentTarget));
  // Restaura el último resumen si el panel se re-monta tras un repintado.
  if (estado.reporte) { renderResumen(contResumen, estado.reporte); contResumen.classList.add("visible"); panel.querySelector("#nv-insp-pdf").disabled = false; }
  return panel;
}

function montar() {
  if (document.getElementById("nv-inspector")) return;
  const destino = objetivoMontaje();
  if (!destino) return;
  destino.insertBefore(construirPanel(), destino.firstChild);
}

export function instalarInspector() {
  const esAdmin = (window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "admin";
  if (!esAdmin) return;
  montar();
  // Re-monta si el runtime repinta el árbol (sin recalcular el reporte).
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window && !_obs) {
    let pend = 0;
    _obs = new MutationObserver(() => {
      if (pend || document.getElementById("nv-inspector")) return;
      pend = requestAnimationFrame(() => { pend = 0; montar(); });
    });
    _obs.observe(root, { childList: true, subtree: true });
  }
}

export default { instalarInspector };
