/**
 * bridge.js — Puente entre el Store (datos reales de PostgreSQL) y las plantillas
 * de nv-runtime. No modifica el motor de render: se engancha vía
 * `window.NV.decorate(pageId, vals)`, que nv-runtime invoca en cada render.
 *
 * Responsabilidad: transformar los datos normalizados del Store a la forma EXACTA
 * que cada plantilla espera (mismos nombres de campo que el seed estático), de
 * modo que catálogos, combos, carteleras, métodos de pago, tablas del admin y
 * del revendedor, carrito multi-moneda, etc. rendericen sobre datos reales.
 * También expone `window.NV` (cart, checkout, wallet, moneda, admin) y delega
 * los clics de acción (añadir al carrito, aprobar, sembrar BD…).
 */

import NVCore from "./core.js";
import { Catalogo } from "./services/data.service.js";
import Commerce from "./services/commerce.service.js";
import Admin from "./services/admin.service.js";

const { Store, Bus, Utils } = NVCore;
const { Cart, Moneda, Checkout, Wallet } = Commerce;

/* ─────────────────────  TABLAS DE PRESENTACIÓN  ───────────────────── */
const GRAD = {
  netflix: "linear-gradient(135deg,#1a0a2e,#6a1a8a)", spotify: "linear-gradient(135deg,#0a1e0a,#1a7a1a)",
  disney: "linear-gradient(135deg,#0a0a2e,#2a2a8a)", hbo: "linear-gradient(135deg,#1e0a2e,#5a0a7a)",
  chatgpt: "linear-gradient(135deg,#0a1a1a,#0a5a4a)", adobe: "linear-gradient(135deg,#2e0a0a,#8a1a1a)",
  appletv: "linear-gradient(135deg,#0a0a12,#33333a)", vix: "linear-gradient(135deg,#1a0010,#7a0040)",
  crunchyroll: "linear-gradient(135deg,#2e1000,#7a3000)", paramount: "linear-gradient(135deg,#000a2e,#0a1a6e)",
  tidal: "linear-gradient(135deg,#001018,#004a6a)", youtube: "linear-gradient(135deg,#2e0000,#8a0000)",
  deezer: "linear-gradient(135deg,#14001a,#5a00aa)", office365: "linear-gradient(135deg,#001a2e,#003a6e)",
  windows11: "linear-gradient(135deg,#001a2e,#0060b0)", googleone: "linear-gradient(135deg,#0a0a1a,#2a4a8a)",
};
const CROP = { netflix: 1, spotify: 1, disney: 1, hbo: 1, chatgpt: 1, adobe: 1, appletv: 1, vix: 1, crunchyroll: 1, paramount: 1, office365: 1, googleone: 1, tvmagico: 1, flujo: 1 };
const PAY = {
  pago_movil_bdv: { color: "#22B8FF", icon: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2M9 6h6"/>' },
  binance_pay: { color: "#F0B90B", icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4m0 0h4.5a2 2 0 0 1 0 4H9.5m0-8V6m0 12v-2m3-8V6.5m0 11.5V16"/>' },
  zelle: { color: "#8A4DFF", icon: '<path d="M5 5h14L5 19h14"/><path d="M12 3v3M12 18v3"/>' },
  paypal: { color: "#3B7BBF", icon: '<path d="M7 3h7a4 4 0 0 1 0 8h-4M6 11h7a4 4 0 0 1 0 8H8l-.5 2M6 11 8 21"/>' },
  transferencia: { color: "#00D4A0", icon: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3 3 9h18z"/>' },
  default: { color: "#00CFFF", icon: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>' },
};
const grad = (id) => GRAD[id] || "linear-gradient(135deg,#0a0a2e,#2a2a8a)";
const crop = (s) => (CROP[s.id_servicio] ? `assets/crop-${s.id_servicio}.png` : s.logo_url || s.tarjeta_url);
const catLabel = (c) => ({ MUSICA: "MÚSICA", IA: "IA", SOFTWARE: "SOFTWARE", CLOUD: "CLOUD", STREAMING: "STREAMING" }[c] || c);
const fmtUSD = (n) => "$" + Utils.num(n).toFixed(2);
const short = (name) => String(name || "").split(" ")[0].toUpperCase().slice(0, 8);
const stockLabel = (s) => (!s.en_stock || s.stock <= 0 ? "AGOTADO" : s.stock <= 3 ? "ÚLTIMAS " + s.stock : s.stock <= 6 ? "QUEDAN " + s.stock : "");
const isLow = (s) => s.en_stock && s.stock > 0 && s.stock <= 6;

/* ─────────────────────  TRANSFORMS → FORMA DE PLANTILLA  ───────────────── */
const toServiceRow = (s) => ({ shortName: short(s.nombre_display), img: crop(s), name: s.nombre_display, desc: s.descripcion || s.tipo_entrega, price: fmtUSD(Catalogo.precioFinalUSD(s)), gradient: grad(s.id_servicio), category: catLabel(s.categoria), isTop: s.destacado, lowStock: isLow(s), stockLabel: stockLabel(s), _id: s.id_servicio });
const toServiceCard = (s) => ({ img: crop(s), name: s.nombre_display, price: fmtUSD(Catalogo.precioFinalUSD(s)), lowStock: isLow(s), stockLabel: stockLabel(s), _id: s.id_servicio });
const toPremium = (s) => ({ shortName: short(s.nombre_display), name: s.nombre_display, plan: s.descripcion, gradient: grad(s.id_servicio), category: catLabel(s.categoria), price: fmtUSD(Catalogo.precioFinalUSD(s)), features: (s.descripcion || "").split("·").map((x) => x.trim()).filter(Boolean).slice(0, 3), rating: "4.8", reviews: (100 + (s.stock * 37) % 900) / 100 + "K", isTop: s.destacado, topLabel: s.nuevo ? "NUEVO" : s.destacado ? "MÁS VENDIDO" : "", _id: s.id_servicio });
const toMkCard = (s) => ({ shortName: short(s.nombre_display), name: s.nombre_display, desc: s.descripcion || s.tipo_entrega, price: fmtUSD(Catalogo.precioFinalUSD(s)), gradient: grad(s.id_servicio), tag: (s.tags && s.tags[0]) ? String(s.tags[0]).toUpperCase() : catLabel(s.categoria), isPremium: s.destacado, _id: s.id_servicio });
const toRelated = (s) => ({ short: short(s.nombre_display), name: s.nombre_display, price: fmtUSD(Catalogo.precioFinalUSD(s)), gradient: grad(s.id_servicio), _id: s.id_servicio });

function toCombo(c) {
  const included = (c.servicios_included || []).map((nombre) => {
    const s = Catalogo.servicios().find((x) => x.nombre_display === nombre) || {};
    return { icon: short(nombre).slice(0, 1), name: nombre, price: fmtUSD(s.precio || 0), bg: grad(s.id_servicio || "") };
  });
  const orig = included.reduce((a, i) => a + Utils.num(i.price.replace("$", "")), 0);
  const precioCombo = Catalogo.precioComboUSD(c); // tarifa por rol (revendedor/estándar)
  return {
    name: c.nombre_combo, tag: "MÁS POPULAR", borderColor: "rgba(0,207,255,0.22)", glowColor: "rgba(0,80,255,0.07)",
    tagBg: "rgba(0,207,255,0.1)", tagBorder: "rgba(0,207,255,0.28)", tagColor: "#00CFFF",
    price: fmtUSD(precioCombo), originalPrice: fmtUSD(orig), savings: fmtUSD(Math.max(0, orig - precioCombo)) + "/mes",
    priceColor: "#00CFFF", priceGlow: "rgba(0,207,255,0.3)", btnGradient: "linear-gradient(135deg,#0A3AAE,#1A8FFF)", btnTextColor: "white", btnShadow: "0 3px 12px rgba(0,100,255,0.3)",
    items: included, _id: c.id,
  };
}
function toEstreno(e, i) {
  const urg = [{ t: "SE ESTRENA MAÑANA", c: "#FF30A0", bg: "rgba(255,48,160,0.18)", b: "rgba(255,48,160,0.4)" }, { t: "EN 3 DÍAS", c: "#FFB020", bg: "rgba(255,176,32,0.16)", b: "rgba(255,176,32,0.38)" }, { t: "PRÓXIMA SEMANA", c: "#00D4A0", bg: "rgba(0,212,160,0.14)", b: "rgba(0,212,160,0.34)" }][i % 3];
  const buyers = 800 + ((i + 1) * 653) % 2600;
  return {
    title: e.titulo_banner, type: "Estreno · " + e.plataforma, platform: e.plataforma, platformIcon: short(e.plataforma).slice(0, 1),
    platformBg: grad((e.plataforma || "").toLowerCase().includes("disney") ? "disney" : (e.plataforma || "").toLowerCase().includes("max") || (e.plataforma || "").toLowerCase().includes("hbo") ? "hbo" : "netflix"),
    urgency: urg.t, urgencyColor: urg.c, urgencyBg: urg.bg, urgencyBorder: urg.b,
    gradient: "linear-gradient(135deg,#0A041A 0%,#1A0A3E 40%,#2E0A5A 70%,#0A041A 100%)",
    desc: `Disponible en ${e.plataforma}. ${e.llamado_accion}.`,
    buyersCount: buyers.toLocaleString("es-VE"), buyerPreview: `${buyers.toLocaleString("es-VE")} personas ya lo tienen`,
    buyers: [{ initial: "M", bg: "linear-gradient(135deg,#0A3AAE,#1A8FFF)" }, { initial: "C", bg: "linear-gradient(135deg,#C8900A,#8B5E00)" }, { initial: "A", bg: "linear-gradient(135deg,#00A87A,#006A4E)" }],
    ctaLabel: e.llamado_accion, imagen_background: e.imagen_background,
  };
}
function toPayment(m) {
  const p = PAY[m.id_pago] || PAY[m.tipo] || PAY.default;
  const rgba = (hex, a) => { const n = hex.replace("#", ""); const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; };
  return { name: m.tipo_banco || m.id_pago, desc: m.titular || m.tipo, iconColor: p.color, icon: p.icon, iconBg: rgba(p.color, 0.1), iconBorder: rgba(p.color, 0.22), accentBg: rgba(p.color, 0.05), accentBorder: rgba(p.color, 0.28), _id: m.id_pago };
}
const toCartItem = (it) => {
  const s = Catalogo.porId(it.id) || {};
  return { icon: short(it.nombre).slice(0, 1), name: it.nombre, plan: (s.descripcion || it.meta?.categoria || "1 mes") + " · " + (it.cantidad || 1) + "x", price: fmtUSD(it.precioUSD), gradient: grad(it.id), tags: (s.tags || []).slice(0, 2), img: it.img, bg: grad(it.id), qty: it.cantidad || 1, tag: catLabel(s.categoria || "STREAMING"), tagBg: "rgba(155,63,255,0.14)", tagBorder: "rgba(155,63,255,0.3)", tagColor: "#B47CFF", _id: it.id, _tipo: it.tipo };
};

// Clona la forma cosmética de un item de muestra y sobreescribe campos reales.
const onSample = (samples, i, over) => Object.assign({}, samples[i % samples.length] || {}, over);

/* ─────────────────────  ESTADO VACÍO (base de datos sin datos)  ───────────
 * Con PostgreSQL vacío NO debe quedar ningún dato de demostración a la vista.
 * Cada lista se vacía; la lista PRINCIPAL de cada vista muestra UNA tarjeta/fila
 * de estado vacío con la MISMA forma de campos que la plantilla ya sabe pintar
 * (así no hay que tocar el HTML). Se marca `_empty` para distinguirla. */
const EMPTY_GRAD = "linear-gradient(135deg,#0a0e1a,#141a2e)";
function tarjetaVacia(titulo, sub) {
  return {
    _empty: true, _id: "__vacio__",
    shortName: "", img: "", name: titulo, desc: sub || "", plan: sub || "",
    price: "", gradient: EMPTY_GRAD, category: "", tag: "", topLabel: "",
    features: [], rating: "", reviews: "", isTop: false, lowStock: false,
    stockLabel: "", items: [],
  };
}
function filaVacia(over) {
  return Object.assign({
    _empty: true, _id: "__vacio__", label: "", sub: "", date: "", amount: "",
    isCredit: false, amountColor: "#8892b0", name: "", plan: "", expires: "",
    status: "", price: "", icon: "", gradient: EMPTY_GRAD, email: "",
    initials: "–", wa: "", products: "", renew: "",
  }, over || {});
}

/* ──────────────────────────  DECORATE POR PÁGINA  ───────────────────── */
function decorate(pageId, vals) {
  // Filtro de búsqueda activo → el catálogo se resuelve por índice (O(k)) y el
  // runtime repinta solo las coincidencias. Sin escaneo del DOM ni skeletons.
  const filtro = String(Store.get("busquedaFiltro") || "").trim();
  const svc = dedupServicios(filtro ? Catalogo.buscar(filtro) : Catalogo.activos());
  switch (pageId) {
    case "index": return decorateIndex(vals, svc);
    case "catalogo": return decorateCatalogo(vals, svc);
    case "detalles": return decorateDetalles(vals, svc);
    case "carrito": return decorateCarrito(vals);
    case "pagos": return decoratePagos(vals);
    case "billetera": return decorateBilletera(vals);
    case "mi-cuenta": return decorateCuenta(vals);
    case "admin": return decorateAdmin(vals);
    case "revendedor": return decorateRevendedor(vals);
    default: return;
  }
}

// Elimina servicios repetidos por id_servicio (evita, p. ej., "Netflix" duplicado
// cuando la BD tiene un doc repetido o al mezclar destacados + catálogo).
function dedupServicios(lista) {
  const vistos = new Set(); const out = [];
  for (const s of lista || []) { const id = s.id_servicio || s.id; if (id && vistos.has(id)) continue; if (id) vistos.add(id); out.push(s); }
  return out;
}

function decorateIndex(vals, svc) {
  if (svc.length) {
    vals.services = svc.slice(0, 10).map(toServiceRow);
    vals.serviceCards = svc.slice(0, 12).map(toServiceCard);
    // Destacados primero, pero SIN duplicar (dedup por id).
    vals.premiumServices = dedupServicios(Catalogo.destacados().concat(svc)).slice(0, 8).map(toPremium);
  } else {
    // BD vacía → nada de datos falsos; una sola tarjeta de estado vacío.
    vals.services = [tarjetaVacia("Catálogo en preparación", "Muy pronto publicaremos los servicios disponibles.")];
    vals.serviceCards = [];
    vals.premiumServices = [];
  }
  const combos = Catalogo.combos(); vals.combos = combos.length ? combos.map(toCombo) : [];
  const cart = Store.get("carteleras") || []; const estr = cart.filter((e) => e.activo); vals.estrenos = estr.length ? estr.map(toEstreno) : [];
  const mp = (Store.get("metodosPago") || []).filter((m) => m.estado_activo); vals.paymentMethods = mp.length ? mp.map(toPayment) : [];
  // Carrito lateral en vivo desde el Store real.
  const items = Cart.items();
  vals.cartItems = items.map(toCartItem);
  vals.cartCount = Cart.count();
  vals.cartSubtotal = fmtUSD(Cart.subtotalUSD());
  vals.cartDiscount = fmtUSD(Cart.descuentoUSD());
  vals.cartTotal = fmtUSD(Cart.totalUSD());
}

function decorateCatalogo(vals, svc) {
  // ¿Hay una búsqueda activa? Si la hay, ocultamos la promo de "Ofertas Flash"
  // (no es un resultado de búsqueda) y las secciones de categoría vacías.
  const buscando = !!String(Store.get("busquedaFiltro") || "").trim();
  vals.buscando = buscando;
  vals.sinBusqueda = !buscando;

  if (!svc.length) {
    // BD vacía o búsqueda sin resultados → sin tarjetas falsas; estado vacío.
    vals.streamingCards = [tarjetaVacia(
      buscando ? "Sin resultados" : "Catálogo en preparación",
      buscando ? "No encontramos servicios para tu búsqueda." : "Pronto publicaremos nuestros servicios.")];
    vals.aiCards = [];
    vals.prodCards = [];
    vals.offers = [];
    vals.serviceCount = 0;
    vals.streamingCount = 0; vals.aiCount = 0; vals.prodCount = 0;
    vals.hayStreaming = true; vals.hayAI = false; vals.hayProd = false;
    return;
  }
  vals.streamingCards = svc.filter((s) => ["STREAMING"].includes(s.categoria)).map(toMkCard);
  vals.aiCards = svc.filter((s) => s.categoria === "IA").map(toMkCard);
  vals.prodCards = svc.filter((s) => ["SOFTWARE", "CLOUD"].includes(s.categoria)).map(toMkCard);
  // Conteos reales por sección + visibilidad (se ocultan las secciones vacías,
  // sobre todo al buscar, para que no queden encabezados con "0 servicios").
  vals.streamingCount = vals.streamingCards.length;
  vals.aiCount = vals.aiCards.length;
  vals.prodCount = vals.prodCards.length;
  vals.hayStreaming = vals.streamingCards.length > 0;
  vals.hayAI = vals.aiCards.length > 0;
  vals.hayProd = vals.prodCards.length > 0;
  // Etiquetas de conteo ("N servicios") ya formateadas para la plantilla.
  vals.streamingLabel = vals.streamingCount + (vals.streamingCount === 1 ? " servicio" : " servicios");
  vals.aiLabel = vals.aiCount + (vals.aiCount === 1 ? " servicio" : " servicios");
  vals.prodLabel = vals.prodCount + (vals.prodCount === 1 ? " servicio" : " servicios");

  const of = buscando ? [] : Catalogo.ofertas();   // sin promo durante la búsqueda
  if (of.length) {
    const samples = Array.isArray(vals.offers) ? vals.offers : [];
    vals.offers = of.map((o, i) => {
      const s = Catalogo.porId(o.id_servicio) || {};
      return onSample(samples, i, { shortName: short(o.nombre), name: o.nombre, desc: s.descripcion || "", tag: catLabel(s.categoria || "STREAMING"), discount: "-" + o.descuento_pct + "%", price: fmtUSD(o.precio_oferta), oldPrice: fmtUSD(o.precio_normal), save: fmtUSD(o.precio_normal - o.precio_oferta), gradient: grad(o.id_servicio) });
    });
  } else {
    vals.offers = [];
  }
  vals.serviceCount = svc.length;
}

function decorateDetalles(vals, svc) {
  vals.related = svc.length ? svc.filter((s) => s.destacado).slice(0, 4).map(toRelated) : [];
  const coment = (Store.get("comentarios") || []).filter((c) => c.aprobado);
  if (coment.length) {
    const samples = Array.isArray(vals.reviews) ? vals.reviews : [];
    vals.reviews = coment.slice(0, 6).map((c, i) => onSample(samples, i, { initial: short(c.nombre).slice(0, 1), name: c.nombre, date: Utils.fecha(c.creadoEn), text: c.texto }));
  } else {
    vals.reviews = [];
  }
  // Perfil privado real (inventario) que se entrega en la compra de pantallas.
  const inv = (Store.get("inventario") || []).find((x) => x.estado === "disponible");
  if (inv) vals.perfilPrivado = { usuario: inv.credenciales.usuario, perfil: inv.credenciales.perfil, pin: inv.credenciales.pin };
}

function decorateCarrito(vals) {
  const items = Cart.items();
  vals.items = items.map(toCartItem);
  vals.itemCount = Cart.count();
  // Sugerencias reales ("completa tu combo") desde el catálogo destacado.
  const enCarrito = new Set(items.map((i) => i.id));
  const sug = Catalogo.destacados().filter((s) => !enCarrito.has(s.id_servicio)).slice(0, 4)
    .map((s) => ({ name: s.nombre_display, img: crop(s), bg: grad(s.id_servicio), price: fmtUSD(s.precio), _id: s.id_servicio }));
  if (Array.isArray(vals.suggestions) && vals.suggestions.length) vals.suggestions = sug.map((x, i) => onSample(vals.suggestions, i, x));
  else vals.suggestions = sug;
  // Métodos de pago reales para el selector rápido (vacío si no hay configurados).
  const mp = (Store.get("metodosPago") || []).filter((m) => m.estado_activo);
  if (Array.isArray(vals.payMethods)) vals.payMethods = mp.length ? mp.map((m, i) => onSample(vals.payMethods, i, { name: m.tipo_banco, label: m.tipo_banco, _id: m.id_pago })) : [];
}

function decoratePagos(vals) {
  const mp = (Store.get("metodosPago") || []).filter((m) => m.estado_activo);
  if (!mp.length) {
    // Sin métodos configurados → no mostrar datos de pago de demostración.
    const vacio = { title: "Método no configurado", lines: [{ k: "Estado", v: "Aún no hay métodos de pago configurados." }], _id: "__vacio__", _empty: true };
    vals.movil = vacio; vals.binance = vacio; vals.zelle = vacio; vals.paypal = vacio; vals.transferencia = vacio;
    return;
  }
  // Detalle por método (líneas para pagar) desde metodos_pago_config real.
  const linesFor = (m) => {
    const L = [];
    if (m.titular) L.push({ k: "Titular", v: m.titular });
    if (m.documento_identidad) L.push({ k: "Cédula/RIF", v: m.documento_identidad });
    if (m.telefono_pago) L.push({ k: "Teléfono", v: m.telefono_pago });
    if (m.tipo_banco) L.push({ k: "Banco", v: m.tipo_banco });
    if (m.correo_zelle) L.push({ k: "Correo Zelle", v: m.correo_zelle });
    if (m.correo_paypal) L.push({ k: "Correo PayPal", v: m.correo_paypal });
    if (m.correo_binance) L.push({ k: "Binance", v: m.correo_binance });
    if (m.instrucciones) L.push({ k: "Instrucciones", v: m.instrucciones });
    return L;
  };
  const byId = (id) => mp.find((m) => m.id_pago === id) || mp.find((m) => m.tipo === id);
  const build = (id, title) => { const m = byId(id); return m ? { title: m.tipo_banco || title, lines: linesFor(m), _id: m.id_pago } : vals[id]; };
  vals.movil = build("pago_movil_bdv", "Pago Móvil") || vals.movil;
  vals.binance = build("binance_pay", "Binance Pay") || vals.binance;
  vals.zelle = build("zelle", "Zelle") || vals.zelle;
  vals.paypal = build("paypal", "PayPal") || vals.paypal;
  vals.transferencia = build("transferencia", "Transferencia") || vals.transferencia;
}

function decorateBilletera(vals) {
  const mov = Store.get("movimientos") || [];
  if (!Array.isArray(vals.transactions)) return;
  if (mov.length) {
    vals.transactions = mov.slice(0, 10).map((m, i) => onSample(vals.transactions, i, {
      label: m.descripcion || (m.tipo === "ingreso" ? "Recarga de saldo" : "Compra"),
      sub: m.referencia ? "Ref " + m.referencia : (m.ejecutado_por || ""), date: Utils.fecha(m.fecha),
      amount: (m.tipo === "ingreso" ? "+" : "-") + fmtUSD(m.monto), isCredit: m.tipo === "ingreso",
    }));
  } else {
    vals.transactions = [filaVacia({ label: "Sin movimientos todavía", sub: "Tus recargas y compras aparecerán aquí." })];
  }
}

function decorateCuenta(vals) {
  const subs = Store.get("suscripciones") || [];

  // ── Perfil + estadísticas REALES (sin datos inventados) ──
  const ses = Store.get("sesion") || {};
  const auth = ses.estado === "autenticado";
  const u = ses.usuario || {};
  const nombre = auth ? String(u.nombre || (u.email || "").split("@")[0] || "Cliente") : "Invitado";
  vals.userName = nombre;
  vals.userEmail = auth ? (u.email || "—") : "Inicia sesión";
  vals.userInitial = (nombre.trim()[0] || "?").toUpperCase();

  const activas = subs.filter((s) => s.estado === "activo" || s.estado === "activa");
  const hoy = Date.now();
  const diasDe = (v) => (v ? Math.ceil((new Date(v).getTime() - hoy) / 864e5) : null);
  const porVencer = activas
    .map((s) => ({ s, d: diasDe(s.vence) }))
    .filter((x) => x.d != null && x.d >= 0 && x.d <= 7)
    .sort((a, b) => a.d - b.d);

  vals.statActivos = auth ? String(activas.length) : "—";
  vals.statActivosSub = auth ? (activas.length ? "En tu cuenta" : "Sin servicios activos") : "Inicia sesión";
  vals.statPorVencer = auth ? String(porVencer.length) : "—";
  if (auth && porVencer.length) {
    const p0 = porVencer[0];
    const nom = (Catalogo.porId(p0.s.servicio) || {}).nombre_display || p0.s.servicio;
    vals.statPorVencerSub = `${nom} · ${p0.d} día${p0.d === 1 ? "" : "s"}`;
  } else {
    vals.statPorVencerSub = auth ? "Nada próximo a vencer" : "—";
  }

  const bs = Store.get("billeteraStats");
  const gasto = bs && isFinite(Number(bs.gastadoMes))
    ? Number(bs.gastadoMes)
    : activas.reduce((a, s) => a + (Number(s.precioVenta) || 0), 0);
  vals.statGasto = auth ? fmtUSD(gasto) : "—";
  vals.statGastoSub = auth ? "Este mes" : "Inicia sesión";

  const saldo = Number(u.saldoBilletera);
  vals.statSaldo = auth && isFinite(saldo) ? fmtUSD(saldo) : "—";
  vals.statSaldoSub = auth ? "Disponible" : "Inicia sesión";

  // Aviso "por vencer": solo si hay sesión y algo realmente próximo a vencer.
  vals.hayPorVencer = auth && porVencer.length > 0;
  if (vals.hayPorVencer) {
    const p0 = porVencer[0];
    const nom = (Catalogo.porId(p0.s.servicio) || {}).nombre_display || p0.s.servicio;
    vals.avisoVence = `Tu suscripción de ${nom} vence en ${p0.d} día${p0.d === 1 ? "" : "s"}.`;
  }
  // El aviso solo aparece en la pestaña de servicios y con algo real por vencer.
  vals.avisoVenceVisible = !!(vals.isServicios && vals.hayPorVencer);

  // Sin sesión → NO mostramos suscripciones/movimientos de demo: estado vacío
  // con invitación a iniciar sesión (nunca datos de otro usuario ni inventados).
  const subsReales = auth ? subs : [];
  const mov = auth ? (Store.get("movimientos") || []) : [];
  if (Array.isArray(vals.subscriptions)) {
    if (subsReales.length) {
      vals.subscriptions = subsReales.slice(0, 8).map((s, i) => {
        const serv = Catalogo.porId(s.servicio) || {};
        return onSample(vals.subscriptions, i, { icon: short(serv.nombre_display || s.servicio).slice(0, 1), gradient: grad(s.servicio), name: serv.nombre_display || s.servicio, plan: s.perfil || s.tipo, expires: Utils.fecha(s.vence), status: s.estado === "activo" ? "Activo" : s.estado, price: fmtUSD(s.precioVenta) });
      });
    } else {
      vals.subscriptions = [filaVacia({ name: auth ? "Sin suscripciones activas" : "Inicia sesión para ver tus servicios", plan: auth ? "Explora el catálogo para contratar un servicio." : "Aquí aparecerán tus suscripciones." })];
    }
  }
  if (Array.isArray(vals.transactions)) {
    if (mov.length) {
      vals.transactions = mov.slice(0, 8).map((m, i) => onSample(vals.transactions, i, { label: m.descripcion, date: Utils.fecha(m.fecha), amount: (m.tipo === "ingreso" ? "+" : "−") + fmtUSD(m.monto), amountColor: m.tipo === "ingreso" ? "#00C896" : "#FF4466" }));
    } else {
      vals.transactions = [filaVacia({ label: auth ? "Sin movimientos todavía" : "Inicia sesión para ver tus movimientos" })];
    }
  }
  // Historial de facturación = egresos/pagos reales (no facturas inventadas).
  if (Array.isArray(vals.billing)) {
    const pagos = mov.filter((m) => m.tipo !== "ingreso");
    if (pagos.length) {
      vals.billing = pagos.slice(0, 8).map((m, i) => onSample(vals.billing, i, { date: Utils.fecha(m.fecha), service: m.descripcion || "Compra", status: "Completado", statusColor: "#00C896", statusBg: "rgba(0,200,150,0.08)", statusBorder: "rgba(0,200,150,0.18)", amount: fmtUSD(m.monto) }));
    } else {
      vals.billing = [filaVacia({ date: "—", service: "Sin pagos registrados", status: "—", amount: "—", statusColor: "rgba(240,240,250,0.4)", statusBg: "rgba(255,255,255,0.03)", statusBorder: "rgba(255,255,255,0.08)" })];
    }
  }
}

function decorateAdmin(vals) {
  // KPIs reales de negocio (sin widgets de "estado del sistema").
  const pedidos = Store.get("pedidos") || [];
  const aprob = pedidos.filter((p) => p.estado === "aprobado");
  const revenue = aprob.reduce((a, p) => a + Utils.num(p.precio), 0);
  const usuarios = Store.get("usuarios") || [];
  if (Array.isArray(vals.kpis) && vals.kpis.length >= 4) {
    vals.kpis = [
      onSample(vals.kpis, 0, { label: "Ventas aprobadas", value: fmtUSD(revenue), sub: aprob.length + " pedidos" }),
      onSample(vals.kpis, 1, { label: "Pedidos pendientes", value: String(pedidos.filter((p) => p.estado === "pendiente").length), sub: "por aprobar" }),
      onSample(vals.kpis, 2, { label: "Usuarios", value: String(usuarios.length), sub: "registrados" }),
      onSample(vals.kpis, 3, { label: "Suscripciones", value: String((Store.get("suscripciones") || []).length), sub: "activas" }),
    ];
  }
  // Tabla de órdenes real (con acciones aprobar/rechazar).
  if (Array.isArray(vals.orders)) {
    vals.orders = pedidos.slice(0, 20).map((p, i) => {
      const serv = Catalogo.porId(p.id_servicio) || {};
      return onSample(vals.orders, i, {
        id: p.id, cliente: p.nombre_cliente || p.email_cliente || "—", servicio: serv.nombre_display || p.nombre_item || p.id_servicio,
        monto: fmtUSD(p.precio), estado: p.estado, fecha: Utils.fecha(p.creadoEn), metodo: p.metodo_pago,
        _id: p.id, _estado: p.estado,
      });
    });
  }
  // Alertas = notificaciones_admin reales (sin alertas de demostración si no hay).
  const notif = (Store.get("notifAdmin") || []).filter((n) => !n.leido);
  if (Array.isArray(vals.alerts)) vals.alerts = notif.length ? notif.slice(0, 6).map((n, i) => onSample(vals.alerts, i, { mensaje: n.mensaje, texto: n.mensaje, tipo: n.tipo, fecha: Utils.fecha(n.creadoEn) })) : [];
}

function decorateRevendedor(vals) {
  const ses = Store.get("sesion") || {};
  const auth = ses.estado === "autenticado";
  const u = ses.usuario || {};
  const nom = auth ? String(u.nombre || (u.email || "").split("@")[0] || "Revendedor") : "Revendedor";

  // Datos REALES del backend (/api/reseller/*), cargados por reseller-api.js.
  const ov = Store.get("resellerOverview");           // resumen: código, KPIs, comisiones
  const clientesReales = Store.get("resellerClients") || [];
  const comisionesReales = Store.get("resellerCommissions") || [];

  // ── Identidad ── (código real del backend si está; si no, provisional) ──
  const codigo = (ov && ov.codigo) || (auth ? "NV-" + String(u.uid || u.email || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() : "NV-------");
  vals.resellerName = nom;
  vals.resellerFirst = nom.split(" ")[0];
  vals.resellerInitials = (nom.split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "NV").toUpperCase();
  vals.resellerCode = codigo;
  vals.refUser = codigo;
  vals.resellerSaldo = ov ? fmtUSD(ov.saldo) : (auth && isFinite(Number(u.saldoBilletera)) ? fmtUSD(Number(u.saldoBilletera)) : "$0.00");

  // ── Comisiones reales (cubos del backend) ──
  const pendiente = ov ? Number(ov.pendiente) || 0 : 0;
  const disponible = ov ? Number(ov.disponible) || 0 : 0;
  const pagadaMes = ov ? Number(ov.pagadaMes) || 0 : 0;
  const comisionTotal = ov ? Number(ov.comisionTotal) || 0 : 0;
  const ingresos = ov ? Number(ov.ingresos) || 0 : 0;
  const ventas = ov ? Number(ov.ventas) || 0 : 0;
  const nClientes = ov ? Number(ov.clientes) || 0 : 0;
  if (Array.isArray(vals.commissions)) {
    vals.commissions = [
      { label: "Pendiente", value: fmtUSD(pendiente), color: "#FFB020" },
      { label: "Disponible", value: fmtUSD(disponible), color: "#00D4A0" },
      { label: "Pagada (mes)", value: fmtUSD(pagadaMes), color: "#00CFFF" },
      { label: "Total comisión", value: fmtUSD(comisionTotal), color: "#9B3FFF" },
    ];
  }
  vals.levelXP = fmtUSD(comisionTotal);
  vals.disponibleRetiro = fmtUSD(disponible);
  vals.puedeRetirar = disponible > 0;
  vals.memberSince = (ov ? Number(ov.clientes) || 0 : 0) + " referido" + ((ov ? Number(ov.clientes) || 0 : 0) === 1 ? "" : "s");

  // ── KPIs reales del dashboard ──
  if (Array.isArray(vals.kpis) && vals.kpis.length >= 3) {
    vals.kpis = [
      onSample(vals.kpis, 0, { label: "Ventas", value: String(ventas), sub: "de referidos" }),
      onSample(vals.kpis, 1, { label: "Ingresos", value: fmtUSD(ingresos), sub: "generados" }),
      onSample(vals.kpis, 2, { label: "Comisión", value: fmtUSD(comisionTotal), sub: (ov ? Math.round((Number(ov.comisionPct) || 0) * 100) : 0) + "%" }),
      ...(vals.kpis[3] ? [onSample(vals.kpis, 3, { label: "Clientes", value: String(nClientes), sub: "referidos" })] : []),
      ...(vals.kpis[4] ? [onSample(vals.kpis, 4, { label: "Disponible", value: fmtUSD(disponible), sub: "para retirar" })] : []),
    ];
  }

  // ── CRM: clientes referidos reales ──
  if (Array.isArray(vals.clientes)) {
    if (clientesReales.length) {
      vals.clientes = clientesReales.slice(0, 20).map((c, i) => {
        const activo = Number(c.activas) > 0;
        return onSample(vals.clientes, i, {
          name: c.nombre || (c.email || "Cliente").split("@")[0],
          email: c.email || "",
          initials: short(c.nombre || c.email || "C").slice(0, 2),
          wa: c.whatsapp || "—",
          products: Number(c.pedidos) ? `${c.pedidos} pedido(s)` : "Sin compras",
          amount: fmtUSD(c.total),
          statusLabel: activo ? "Activo" : "Referido",
          statusColor: activo ? "#00D4A0" : "#00CFFF",
          statusBg: activo ? "rgba(0,212,160,0.12)" : "rgba(0,207,255,0.10)",
          last: c.ultimo ? Utils.fecha(c.ultimo) : "—",
          renew: c.proximoVence ? Utils.fecha(c.proximoVence) : "—",
          renewSoon: false,
          notes: "—",
        });
      });
    } else {
      vals.clientes = [filaVacia({ name: auth ? "Aún no tienes referidos" : "Inicia sesión", products: "Comparte tu enlace de referido para empezar a ganar comisiones." })];
    }
  }
  // Filtro "Todos (N)" con el conteo real.
  if (Array.isArray(vals.clientFilters) && vals.clientFilters[0]) {
    vals.clientFilters = vals.clientFilters.map((f, i) => (i === 0 ? Object.assign({}, f, { label: `Todos (${nClientes})` }) : f));
  }

  // ── Libro de comisiones (para el módulo Centro Financiero / Comisión) ──
  vals.comisionesLista = comisionesReales.map((c) => ({
    servicio: c.servicio || "Servicio",
    cliente: c.clienteNombre || c.clienteEmail || "Cliente",
    monto: fmtUSD(c.monto),
    pct: Math.round((Number(c.pct) || 0) * 100) + "%",
    estado: c.estadoUI,
    fecha: c.creadoEn ? Utils.fecha(c.creadoEn) : "—",
  }));

  // ── Gráfico "Ventas & Ganancias" desde la serie real (últimos 6 meses) ──
  const serie = (ov && Array.isArray(ov.serie) && ov.serie.length) ? ov.serie : null;
  vals.chartValue = fmtUSD(comisionTotal);
  vals.chartDelta = "";
  if (serie && serie.length >= 2) {
    const n = serie.length;
    const maxV = Math.max(1, ...serie.map((s) => Math.max(Number(s.ventas) || 0, Number(s.comision) || 0)));
    const xAt = (i) => Math.round(20 + i * (520 / (n - 1)));
    const yAt = (v) => Math.round(130 - ((Number(v) || 0) / maxV) * 92);  // 38..130 (y invertida)
    const ventasPts = serie.map((s, i) => [xAt(i), yAt(s.ventas)]);
    const comisPts = serie.map((s, i) => [xAt(i), yAt(s.comision)]);
    const last = ventasPts[n - 1];
    vals.chartSales = ventasPts.map((p) => p.join(",")).join(" ");
    vals.chartProfit = comisPts.map((p) => p.join(",")).join(" ");
    vals.chartArea = `M${ventasPts[0][0]},${ventasPts[0][1]} ` + ventasPts.slice(1).map((p) => `L${p[0]},${p[1]}`).join(" ") + ` L${last[0]},150 L${ventasPts[0][0]},150 Z`;
    vals.chartDotX = last[0];
    vals.chartDotY = last[1];
    vals.chartLabels = serie.map((s, i) => ({ label: s.label, x: ventasPts[i][0] }));
  }

  // ── Nivel con umbrales REALES (por comisión acumulada) ──
  const NIVEL_UI = {
    Bronce: { c: "#CD7F32", c2: "#8B5A2B", e: "🥉" },
    Plata: { c: "#C0C8D4", c2: "#8A94A6", e: "🥈" },
    Oro: { c: "#E6B83A", c2: "#B8860B", e: "🥇" },
    Platino: { c: "#7FD4FF", c2: "#3A9AD9", e: "🏆" },
    Diamante: { c: "#9B7BFF", c2: "#6A3FD9", e: "💎" },
  };
  const niv = (ov && ov.nivel) || { nombre: "Bronce", siguiente: "Plata", pct: 0, faltante: 0 };
  const nui = NIVEL_UI[niv.nombre] || NIVEL_UI.Bronce;
  vals.levelName = niv.nombre;
  vals.levelColor = nui.c;
  vals.levelColor2 = nui.c2;
  vals.levelGlow = nui.c + "55";
  vals.levelEmoji = nui.e;
  vals.levelPct = niv.pct;
  vals.levelNext = niv.siguiente || "MÁX";
  vals.levelRemaining = niv.siguiente ? fmtUSD(niv.faltante) : "—";
  const avgCom = ventas > 0 ? comisionTotal / ventas : 2.5;
  vals.levelSalesToGo = niv.siguiente && niv.faltante > 0 ? String(Math.max(1, Math.ceil(niv.faltante / avgCom))) : "0";

  // ── "Más vendidos" desde el top real de servicios (por comisión) ──
  const top = (ov && Array.isArray(ov.topServicios)) ? ov.topServicios : [];
  const rankCol = ["#E6B83A", "#C0C8D4", "#CD7F32", "rgba(160,185,240,0.5)", "rgba(160,185,240,0.5)"];
  if (Array.isArray(vals.bestSellers)) {
    if (top.length) {
      vals.bestSellers = top.map((t, i) => {
        const s = Catalogo.porId(t.servicio) || {};
        const nombre = s.nombre_display || t.servicio;
        return onSample(vals.bestSellers, i, {
          rank: "0" + (i + 1), rankColor: rankCol[i] || rankCol[4],
          icon: short(nombre).slice(0, 1), bg: grad(t.servicio),
          name: nombre, units: String(t.ventas), earnings: fmtUSD(t.comision),
        });
      });
    } else {
      vals.bestSellers = [filaVacia({ rank: "—", name: "Sin ventas todavía", units: "0", earnings: fmtUSD(0) })];
    }
  }

  // ── "Actividad reciente" desde el libro de comisiones real ──
  if (Array.isArray(vals.activity)) {
    if (comisionesReales.length) {
      vals.activity = comisionesReales.slice(0, 6).map((c, i) => {
        const s = Catalogo.porId(c.servicio) || {};
        const nombre = s.nombre_display || c.servicio || "servicio";
        const cli = c.clienteNombre || (c.clienteEmail || "cliente").split("@")[0];
        return onSample(vals.activity, i, {
          text: `Comisión por ${nombre} · ${cli}`,
          amount: "+" + fmtUSD(c.monto), amountColor: "#00D4A0",
          time: c.creadoEn ? Utils.fecha(c.creadoEn) : "",
          icon: '<path d="M20 6 9 17l-5-5"/>',
          iconColor: "#00D4A0", iconBg: "rgba(0,212,160,0.1)", iconBorder: "rgba(0,212,160,0.24)",
        });
      });
    } else {
      vals.activity = [filaVacia({ text: "Aún no hay actividad. Tu primera comisión aparecerá aquí.", amount: "", time: "" })];
    }
  }

  // El "pipeline CRM" era una maqueta sin respaldo → se oculta; el CRM real vive
  // en la vista "Mis Clientes" (clientes referidos con actividad real).
  vals.showPipeline = false;
}

/* ──────────────────────────  INTERACTIVIDAD  ───────────────────────── */
function toast(msg, color) {
  let t = document.getElementById("nv-toast");
  if (!t) {
    t = document.createElement("div"); t.id = "nv-toast";
    t.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);z-index:99999;padding:12px 22px;border-radius:12px;font:600 14px/1.2 'DM Sans',sans-serif;color:#fff;background:rgba(10,14,30,0.94);border:1px solid rgba(0,207,255,0.4);box-shadow:0 12px 40px rgba(0,0,40,0.6);opacity:0;transition:all .3s cubic-bezier(.32,.72,0,1);backdrop-filter:blur(10px);pointer-events:none;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderColor = color || "rgba(0,207,255,0.4)";
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(0)"; });
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(-50%) translateY(20px)"; }, 2200);
}

// Delegación global: botones de acción sin hook en plantilla se resuelven por
// texto + tarjeta contenedora (nombre del servicio → catálogo → carrito).
const ADD_RX = /^(acceder|añadir|agregar|comprar|conseguir|aprovechar|lo quiero|añadir al carrito)/i;
function nombreEnTarjeta(el) {
  let node = el;
  for (let i = 0; i < 6 && node; i++) {
    node = node.parentElement; if (!node) break;
    const txts = node.querySelectorAll("span,h2,h3,div");
    for (const t of txts) {
      const raw = (t.textContent || "").trim();
      if (raw.length > 2 && raw.length < 40) {
        const s = Catalogo.servicios().find((x) => x.nombre_display === raw || x.nombre_display.toLowerCase().startsWith(raw.toLowerCase().split(" ")[0]));
        if (s) return s;
      }
    }
  }
  return null;
}
function onGlobalClick(ev) {
  const btn = ev.target.closest("button,a");
  if (!btn) return;
  const txt = (btn.textContent || "").trim();
  if (!ADD_RX.test(txt)) return;
  const s = nombreEnTarjeta(btn);
  if (!s) return;
  ev.preventDefault();
  Cart.addServicio(s.id_servicio);
  toast(`${s.nombre_display} añadido al carrito`, "rgba(0,212,160,0.5)");
  if (window.NVSound) window.NVSound.reproducir("notify");
}

/* ──────────────────────────  API GLOBAL NV  ───────────────────────── */
function rerenderSoon() {
  if (rerenderSoon._q) return; rerenderSoon._q = true;
  requestAnimationFrame(() => { rerenderSoon._q = false; if (window.__NV_RERENDER) window.__NV_RERENDER(); });
}

export function instalarBridge() {
  window.NV = Object.assign(window.NV || {}, {
    decorate,
    catalog: Catalogo, cart: Cart, moneda: Moneda, checkout: Checkout, wallet: Wallet,
    admin: Admin, core: NVCore, toast,
    rerender: rerenderSoon,
    addToCart: (id) => { Cart.addServicio(id); const s = Catalogo.porId(id); toast(`${s ? s.nombre_display : "Servicio"} añadido`, "rgba(0,212,160,0.5)"); },
  });
  // Re-render cuando el Store cambie (snapshots de PostgreSQL, carrito, moneda…).
  Bus.on("store:changed", rerenderSoon);
  Bus.on("cart:updated", rerenderSoon);
  Bus.on("currency:changed", rerenderSoon);
  document.addEventListener("click", onGlobalClick, true);
}

export default { instalarBridge, decorate };
