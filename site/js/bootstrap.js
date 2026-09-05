/**
 * bootstrap.js — Punto de arranque oficial (Documento 1 · Cap. 4).
 *
 * Orden: Core → Firebase → Commerce → Bridge → Carga de datos → Auth → Acciones.
 * Módulo ECMAScript nativo (type="module"). Se incluye en todas las páginas.
 * La UI ya pintó desde el seed estático; aquí conectamos PostgreSQL y, cuando
 * llegan snapshots, el bridge repinta con datos reales.
 */

import NVCore from "./core.js";
import { iniciarCargaDatos } from "./services/data.service.js";
import Commerce from "./services/commerce.service.js";
import { instalarBridge } from "./bridge.js";
import { instalarSonido, reproducir } from "./modules/sound.js";
import { instalarUI, NVUI } from "./modules/ui-feedback.js";
import { instalarUX } from "./modules/ux-fixes.js";
import { instalarSubidaImagenes } from "./modules/image-upload.js";
import { instalarChat } from "./modules/assistant-chat.js";
import { instalarResellerApp } from "./modules/reseller-app.js";
import { instalarEditorPersist } from "./modules/editor-persist.js";
import { cargarCatalogoReal, cargarConfigReal } from "./modules/catalog-api.js";
import { instalarToasts } from "./modules/nv-toast.js";
import { instalarForms } from "./modules/nv-forms.js";
import { instalarUiState } from "./modules/nv-ui-state.js";
import { instalarPerf } from "./modules/nv-perf.js";
import { instalarGoogle } from "./modules/nv-google.js";
import { instalarLayout } from "./modules/nv-layout.js";
import { instalarSearchSuggest } from "./modules/search-suggest.js";
import { instalarAdminApp } from "./modules/admin-app.js";
import { instalarEditorBridge } from "./modules/editor-bridge.js";
import { instalarEditorLive } from "./modules/editor-live.js";

const { Auth, Store, Bus, Utils } = NVCore;
const page = () => window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page")) || "index";

/* WhatsApp del cliente para el checkout (entrega de acceso + OTP). Prefiere el
 * de la sesión; si no, el último usado (localStorage). Devuelve solo dígitos. */
function telefonoGuardado() {
  const u = (Store.get("sesion") || {}).usuario || {};
  let ls = ""; try { ls = localStorage.getItem("nv_wa") || ""; } catch (_) {}
  return String(u.id_whatsapp || u.whatsapp || u.telefono || ls || "").replace(/\D/g, "");
}
/** Pide y valida el WhatsApp (código de país incluido). null si se cancela. */
async function pedirWhatsApp() {
  const NVUI = window.NVUI;
  if (!NVUI || !NVUI.pedir) return telefonoGuardado() || null; // sin UI, no bloquea
  const prefill = telefonoGuardado();
  for (;;) {
    const val = await NVUI.pedir(
      "Tu WhatsApp",
      "¿A qué número te enviamos el acceso y los códigos de verificación? Incluye el código de país.",
      { placeholder: "Ej: 58 412 1234567", valor: prefill, type: "tel", inputmode: "tel" },
      "Continuar",
    );
    if (val == null) return null; // canceló
    const tel = String(val).replace(/\D/g, "");
    if (tel.length >= 8 && tel.length <= 15) {
      try { localStorage.setItem("nv_wa", tel); } catch (_) {}
      return tel;
    }
    await NVUI.error("Número inválido", "Escribe un número válido con código de país (solo dígitos, entre 8 y 15).");
  }
}

/* ─────────────────────────  ARRANQUE  ───────────────────────── */
async function boot() {
  Commerce.initCommerce();        // carrito + moneda desde localStorage
  instalarBridge();               // window.NV + decorate + delegación de clics
  instalarToasts();               // notificaciones no bloqueantes (window.NVToast) + errores de red
  instalarUiState();              // helper skeleton/empty/error (window.NVState)
  instalarForms();                // validación de formularios en tiempo real
  instalarPerf();                 // rendimiento: lazy-loading de imágenes (actuales y futuras)
  instalarGoogle();               // acceso con Google (si hay googleClientId en config)
  instalarUI();                   // spinner + modales (window.NVUI)
  instalarSonido();               // feedback auditivo (window.NVSound)
  instalarUX();                   // pulido UX: sliders, buscador, moneda, billetera, soporte
  instalarSubidaImagenes();       // subida de imágenes a ImgBB (admin/editor)
  instalarChat();                 // Asistente NV con procesamiento real (/api/chat)
  instalarResellerApp();          // Panel de Revendedor REAL: navegación lateral + /api/reseller/*
  instalarEditorPersist();        // editor visual → guarda componentes en PostgreSQL
  wireAcciones();                 // captura de comprobante + checkout + recarga

  // Inicializa Firebase (resiliente). Siempre resuelve; offline → seed local.
  await NVCore.init();

  iniciarCargaDatos();            // seed inmediato + snapshots PostgreSQL
  Auth.iniciarObservadorSesion(); // sesión → Store (anónimo en modo offline)
  cargarCatalogoReal();           // precios/stock reales desde el backend (sin datos falsos)
  cargarConfigReal();             // parametros (tasa_bcv viva) + tema desde /api/config
  instalarLayout();               // storefront ← layout PUBLICADO del editor visual (paginas_layout)
  instalarSearchSuggest();        // autocompletado en vivo bajo las cajas de búsqueda
  instalarAdminApp();             // Back Office REAL: navegación lateral + secciones conectadas a PostgreSQL
  instalarEditorBridge();         // editor en vivo: la tienda (dentro del iframe) se vuelve editable
  instalarEditorLive();           // editor: iframe con la página REAL + sincronía de la barra
  aplicarGatekeeper();

  Bus.emit("app:ready", { online: NVCore.online, page: page() });
  if (window.NV && window.NV.rerender) window.NV.rerender();
}

/* ──────────────  GATEKEEPER (admin / revendedor)  ────────────── */
// Verifica rol para paneles internos. Permisivo por defecto (modo demo) para no
// bloquear la revisión sin cuentas Auth reales; pon window.NV_ENFORCE=true para
// activar el rebote real al storefront cuando el rol no corresponda.
function aplicarGatekeeper() {
  const p = page();
  const protegido = { admin: "admin", revendedor: "revendedor" }[p];
  if (!protegido) return;
  const overlay = document.querySelector(".gatekeeper-fullscreen-blur");
  const liberar = () => overlay && (overlay.style.display = "none");
  Store.subscribe("sesion", (s) => {
    const u = s && s.usuario;
    if (!window.NV_ENFORCE) { liberar(); return; } // demo: acceso abierto
    if (!u) { location.href = "auth.html"; return; }
    const ok = protegido === "admin" ? u.rol === "admin" : (u.rol === "revendedor" || u.rol === "admin");
    if (ok) liberar(); else location.href = "index.html";
  });
  if (!NVCore.online || !window.NV_ENFORCE) liberar();
}

/* ─────────────────────────  ACCIONES  ───────────────────────── */
function wireAcciones() {
  // Captura de comprobante: cualquier <input type=file> → dataURL en memoria.
  document.addEventListener("change", (ev) => {
    const inp = ev.target;
    if (!inp || inp.type !== "file" || !inp.files || !inp.files[0]) return;
    const f = inp.files[0];
    const r = new FileReader();
    r.onload = () => { window.__NV_COMPROBANTE = r.result; NV.toast("Comprobante cargado ✓", "rgba(0,212,160,0.5)"); };
    r.readAsDataURL(f);
  }, true);

  // Delegación de acciones de compra/recarga por texto de botón.
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button,a"); if (!btn) return;
    const txt = (btn.textContent || "").trim().toLowerCase();
    const inst = window.__NV_INSTANCE || {};
    const st = inst.state || {};

    // Checkout (pagos / carrito) — con modal de confirmación + spinner + éxito.
    if (/^(confirmar pago|finalizar compra|pagar ahora|confirmar y pagar|realizar pago|finalizar pedido)/.test(txt)) {
      ev.preventDefault();
      const metodo = st.method || (Store.get("metodosPago") || [])[0]?.id_pago || "pago_movil_bdv";
      const total = NV.moneda ? NV.moneda.formato(NV.cart.totalUSD()) : "";
      // Pedimos el WhatsApp: es el canal por el que se entrega el acceso y los
      // códigos (OTP). Sin él, el backend no puede alcanzar al cliente.
      const telefono = await pedirWhatsApp();
      if (telefono == null) { NV.toast("Compra cancelada: necesitamos tu WhatsApp para enviarte el acceso.", "rgba(255,176,32,0.55)"); return; }
      const ok = await NVUI.confirmar("Confirmar pago", `Vas a registrar tu pago${total ? " por " + total : ""}. Enviaremos el acceso y la confirmación al WhatsApp +${telefono}.`, "Sí, pagar");
      if (!ok) return;
      NVUI.spinner(true, "Procesando tu pago…");
      const t0 = performance.now();
      try {
        const ids = await Commerce.Checkout.crearPedido({ metodo_pago: metodo, comprobante: window.__NV_COMPROBANTE || "", telefono });
        window.__NV_COMPROBANTE = "";
        await new Promise((r) => setTimeout(r, Math.max(0, 550 - (performance.now() - t0)))); // mínimo perceptible
        NVUI.spinner(false);
        reproducir("success");
        await NVUI.exito("¡Pago registrado!", `Creamos tu pedido (${ids.length} ítem${ids.length === 1 ? "" : "s"}). Validaremos tu pago y te avisaremos por WhatsApp.`);
      } catch (e) {
        NVUI.spinner(false);
        reproducir("error");
        NVUI.error("No se pudo procesar", e.message || "Inténtalo de nuevo o contáctanos por WhatsApp.");
      }
      return;
    }

    // Recarga de billetera. En la página de billetera el propio controlador de la
    // vista maneja el envío (botón "Continuar con recarga"), así que aquí NO lo
    // duplicamos: solo cubrimos recargas disparadas desde otras páginas.
    if (page() !== "billetera" && /^(confirmar recarga|añadir saldo)/.test(txt)) {
      ev.preventDefault();
      const monto = Utils.num(st.customAmount || st.rechargeAmount || 50);
      const metodo = st.activePayMethod || st.method || "binance";
      try {
        await Commerce.Wallet.solicitarRecarga({ monto, metodo_pago: metodo, comprobante: window.__NV_COMPROBANTE || "" });
        NV.toast(`Recarga de ${Utils.formatear(monto, "USD")} solicitada`, "rgba(0,212,160,0.55)");
      } catch (e) { NV.toast("No se pudo solicitar la recarga", "rgba(255,68,102,0.5)"); }
      return;
    }

    // Aprobar / rechazar en el admin (fila con data-order-id).
    if (page() === "admin") {
      const row = btn.closest("[data-order-id]");
      const id = row && row.getAttribute("data-order-id");
      if (id && /aprobar/.test(txt)) {
        ev.preventDefault();
        const link = await NV.admin.Pedidos.aprobar(id);
        NV.toast("Pedido aprobado ✓", "rgba(0,212,160,0.5)");
        if (link && /^https?:\/\//i.test(String(link))) window.open(link, "_blank", "noopener");
        return;
      }
      if (id && /rechazar/.test(txt)) {
        ev.preventDefault();
        await NV.admin.Pedidos.rechazar(id);
        NV.toast("Pedido rechazado", "rgba(255,176,32,0.5)");
        return;
      }
    }
  }, false);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
