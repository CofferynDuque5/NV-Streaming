/**
 * seed.js — Dataset canónico de NV Streaming.
 *
 * Refleja textualmente el esquema de las 24 colecciones auditadas en PostgreSQL
 * (ver BLUEPRINT_NV_STREAMING_ADMIN.md). Cumple dos funciones:
 *
 *   1. COMPLETAR LA BASE DE DATOS — el seeder (js/seeder.js) empuja estos
 *      documentos a PostgreSQL para poblar las colecciones que faltaban.
 *   2. FALLBACK OFFLINE — si PostgreSQL está vacío o no hay red, los servicios
 *      leen de aquí, de modo que la interfaz nunca queda con placeholders
 *      estáticos ni tablas vacías.
 *
 * Las imágenes apuntan a `assets/` locales para que todo renderice sin red.
 * Nombres de campo y tipos son idénticos a los del backend real.
 */

// Timestamps deterministas (evitan Date.now() y mantienen el seed reproducible).
const T = (iso) => new Date(iso);
const AHORA = T("2026-06-16T12:00:00Z");

/* ────────────────────────────  SERVICIOS  ──────────────────────────── */
// Colección maestra `servicios_sistema`. `id_servicio` es la clave de negocio.
export const SERVICIOS = [
  {
    _id: "svc_netflix", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Cuenta original · Suscripción mensual",
    destacado: true, en_oferta: false, id_servicio: "netflix",
    logo_url: "assets/t-netflix.png", nombre_display: "Netflix", nuevo: false,
    orden: 1, precio: 5, precio_rev: 4,
    tags: ["netflix"], tarjeta_url: "assets/card-netflix.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_disney", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Sin ESPN · Suscripción mensual",
    destacado: true, en_oferta: false, id_servicio: "disney",
    logo_url: "assets/t-disney.png", nombre_display: "Disney+", nuevo: false,
    orden: 2, precio: 3, precio_rev: 3,
    tags: ["disney","disney+","disney plus"], tarjeta_url: "assets/card-disney.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_disney_espn", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Con ESPN · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "disney_espn",
    logo_url: "assets/t-disney.png", nombre_display: "Disney+ con ESPN", nuevo: false,
    orden: 3, precio: 3.5, precio_rev: 3,
    tags: ["disney espn","espn"], tarjeta_url: "assets/card-disney.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_prime", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Amazon Prime Video · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "prime",
    logo_url: "", nombre_display: "Prime Video", nuevo: false,
    orden: 4, precio: 2, precio_rev: 2,
    tags: ["prime","prime video","amazon"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_max", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "HBO Max · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "max",
    logo_url: "assets/t-hbo.png", nombre_display: "HBO Max", nuevo: false,
    orden: 5, precio: 3, precio_rev: 2.7,
    tags: ["max","hbo","hbo max"], tarjeta_url: "assets/card-hbo.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_paramount", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Paramount+ · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "paramount",
    logo_url: "assets/t-paramount.png", nombre_display: "Paramount+", nuevo: false,
    orden: 6, precio: 2, precio_rev: 2,
    tags: ["paramount","paramount+"], tarjeta_url: "assets/card-paramount.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_crunchyroll", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Anime · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "crunchyroll",
    logo_url: "assets/t-crunchyroll.png", nombre_display: "Crunchyroll", nuevo: false,
    orden: 7, precio: 2, precio_rev: 1.5,
    tags: ["crunchyroll","anime"], tarjeta_url: "assets/card-crunchyroll.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_flujotv", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "TV en vivo · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "flujotv",
    logo_url: "assets/t-flujo.png", nombre_display: "FlujoTV", nuevo: false,
    orden: 8, precio: 3, precio_rev: 2.5,
    tags: ["flujo","flujotv","flujo tv","iptv"], tarjeta_url: "assets/card-flujo.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_telelatino", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "TV en vivo · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "telelatino",
    logo_url: "", nombre_display: "Telelatino", nuevo: false,
    orden: 9, precio: 3, precio_rev: 2.5,
    tags: ["telelatino","tele latino","iptv"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_plex", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Plex · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "plex",
    logo_url: "", nombre_display: "Plex", nuevo: false,
    orden: 10, precio: 2, precio_rev: 2,
    tags: ["plex"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_appletv", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Apple TV+ · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "appletv",
    logo_url: "assets/t-appletv.png", nombre_display: "AppleTV", nuevo: false,
    orden: 11, precio: 3, precio_rev: 2.7,
    tags: ["apple","apple tv","appletv"], tarjeta_url: "assets/card-appletv.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_vix", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "ViX Premium · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "vix",
    logo_url: "assets/t-vix.png", nombre_display: "Vix Premium", nuevo: false,
    orden: 12, precio: 2, precio_rev: 1.5,
    tags: ["vix","vix premium"], tarjeta_url: "assets/card-vix.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_rakuten", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Rakuten Viki · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "rakuten",
    logo_url: "", nombre_display: "Rakuten Viki", nuevo: false,
    orden: 13, precio: 3, precio_rev: 2,
    tags: ["rakuten","viki","rakuten viki","doramas"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_youtube", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-09-15"), descripcion: "Sin anuncios + YouTube Music · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "youtube",
    logo_url: "assets/t-youtube.png", nombre_display: "YouTube Premium", nuevo: false,
    orden: 14, precio: 3, precio_rev: 2.7,
    tags: ["youtube","youtube premium","youtube music"], tarjeta_url: "assets/card-youtube.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_spotify", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-09-15"), descripcion: "Premium · Suscripción mensual",
    destacado: true, en_oferta: false, id_servicio: "spotify",
    logo_url: "assets/t-spotify.png", nombre_display: "Spotify Premium", nuevo: false,
    orden: 15, precio: 3.5, precio_rev: 3.5,
    tags: ["spotify","música","musica"], tarjeta_url: "assets/card-spotify.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_deezer", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-09-15"), descripcion: "Premium · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "deezer",
    logo_url: "assets/t-deezer.png", nombre_display: "Deezer Premium", nuevo: false,
    orden: 16, precio: 3, precio_rev: 3,
    tags: ["deezer"], tarjeta_url: "assets/card-deezer.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_tidal", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-09-15"), descripcion: "HiFi · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "tidal",
    logo_url: "assets/t-tidal.png", nombre_display: "Tidal", nuevo: false,
    orden: 17, precio: 3, precio_rev: 3,
    tags: ["tidal","hifi"], tarjeta_url: "assets/card-tidal.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_canva", activo: true, categoria: "SOFTWARE", mundo: "software",
    creadoEn: T("2026-09-15"), descripcion: "Canva Pro · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "canva",
    logo_url: "", nombre_display: "Canva Pro", nuevo: false,
    orden: 18, precio: 3.5, precio_rev: 2.7,
    tags: ["canva","canva pro","diseño"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_capcut", activo: true, categoria: "SOFTWARE", mundo: "software",
    creadoEn: T("2026-09-15"), descripcion: "CapCut Pro · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "capcut",
    logo_url: "", nombre_display: "CapCut Pro", nuevo: false,
    orden: 19, precio: 5, precio_rev: 5,
    tags: ["capcut","capcut pro","edición","video"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_googleone", activo: true, categoria: "CLOUD", mundo: "cloud",
    creadoEn: T("2026-09-15"), descripcion: "Almacenamiento en la nube · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "googleone",
    logo_url: "assets/t-googleone.png", nombre_display: "Google One", nuevo: false,
    orden: 20, precio: 3.5, precio_rev: 3,
    tags: ["google one","google","drive","nube"], tarjeta_url: "assets/card-googleone.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_chatgpt", activo: true, categoria: "IA", mundo: "ia",
    creadoEn: T("2026-09-15"), descripcion: "ChatGPT Plus · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "chatgpt",
    logo_url: "assets/t-chatgpt.png", nombre_display: "ChatGPT+", nuevo: false,
    orden: 21, precio: 5, precio_rev: 4,
    tags: ["chatgpt","gpt","openai","ia"], tarjeta_url: "assets/card-chatgpt.png", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_gemini", activo: true, categoria: "IA", mundo: "ia",
    creadoEn: T("2026-09-15"), descripcion: "Gemini Advanced + 2 TB · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "gemini",
    logo_url: "", nombre_display: "Gemini + 2 TB", nuevo: false,
    orden: 22, precio: 5, precio_rev: 3.5,
    tags: ["gemini","google ia","2tb"], tarjeta_url: "", tipo_entrega: "Suscripción mensual",
  },
  {
    _id: "svc_office365", activo: true, categoria: "SOFTWARE", mundo: "software",
    creadoEn: T("2026-09-15"), descripcion: "Microsoft 365 · Suscripción mensual",
    destacado: false, en_oferta: false, id_servicio: "office365",
    logo_url: "assets/t-office365.png", nombre_display: "Office 365", nuevo: false,
    orden: 23, precio: 3.5, precio_rev: 3,
    tags: ["office","office 365","microsoft","word","excel"], tarjeta_url: "assets/card-office365.png", tipo_entrega: "Suscripción mensual",
  },
];

/* ────────────────────────────  OFERTAS  ──────────────────────────── */
export const OFERTAS = [];

/* ────────────────────────  COMBOS DE SUSCRIPCIÓN  ──────────────────────── */
export const COMBOS = [
  {
    _id: "combo_cine", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "🎬 Netflix + HBO Max + Prime Video + Paramount+", fin_validez: null, id_combo: "combo_cine",
    nombre_combo: "Combo Cine +", precio_publico_combo: 12,
    precio_revendedor_combo: 10.7, servicios_included: ["Netflix","HBO Max","Prime Video","Paramount+"],
  },
  {
    _id: "combo_essential", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "⭐ Netflix + Disney+ + Spotify Premium", fin_validez: null, id_combo: "combo_essential",
    nombre_combo: "Combo Essential", precio_publico_combo: 11.5,
    precio_revendedor_combo: 10.5, servicios_included: ["Netflix","Disney+","Spotify Premium"],
  },
  {
    _id: "combo_family", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "🍿 Netflix + Disney+ + Prime Video + YouTube Premium", fin_validez: null, id_combo: "combo_family",
    nombre_combo: "Combo Family", precio_publico_combo: 13,
    precio_revendedor_combo: 11.7, servicios_included: ["Netflix","Disney+","Prime Video","YouTube Premium"],
  },
  {
    _id: "combo_tvpro", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "📺 FlujoTV + Telelatino + Plex", fin_validez: null, id_combo: "combo_tvpro",
    nombre_combo: "Combo TV Pro", precio_publico_combo: 8,
    precio_revendedor_combo: 7, servicios_included: ["FlujoTV","Telelatino","Plex"],
  },
  {
    _id: "combo_musica", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "🎧 Spotify Premium + Deezer Premium + Tidal + YouTube Premium", fin_validez: null, id_combo: "combo_musica",
    nombre_combo: "Combo Música", precio_publico_combo: 12.5,
    precio_revendedor_combo: 12.2, servicios_included: ["Spotify Premium","Deezer Premium","Tidal","YouTube Premium"],
  },
  {
    _id: "combo_creador", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "🎨 Canva Pro + CapCut Pro + Google One", fin_validez: null, id_combo: "combo_creador",
    nombre_combo: "Combo Creador", precio_publico_combo: 12,
    precio_revendedor_combo: 10.7, servicios_included: ["Canva Pro","CapCut Pro","Google One"],
  },
  {
    _id: "combo_office", activo: true, banner_url: "", creadoEn: T("2026-09-15"),
    descripcion: "💼 Office 365 + Google One + Gemini + 2 TB", fin_validez: null, id_combo: "combo_office",
    nombre_combo: "Combo Office", precio_publico_combo: 12,
    precio_revendedor_combo: 9.5, servicios_included: ["Office 365","Google One","Gemini + 2 TB"],
  },
];

/* ──────────────────────────  CARTELERAS / ESTRENOS  ────────────────────── */
export const CARTELERAS = [
  {
    _id: "estreno_netflix_001", activo: true, id_estreno: "estreno_netflix_001",
    imagen_background: "assets/card-netflix.png", llamado_accion: "Ver en Netflix",
    plataforma: "Netflix", titulo_banner: "Stranger Things — Temporada Final",
  },
  {
    _id: "estreno_disney_001", activo: true, id_estreno: "estreno_disney_001",
    imagen_background: "assets/card-disney.png", llamado_accion: "Ver en Disney+",
    plataforma: "Disney+", titulo_banner: "Marvel — La nueva era del multiverso",
  },
  {
    _id: "estreno_hbo_001", activo: true, id_estreno: "estreno_hbo_001",
    imagen_background: "assets/card-hbo.png", llamado_accion: "Ver en MAX",
    plataforma: "MAX (HBO)", titulo_banner: "Dune: Messiah — Estreno exclusivo",
  },
];

/* ────────────────────────────  BANNERS  ──────────────────────────── */
export const BANNERS = [
  {
    _id: "banner_top_001", activo: true, imagen_url: "assets/card-netflix.png",
    pagina_destino: "index", posicion_html: "top_header",
    url_redireccion: "https://wa.me/584164600411",
  },
];

/* ─────────────────────────  TARJETAS HEADER  ───────────────────────── */
export const TARJETAS_HEADER = [
  { _id: "th_netflix", activo: true, id_tarjeta: "tarjeta_netflix", imagen_url: "assets/card-netflix.png", orden: 1, titulo: "Netflix Premium" },
  { _id: "th_disney", activo: true, id_tarjeta: "tarjeta_disney", imagen_url: "assets/card-disney.png", orden: 2, titulo: "Disney+ Premium" },
  { _id: "th_hbo", activo: true, id_tarjeta: "tarjeta_hbo", imagen_url: "assets/card-hbo.png", orden: 3, titulo: "MAX (HBO)" },
  { _id: "th_spotify", activo: true, id_tarjeta: "tarjeta_spotify", imagen_url: "assets/card-spotify.png", orden: 4, titulo: "Spotify Premium" },
  { _id: "th_chatgpt", activo: true, id_tarjeta: "tarjeta_chatgpt", imagen_url: "assets/card-chatgpt.png", orden: 5, titulo: "ChatGPT Plus" },
];

/* ──────────────────────────  MÉTODOS DE PAGO  ──────────────────────── */
// Métodos de pago: se muestra la ESTRUCTURA (banco/tipo/instrucciones) pero los
// DATOS DE COBRO (titular, cédula, teléfono, correo) van VACÍOS a propósito. El
// titular los rellena en el panel de admin y el backend sirve los reales por
// `/api/cms/metodos_pago_config`. Nunca datos de cobro de ejemplo (evita que
// alguien pague a una cuenta falsa).
export const METODOS_PAGO = [
  {
    _id: "pago_movil_bdv", documento_identidad: "", estado_activo: true,
    id_pago: "pago_movil_bdv", logo_url: "", orden: 1, telefono_pago: "",
    tipo_banco: "Bancos Venezolanos", titular: "", tipo: "pago_movil",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Pago Móvil o transferencia a banco venezolano. Sube el comprobante.",
  },
  {
    _id: "binance_pay", documento_identidad: "", estado_activo: true,
    id_pago: "binance_pay", logo_url: "", orden: 2, telefono_pago: "",
    tipo_banco: "Binance (USDT)", titular: "", tipo: "cripto",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Envía USDT por Binance Pay y sube el comprobante con el ID de la transacción.",
  },
  {
    _id: "zinli", documento_identidad: "", estado_activo: true,
    id_pago: "zinli", logo_url: "", orden: 3, telefono_pago: "",
    tipo_banco: "Zinli", titular: "", tipo: "billetera",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Transfiere por Zinli y sube el comprobante.",
  },
  {
    _id: "revolut", documento_identidad: "", estado_activo: true,
    id_pago: "revolut", logo_url: "", orden: 4, telefono_pago: "",
    tipo_banco: "Revolut", titular: "", tipo: "billetera",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Transfiere por Revolut y sube el comprobante.",
  },
  {
    _id: "yape", documento_identidad: "", estado_activo: true,
    id_pago: "yape", logo_url: "", orden: 5, telefono_pago: "",
    tipo_banco: "Yape (Perú)", titular: "", tipo: "billetera",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Paga por Yape y sube el comprobante.",
  },
  {
    _id: "bancolombia", documento_identidad: "", estado_activo: true,
    id_pago: "bancolombia", logo_url: "", orden: 6, telefono_pago: "",
    tipo_banco: "Bancolombia", titular: "", tipo: "transferencia",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Transferencia Bancolombia. Sube el comprobante.",
  },
  {
    _id: "ripio", documento_identidad: "", estado_activo: true,
    id_pago: "ripio", logo_url: "", orden: 7, telefono_pago: "",
    tipo_banco: "Ripio (Argentina)", titular: "", tipo: "billetera",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Envía por Ripio y sube el comprobante.",
  },
  {
    _id: "pichincha", documento_identidad: "", estado_activo: true,
    id_pago: "pichincha", logo_url: "", orden: 8, telefono_pago: "",
    tipo_banco: "Banco Pichincha (Ecuador)", titular: "", tipo: "transferencia",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Transferencia Banco Pichincha. Sube el comprobante.",
  },
  {
    _id: "zelle", documento_identidad: "", estado_activo: true,
    id_pago: "zelle", logo_url: "", orden: 9, telefono_pago: "",
    tipo_banco: "Zelle", titular: "", tipo: "zelle",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Transfiere por Zelle y sube el comprobante con el número de confirmación.",
  },
  {
    _id: "paypal", documento_identidad: "", estado_activo: true,
    id_pago: "paypal", logo_url: "", orden: 10, telefono_pago: "",
    tipo_banco: "PayPal (+ comisión)", titular: "", tipo: "paypal",
    correo_zelle: "", correo_paypal: "", correo_binance: "", instrucciones: "Paga por PayPal (aplica comisión) y sube el comprobante.",
  },
];

/* ───────────────────────────  INVENTARIO  ──────────────────────────── */
// Inventario de cuentas: son CREDENCIALES reales → nunca de ejemplo. Vacío por
// defecto; el stock real vive en `cuentas_streaming` (backend) y se gestiona en
// el panel de admin. La web muestra estado vacío hasta que existan cuentas.
export const INVENTARIO = [];

/* ─────────────────────────────  USUARIOS  ──────────────────────────── */
// Sin usuarios de ejemplo: los usuarios reales viven en la tabla `usuarios`
// (backend). Crea el admin con `npm run seed` (o crear-admin), no aquí.
export const USUARIOS = [];

/* ────────────────────────────  PEDIDOS  ──────────────────────────── */
// Sin pedidos ficticios: los pedidos reales llegan de `/api/pedidos`.
export const PEDIDOS = [];

/* ────────────────────────────  RECARGAS  ──────────────────────────── */
// Sin recargas ficticias: datos reales desde `/api/wallet/recargas`.
export const RECARGAS = [];
export const RECARGAS_BILLETERA = [];

/* ────────────────────────  HISTORIAL MOVIMIENTOS  ──────────────────── */
// Sin movimientos ficticios: el libro real vive en `movimientos_billetera`.
export const HISTORIAL = [];

/* ─────────────────────────  SUSCRIPCIONES  ─────────────────────────── */
// Sin suscripciones ficticias (contenían credenciales de ejemplo): las reales
// se sirven por usuario desde `/api/mis/suscripciones`.
export const SUSCRIPCIONES = [];

/* ────────────────────────  RENOVACIONES PENDIENTES  ────────────────── */
export const RENOVACIONES = [];

/* ───────────────────────────  COMENTARIOS  ─────────────────────────── */
// Sin testimonios inventados: se mostrarán reseñas reales cuando existan.
export const COMENTARIOS = [];

/* ──────────────────────────  FAQ  ─────────────────────────── */
export const FAQS = [
  { _id: "faq_001", categoria: "general", id_faq: "faq_001", orden: 0, pregunta: "¿Cómo funciona NV Streaming?", respuesta: "NV Streaming es una plataforma de reventa de suscripciones digitales. Compras tu suscripción con nosotros y te entregamos las credenciales de acceso." },
  { _id: "faq_002", categoria: "pagos", id_faq: "faq_002", orden: 1, pregunta: "¿Qué métodos de pago aceptan?", respuesta: "Aceptamos Pago Móvil, Binance Pay, Zelle y PayPal. Tras el pago subes tu comprobante y activamos el servicio." },
  { _id: "faq_003", categoria: "garantia", id_faq: "faq_003", orden: 2, pregunta: "¿Tienen garantía?", respuesta: "Sí, todas las cuentas cuentan con 7 días de garantía. Si algo falla, te reemplazamos el acceso sin costo." },
  { _id: "faq_004", categoria: "entrega", id_faq: "faq_004", orden: 3, pregunta: "¿En cuánto tiempo recibo mi cuenta?", respuesta: "La activación es inmediata. En cuanto validamos el pago recibes las credenciales por WhatsApp y en tu panel." },
];

/* ──────────────  PLANES DE REVENDEDOR (página "Hazte revendedor")  ────────────── */
/* Planes por defecto (editables en Admin → Catálogo → Planes revendedor). El
 * backend (colección CMS `planes_revendedor`) los sobrescribe cuando responde. */
export const PLANES_REVENDEDOR = [
  { _id: "rev_starter", id: "rev_starter", name: "Starter", price: "$9.99", period: "/mes", accent: "#00CFFF", featured: false, orden: 1, activo: true, tagline: "Ideal para empezar a revender.", features: ["Precios de revendedor", "Panel de ventas", "Hasta 30 clientes", "Soporte por chat"] },
  { _id: "rev_pro", id: "rev_pro", name: "Pro", price: "$24.99", period: "/mes", accent: "#9B3FFF", featured: true, orden: 2, activo: true, tagline: "El favorito de los revendedores activos.", features: ["Todo lo de Starter", "Clientes ilimitados", "Comisiones potenciadas", "CRM + cotizaciones", "Material de marketing"] },
  { _id: "rev_anual", id: "rev_anual", name: "Anual", price: "$199", period: "/año", accent: "#00D4A0", featured: false, orden: 3, activo: true, tagline: "2 meses gratis pagando al año.", features: ["Todo lo de Pro", "2 meses gratis", "Prioridad de soporte", "Insignia verificada"] },
];

/* ─────────────────────────  RESPUESTAS RÁPIDAS  ────────────────────── */
export const RESPUESTAS_RAPIDAS = [
  { _id: "macro_pin", atajo_teclado: "/pin", categoria: "streaming", cuerpo_mensaje: "Hola, recuerda que para ingresar a tu perfil asignado debes colocar el código de seguridad inyectado en tus credenciales. Cualquier duda estamos para ayudarte.", id_macro: "macro_pin", titulo_macro: "Instrucciones de PIN de Perfil" },
  { _id: "macro_bienvenida", atajo_teclado: "/hola", categoria: "general", cuerpo_mensaje: "¡Hola! Gracias por escribir a NV Streaming. ¿En qué podemos ayudarte hoy?", id_macro: "macro_bienvenida", titulo_macro: "Bienvenida" },
  { _id: "macro_garantia", atajo_teclado: "/garantia", categoria: "general", cuerpo_mensaje: "Tu compra incluye 7 días de garantía. Si el acceso falla, te lo reponemos sin costo. Envíanos una captura del error.", id_macro: "macro_garantia", titulo_macro: "Garantía" },
];

/* ──────────────────────  PLANTILLAS DE MENSAJES  ───────────────────── */
export const PLANTILLAS_MENSAJES = {
  notificacion_pedido_aprobado:
    "✅ Hola {{nombre}}, tu pedido {{id_pedido}} fue APROBADO. Tus credenciales: {{credenciales}}. Garantía: {{dias_garantia}} días. ¡Gracias por confiar en NV Streaming!",
  notificacion_pedido_pendiente:
    "🕐 Hola {{nombre}}, recibimos tu pedido {{id_pedido}} por {{total_usd}} USD ({{total_local}} {{moneda}}). Referencia: {{referencia}}. Estamos validando tu pago.",
  notificacion_pedido_rechazado:
    "❌ Hola {{nombre}}, tu trámite {{id_tramite}} fue rechazado. Por favor verifica el comprobante y vuelve a intentarlo.",
  notificacion_recarga_aprobada:
    "💰 Hola {{nombre}}, tu recarga {{id_recarga}} de {{monto_usd}} USD fue aprobada. Nuevo saldo: {{nuevo_saldo}} USD.",
};

/* ────────────────────  PARÁMETROS DEL SISTEMA  ─────────────────────── */
export const PARAMETROS = {
  creadoEn: T("2026-06-07"),
  email_soporte: "soporte@nvstreaming.com",
  facebook: "https://facebook.com/nvstreaming",
  garantia_dias: 7,
  instagram: "@nvstreaming",
  moneda_defecto: "USD",
  tasa_bcv: 36.5,
  tasa_cop: 4000,
  tasa_eur: 0.92,
  tasa_pen: 3.8,
  telegram: "@nvstreaming",
  tiktok: "@nvstreaming",
  topbar_texto: "⚡ NV Streaming — Activación inmediata · Soporte 24/7",
  whatsapp: "584164600411",
};

/* ───────────────────────  TEMA DE INTERFAZ  ────────────────────────── */
export const TEMA_INTERFAZ = {
  bg_space_core: "#0d0d1b",
  bg_space_dark: "#05050b",
  bg_surface_opaque: "#0d0d13",
  curva_animacion: "cubic-bezier(0.25, 0.8, 0.25, 1)",
  fuente_body: "Lexend",
  fuente_display: "Orbitron",
  fuente_sans: "Inter",
  logo_texto: "NV STREAMING",
  logo_url_img: "",
  neon_cyan: "#00d2ff",
  neon_green: "#00ffcc",
  neon_orange: "#ff6b00",
  neon_purple: "#bc00dd",
  velocidad_marquesina: "25s",
  velocidad_transiciones: "0.3s",
};

/* ─────────────────────  CHATS Y TICKETS DE SOPORTE  ────────────────── */
// Sin conversaciones ni tickets ficticios: el soporte real llega del backend.
export const CHATS_SOPORTE = [];
export const TICKETS = [];

/* ────────────────────  NOTIFICACIONES (cliente/admin)  ─────────────── */
// Sin notificaciones inventadas: las reales se generan por eventos del backend.
export const NOTIFICACIONES = [];
export const NOTIFICACIONES_ADMIN = [];

/* ────────────────────────  FLYERS REVENDEDORES  ───────────────────── */
export const FLYERS_REVENDEDORES = [
  {
    _id: "flyer_demo", nombre_negocio: "NV Streaming", uid_revendedor: "reseller_demo_uid",
    ultima_actualizacion: AHORA,
    // Normalizado a map (ver §5 del blueprint: el array heterogéneo original era un map aplanado).
    configuraciones: { id_servicio: "netflix", color_fondo: "#05050b", color_texto: "#00d2ff", slogan: "Tus streamings al mejor precio", activo: true },
  },
];

/* ══════════════════  MÓDULO OTP · AUTOMATIZACIÓN DE CREDENCIALES  ══════════════════ */

/* `plataformas` — catálogo de servicios para el motor de códigos (mapea 1:1 con
 * servicios_sistema por `id_servicio`; incluye palabras clave para el parser). */
export const PLATAFORMAS = [
  { _id: "netflix", nombre: "Netflix", id_servicio: "netflix", estado: 1, keywords: ["netflix"] },
  { _id: "disney", nombre: "Disney+", id_servicio: "disney", estado: 1, keywords: ["disney","disney+","disney plus"] },
  { _id: "disney_espn", nombre: "Disney+ con ESPN", id_servicio: "disney_espn", estado: 1, keywords: ["disney espn","espn"] },
  { _id: "prime", nombre: "Prime Video", id_servicio: "prime", estado: 1, keywords: ["prime","prime video","amazon"] },
  { _id: "max", nombre: "HBO Max", id_servicio: "max", estado: 1, keywords: ["max","hbo","hbo max"] },
  { _id: "paramount", nombre: "Paramount+", id_servicio: "paramount", estado: 1, keywords: ["paramount","paramount+"] },
  { _id: "crunchyroll", nombre: "Crunchyroll", id_servicio: "crunchyroll", estado: 1, keywords: ["crunchyroll","anime"] },
  { _id: "flujotv", nombre: "FlujoTV", id_servicio: "flujotv", estado: 1, keywords: ["flujo","flujotv","flujo tv","iptv"] },
  { _id: "telelatino", nombre: "Telelatino", id_servicio: "telelatino", estado: 1, keywords: ["telelatino","tele latino","iptv"] },
  { _id: "plex", nombre: "Plex", id_servicio: "plex", estado: 1, keywords: ["plex"] },
  { _id: "appletv", nombre: "AppleTV", id_servicio: "appletv", estado: 1, keywords: ["apple","apple tv","appletv"] },
  { _id: "vix", nombre: "Vix Premium", id_servicio: "vix", estado: 1, keywords: ["vix","vix premium"] },
  { _id: "rakuten", nombre: "Rakuten Viki", id_servicio: "rakuten", estado: 1, keywords: ["rakuten","viki","rakuten viki","doramas"] },
  { _id: "youtube", nombre: "YouTube Premium", id_servicio: "youtube", estado: 1, keywords: ["youtube","youtube premium","youtube music"] },
  { _id: "spotify", nombre: "Spotify Premium", id_servicio: "spotify", estado: 1, keywords: ["spotify","música","musica"] },
  { _id: "deezer", nombre: "Deezer Premium", id_servicio: "deezer", estado: 1, keywords: ["deezer"] },
  { _id: "tidal", nombre: "Tidal", id_servicio: "tidal", estado: 1, keywords: ["tidal","hifi"] },
  { _id: "canva", nombre: "Canva Pro", id_servicio: "canva", estado: 1, keywords: ["canva","canva pro","diseño"] },
  { _id: "capcut", nombre: "CapCut Pro", id_servicio: "capcut", estado: 1, keywords: ["capcut","capcut pro","edición","video"] },
  { _id: "googleone", nombre: "Google One", id_servicio: "googleone", estado: 1, keywords: ["google one","google","drive","nube"] },
  { _id: "chatgpt", nombre: "ChatGPT+", id_servicio: "chatgpt", estado: 1, keywords: ["chatgpt","gpt","openai","ia"] },
  { _id: "gemini", nombre: "Gemini + 2 TB", id_servicio: "gemini", estado: 1, keywords: ["gemini","google ia","2tb"] },
  { _id: "office365", nombre: "Office 365", id_servicio: "office365", estado: 1, keywords: ["office","office 365","microsoft","word","excel"] },
];

/* `codigos_verificacion` — recepción real de OTP (Telegram/WhatsApp).
 * Vacío: los códigos reales los inserta el backend al recibirlos. Nunca de ejemplo. */
export const CODIGOS_VERIFICACION = [];

/* `plantillas_permisos` — RBAC del módulo: quién inyecta / ve / configura. */
export const PLANTILLAS_PERMISOS = [
  { _id: "perm_admin", rol: "admin", puede_inyectar: true, puede_ver_global: true, puede_configurar_api: true, puede_asignar_masivo: true, plataformas_permitidas: ["*"] },
  { _id: "perm_operador", rol: "operador", puede_inyectar: true, puede_ver_global: true, puede_configurar_api: false, puede_asignar_masivo: true, plataformas_permitidas: ["netflix", "disney", "hbo", "spotify"] },
  { _id: "perm_revendedor", rol: "revendedor", puede_inyectar: false, puede_ver_global: false, puede_configurar_api: false, puede_asignar_masivo: false, plataformas_permitidas: [] },
  { _id: "perm_cliente", rol: "cliente", puede_inyectar: false, puede_ver_global: false, puede_configurar_api: false, puede_asignar_masivo: false, plataformas_permitidas: [] },
];

/**
 * Índice maestro colección → datos. El seeder y los servicios lo consumen.
 * `docs` incluye `_id` (id de documento) mezclado con los campos; el seeder
 * separa `_id` del resto al escribir. Para `configuracion_sistema` los ids de
 * documento son fijos (`parametros`, `plantillas_mensajes`, `tema_interfaz`).
 */
export const SEED = {
  servicios_sistema: SERVICIOS,
  ofertas: OFERTAS,
  combos_suscripciones: COMBOS,
  carteleras_estrenos: CARTELERAS,
  banners_posiciones: BANNERS,
  tarjetas_header: TARJETAS_HEADER,
  metodos_pago_config: METODOS_PAGO,
  inventario: INVENTARIO,
  usuarios: USUARIOS,
  pedidos: PEDIDOS,
  recargas: RECARGAS,
  recargas_billetera: RECARGAS_BILLETERA,
  historial_movimientos: HISTORIAL,
  suscripciones: SUSCRIPCIONES,
  renovaciones_pendientes: RENOVACIONES,
  comentarios: COMENTARIOS,
  preguntas_frecuentes: FAQS,
  planes_revendedor: PLANES_REVENDEDOR,
  respuestas_rapidas: RESPUESTAS_RAPIDAS,
  chats_soporte: CHATS_SOPORTE,
  tickets_soporte: TICKETS,
  notificaciones: NOTIFICACIONES,
  notificaciones_admin: NOTIFICACIONES_ADMIN,
  flyers_revendedores: FLYERS_REVENDEDORES,
  plataformas: PLATAFORMAS,
  codigos_verificacion: CODIGOS_VERIFICACION,
  plantillas_permisos: PLANTILLAS_PERMISOS,
  // configuracion_sistema se maneja aparte (3 docs de id fijo).
  configuracion_sistema: {
    parametros: PARAMETROS,
    plantillas_mensajes: PLANTILLAS_MENSAJES,
    tema_interfaz: TEMA_INTERFAZ,
  },
};

export default SEED;
