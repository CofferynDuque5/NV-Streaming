/**
 * admin-app.js — Back Office REAL de NV Streaming (rediseño).
 *
 * Reemplaza el "lanzador de 28 módulos" (fachada con tarjetas de versión falsas y
 * ventanas que a veces no abrían) por un panel de administración limpio, con
 * navegación lateral y secciones que SÍ funcionan, todas conectadas a PostgreSQL:
 *
 *   · Dashboard   → KPIs, gráfico de 14 días, top de servicios, actividad, roles.
 *   · Pedidos     → lista real + aprobar/rechazar.
 *   · Recargas    → lista real + aprobar/rechazar.
 *   · Suscripciones, Usuarios (editar rol/saldo/comisión), Revendedores.
 *   · Catálogo (Servicios, Combos, Categorías, Métodos de pago, Cartelera,
 *     Ofertas, FAQs) → CRUD real sobre el CMS.
 *   · Inventario (cuentas) y Planes → CRUD real.
 *   · Configuración del negocio → edición real.
 *   · Editor visual → abre el constructor.
 *
 * Cada sección lee datos reales al abrirse y muestra estados honestos cuando algo
 * está vacío. Nada de datos inventados.
 */
import NVCore from "../core.js";
import { NVApi } from "../services/nv-api.js";
import { editorService } from "../services/editor.service.js";

const { Store } = NVCore;

/* ─────────────────────────────  HELPERS  ───────────────────────────── */
const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
function toast(m, c) { try { if (window.NV && window.NV.toast) window.NV.toast(m, c); } catch (_) {} }
const OK = "rgba(0,212,160,0.55)", BAD = "rgba(255,120,80,0.55)";
function fechaCorta(v) { if (!v) return ""; const t = Date.parse(v); if (!t) return String(v).slice(0, 10); return new Date(t).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }); }
function haceCuanto(iso) { const t = Date.parse(iso); if (!t) return ""; const s = Math.max(1, (Date.now() - t) / 1000); if (s < 3600) return "hace " + Math.floor(s / 60) + " min"; if (s < 86400) return "hace " + Math.floor(s / 3600) + " h"; return "hace " + Math.floor(s / 86400) + " d"; }
async function confirmar(titulo, msg, ok) { if (window.NVUI && window.NVUI.confirmar) return window.NVUI.confirmar(titulo, msg, ok || "Confirmar"); return window.confirm(msg); }

const CATS = ["STREAMING", "MUSICA", "IA", "SOFTWARE", "CLOUD", "JUEGOS"];
const ESTADO_TAG = { pendiente: "#FFB000", aprobado: "#00C896", entregado: "#00C896", activa: "#00C896", rechazado: "#FF5B7A", anulada: "#FF5B7A", pagada: "#00CFFF", disponible: "#00C896", asignada: "#FFB000" };
function tag(v) { const c = ESTADO_TAG[String(v || "").toLowerCase()] || "rgba(200,215,255,0.6)"; return `<span class="nv-adm-tag" style="color:${c};border-color:${c}55;background:${c}14;">${esc(v || "—")}</span>`; }

/* ─────────────  Adaptadores CRUD (fuente real por sección)  ───────────── */
const cms = (coll) => ({
  listar: () => NVApi.coleccion(coll),
  crear: (d) => editorService.guardarComponente(coll, null, d),
  actualizar: (id, d) => editorService.guardarComponente(coll, id, d),
  borrar: (id) => editorService.eliminarComponente(coll, id),
  idKey: "id",
});
const planesAdaptador = {
  listar: () => NVApi.planes(),
  crear: (d) => NVApi.crearPlan({ ...d, precio: Number(d.precio), duracion_dias: Number(d.duracion_dias) }),
  actualizar: (id, d) => NVApi.actualizarPlan(id, { ...d, precio: Number(d.precio), duracion_dias: Number(d.duracion_dias) }),
  borrar: (id) => NVApi.borrarPlan(id),
  idKey: "id",
};
const cuentasAdaptador = {
  listar: () => NVApi.cuentas(),
  crear: (d) => NVApi.crearCuenta(d),
  actualizar: (id, d) => NVApi.actualizarCuenta(id, d),
  borrar: (id) => NVApi.borrarCuenta(id),
  idKey: "id",
};

/* ─────────────────────────  DEFINICIÓN DE SECCIONES  ───────────────────────── */
// tipo: dashboard | tabla | crud | config | link
const SECCIONES = [
  { id: "dashboard", grupo: "General", label: "Dashboard", icon: "▦", tipo: "dashboard" },

  { id: "pedidos", grupo: "Ventas", label: "Pedidos", icon: "🧾", tipo: "tabla",
    titulo: "Pedidos", sub: "Órdenes de compra, entregas y estados.",
    cargar: () => NVApi.pedidos(),
    columnas: [
      { k: "nombre_cliente", label: "Cliente", fmt: (r) => esc(r.nombre_cliente || r.uid_cliente || "—") },
      { k: "id_servicio", label: "Servicio", fmt: (r) => esc(r.id_servicio) },
      { k: "precio", label: "Precio", fmt: (r) => money(r.precio) },
      { k: "estado", label: "Estado", fmt: (r) => tag(r.estado) },
      { k: "creado_en", label: "Fecha", fmt: (r) => fechaCorta(r.creado_en) },
    ],
    acciones: (r) => (String(r.estado) === "pendiente" ? [
      { label: "Aprobar", tono: "ok", run: () => NVApi.cambiarEstadoPedido(r.id, "aprobado") },
      { label: "Rechazar", tono: "bad", run: () => NVApi.cambiarEstadoPedido(r.id, "rechazado") },
    ] : []),
  },

  { id: "recargas", grupo: "Ventas", label: "Recargas", icon: "💰", tipo: "tabla",
    titulo: "Recargas de billetera", sub: "Solicitudes de saldo y su aprobación.",
    cargar: async () => (await NVApi.adminDatos())?.recargas || [],
    columnas: [
      { k: "email", label: "Usuario", fmt: (r) => esc(r.email || "—") },
      { k: "monto", label: "Monto", fmt: (r) => money(r.monto) },
      { k: "metodo_pago", label: "Método", fmt: (r) => esc(r.metodo_pago || "—") },
      { k: "estado", label: "Estado", fmt: (r) => tag(r.estado) },
      { k: "creadoEn", label: "Fecha", fmt: (r) => fechaCorta(r.creadoEn) },
    ],
    acciones: (r) => (String(r.estado) === "pendiente" ? [
      { label: "Aprobar", tono: "ok", run: () => NVApi.aprobarRecarga(r.id) },
      { label: "Rechazar", tono: "bad", run: () => NVApi.rechazarRecarga(r.id) },
    ] : []),
  },

  { id: "suscripciones", grupo: "Ventas", label: "Suscripciones", icon: "🔑", tipo: "tabla",
    titulo: "Suscripciones", sub: "Suscripciones activas de tus clientes.",
    cargar: async () => (await NVApi.adminDatos())?.suscripciones || [],
    columnas: [
      { k: "nombre", label: "Cliente", fmt: (r) => esc(r.nombre || "—") },
      { k: "servicio", label: "Servicio", fmt: (r) => esc(r.servicio || "—") },
      { k: "perfil", label: "Perfil", fmt: (r) => esc(r.perfil || "—") },
      { k: "estado", label: "Estado", fmt: (r) => tag(r.estado) },
      { k: "precioVenta", label: "Precio", fmt: (r) => money(r.precioVenta) },
      { k: "vence", label: "Vence", fmt: (r) => fechaCorta(r.vence) },
    ],
  },

  { id: "usuarios", grupo: "Personas", label: "Usuarios", icon: "👤", tipo: "tabla",
    titulo: "Usuarios", sub: "Cuentas registradas. Puedes cambiar rol, saldo y % de comisión.",
    cargar: async () => (await NVApi.adminDatos())?.usuarios || [],
    columnas: [
      { k: "nombre", label: "Nombre", fmt: (r) => esc(r.nombre || "—") },
      { k: "email", label: "Email", fmt: (r) => esc(r.email || "—") },
      { k: "rol", label: "Rol", fmt: (r) => tag(r.rol) },
      { k: "saldoBilletera", label: "Saldo", fmt: (r) => money(r.saldoBilletera) },
    ],
    acciones: (r) => [{ label: "Editar", tono: "edit", run: null, form: {
      titulo: "Editar usuario · " + (r.nombre || r.email || r.id),
      campos: [
        { k: "rol", label: "Rol", tipo: "select", opciones: ["cliente", "revendedor", "admin"] },
        { k: "saldoBilletera", label: "Saldo billetera (USD)", tipo: "number" },
        { k: "comisionPct", label: "Comisión revendedor (0–1, ej. 0.25)", tipo: "number" },
      ],
      valores: { rol: r.rol, saldoBilletera: r.saldoBilletera },
      guardar: (d) => NVApi.adminActualizarUsuario(r.id, d),
    } }],
  },

  { id: "revendedores", grupo: "Personas", label: "Revendedores", icon: "🤝", tipo: "tabla",
    titulo: "Revendedores", sub: "Red de revendedores con sus referidos y comisiones reales.",
    cargar: () => NVApi.adminRevendedores(),
    vacio: "Aún no hay revendedores ni comisiones registradas.",
    columnas: [
      { k: "nombre", label: "Revendedor", fmt: (r) => esc(r.nombre || r.email || "—") },
      { k: "codigo", label: "Código", fmt: (r) => esc(r.codigo || "—") },
      { k: "clientes", label: "Clientes", fmt: (r) => r.clientes },
      { k: "ventas", label: "Ventas", fmt: (r) => r.ventas },
      { k: "comisionTotal", label: "Comisión total", fmt: (r) => money(r.comisionTotal) },
      { k: "pendiente", label: "Pendiente", fmt: (r) => money(r.pendiente) },
    ],
  },

  { id: "servicios", grupo: "Catálogo", label: "Servicios", icon: "🎬", tipo: "crud", adaptador: cms("servicios_sistema"),
    titulo: "Servicios", sub: "El catálogo que ven tus clientes.",
    resumen: (d) => `${esc(d.nombre_display || d.id_servicio || d.id)} · ${money(d.precio)}`,
    columnas: [
      { k: "nombre_display", label: "Nombre", fmt: (r) => esc(r.nombre_display || r.id_servicio) },
      { k: "categoria", label: "Categoría", fmt: (r) => esc(r.categoria || "—") },
      { k: "precio", label: "Precio", fmt: (r) => money(r.precio) },
      { k: "stock", label: "Stock", fmt: (r) => (r.stock ?? "—") },
      { k: "activo", label: "Activo", fmt: (r) => (r.activo === false ? "No" : "Sí") },
    ],
    campos: [
      { k: "id_servicio", label: "ID (slug, ej. netflix)", tipo: "text", req: true },
      { k: "nombre_display", label: "Nombre", tipo: "text", req: true },
      { k: "categoria", label: "Categoría", tipo: "select", opciones: CATS },
      { k: "descripcion", label: "Descripción", tipo: "textarea" },
      { k: "precio", label: "Precio USD", tipo: "number" },
      { k: "precio_rev", label: "Precio revendedor USD", tipo: "number" },
      { k: "stock", label: "Stock", tipo: "number" },
      { k: "tarjeta_url", label: "Imagen (URL)", tipo: "text" },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
      { k: "destacado", label: "Destacado", tipo: "bool" },
    ],
  },

  { id: "combos", grupo: "Catálogo", label: "Combos", icon: "📦", tipo: "crud", adaptador: cms("combos_suscripciones"),
    titulo: "Combos", sub: "Paquetes de varios servicios con descuento.",
    resumen: (d) => `${esc(d.nombre_combo)} · ${money(d.precio_publico_combo)}`,
    columnas: [
      { k: "nombre_combo", label: "Combo", fmt: (r) => esc(r.nombre_combo) },
      { k: "precio_publico_combo", label: "Precio público", fmt: (r) => money(r.precio_publico_combo) },
      { k: "activo", label: "Activo", fmt: (r) => (r.activo === false ? "No" : "Sí") },
    ],
    campos: [
      { k: "nombre_combo", label: "Nombre del combo", tipo: "text", req: true },
      { k: "descripcion", label: "Descripción", tipo: "textarea" },
      { k: "precio_publico_combo", label: "Precio público USD", tipo: "number" },
      { k: "precio_revendedor_combo", label: "Precio revendedor USD", tipo: "number" },
      { k: "servicios_included", label: "Servicios incluidos (separa con comas)", tipo: "tags" },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
    ],
  },

  { id: "categorias", grupo: "Catálogo", label: "Categorías", icon: "🏷️", tipo: "crud", adaptador: cms("plataformas"),
    titulo: "Categorías / Plataformas", sub: "Taxonomía real que agrupa tus servicios.",
    resumen: (d) => `${esc(d.nombre)} · ${esc(d.categoria || "")}`,
    columnas: [
      { k: "nombre", label: "Nombre", fmt: (r) => esc(r.nombre) },
      { k: "categoria", label: "Categoría", fmt: (r) => esc(r.categoria || "—") },
      { k: "orden", label: "Orden", fmt: (r) => (r.orden ?? "—") },
    ],
    campos: [
      { k: "nombre", label: "Nombre", tipo: "text", req: true },
      { k: "categoria", label: "Categoría", tipo: "select", opciones: CATS },
      { k: "orden", label: "Orden", tipo: "number" },
    ],
  },

  { id: "metodos", grupo: "Catálogo", label: "Métodos de pago", icon: "💳", tipo: "crud", adaptador: cms("metodos_pago_config"),
    titulo: "Métodos de pago", sub: "Cuentas y pasarelas donde recibes pagos.",
    resumen: (d) => `${esc(d.tipo_banco || d.id_pago)} · ${esc(d.titular || "")}`,
    columnas: [
      { k: "tipo_banco", label: "Nombre / Banco", fmt: (r) => esc(r.tipo_banco || r.tipo || "—") },
      { k: "titular", label: "Titular", fmt: (r) => esc(r.titular || "—") },
      { k: "telefono_pago", label: "Teléfono", fmt: (r) => esc(r.telefono_pago || "—") },
      { k: "estado_activo", label: "Activo", fmt: (r) => (r.estado_activo === false ? "No" : "Sí") },
    ],
    campos: [
      { k: "id_pago", label: "ID (ej. pago_movil_bdv)", tipo: "text", req: true },
      { k: "tipo_banco", label: "Nombre / Banco", tipo: "text", req: true },
      { k: "titular", label: "Titular", tipo: "text" },
      { k: "documento_identidad", label: "Cédula / RIF", tipo: "text" },
      { k: "telefono_pago", label: "Teléfono", tipo: "text" },
      { k: "correo_zelle", label: "Correo Zelle", tipo: "text" },
      { k: "correo_binance", label: "Binance", tipo: "text" },
      { k: "instrucciones", label: "Instrucciones", tipo: "textarea" },
      { k: "orden", label: "Orden", tipo: "number" },
      { k: "estado_activo", label: "Activo", tipo: "bool", def: true },
    ],
  },

  { id: "cartelera", grupo: "Catálogo", label: "Cartelera", icon: "🎞️", tipo: "crud", adaptador: cms("carteleras_estrenos"),
    titulo: "Cartelera / Estrenos", sub: "Banners de estrenos y novedades.",
    resumen: (d) => `${esc(d.titulo_banner || d.id_estreno)} · ${esc(d.plataforma || "")}`,
    columnas: [
      { k: "titulo_banner", label: "Título", fmt: (r) => esc(r.titulo_banner) },
      { k: "plataforma", label: "Plataforma", fmt: (r) => esc(r.plataforma || "—") },
      { k: "activo", label: "Activo", fmt: (r) => (r.activo === false ? "No" : "Sí") },
    ],
    campos: [
      { k: "id_estreno", label: "ID (ej. estreno_001)", tipo: "text", req: true },
      { k: "titulo_banner", label: "Título", tipo: "text", req: true },
      { k: "plataforma", label: "Plataforma", tipo: "text" },
      { k: "llamado_accion", label: "Texto del botón (CTA)", tipo: "text" },
      { k: "imagen_background", label: "Imagen de fondo (URL)", tipo: "text" },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
    ],
  },

  { id: "ofertas", grupo: "Catálogo", label: "Ofertas", icon: "🔥", tipo: "crud", adaptador: cms("ofertas"),
    titulo: "Ofertas", sub: "Descuentos y promociones destacadas.",
    resumen: (d) => `${esc(d.nombre)} · -${d.descuento_pct || 0}%`,
    columnas: [
      { k: "nombre", label: "Oferta", fmt: (r) => esc(r.nombre) },
      { k: "descuento_pct", label: "Descuento", fmt: (r) => (r.descuento_pct || 0) + "%" },
      { k: "precio_oferta", label: "Precio oferta", fmt: (r) => money(r.precio_oferta) },
      { k: "activo", label: "Activa", fmt: (r) => (r.activo === false ? "No" : "Sí") },
    ],
    campos: [
      { k: "id_servicio", label: "ID del servicio", tipo: "text", req: true },
      { k: "nombre", label: "Nombre", tipo: "text", req: true },
      { k: "etiqueta", label: "Etiqueta", tipo: "text", def: "OFERTA" },
      { k: "descuento_pct", label: "Descuento %", tipo: "number" },
      { k: "precio_normal", label: "Precio normal USD", tipo: "number" },
      { k: "precio_oferta", label: "Precio oferta USD", tipo: "number" },
      { k: "orden", label: "Orden", tipo: "number" },
      { k: "activo", label: "Activa", tipo: "bool", def: true },
    ],
  },

  { id: "faqs", grupo: "Catálogo", label: "FAQs", icon: "❓", tipo: "crud", adaptador: cms("preguntas_frecuentes"),
    titulo: "Preguntas frecuentes", sub: "Las FAQs que se muestran en la tienda.",
    resumen: (d) => esc(d.pregunta),
    columnas: [
      { k: "pregunta", label: "Pregunta", fmt: (r) => esc(r.pregunta) },
      { k: "orden", label: "Orden", fmt: (r) => (r.orden ?? "—") },
    ],
    campos: [
      { k: "pregunta", label: "Pregunta", tipo: "text", req: true },
      { k: "respuesta", label: "Respuesta", tipo: "textarea", req: true },
      { k: "orden", label: "Orden", tipo: "number" },
    ],
  },

  { id: "inventario", grupo: "Operaciones", label: "Inventario", icon: "🗄️", tipo: "crud", adaptador: cuentasAdaptador,
    titulo: "Inventario de cuentas", sub: "Stock real de cuentas de streaming para aprovisionar.",
    resumen: (d) => `${esc(d.plataforma_id)} · ${esc(d.correo)} · ${esc(d.perfil || "")}`,
    columnas: [
      { k: "plataforma_id", label: "Plataforma", fmt: (r) => esc(r.plataforma_id) },
      { k: "correo", label: "Correo", fmt: (r) => esc(r.correo) },
      { k: "perfil", label: "Perfil", fmt: (r) => esc(r.perfil || "—") },
      { k: "estado", label: "Estado", fmt: (r) => tag(r.estado) },
    ],
    campos: [
      { k: "plataforma_id", label: "Plataforma (ej. netflix)", tipo: "text", req: true },
      { k: "correo", label: "Correo de la cuenta", tipo: "text", req: true },
      { k: "contrasena", label: "Contraseña", tipo: "text", req: true, soloNuevo: true },
      { k: "perfil", label: "Perfil (ej. P1)", tipo: "text" },
      { k: "pin", label: "PIN", tipo: "text" },
    ],
    sinEditar: true, // el backend no expone editar credenciales cifradas; crea/borra
  },

  { id: "planes", grupo: "Operaciones", label: "Planes", icon: "📋", tipo: "crud", adaptador: planesAdaptador,
    titulo: "Planes", sub: "Planes de precio/duración por plataforma.",
    resumen: (d) => `${esc(d.plataforma_id)} · ${esc(d.nombre)} · ${money(d.precio)}`,
    columnas: [
      { k: "plataforma_id", label: "Plataforma", fmt: (r) => esc(r.plataforma_id) },
      { k: "nombre", label: "Plan", fmt: (r) => esc(r.nombre) },
      { k: "precio", label: "Precio", fmt: (r) => money(r.precio) },
      { k: "duracion_dias", label: "Días", fmt: (r) => r.duracion_dias },
      { k: "activo", label: "Activo", fmt: (r) => (r.activo === false ? "No" : "Sí") },
    ],
    campos: [
      { k: "plataforma_id", label: "Plataforma (ej. netflix)", tipo: "text", req: true },
      { k: "nombre", label: "Nombre del plan", tipo: "text", req: true },
      { k: "precio", label: "Precio USD", tipo: "number", req: true },
      { k: "duracion_dias", label: "Duración (días)", tipo: "number", req: true, def: 30 },
      { k: "activo", label: "Activo", tipo: "bool", def: true },
    ],
  },

  { id: "config", grupo: "Sistema", label: "Configuración", icon: "⚙️", tipo: "config",
    titulo: "Configuración del negocio", sub: "Datos generales de tu tienda.",
    coleccion: "configuracion_sistema",
    campos: [
      { k: "empresa", label: "Nombre de la empresa", tipo: "text" },
      { k: "whatsapp", label: "WhatsApp de soporte", tipo: "text" },
      { k: "tasa_bcv", label: "Tasa BCV (Bs por USD)", tipo: "number" },
      { k: "moneda_base", label: "Moneda base", tipo: "text" },
      { k: "garantia_dias", label: "Garantía (días)", tipo: "number" },
    ],
  },

  { id: "editor", grupo: "Sistema", label: "Editor visual", icon: "🎨", tipo: "link", url: "editor.html" },
];

const porId = (id) => SECCIONES.find((s) => s.id === id);

/* ─────────────────────────────  ESTILOS  ───────────────────────────── */
function inyectarEstilos() {
  if (document.getElementById("nv-adm-css")) return;
  const s = el("style"); s.id = "nv-adm-css";
  s.textContent = `
  #nv-adm{position:fixed;inset:0;display:flex;background:#04040C;color:#EEF2FF;font-family:'DM Sans',system-ui,sans-serif;z-index:10;}
  #nv-adm *{box-sizing:border-box;}
  .nv-adm-side{width:236px;flex-shrink:0;height:100%;overflow-y:auto;border-right:1px solid rgba(80,100,200,0.14);background:#06061A;padding:14px 10px 30px;}
  .nv-adm-brand{display:flex;align-items:center;gap:10px;padding:8px 10px 16px;}
  .nv-adm-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(150deg,#16205e,#0a0a22 55%,#241046);border:1px solid rgba(110,130,255,0.28);display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;background-clip:text;color:#9fe9ff;}
  .nv-adm-brand b{font-family:'Syne',sans-serif;font-size:15px;letter-spacing:0.02em;}
  .nv-adm-brand span{display:block;font-size:8.5px;letter-spacing:0.18em;color:rgba(0,207,255,0.55);}
  .nv-adm-grp{font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(160,185,240,0.38);padding:14px 12px 6px;}
  .nv-adm-nav{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 12px;border-radius:9px;border:1px solid transparent;background:transparent;color:rgba(230,236,255,0.72);font-size:13.5px;cursor:pointer;font-family:inherit;}
  .nv-adm-nav:hover{background:rgba(255,255,255,0.04);color:#fff;}
  .nv-adm-nav.on{background:rgba(0,207,255,0.1);border-color:rgba(0,207,255,0.25);color:#EAF6FF;}
  .nv-adm-nav .ic{width:20px;text-align:center;}
  .nv-adm-main{flex:1;height:100%;overflow-y:auto;padding:26px 30px 60px;}
  .nv-adm-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px;}
  .nv-adm-h{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;letter-spacing:-0.01em;}
  .nv-adm-sub{font-size:13px;color:rgba(200,215,255,0.5);margin-top:3px;}
  .nv-adm-btn{border:1px solid rgba(0,207,255,0.3);background:rgba(0,207,255,0.1);color:#9fe9ff;border-radius:9px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
  .nv-adm-btn:hover{background:rgba(0,207,255,0.18);}
  .nv-adm-btn.primary{background:linear-gradient(135deg,#0A3AAE,#1A8FFF);border:none;color:#fff;}
  .nv-adm-idpill{display:flex;align-items:center;gap:8px;font-size:12.5px;color:rgba(200,215,255,0.65);border:1px solid rgba(80,100,200,0.2);border-radius:100px;padding:6px 12px;}
  .nv-adm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;}
  .nv-adm-kpi{background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:13px;padding:15px 16px;}
  .nv-adm-kpi .l{font-size:10.5px;letter-spacing:0.07em;text-transform:uppercase;color:rgba(200,215,255,0.5);}
  .nv-adm-kpi .v{font-family:'Syne',sans-serif;font-size:25px;font-weight:800;margin-top:6px;}
  .nv-adm-grid2{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px;}
  @media(max-width:900px){.nv-adm-grid2{grid-template-columns:1fr;}}
  .nv-adm-card{background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:14px;padding:16px 18px;}
  .nv-adm-card h4{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;margin-bottom:14px;}
  .nv-adm-bars{display:flex;align-items:flex-end;gap:5px;height:140px;}
  .nv-adm-bar{flex:1;background:linear-gradient(180deg,#00CFFF,#5510BB);border-radius:4px 4px 0 0;min-height:2px;opacity:0.9;}
  .nv-adm-tblwrap{background:#0A0A22;border:1px solid rgba(80,100,200,0.16);border-radius:14px;overflow:hidden;}
  table.nv-adm-tbl{width:100%;border-collapse:collapse;font-size:13px;}
  .nv-adm-tbl th{text-align:left;padding:11px 16px;font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(200,215,255,0.4);border-bottom:1px solid rgba(80,100,200,0.16);}
  .nv-adm-tbl td{padding:11px 16px;border-bottom:1px solid rgba(80,100,200,0.08);color:rgba(230,236,255,0.85);}
  .nv-adm-tbl tr:last-child td{border-bottom:0;}
  .nv-adm-tbl tr:hover td{background:rgba(255,255,255,0.02);}
  .nv-adm-tag{font-size:11px;padding:2px 9px;border-radius:100px;border:1px solid;font-weight:600;white-space:nowrap;}
  .nv-adm-rowbtn{border:1px solid rgba(80,100,200,0.25);background:rgba(255,255,255,0.03);color:rgba(230,236,255,0.8);border-radius:7px;padding:5px 11px;font-size:12px;cursor:pointer;font-family:inherit;margin-left:6px;}
  .nv-adm-rowbtn.ok{color:#00E6A8;border-color:rgba(0,230,168,0.3);}
  .nv-adm-rowbtn.bad{color:#FF7A93;border-color:rgba(255,122,147,0.3);}
  .nv-adm-rowbtn:hover{background:rgba(255,255,255,0.08);}
  .nv-adm-empty{padding:40px 20px;text-align:center;color:rgba(200,215,255,0.45);font-size:13.5px;}
  .nv-adm-load{padding:40px 20px;text-align:center;color:rgba(200,215,255,0.4);font-size:13px;}
  .nv-adm-ov{position:fixed;inset:0;background:rgba(2,3,12,0.72);backdrop-filter:blur(4px);z-index:99991;display:flex;align-items:flex-start;justify-content:center;padding:52px 16px;overflow:auto;}
  .nv-adm-modal{width:min(520px,100%);background:#0A0A22;border:1px solid rgba(0,207,255,0.2);border-radius:16px;box-shadow:0 30px 90px rgba(0,0,30,0.7);}
  .nv-adm-mhead{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(80,100,200,0.16);font-family:'Syne',sans-serif;font-weight:700;}
  .nv-adm-mx{background:transparent;border:0;color:rgba(230,236,255,0.6);font-size:20px;cursor:pointer;}
  .nv-adm-mbody{padding:16px 20px;display:flex;flex-direction:column;gap:12px;max-height:60vh;overflow:auto;}
  .nv-adm-f{display:flex;flex-direction:column;gap:5px;}
  .nv-adm-f span{font-size:12px;color:rgba(200,215,255,0.6);}
  .nv-adm-f input,.nv-adm-f select,.nv-adm-f textarea{background:rgba(255,255,255,0.04);border:1px solid rgba(80,100,200,0.24);border-radius:8px;padding:9px 11px;color:#EAF3FF;font-size:13.5px;font-family:inherit;}
  .nv-adm-f textarea{min-height:70px;resize:vertical;}
  .nv-adm-check{display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(230,236,255,0.85);}
  .nv-adm-mfoot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid rgba(80,100,200,0.16);}
  .nv-adm-ghost{background:rgba(255,255,255,0.05);border:1px solid rgba(80,100,200,0.24);color:rgba(230,236,255,0.8);border-radius:9px;padding:9px 15px;font-size:13px;cursor:pointer;font-family:inherit;}
  .nv-adm-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(80,100,200,0.1);font-size:13px;}
  .nv-adm-row:last-child{border-bottom:0;}
  `;
  document.head.appendChild(s);
}

/* ─────────────────────────  FORMULARIO (MODAL)  ───────────────────────── */
function campoHTML(c, val) {
  const id = "nvf_" + c.k;
  const v = c.tipo === "tags" && Array.isArray(val) ? val.join(", ") : (val != null ? val : (c.def != null ? c.def : ""));
  if (c.tipo === "bool") return `<label class="nv-adm-check"><input type="checkbox" id="${id}" ${val === undefined ? (c.def ? "checked" : "") : (val ? "checked" : "")}> ${esc(c.label)}</label>`;
  if (c.tipo === "select") return `<label class="nv-adm-f"><span>${esc(c.label)}</span><select id="${id}">${c.opciones.map((o) => `<option ${String(o) === String(val) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  if (c.tipo === "textarea") return `<label class="nv-adm-f"><span>${esc(c.label)}${c.req ? " *" : ""}</span><textarea id="${id}">${esc(v)}</textarea></label>`;
  const t = c.tipo === "number" ? "number" : "text";
  return `<label class="nv-adm-f"><span>${esc(c.label)}${c.req ? " *" : ""}</span><input type="${t}" id="${id}" value="${esc(v)}" step="any"></label>`;
}
function leerCampo(c) {
  const n = document.getElementById("nvf_" + c.k);
  if (!n) return undefined;
  if (c.tipo === "bool") return n.checked;
  if (c.tipo === "number") { if (n.value.trim() === "") return undefined; const x = parseFloat(n.value); return isNaN(x) ? 0 : x; }
  if (c.tipo === "tags") return n.value.split(",").map((s) => s.trim()).filter(Boolean);
  return n.value.trim();
}
function abrirForm({ titulo, campos, valores, onGuardar }) {
  const ov = el("div", "nv-adm-ov");
  ov.innerHTML = `<div class="nv-adm-modal">
    <div class="nv-adm-mhead"><span>${esc(titulo)}</span><button class="nv-adm-mx" data-x>✕</button></div>
    <div class="nv-adm-mbody">${campos.map((c) => campoHTML(c, valores ? valores[c.k] : undefined)).join("")}</div>
    <div class="nv-adm-mfoot"><button class="nv-adm-ghost" data-x>Cancelar</button><button class="nv-adm-btn primary" data-save>Guardar</button></div>
  </div>`;
  document.body.appendChild(ov);
  const cerrar = () => ov.remove();
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-x]")) cerrar(); });
  ov.querySelector("[data-save]").addEventListener("click", async () => {
    const datos = {};
    for (const c of campos) { const v = leerCampo(c); if (v !== undefined) datos[c.k] = v; }
    const faltan = campos.filter((c) => c.req && (datos[c.k] === undefined || datos[c.k] === "" || (Array.isArray(datos[c.k]) && !datos[c.k].length)));
    if (faltan.length) { toast("Completa: " + faltan.map((c) => c.label).join(", "), "rgba(255,176,32,0.5)"); return; }
    const btn = ov.querySelector("[data-save]"); btn.disabled = true; btn.textContent = "Guardando…";
    try { await onGuardar(datos); toast("Guardado ✓", OK); cerrar(); }
    catch (e) { btn.disabled = false; btn.textContent = "Guardar"; if (window.NVUI && window.NVUI.error) window.NVUI.error("No se pudo guardar", (e && e.message) || "Revisa la conexión o los permisos."); else toast("Error al guardar", BAD); }
  });
}

/* ─────────────────────────────  ESTADO  ───────────────────────────── */
let root = null, main = null, actual = "dashboard";

function pintarSidebar(side) {
  const grupos = [];
  for (const s of SECCIONES) { if (!grupos.includes(s.grupo)) grupos.push(s.grupo); }
  side.innerHTML = `<div class="nv-adm-brand"><div class="nv-adm-logo">NV</div><div><b>Back Office</b><span>NV STREAMING</span></div></div>`;
  for (const g of grupos) {
    side.appendChild(el("div", "nv-adm-grp", esc(g)));
    for (const s of SECCIONES.filter((x) => x.grupo === g)) {
      const b = el("button", "nv-adm-nav" + (s.id === actual ? " on" : ""), `<span class="ic">${s.icon}</span><span>${esc(s.label)}</span>`);
      b.setAttribute("data-sec", s.id);
      b.addEventListener("click", () => ir(s.id));
      side.appendChild(b);
    }
  }
  const pie = el("a", "nv-adm-nav", `<span class="ic">↩</span><span>Ver tienda</span>`);
  pie.href = "index.html"; pie.style.marginTop = "18px"; pie.style.textDecoration = "none";
  side.appendChild(pie);
}

function ir(id) {
  const s = porId(id); if (!s) return;
  if (s.tipo === "link") { window.location.href = s.url; return; }
  actual = id;
  try { location.hash = "#" + id; } catch (_) {}
  root.querySelectorAll(".nv-adm-nav").forEach((n) => n.classList.toggle("on", n.getAttribute("data-sec") === id));
  render(s);
}

/* ─────────────────────────────  RENDER SECCIÓN  ───────────────────────────── */
async function render(s) {
  main.scrollTop = 0;
  main.innerHTML = `<div class="nv-adm-top"><div><div class="nv-adm-h">${esc(s.titulo || s.label)}</div><div class="nv-adm-sub">${esc(s.sub || "")}</div></div><div data-acc></div></div><div class="nv-adm-load">Cargando datos reales…</div>`;
  try {
    if (s.tipo === "dashboard") return await renderDashboard();
    if (s.tipo === "config") return await renderConfig(s);
    if (s.tipo === "crud") return await renderCrud(s);
    if (s.tipo === "tabla") return await renderTabla(s);
  } catch (e) {
    main.querySelector(".nv-adm-load")?.remove();
    main.appendChild(el("div", "nv-adm-empty", "No se pudieron cargar los datos: " + esc((e && e.message) || "error") + ". Verifica la conexión con el backend."));
  }
}

async function renderDashboard() {
  let o = Store.get("adminOverview");
  if (!o) { try { o = await NVApi.adminOverview(); if (o) Store.set("adminOverview", o); } catch (_) {} }
  if (actual !== "dashboard") return; // navegó a otra sección durante la carga
  main.querySelector(".nv-adm-load")?.remove();
  if (!o) { main.appendChild(el("div", "nv-adm-empty", "Sin datos de negocio todavía.")); return; }
  const k = o.kpis || {};
  const kpi = (l, v) => `<div class="nv-adm-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const serie = Array.isArray(o.serie) ? o.serie : [];
  const maxV = Math.max(1, ...serie.map((x) => x.ventas));
  const bars = serie.map((x) => `<div class="nv-adm-bar" style="height:${Math.round((x.ventas / maxV) * 100)}%" title="${x.dia}: ${money(x.ventas)}"></div>`).join("");
  const top = (o.topServicios || []).map((t) => `<div class="nv-adm-row"><span>${esc(t.servicio)}</span><b>${money(t.ingresos)}</b></div>`).join("") || `<div class="nv-adm-empty" style="padding:10px 0;">Sin ventas todavía.</div>`;
  const roles = (o.roles || []).map((r) => `<div class="nv-adm-row"><span>${esc(r.rol)}</span><b>${r.total}</b></div>`).join("") || `<div class="nv-adm-empty" style="padding:10px 0;">Sin usuarios.</div>`;
  const act = (o.actividad || []).map((a) => `<div class="nv-adm-row"><span>${esc(a.actor)} · ${esc(a.accion)}</span><span style="color:rgba(200,215,255,0.4);font-size:11.5px;">${esc(a.estado)} · ${haceCuanto(a.cuando)}</span></div>`).join("") || `<div class="nv-adm-empty" style="padding:10px 0;">Sin actividad reciente.</div>`;
  const cont = el("div", null, `
    <div class="nv-adm-kpis">
      ${kpi("Ventas aprobadas", money(k.ventasAprobadas))}
      ${kpi("Pedidos pendientes", k.pedidosPendientes || 0)}
      ${kpi("Usuarios", k.usuarios || 0)}
      ${kpi("Suscripciones activas", k.suscripcionesActivas || 0)}
      ${kpi("Recargas pendientes", k.recargasPendientes || 0)}
      ${kpi("Cuentas en stock", k.cuentasStock || 0)}
      ${kpi("Planes", k.planes || 0)}
    </div>
    <div class="nv-adm-grid2">
      <div class="nv-adm-card"><h4>Ventas · últimos 14 días</h4><div class="nv-adm-bars">${bars}</div></div>
      <div class="nv-adm-card"><h4>Top servicios por ingresos</h4>${top}</div>
    </div>
    <div class="nv-adm-grid2">
      <div class="nv-adm-card"><h4>Actividad reciente</h4>${act}</div>
      <div class="nv-adm-card"><h4>Roles de usuarios</h4>${roles}</div>
    </div>`);
  main.appendChild(cont);
}

function tablaHTML(s, filas) {
  if (!filas.length) return `<div class="nv-adm-tblwrap"><div class="nv-adm-empty">${esc(s.vacio || "Aún no hay registros aquí.")}</div></div>`;
  const conAcc = typeof s.acciones === "function" || s.tipo === "crud";
  const th = s.columnas.map((c) => `<th>${esc(c.label)}</th>`).join("") + (conAcc ? "<th></th>" : "");
  const rows = filas.map((r, i) => {
    const tds = s.columnas.map((c) => `<td>${c.fmt ? c.fmt(r) : esc(r[c.k])}</td>`).join("");
    let acc = "";
    if (conAcc) {
      const btns = [];
      if (s.tipo === "crud") {
        if (!s.sinEditar) btns.push(`<button class="nv-adm-rowbtn" data-edit="${i}">Editar</button>`);
        btns.push(`<button class="nv-adm-rowbtn bad" data-del="${i}">Borrar</button>`);
      } else if (typeof s.acciones === "function") {
        (s.acciones(r) || []).forEach((a, j) => btns.push(`<button class="nv-adm-rowbtn ${a.tono || ""}" data-act="${i}:${j}">${esc(a.label)}</button>`));
      }
      acc = `<td style="text-align:right;white-space:nowrap;">${btns.join("")}</td>`;
    }
    return `<tr>${tds}${acc}</tr>`;
  }).join("");
  return `<div class="nv-adm-tblwrap"><table class="nv-adm-tbl"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderTabla(s) {
  const filas = (await s.cargar()) || [];
  if (actual !== s.id) return;
  main.querySelector(".nv-adm-load")?.remove();
  const wrap = el("div"); wrap.innerHTML = tablaHTML(s, filas);
  main.appendChild(wrap);
  // acciones de fila
  wrap.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const [i, j] = b.getAttribute("data-act").split(":").map(Number);
    const a = (s.acciones(filas[i]) || [])[j]; if (!a) return;
    if (a.form) { return abrirForm({ titulo: a.form.titulo, campos: a.form.campos, valores: a.form.valores, onGuardar: async (d) => { await a.form.guardar(d); ir(s.id); } }); }
    b.disabled = true; b.textContent = "…";
    try { await a.run(); toast("Hecho ✓", OK); Store.set("adminOverview", null); ir(s.id); }
    catch (e) { b.disabled = false; toast((e && e.message) || "Error", BAD); }
  }));
}

async function renderCrud(s) {
  const ad = s.adaptador;
  const filas = (await ad.listar()) || [];
  if (actual !== s.id) return;
  main.querySelector(".nv-adm-load")?.remove();
  // botón "Nuevo" en la barra de acciones
  const acc = main.querySelector("[data-acc]");
  if (acc) { const b = el("button", "nv-adm-btn primary", "＋ Nuevo"); b.addEventListener("click", () => formularioCrud(s, null)); acc.appendChild(b); }
  const wrap = el("div"); wrap.innerHTML = tablaHTML(s, filas);
  main.appendChild(wrap);
  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => formularioCrud(s, filas[Number(b.getAttribute("data-edit"))])));
  wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const item = filas[Number(b.getAttribute("data-del"))];
    const ok = await confirmar("Borrar", `¿Eliminar "${(s.resumen ? s.resumen(item) : item[ad.idKey])}"? No se puede deshacer.`, "Sí, borrar");
    if (!ok) return;
    try { await ad.borrar(item[ad.idKey] || item._id); toast("Borrado ✓", BAD); ir(s.id); }
    catch (e) { toast((e && e.message) || "Error al borrar", BAD); }
  }));
}

function formularioCrud(s, item) {
  const ad = s.adaptador;
  const editando = !!item;
  const campos = s.campos.filter((c) => !(editando && c.soloNuevo));
  abrirForm({
    titulo: (editando ? "Editar · " : "Nuevo · ") + s.label,
    campos, valores: item || undefined,
    onGuardar: async (datos) => {
      if (editando) await ad.actualizar(item[ad.idKey] || item._id, datos);
      else await ad.crear(datos);
      ir(s.id);
    },
  });
}

async function renderConfig(s) {
  const docs = (await NVApi.coleccion(s.coleccion)) || [];
  if (actual !== s.id) return;
  // Elige el documento de negocio (el que tenga 'empresa' o 'tasa_bcv').
  const doc = docs.find((d) => "empresa" in d || "tasa_bcv" in d) || docs[0] || { id: "general" };
  main.querySelector(".nv-adm-load")?.remove();
  const card = el("div", "nv-adm-card");
  card.style.maxWidth = "560px";
  card.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;">${s.campos.map((c) => campoHTML(c, doc[c.k])).join("")}</div>
    <div style="margin-top:16px;text-align:right;"><button class="nv-adm-btn primary" data-save>Guardar cambios</button></div>`;
  main.appendChild(card);
  card.querySelector("[data-save]").addEventListener("click", async () => {
    const datos = {};
    for (const c of s.campos) { const v = leerCampo(c); if (v !== undefined) datos[c.k] = v; }
    const btn = card.querySelector("[data-save]"); btn.disabled = true; btn.textContent = "Guardando…";
    try { await NVApi.guardarDoc(s.coleccion, doc.id || "general", { ...doc, ...datos }); toast("Configuración guardada ✓", OK); btn.disabled = false; btn.textContent = "Guardar cambios"; }
    catch (e) { btn.disabled = false; btn.textContent = "Guardar cambios"; if (window.NVUI && window.NVUI.error) window.NVUI.error("No se pudo guardar", (e && e.message) || "Revisa la conexión."); }
  });
}

/* ─────────────────────────────  MONTAJE  ───────────────────────────── */
function montar() {
  if (document.getElementById("nv-adm")) return;
  inyectarEstilos();
  root = el("div"); root.id = "nv-adm"; root.setAttribute("data-nv-ux", "1");
  const side = el("aside", "nv-adm-side");
  main = el("main", "nv-adm-main");
  root.appendChild(side); root.appendChild(main);
  document.body.appendChild(root);
  const boot = document.getElementById("nv-adm-boot"); if (boot) boot.remove();
  pintarSidebar(side);
  // sección inicial desde el hash
  const h = (location.hash || "").replace("#", "");
  if (h && porId(h) && porId(h).tipo !== "link") actual = h;
  ir(actual);
}

export function instalarAdminApp() {
  const esAdmin = (typeof window !== "undefined") && ((window.__NV_PAGE || (document.body && document.body.getAttribute("data-nv-page"))) === "admin");
  if (!esAdmin || window.__NV_ADMIN_APP) return;
  window.__NV_ADMIN_APP = true;
  const arranca = () => montar();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arranca);
  else arranca();
}

export default { instalarAdminApp };
