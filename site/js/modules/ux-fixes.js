/**
 * ux-fixes.js — Capa de comportamiento (limpieza de UX/UI de NV Stream).
 *
 * Resuelve los 7 puntos del pulido solicitado, SIN datos falsos y respetando
 * los re-render del runtime (todo se vuelve a aplicar tras cada pintado):
 *
 *   1. Asistencia unificada  → "Soporte Humano"/"Hablar con asesor" abre WhatsApp.
 *   2. Datos reales / invitado → sustituye el saldo/correo quemados por la sesión.
 *   3. Buscador funcional     → filtra tarjetas del catálogo en vivo.
 *   4. (hover)                → resuelto en nv-fixes.css; aquí solo damos aire.
 *   5. Flechas de slider      → inyecta ❮ ❯ flotantes en cada carril horizontal.
 *   6. Sonidos                → clic de navegación/categoría + chime en éxito.
 *   7. Billetera + moneda     → botón de recarga (modal) y conversor USD/VES.
 */
import NVCore from "../core.js";
import { reproducir } from "./sound.js";

const { Store, Bus, Utils } = NVCore;

const cfg = () => (typeof window !== "undefined" && window.NV_CONFIG) || {};
// La moneda elegida PERSISTE entre páginas (localStorage): antes se reiniciaba a
// USD en cada navegación, así que el conversor "no funcionaba del todo".
function monedaGuardada() { try { return localStorage.getItem("nv_moneda") || "USD"; } catch (_) { return "USD"; } }
const state = { moneda: monedaGuardada(), wired: false };

/* ───────────────────────── utilidades ───────────────────────── */
function sesion() {
  const s = Store.get("sesion") || {};
  return { auth: s.estado === "autenticado", u: s.usuario || null };
}
function saldoUSD() {
  const { u } = sesion();
  const n = u && Number(u.saldoBilletera);
  return isFinite(n) ? n : null;
}
function abrirWhatsApp() {
  const w = cfg().whatsapp || {};
  const num = (w.numero || "").replace(/\D/g, "");
  const msg = encodeURIComponent(w.mensaje || "Hola, necesito asistencia con NV Stream");
  if (!num) {
    if (window.NVUI) window.NVUI.info("WhatsApp no configurado", "Configura el número en js/config.js (whatsapp.numero).");
    return;
  }
  window.open(`https://wa.me/${num}?text=${msg}`, "_blank", "noopener");
}
// Normaliza un enlace de red social: acepta URL completa o solo el usuario/canal.
function urlRed(valor, base) {
  const v = String(valor || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, "");
}
function abrirTelegram() {
  const url = urlRed((cfg().redes || {}).telegram, "https://t.me/");
  if (!url) { if (window.NVUI) window.NVUI.info("Telegram no configurado", "Añade tu canal en js/config.js (redes.telegram)."); return; }
  window.open(url, "_blank", "noopener");
}
function abrirInstagram() {
  const url = urlRed((cfg().redes || {}).instagram, "https://instagram.com/");
  if (!url) { if (window.NVUI) window.NVUI.info("Instagram no configurado", "Añade tu perfil en js/config.js (redes.instagram)."); return; }
  window.open(url, "_blank", "noopener");
}
function abrirX() {
  const url = urlRed((cfg().redes || {}).x, "https://x.com/");
  if (!url) { if (window.NVUI) window.NVUI.info("X no configurado", "Añade tu perfil en js/config.js (redes.x)."); return; }
  window.open(url, "_blank", "noopener");
}
// Modal de métodos de pago (datos NO sensibles desde config.pagos).
async function abrirPagos() {
  const pagos = (cfg().pagos && cfg().pagos.length) ? cfg().pagos : [
    { nombre: "Pago Móvil", detalle: "Confirmación por WhatsApp" },
    { nombre: "Transferencia", detalle: "Envía el comprobante" },
  ];
  const NVUI = window.NVUI;
  const filas = pagos.map((p) =>
    `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(0,207,255,0.16);border-radius:12px;margin-bottom:9px;background:rgba(0,207,255,0.04);">
       <div style="width:34px;height:34px;border-radius:9px;background:rgba(0,207,255,0.12);display:flex;align-items:center;justify-content:center;color:#00CFFF;flex-shrink:0;">
         <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
       </div>
       <div style="text-align:left;">
         <div style="font-weight:600;color:#EEF2FF;font-size:14px;">${p.nombre}</div>
         <div style="font-size:12px;color:rgba(200,215,255,0.55);">${p.detalle || ""}</div>
       </div>
     </div>`).join("");
  const html =
    `<div style="max-height:52vh;overflow:auto;margin:4px 0 2px;">${filas}</div>
     <div style="font-size:12px;color:rgba(200,215,255,0.5);margin-top:6px;">Los datos exactos de pago se confirman por WhatsApp al hacer tu pedido.</div>`;
  if (NVUI && NVUI.modal) {
    await NVUI.modal({
      tipo: "ask",
      icono: "💳",
      titulo: "Métodos de pago",
      html,
      acciones: [
        { label: "Escribir por WhatsApp", val: "wa" },
        { label: "Cerrar", ghost: true, val: 0 },
      ],
    }).then((v) => { if (v === "wa") abrirWhatsApp(); });
  } else {
    alert("Métodos de pago:\n" + pagos.map((p) => "• " + p.nombre).join("\n"));
  }
}
// Enlaza los botones marcados con data-nv-link (métodos de pago, WhatsApp,
// Telegram, Instagram, X) tanto en el header como en el pie.
function wireEnlaces() {
  if (wireEnlaces._done) return;
  wireEnlaces._done = true;
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-nv-link]");
    if (!el) return;
    const tipo = el.getAttribute("data-nv-link");
    ev.preventDefault(); ev.stopPropagation();
    reproducir("click");
    if (tipo === "pagos") abrirPagos();
    else if (tipo === "whatsapp") abrirWhatsApp();
    else if (tipo === "telegram") abrirTelegram();
    else if (tipo === "instagram") abrirInstagram();
    else if (tipo === "x") abrirX();
  }, true);
}

/* ── recorrido de nodos de texto (para moneda y limpieza de datos) ── */
function walkTexto(fn) {
  const root = document.querySelector("[data-nv-root]") || document.body;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "AUDIO" || p.closest("[data-nv-ux]"))
        return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodos = [];
  let n; while ((n = tw.nextNode())) nodos.push(n);
  nodos.forEach(fn);
}

/* ───── 1 + 2. Asistencia unificada + datos reales / invitado ───── */
// Delegación única: WhatsApp para soporte humano; sin botón flotante verde.
function wireSoporteHumano() {
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button,a");
    if (!b || b.closest("[data-nv-link]")) return;   // los data-nv-link los maneja wireEnlaces
    const t = (b.textContent || "").trim().toLowerCase();
    if (/soporte humano|hablar con asesor|contactar (asesor|soporte)|whatsapp/.test(t)) {
      ev.preventDefault();
      reproducir("click");
      abrirWhatsApp();
    }
  }, true);
}

// Sustituye los valores quemados ($125, correo ficticio, "Hola Juan") por el
// estado real de la sesión. Si no hay sesión → estado de invitado, nunca falso.
function limpiarDatosFalsos() {
  const { auth, u } = sesion();
  const saldo = saldoUSD();
  const saldoTxt = auth && saldo != null
    ? Utils.formatear(saldo, "USD")
    : "Inicia sesión";
  const correoTxt = auth && u && u.email ? u.email : "Invitado · inicia sesión";
  const nombre = auth && u && (u.nombre || u.email) ? (u.nombre || u.email.split("@")[0]) : "";

  walkTexto((node) => {
    let v = node.nodeValue;
    // Saldo quemado $125.00 / $125 → saldo real (con $) o guion si es invitado.
    v = v.replace(/\$125(\.00)?(?!\d)/g, auth && saldo != null ? saldoTxt : "—");
    // Correo ficticio del prototipo.
    v = v.replace(/usuario@nvplatform\.io/gi, correoTxt);
    // Saludo con nombre inventado ("Hola Juan").
    v = v.replace(/Hola Juan\b/gi, nombre ? "Hola " + nombre : "Hola");
    // "3 servicios activos" del panel de usuario → neutral si es invitado.
    // (No tocar la marquesina de marca "+50 Servicios activos": va precedida de
    //  "+" o "más de", así que la excluimos con un lookbehind.)
    if (!auth) v = v.replace(/(?<![+]|más de )\b\d{1,2}\s+servicios activos/gi, "tus servicios");
    if (v !== node.nodeValue) node.nodeValue = v;
  });

  // Marca visualmente el bloque de saldo del sidebar como "invitado".
  if (!auth) {
    document.querySelectorAll("[data-nv-saldo]").forEach((el) => el.classList.add("nv-balance-guest"));
  }
}

/* ───────────── 3. Buscador funcional (índice O(k), sin escaneo del DOM) ─────────────
   Al teclear se fija `busquedaFiltro` en el Store; el bridge repinta el catálogo
   resolviendo las coincidencias por índice invertido/prefijo. No se recorre el
   DOM en cada tecla ni se usan skeletons/lazy-load: el filtrado es algorítmico. */
let _filtroTimer = 0;
// Lleva la vista a la primera tarjeta/sección de resultados (para que el filtro
// sea visible: en index el catálogo está bajo el pliegue).
function irAResultados() {
  const destino = document.querySelector(".svc-card") ||
    document.querySelector('[class*="catalog"],[id*="catalog"]') ||
    document.querySelector("main");
  if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
}
function enviarBusqueda(inp) {
  const q = (inp.value || "").trim();
  // Enviar desde cualquier página que NO sea el catálogo → lleva a la página de
  // catálogo con el término (resultados a pantalla completa). En el catálogo se
  // filtra en el sitio y se hace scroll a los resultados.
  if (q && window.__NV_PAGE !== "catalogo") {
    location.href = "catalogo.html?q=" + encodeURIComponent(q);
    return;
  }
  aplicarFiltro(q);
  setTimeout(irAResultados, 140);   // tras el repintado del bridge
}
function wireBuscador() {
  const inputs = document.querySelectorAll('input[placeholder*="Buscar"],input[placeholder*="buscar"]');
  inputs.forEach((inp) => {
    if (inp.__nvWired) return;
    inp.__nvWired = true;
    inp.addEventListener("input", () => aplicarFiltro(inp.value));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); enviarBusqueda(inp); } });
    // Botón de lupa: es el <button> hermano dentro del mismo contenedor.
    const cont = inp.closest("div,form") || inp.parentElement;
    const btn = cont && cont.querySelector("button");
    if (btn && !btn.__nvSearch) {
      btn.__nvSearch = true;
      btn.addEventListener("click", (e) => { e.preventDefault(); enviarBusqueda(inp); });
    }
  });
  // Aplica ?q= al entrar (deep-link de búsqueda).
  const q = new URLSearchParams(location.search).get("q");
  if (q) {
    inputs.forEach((i) => { if (!i.value) i.value = q; });
    aplicarFiltro(q);
  }
}
function aplicarFiltro(termino) {
  const t = String(termino || "").trim();
  clearTimeout(_filtroTimer);
  // Pequeño antirrebote: agrupa ráfagas de tecleo en un solo repintado.
  _filtroTimer = setTimeout(() => {
    const actual = Store.get("busquedaFiltro") || "";
    if (actual === t) return;
    Store.set("busquedaFiltro", t);   // el bridge repinta por índice
  }, 90);
}

// Nota de "sin resultados" cuando el filtro no coincide con nada (una sola vez).
function notaBusqueda() {
  const filtro = String(Store.get("busquedaFiltro") || "").trim();
  const cat = window.NV && window.NV.catalog;
  const hay = filtro && cat ? cat.buscar(filtro).length > 0 : true;
  let nota = document.getElementById("nv-busqueda-nota");
  if (filtro && !hay) {
    if (!nota) {
      const main = document.querySelector("main") || document.querySelector("[data-nv-root]") || document.body;
      nota = document.createElement("div");
      nota.id = "nv-busqueda-nota";
      nota.className = "nv-search-empty";
      nota.setAttribute("data-nv-ux", "1");
      main.insertBefore(nota, main.firstChild);
    }
    nota.textContent = "Sin resultados para “" + filtro + "”. Prueba otro término.";
  } else if (nota) nota.remove();
}

/* ───────────── 5. Flechas flotantes en carriles horizontales ───────────── */
function decorarCarriles() {
  document.querySelectorAll(".nv-rail").forEach((rail) => {
    if (rail.parentElement && rail.parentElement.classList.contains("nv-rail-host")) {
      actualizarFlechas(rail.parentElement);
      return;
    }
    const host = document.createElement("div");
    host.className = "nv-rail-host";
    host.setAttribute("data-nv-ux", "1");
    rail.parentNode.insertBefore(host, rail);
    host.appendChild(rail);

    const mk = (dir, glifo) => {
      const b = document.createElement("button");
      b.className = "nv-arrow " + dir;
      b.type = "button";
      b.setAttribute("aria-label", dir === "prev" ? "Anterior" : "Siguiente");
      b.setAttribute("data-nv-ux", "1");
      b.textContent = glifo;
      b.addEventListener("click", () => {
        reproducir("click");
        const d = dir === "prev" ? -1 : 1;
        rail.scrollBy({ left: d * Math.max(320, rail.clientWidth * 0.85), behavior: "smooth" });
      });
      return b;
    };
    host.appendChild(mk("prev", "❮"));
    host.appendChild(mk("next", "❯"));
    rail.addEventListener("scroll", () => actualizarFlechas(host), { passive: true });
    actualizarFlechas(host);
  });
}
function actualizarFlechas(host) {
  const rail = host.querySelector(".nv-rail");
  if (!rail) return;
  const prev = host.querySelector(".nv-arrow.prev");
  const next = host.querySelector(".nv-arrow.next");
  const max = rail.scrollWidth - rail.clientWidth - 2;
  const desborda = rail.scrollWidth > rail.clientWidth + 4;
  if (prev) prev.disabled = !desborda || rail.scrollLeft <= 2;
  if (next) next.disabled = !desborda || rail.scrollLeft >= max;
}

/* ───────────── 6. Sonidos de navegación / categorías ───────────── */
function wireSonidos() {
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button,a");
    if (!b || b.closest("[data-nv-ux]")) return;         // las flechas ya suenan
    const t = (b.textContent || "").trim().toLowerCase();
    // Evita duplicar el chime de checkout (lo dispara bootstrap con "success").
    if (/pagar|finalizar|confirmar pago|recargar/.test(t)) return;
    // Navegación / categorías / enlaces internos.
    if (b.matches("a[href]") || b.closest("nav,header,aside,[data-nav],[data-categoria]") ||
        /catálogo|categor|ver todo|explorar|inicio/.test(t)) {
      reproducir("click");
    }
  }, true);
}

/* ───────────── 7a. Billetera → modal de recarga ───────────── */
function wireBilletera() {
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button,a");
    if (!b) return;
    const t = (b.textContent || "").trim().toLowerCase();
    // "Billetera" (abre recarga) — no el propio "Recargar" (lo maneja bootstrap).
    if (/^billetera$/.test(t)) {
      ev.preventDefault();
      reproducir("click");
      abrirRecarga();
    }
  }, true);
}
async function abrirRecarga() {
  const { auth } = sesion();
  const NVUI = window.NVUI;
  if (!auth) {
    if (NVUI) await NVUI.confirmar("Billetera NV", "Inicia sesión para ver y recargar tu saldo.", "Ir a acceder")
      .then((ok) => { if (ok) location.href = "auth.html"; });
    return;
  }
  const saldo = saldoUSD();
  const opts = [10, 25, 50, 100];
  if (NVUI) {
    const val = await NVUI.modal({
      tipo: "ask",
      titulo: "Recargar billetera",
      mensaje: `Saldo actual: ${Utils.formatear(saldo || 0, "USD")}. Elige un monto para recargar.`,
      acciones: opts.map((m) => ({ label: Utils.formatear(m, "USD"), val: m }))
        .concat([{ label: "Cerrar", ghost: true, val: 0 }]),
    });
    if (val) {
      try {
        const Commerce = (await import("../services/commerce.service.js")).default;
        await Commerce.Wallet.solicitarRecarga({ monto: val, metodo_pago: "binance", comprobante: "" });
        reproducir("success");
        await NVUI.exito("Recarga solicitada", `Registramos tu recarga de ${Utils.formatear(val, "USD")}. Te confirmaremos por WhatsApp.`);
      } catch (e) {
        reproducir("error");
        NVUI.error("No se pudo recargar", (e && e.message) || "Inténtalo de nuevo.");
      }
    }
  }
}

/* ───────────── 7b. Conversor de moneda (menú desplegable multi-divisa) ─────────────
   Opciones reales con sus tasas desde configuracion_sistema/parametros. */
const MONEDAS_UI = [
  { code: "USD", nombre: "Dólares", sym: "$" },
  { code: "VES", nombre: "Bolívares", sym: "Bs" },
  { code: "PEN", nombre: "Soles (Perú)", sym: "S/" },
  { code: "COP", nombre: "Pesos colombianos", sym: "COP" },
  { code: "EUR", nombre: "Euros", sym: "€" },
];
function tasaPara(code) {
  const p = Store.get("parametros") || {};
  const campo = { VES: "tasa_bcv", COP: "tasa_cop", PEN: "tasa_pen", EUR: "tasa_eur" }[code];
  const t = campo ? Number(p[campo]) : 1;
  if (isFinite(t) && t > 0) return t;
  if (code === "VES") return Number((cfg().moneda || {}).tasaVES) || 36.5;
  return 1;
}
function esSelectorMoneda(b) {
  if (!b || !b.querySelector || !b.querySelector("svg")) return false;
  const t = (b.textContent || "").replace(/\s+/g, " ").trim().toUpperCase();
  return /^(USD|VES|BS|PEN|COP|EUR|S\/|€|DOLAR|BOLIV|SOLES|PESOS)\b/.test(t) || b.__monedaBtn;
}
function wireMoneda() {
  document.addEventListener("click", (ev) => {
    const op = ev.target.closest(".nv-moneda-op");
    if (op) { ev.preventDefault(); seleccionarMoneda(op.getAttribute("data-cur")); return; }
    const b = ev.target.closest("button,a");
    const menu = document.querySelector(".nv-moneda-menu");
    if (menu && !(b && esSelectorMoneda(b)) && !ev.target.closest(".nv-moneda-menu")) menu.remove();
    if (b && esSelectorMoneda(b)) { ev.preventDefault(); reproducir("click"); abrirMenuMoneda(b); }
  }, true);
}
function abrirMenuMoneda(btn) {
  const ex = document.querySelector(".nv-moneda-menu");
  if (ex) { ex.remove(); return; }
  btn.__monedaBtn = true;
  if (getComputedStyle(btn).position === "static") btn.style.position = "relative";
  const menu = document.createElement("div");
  menu.className = "nv-moneda-menu";
  menu.setAttribute("data-nv-ux", "1");
  menu.innerHTML = MONEDAS_UI.map((m) => `<div class="nv-moneda-op ${m.code === state.moneda ? "activa" : ""}" data-cur="${m.code}"><span>${m.nombre}</span><b>${m.sym} · ${m.code}</b></div>`).join("");
  btn.appendChild(menu);
}
function seleccionarMoneda(code) {
  const m = MONEDAS_UI.find((x) => x.code === code);
  if (!m) return;
  state.moneda = code;
  try { localStorage.setItem("nv_moneda", code); } catch (_) {}   // persistir entre páginas
  const menu = document.querySelector(".nv-moneda-menu"); if (menu) menu.remove();
  document.querySelectorAll("button,a").forEach((b) => { if (b.__monedaBtn) etiquetarSelector(b); });
  reproducir("click");
  // USD = estado nativo del DOM (re-render limpio); otras = overlay tras render.
  if (window.NV && window.NV.rerender) window.NV.rerender(); else aplicarMoneda();
  if (window.NV && window.NV.toast) window.NV.toast(`Moneda: ${m.nombre} (${m.sym})`, "rgba(0,207,255,0.5)");
}
function etiquetarSelector(btn) {
  const cur = MONEDAS_UI.find((m) => m.code === state.moneda) || MONEDAS_UI[0];
  const tw = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null);
  let n; while ((n = tw.nextNode())) {
    if (n.nodeValue.trim() && !n.parentElement.closest(".nv-moneda-menu")) {
      const nuevo = " " + cur.code + " ";
      if (n.nodeValue !== nuevo) n.nodeValue = nuevo;   // idempotente: no re-muta si ya está (evita bucle)
      break;
    }
  }
}
function aplicarMoneda() {
  if (state.moneda === "USD") return; // USD es el estado nativo del DOM
  const cur = MONEDAS_UI.find((m) => m.code === state.moneda); if (!cur) return;
  const tasa = tasaPara(state.moneda);
  const dec = (state.moneda === "VES" || state.moneda === "COP") ? 0 : 2;
  const re = /\$\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g;
  walkTexto((node) => {
    if (!/\$\s?\d/.test(node.nodeValue)) return;
    node.nodeValue = node.nodeValue.replace(re, (m, num) => {
      // Los precios de origen SIEMPRE están en formato US ("$9.99", "$1,234.56"):
      // el punto es el decimal y la coma el separador de miles. Antes se borraba
      // el punto (9.99 → 999) y la conversión salía ~100× inflada. Correcto:
      // quitar solo las comas de millar y conservar el punto decimal.
      const usd = parseFloat(num.replace(/,/g, ""));
      if (!isFinite(usd)) return m;
      return cur.sym + " " + (usd * tasa).toLocaleString("es-VE", { maximumFractionDigits: dec, minimumFractionDigits: dec });
    });
  });
}

/* ───────────── 8. Botón "Mi Cuenta" + logo real en el header ───────────── */
function wireCuenta() {
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("button,a");
    if (!b) return;
    const t = (b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (t === "mi cuenta") { ev.preventDefault(); reproducir("click"); location.href = "mi-cuenta.html"; }
  }, true);
}
// Logo DINÁMICO: prioridad al que está en la BD (configuracion_sistema/
// tema_interfaz.logo_url_img), luego config, luego el SVG por defecto. Si el
// admin sube un logo desde el editor, se refleja aquí en toda la app.
function logoSrc() {
  const tema = Store.get("tema") || {};
  if (tema.logo_url_img) return tema.logo_url_img;
  const c = (cfg().marca && cfg().marca.logo) || {};
  if (c.imagen) return c.imagen;
  const base = (cfg().assets && cfg().assets.base) || "assets/";
  return base + "logo-nv-header.svg";
}
function arreglarLogo() {
  const header = document.querySelector("header");
  if (!header) return;
  const brand = header.querySelector("a");
  if (!brand) return;
  const src = logoSrc();
  const img = brand.querySelector("img[data-nv-logo]");
  if (img) { if (img.getAttribute("src") !== src) img.setAttribute("src", src); return; }
  brand.setAttribute("href", "index.html");
  brand.innerHTML = `<img data-nv-logo="1" src="${src}" alt="NV STREAMING" style="height:40px;width:auto;max-width:210px;object-fit:contain;display:block;" onerror="this.style.display='none'">`;
}

// Al cargar/repintar, deja el botón selector mostrando la moneda persistida
// (antes seguía diciendo "USD" aunque se hubiera elegido otra).
function sincronizarSelectorMoneda() {
  if (state.moneda === "USD") return;
  document.querySelectorAll("button,a").forEach((b) => {
    if (esSelectorMoneda(b)) { b.__monedaBtn = true; etiquetarSelector(b); }  // re-sincroniza tras cada render
  });
}

// Rellena la tarjeta de saldo (billetera/mi-cuenta) con el saldo y el nombre
// REALES de la sesión — antes eran un placeholder de plantilla ($25 / "JUAN
// PÉREZ"). Los elementos se marcan con data-nv-saldo / data-nv-nombre.
function pintarSaldo() {
  const { auth, u } = sesion();
  const saldo = saldoUSD();
  const txt = auth && saldo != null ? "$" + Number(saldo).toFixed(2) : "—";
  document.querySelectorAll("[data-nv-saldo]").forEach((el) => { if (el.textContent.trim() !== txt) el.textContent = txt; });
  const nombre = auth && u ? String(u.nombre || (u.email || "").split("@")[0] || "Cliente") : "Invitado";
  const up = nombre.toUpperCase();
  document.querySelectorAll("[data-nv-nombre]").forEach((el) => { if (el.textContent.trim() !== up) el.textContent = up; });
}

// Stats secundarias de la billetera (reservado, gastado del mes, uso del saldo y
// contador de movimientos). Vienen del endpoint /wallet (backend Postgres) y se
// guardan en el Store como "billeteraStats" (ver core.js). Antes eran valores de
// plantilla fijos ($9.99 / $54.96 / 68.7% / "8 de 24").
function pintarStatsBilletera() {
  if (!document.querySelector("[data-nv-reservado],[data-nv-gastado],[data-nv-uso],[data-nv-movcount]")) return;
  const { auth } = sesion();
  const s = auth ? Store.get("billeteraStats") : null;
  const money = (n) => "$" + (Number(n) || 0).toFixed(2);
  const setTxt = (sel, txt) => document.querySelectorAll(sel).forEach((el) => { if (el.textContent.trim() !== txt) el.textContent = txt; });

  setTxt("[data-nv-reservado]", s ? money(s.reservado) : "—");
  setTxt("[data-nv-gastado]", s ? money(s.gastadoMes) : "—");

  const uso = s ? Math.max(0, Math.min(100, Number(s.usoSaldo) || 0)) : 0;
  setTxt("[data-nv-uso]", s ? uso + "%" : "—");
  document.querySelectorAll("[data-nv-uso-bar]").forEach((el) => { el.style.width = uso + "%"; });

  const total = s ? (Number(s.totalMovimientos) || 0) : 0;
  const mostrados = Math.min(total, 10); // la lista renderiza como máximo 10 filas
  const cuenta = s ? (total > mostrados ? mostrados + " de " + total + " movimientos" : total + " movimiento" + (total === 1 ? "" : "s")) : "—";
  setTxt("[data-nv-movcount]", cuenta);
}

/* ───── Estado activo de la barra de categorías (caret + resaltado) ─────
   El runtime no re-aplica la clase `active` de estas pestañas tras el primer
   render (la clase se queda congelada), así que sincronizamos aquí el estado
   `active` leyendo el menú abierto de la instancia. Esto arregla a la vez:
   (a) la flechita que debe apuntar hacia arriba al desplegar, y
   (b) el resaltado de la categoría activa, que nunca llegaba a aplicarse. */
function claveNavCat(el) {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (/^categor/.test(t)) return "categorias";
  if (/^ofertas/.test(t)) return "ofertas";
  if (/^streaming/.test(t)) return "streaming";
  if (/^m[úu]sica/.test(t)) return "musica";
  if (/^ia\b/.test(t)) return "ia";
  if (/^juegos/.test(t)) return "juegos";
  if (/^software/.test(t)) return "software";
  return null;
}
function sincronizarNavActivo() {
  const inst = window.__NV_INSTANCE;
  const abierto = inst && inst.state ? inst.state.openMenu : null;
  document.querySelectorAll(".nav-cat").forEach((el) => {
    const activo = claveNavCat(el) === abierto && abierto != null;
    if (el.classList.contains("active") !== activo) el.classList.toggle("active", activo);
  });
}

/* ───────────────────── re-aplicar tras cada render ───────────────────── */
// Header sesión-consciente: el botón "Iniciar Sesión"/"Acceder" del encabezado
// lleva a auth.html si NO hay sesión; si HAY sesión, muestra el nombre y cierra
// sesión al pulsarlo. Antes esos botones no hacían nada (maquetas estáticas).
function esBotonAuthHeader(el) {
  const t = (el.textContent || "").trim();
  if (t === "Iniciar Sesión") return true;                 // inequívoco (solo en headers)
  // "Acceder" está sobrecargado (CTA de productos): solo lo tratamos como login
  // si está en un header/nav y no lleva precio.
  if (t === "Acceder" && el.closest("header,nav,[data-nv-header]") && !/\$|\d/.test(t)) return true;
  return false;
}
function gestionarSesionHeader() {
  const { auth, u } = sesion();
  const nombre = auth && u ? String(u.nombre || (u.email || "").split("@")[0] || "Cliente").split(" ")[0] : "";
  document.querySelectorAll("button,a").forEach((el) => {
    if (!el.__nvAuthBtn && !esBotonAuthHeader(el)) return;
    el.__nvAuthBtn = true;                                  // recordamos que es el control de sesión
    // El handler se (re)cablea solo cuando cambia el estado de sesión.
    if (el.__nvAuthState !== auth) {
      el.__nvAuthState = auth;
      if (el.__nvAuthH) el.removeEventListener("click", el.__nvAuthH, true);
      const handler = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!auth) { location.href = "auth.html"; return; }
        const NVUI = window.NVUI;
        const ok = NVUI ? await NVUI.confirmar("Cerrar sesión", "¿Quieres cerrar tu sesión?", "Cerrar sesión") : true;
        if (ok) { try { await NVCore.Auth.logout(); } catch (_) {} location.href = "index.html"; }
      };
      el.__nvAuthH = handler;
      el.addEventListener("click", handler, true);
    }
    // El nombre se re-aplica SIEMPRE: el runtime reutiliza el nodo y reescribe el
    // texto en cada render, así que hay que volver a pintarlo tras cada re-render.
    if (auth && nombre && el.textContent.trim() !== nombre) el.textContent = nombre;
  });

  // "Crear Cuenta" del header: lleva a registro si NO hay sesión; se oculta si la hay.
  document.querySelectorAll("button,a").forEach((el) => {
    if ((el.textContent || "").trim() !== "Crear Cuenta") return;
    if (!el.closest("header,nav,[data-nv-header]")) return;   // solo el del encabezado
    if (!el.__nvRegWired) {
      el.__nvRegWired = true;
      el.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); location.href = "auth.html"; }, true);
    }
    el.style.display = auth ? "none" : "";
  });
}

function redecorar() {
  decorarCarriles();
  wireBuscador();
  notaBusqueda();
  arreglarLogo();
  limpiarDatosFalsos();
  pintarSaldo();
  pintarStatsBilletera();
  gestionarSesionHeader();
  sincronizarNavActivo();
  sincronizarSelectorMoneda();
  aplicarMoneda();
}

// Captura el código de referido de la URL (?ref=CODE) en cualquier página y lo
// guarda para usarlo al registrarse, aunque el visitante navegue antes.
function capturarRef() {
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref && /^[A-Za-z0-9_-]{3,16}$/.test(ref)) localStorage.setItem("nv_ref", ref);
  } catch (_) {}
}

export function instalarUX() {
  if (state.wired) return;
  state.wired = true;
  capturarRef();

  // Handlers globales (una sola vez).
  wireSoporteHumano();
  wireEnlaces();
  wireSonidos();
  wireBilletera();
  wireMoneda();
  wireCuenta();

  // Decoración dependiente del DOM (se repite tras cada re-render del runtime).
  redecorar();
  Bus.on && Bus.on("app:ready", redecorar);
  Bus.on && Bus.on("catalogo:real", redecorar);
  Store.subscribe && Store.subscribe("sesion", () => { limpiarDatosFalsos(); pintarSaldo(); gestionarSesionHeader(); });
  Store.subscribe && Store.subscribe("billeteraStats", () => { pintarStatsBilletera(); aplicarMoneda(); });
  Store.subscribe && Store.subscribe("tema", () => arreglarLogo()); // logo dinámico desde la BD

  // El runtime repinta el árbol: observamos y re-decoramos (con antirrebote).
  const root = document.querySelector("[data-nv-root]") || document.body;
  if (root && "MutationObserver" in window) {
    let pend = 0;
    const obs = new MutationObserver(() => {
      if (pend) return;
      pend = requestAnimationFrame(() => { pend = 0; redecorar(); });
    });
    obs.observe(root, { childList: true, subtree: true });
  }
  window.addEventListener("resize", decorarCarriles, { passive: true });
}

export default { instalarUX };
