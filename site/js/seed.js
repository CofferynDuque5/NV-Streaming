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
    creadoEn: T("2026-06-06"), descripcion: "4K UHD · 4 pantallas simultáneas · Sin publicidad",
    destacado: true, en_oferta: true, en_stock: true, id_servicio: "netflix",
    logo_url: "assets/t-netflix.png", nombre_display: "Netflix Premium", nuevo: false,
    orden: 1, precio: 5.99, precio_rev: 4.5, stock: 8,
    tags: ["streaming", "películas", "series", "4k"],
    tarjeta_url: "assets/card-netflix.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_disney", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-06-06"), descripcion: "Disney, Pixar, Marvel y Star Wars en 4K",
    destacado: true, en_oferta: false, en_stock: true, id_servicio: "disney",
    logo_url: "assets/t-disney.png", nombre_display: "Disney+ Premium", nuevo: false,
    orden: 2, precio: 5.49, precio_rev: 4.2, stock: 15,
    tags: ["streaming", "familia", "películas", "4k"],
    tarjeta_url: "assets/card-disney.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_hbo", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-06-06"), descripcion: "HBO Originals · Warner · DC en 4K UHD",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "hbo",
    logo_url: "assets/t-hbo.png", nombre_display: "MAX (HBO)", nuevo: false,
    orden: 3, precio: 5.99, precio_rev: 4.6, stock: 3,
    tags: ["streaming", "series", "películas"],
    tarjeta_url: "assets/card-hbo.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_appletv", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-06-06"), descripcion: "Apple Originals en calidad cinematográfica",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "appletv",
    logo_url: "assets/t-appletv-logo.png", nombre_display: "Apple TV+", nuevo: true,
    orden: 4, precio: 4.99, precio_rev: 3.8, stock: 20,
    tags: ["streaming", "series", "premium"],
    tarjeta_url: "assets/card-appletv.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_vix", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-06-06"), descripcion: "Cine y novelas en español · Deportes en vivo",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "vix",
    logo_url: "assets/t-vix.png", nombre_display: "ViX Premium", nuevo: false,
    orden: 5, precio: 3.99, precio_rev: 2.9, stock: 12,
    tags: ["streaming", "español", "deportes"],
    tarjeta_url: "assets/card-vix.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_paramount", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-06-06"), descripcion: "Paramount, MTV, Nickelodeon y deportes",
    destacado: false, en_oferta: false, en_stock: false, id_servicio: "paramount",
    logo_url: "assets/t-paramount.png", nombre_display: "Paramount+", nuevo: false,
    orden: 6, precio: 3.99, precio_rev: 2.9, stock: 0,
    tags: ["streaming", "series", "deportes"],
    tarjeta_url: "assets/card-paramount.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_crunchyroll", activo: true, categoria: "STREAMING", mundo: "streaming",
    creadoEn: T("2026-06-06"), descripcion: "El mayor catálogo de anime del mundo",
    destacado: false, en_oferta: true, en_stock: true, id_servicio: "crunchyroll",
    logo_url: "assets/t-crunchyroll.png", nombre_display: "Crunchyroll Mega", nuevo: false,
    orden: 7, precio: 3.49, precio_rev: 2.5, stock: 6,
    tags: ["streaming", "anime"],
    tarjeta_url: "assets/card-crunchyroll.png", tipo_entrega: "Perfil compartido",
  },
  {
    _id: "svc_spotify", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-06-06"), descripcion: "Música sin anuncios · Descargas · Alta fidelidad",
    destacado: true, en_oferta: false, en_stock: true, id_servicio: "spotify",
    logo_url: "assets/t-spotify.png", nombre_display: "Spotify Premium", nuevo: false,
    orden: 8, precio: 4.49, precio_rev: 3.3, stock: 25,
    tags: ["música", "audio", "podcast"],
    tarjeta_url: "assets/card-spotify.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_tidal", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-06-06"), descripcion: "Audio HiFi Master · La mejor calidad de sonido",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "tidal",
    logo_url: "assets/t-tidal.png", nombre_display: "Tidal HiFi", nuevo: true,
    orden: 9, precio: 4.99, precio_rev: 3.7, stock: 10,
    tags: ["música", "hifi", "audio"],
    tarjeta_url: "assets/card-tidal.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_youtube", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-06-06"), descripcion: "YouTube sin anuncios + YouTube Music",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "youtube",
    logo_url: "assets/t-youtube.png", nombre_display: "YouTube Premium", nuevo: false,
    orden: 10, precio: 4.29, precio_rev: 3.1, stock: 18,
    tags: ["música", "video", "sin anuncios"],
    tarjeta_url: "assets/card-youtube.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_deezer", activo: true, categoria: "MUSICA", mundo: "musica",
    creadoEn: T("2026-06-06"), descripcion: "90M de canciones · HiFi · Sin límites",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "deezer",
    logo_url: "assets/t-deezer.png", nombre_display: "Deezer Premium", nuevo: false,
    orden: 11, precio: 3.99, precio_rev: 2.8, stock: 14,
    tags: ["música", "audio"],
    tarjeta_url: "assets/card-deezer.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_chatgpt", activo: true, categoria: "IA", mundo: "ia",
    creadoEn: T("2026-06-06"), descripcion: "GPT-4o · Acceso prioritario · Sin límites",
    destacado: true, en_oferta: false, en_stock: true, id_servicio: "chatgpt",
    logo_url: "assets/t-chatgpt.png", nombre_display: "ChatGPT Plus", nuevo: true,
    orden: 12, precio: 9.99, precio_rev: 7.5, stock: 4,
    tags: ["ia", "productividad", "gpt"],
    tarjeta_url: "assets/card-chatgpt.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_windows11", activo: true, categoria: "SOFTWARE", mundo: "software",
    creadoEn: T("2026-06-06"), descripcion: "Licencia Windows 11 Pro · Activación permanente",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "windows11",
    logo_url: "assets/t-windows11.png", nombre_display: "Windows 11 Pro", nuevo: false,
    orden: 13, precio: 14.99, precio_rev: 11.0, stock: 30,
    tags: ["software", "licencia", "trabajo"],
    tarjeta_url: "assets/card-windows11.png", tipo_entrega: "Clave de licencia",
  },
  {
    _id: "svc_office365", activo: true, categoria: "SOFTWARE", mundo: "software",
    creadoEn: T("2026-06-06"), descripcion: "Word, Excel, PowerPoint + 1TB OneDrive",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "office365",
    logo_url: "assets/t-office365.png", nombre_display: "Microsoft 365", nuevo: false,
    orden: 14, precio: 9.99, precio_rev: 7.2, stock: 22,
    tags: ["software", "ofimática", "trabajo"],
    tarjeta_url: "assets/card-office365.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_adobe", activo: true, categoria: "SOFTWARE", mundo: "software",
    creadoEn: T("2026-06-06"), descripcion: "Photoshop, Illustrator, Premiere y más",
    destacado: false, en_oferta: false, en_stock: false, id_servicio: "adobe",
    logo_url: "assets/t-adobe.png", nombre_display: "Adobe Creative Cloud", nuevo: false,
    orden: 15, precio: 19.99, precio_rev: 15.0, stock: 0,
    tags: ["software", "diseño", "trabajo"],
    tarjeta_url: "assets/t-adobe.png", tipo_entrega: "Cuenta individual",
  },
  {
    _id: "svc_googleone", activo: true, categoria: "CLOUD", mundo: "cloud",
    creadoEn: T("2026-06-06"), descripcion: "2TB de almacenamiento en la nube de Google",
    destacado: false, en_oferta: false, en_stock: true, id_servicio: "googleone",
    logo_url: "assets/t-googleone.png", nombre_display: "Google One 2TB", nuevo: false,
    orden: 16, precio: 4.99, precio_rev: 3.6, stock: 40,
    tags: ["cloud", "almacenamiento"],
    tarjeta_url: "assets/card-googleone.png", tipo_entrega: "Cuenta individual",
  },
];

/* ────────────────────────────  OFERTAS  ──────────────────────────── */
export const OFERTAS = [
  {
    _id: "oferta_netflix_001", activo: true, descuento_pct: 33, etiqueta: "OFERTA",
    id_servicio: "netflix", logo_url: "assets/t-netflix.png", nombre: "Netflix Premium",
    orden: 1, precio_normal: 7.99, precio_oferta: 5.99,
  },
  {
    _id: "oferta_crunchyroll_001", activo: true, descuento_pct: 30, etiqueta: "FLASH",
    id_servicio: "crunchyroll", logo_url: "assets/t-crunchyroll.png", nombre: "Crunchyroll Mega",
    orden: 2, precio_normal: 4.99, precio_oferta: 3.49,
  },
  {
    _id: "oferta_chatgpt_001", activo: true, descuento_pct: 25, etiqueta: "OFERTA",
    id_servicio: "chatgpt", logo_url: "assets/t-chatgpt.png", nombre: "ChatGPT Plus",
    orden: 3, precio_normal: 12.99, precio_oferta: 9.99,
  },
  {
    _id: "oferta_spotify_001", activo: true, descuento_pct: 40, etiqueta: "COMBO",
    id_servicio: "spotify", logo_url: "assets/t-spotify.png", nombre: "Spotify Premium",
    orden: 4, precio_normal: 7.49, precio_oferta: 4.49,
  },
];

/* ────────────────────────  COMBOS DE SUSCRIPCIÓN  ──────────────────────── */
export const COMBOS = [
  {
    _id: "combo_entretenimiento", activo: true, banner_url: "assets/card-netflix.png",
    creadoEn: T("2026-06-06"), descripcion: "Netflix + Spotify + Disney+ al mejor precio",
    fin_validez: T("2026-06-30"), id_combo: "Pack Entretenimiento Total",
    nombre_combo: "Pack Entretenimiento Total", precio_publico_combo: 12.99,
    precio_revendedor_combo: 9.5, servicios_included: ["Netflix Premium", "Spotify", "Disney+"],
  },
  {
    _id: "combo_cinefilo", activo: true, banner_url: "assets/card-hbo.png",
    creadoEn: T("2026-06-06"), descripcion: "MAX + Paramount+ + Apple TV+ para los amantes del cine",
    fin_validez: T("2026-07-30"), id_combo: "Pack Cinéfilo",
    nombre_combo: "Pack Cinéfilo", precio_publico_combo: 13.99,
    precio_revendedor_combo: 10.5, servicios_included: ["MAX (HBO)", "Paramount+", "Apple TV+"],
  },
  {
    _id: "combo_productividad", activo: true, banner_url: "assets/card-office365.png",
    creadoEn: T("2026-06-06"), descripcion: "Microsoft 365 + Windows 11 + Google One 2TB",
    fin_validez: T("2026-08-15"), id_combo: "Pack Productividad Pro",
    nombre_combo: "Pack Productividad Pro", precio_publico_combo: 24.99,
    precio_revendedor_combo: 19.0, servicios_included: ["Microsoft 365", "Windows 11 Pro", "Google One 2TB"],
  },
  {
    _id: "combo_musica", activo: true, banner_url: "assets/card-spotify.png",
    creadoEn: T("2026-06-06"), descripcion: "Spotify + Tidal HiFi + YouTube Premium",
    fin_validez: T("2026-07-15"), id_combo: "Pack Melómano",
    nombre_combo: "Pack Melómano", precio_publico_combo: 10.99,
    precio_revendedor_combo: 8.0, servicios_included: ["Spotify Premium", "Tidal HiFi", "YouTube Premium"],
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
export const METODOS_PAGO = [
  {
    _id: "pago_movil_bdv", documento_identidad: "V-12345678", estado_activo: true,
    id_pago: "pago_movil_bdv", logo_url: "", orden: 0, telefono_pago: "04120000000",
    tipo_banco: "Banco de Venezuela", titular: "Titular NV Streaming", tipo: "pago_movil",
    instrucciones: "Envía el pago móvil y sube el comprobante en el checkout.",
  },
  {
    _id: "binance_pay", documento_identidad: "", estado_activo: true, id_pago: "binance_pay",
    logo_url: "", orden: 1, telefono_pago: "", tipo_banco: "Binance Pay", titular: "Titular NV Streaming",
    tipo: "crypto", correo_binance: "pagos@tudominio.com",
    instrucciones: "Paga en USDT/BNB al Binance ID y sube el comprobante.",
  },
  {
    _id: "zelle", documento_identidad: "", estado_activo: true, id_pago: "zelle",
    logo_url: "", orden: 2, telefono_pago: "", tipo_banco: "Zelle", titular: "Titular NV Streaming",
    correo_zelle: "pagos@tudominio.com", tipo: "zelle",
    instrucciones: "Transfiere por Zelle al correo indicado.",
  },
  {
    _id: "paypal", documento_identidad: "", estado_activo: true, id_pago: "paypal",
    logo_url: "", orden: 3, telefono_pago: "", tipo_banco: "PayPal", titular: "Titular NV Streaming",
    correo_paypal: "pagos@tudominio.com", tipo: "paypal",
    instrucciones: "Envía como 'amigos y familia' y sube el comprobante.",
  },
];

/* ───────────────────────────  INVENTARIO  ──────────────────────────── */
export const INVENTARIO = [
  { _id: "cuenta_netflix_001", estado: "disponible", id_servicio: "netflix", credenciales: { clave: "DEMO-NO-USAR", perfil: "Perfil 01", pin: "1234", usuario: "cuenta001@gmail.com" } },
  { _id: "cuenta_netflix_002", estado: "disponible", id_servicio: "netflix", credenciales: { clave: "password456", perfil: "Perfil 02", pin: "5678", usuario: "cuenta002@gmail.com" } },
  { _id: "cuenta_disney_001", estado: "disponible", id_servicio: "disney", credenciales: { clave: "DEMO-NO-USAR", perfil: "Perfil 01", pin: "0001", usuario: "disney001@gmail.com" } },
  { _id: "cuenta_spotify_001", estado: "disponible", id_servicio: "spotify", credenciales: { clave: "DEMO-NO-USAR", perfil: "Titular", pin: "", usuario: "spotify001@gmail.com" } },
  { _id: "cuenta_chatgpt_001", estado: "vendido", id_servicio: "chatgpt", credenciales: { clave: "gpt2026", perfil: "Titular", pin: "", usuario: "gpt001@gmail.com" } },
  { _id: "cuenta_hbo_001", estado: "disponible", id_servicio: "hbo", credenciales: { clave: "hbo2026", perfil: "Perfil 03", pin: "1122", usuario: "hbo001@gmail.com" } },
];

/* ─────────────────────────────  USUARIOS  ──────────────────────────── */
export const USUARIOS = [
  {
    _id: "admin_root_uid", activo: true, baneado: false, email: "admin@nvstreaming.com",
    fechacreado: T("2026-06-01"), nombre: "Titular NV Streaming", rol: "admin", saldoBilletera: 0,
    telefono: "584164600411", uid: "admin_root_uid", ultimoLogin: AHORA,
  },
  {
    _id: "reseller_demo_uid", activo: true, baneado: false, email: "revendedor@nvstreaming.com",
    fechacreado: T("2026-06-05"), nombre: "Valeryn Duque", rol: "revendedor", saldoBilletera: 150,
    telefono: "584140000000", uid: "reseller_demo_uid", ultimoLogin: AHORA,
    suscripcion_panel: { activa: true, plan: "Pro", vence: T("2026-07-31") },
  },
  {
    _id: "cliente_demo_uid", activo: true, baneado: false,
    email: "cliente.demo@example.com", fechacreado: T("2026-06-16"),
    nombre: "Cliente Demo", rol: "cliente", saldoBilletera: 0, telefono: "",
    uid: "cliente_demo_uid", ultimoLogin: AHORA,
  },
];

/* ────────────────────────────  PEDIDOS  ──────────────────────────── */
export const PEDIDOS = [
  { _id: "ped_0001", comprobante: "", creadoEn: T("2026-06-15"), estado: "pendiente", id_servicio: "netflix", metodo_pago: "pago_movil_bdv", precio: 7, tipo_precio: "detal", nombre_cliente: "Cliente Demo", email_cliente: "cliente.demo@example.com", uid_cliente: "cliente_demo_uid" },
  { _id: "ped_0002", comprobante: "", creadoEn: T("2026-06-14"), estado: "aprobado", id_servicio: "spotify", metodo_pago: "binance_pay", precio: 4.49, tipo_precio: "detal", nombre_cliente: "Carlos R.", email_cliente: "carlos@example.com", uid_cliente: "" },
  { _id: "ped_0003", comprobante: "", creadoEn: T("2026-06-13"), estado: "aprobado", id_servicio: "disney", metodo_pago: "zelle", precio: 5.49, tipo_precio: "detal", nombre_cliente: "María G.", email_cliente: "maria@example.com", uid_cliente: "" },
  { _id: "ped_0004", comprobante: "", creadoEn: T("2026-06-12"), estado: "rechazado", id_servicio: "hbo", metodo_pago: "paypal", precio: 5.99, tipo_precio: "detal", nombre_cliente: "Diego R.", email_cliente: "diego@example.com", uid_cliente: "" },
];

/* ────────────────────────────  RECARGAS  ──────────────────────────── */
export const RECARGAS = [
  { _id: "rec_0001", aprobadoPor: "", comprobante: "", creadoEn: T("2026-06-16"), estado: "pendiente", metodo_pago: "pago_movil_bdv", monto: 7 },
];
export const RECARGAS_BILLETERA = [
  { _id: "recb_0001", aprobadoPor: "", comprobante: "", creadoEn: T("2026-06-16"), estado: "pendiente", metodo_pago: "binance_pay", monto: 50, uid_usuario: "reseller_demo_uid", email: "revendedor@nvstreaming.com" },
  { _id: "recb_0002", aprobadoPor: "admin_root_uid", comprobante: "", creadoEn: T("2026-06-15"), estado: "aprobado", metodo_pago: "zelle", monto: 100, uid_usuario: "reseller_demo_uid", email: "revendedor@nvstreaming.com" },
];

/* ────────────────────────  HISTORIAL MOVIMIENTOS  ──────────────────── */
export const HISTORIAL = [
  { _id: "mov_0001", descripcion: "Recarga de saldo autorizada por mesa de control", ejecutado_por: "sistema", fecha: T("2026-06-16"), monto: 50, referencia: "", saldo_anterior: 0, saldo_posterior: 50, tipo: "ingreso", usuario: "reseller_demo_uid" },
  { _id: "mov_0002", descripcion: "Venta de suscripción Netflix", ejecutado_por: "reseller_demo_uid", fecha: T("2026-06-16"), monto: 4.5, referencia: "ped_0002", saldo_anterior: 150, saldo_posterior: 145.5, tipo: "egreso", usuario: "reseller_demo_uid" },
];

/* ─────────────────────────  SUSCRIPCIONES  ─────────────────────────── */
export const SUSCRIPCIONES = [
  { _id: "sus_0001", actualizadoEn: AHORA, correo: "cliente.demo@example.com", creadoEn: T("2026-06-16"), cuentaCorreo: "cuenta001@gmail.com", cuentaPass: "DEMO-NO-USAR", estado: "activo", nombre: "Cliente Demo", notas: "", perfil: "Perfil 01", pinPerfil: "1234", precioVenta: 7, servicio: "netflix", tipo: "individual", vence: T("2026-07-16"), ws: "584140000000" },
  { _id: "sus_0002", actualizadoEn: AHORA, correo: "carlos@example.com", creadoEn: T("2026-06-01"), cuentaCorreo: "spotify001@gmail.com", cuentaPass: "DEMO-NO-USAR", estado: "activo", nombre: "Carlos R.", notas: "", perfil: "Titular", pinPerfil: "", precioVenta: 4.49, servicio: "spotify", tipo: "individual", vence: T("2026-06-20"), ws: "" },
  { _id: "sus_0003", actualizadoEn: AHORA, correo: "maria@example.com", creadoEn: T("2026-05-18"), cuentaCorreo: "disney001@gmail.com", cuentaPass: "DEMO-NO-USAR", estado: "activo", nombre: "María G.", notas: "Renovación automática", perfil: "Perfil 01", pinPerfil: "0001", precioVenta: 5.49, servicio: "disney", tipo: "individual", vence: T("2026-06-18"), ws: "" },
];

/* ────────────────────────  RENOVACIONES PENDIENTES  ────────────────── */
export const RENOVACIONES = [
  { _id: "ren_0001", dias_para_vencer: 2, email_usuario: "carlos@example.com", estado_notificacion: "pendiente", id_renovacion: "ren_0001", id_suscripcion: "sus_0002", precio_renovacion: 4.49, servicio: "spotify", nombre: "Carlos R." },
  { _id: "ren_0002", dias_para_vencer: 0, email_usuario: "maria@example.com", estado_notificacion: "pendiente", id_renovacion: "ren_0002", id_suscripcion: "sus_0003", precio_renovacion: 5.49, servicio: "disney", nombre: "María G." },
];

/* ───────────────────────────  COMENTARIOS  ─────────────────────────── */
export const COMENTARIOS = [
  { _id: "com_0001", aprobado: true, creadoEn: T("2026-06-02"), estrellas: 5, id_servicio: "netflix", nombre: "Ana C.", texto: "Excelente, activación al instante." },
  { _id: "com_0002", aprobado: true, creadoEn: T("2026-06-10"), estrellas: 5, id_servicio: "spotify", nombre: "Laura M.", texto: "Todo perfecto, muy recomendado." },
  { _id: "com_0003", aprobado: true, creadoEn: T("2026-06-12"), estrellas: 4, id_servicio: "chatgpt", nombre: "José P.", texto: "Buen precio y soporte rápido." },
  { _id: "com_0004", aprobado: false, creadoEn: T("2026-06-14"), estrellas: 3, id_servicio: "hbo", nombre: "Anónimo", texto: "Pendiente de moderación." },
];

/* ──────────────────────────  FAQ  ─────────────────────────── */
export const FAQS = [
  { _id: "faq_001", categoria: "general", id_faq: "faq_001", orden: 0, pregunta: "¿Cómo funciona NV Streaming?", respuesta: "NV Streaming es una plataforma de reventa de suscripciones digitales. Compras tu suscripción con nosotros y te entregamos las credenciales de acceso." },
  { _id: "faq_002", categoria: "pagos", id_faq: "faq_002", orden: 1, pregunta: "¿Qué métodos de pago aceptan?", respuesta: "Aceptamos Pago Móvil, Binance Pay, Zelle y PayPal. Tras el pago subes tu comprobante y activamos el servicio." },
  { _id: "faq_003", categoria: "garantia", id_faq: "faq_003", orden: 2, pregunta: "¿Tienen garantía?", respuesta: "Sí, todas las cuentas cuentan con 7 días de garantía. Si algo falla, te reemplazamos el acceso sin costo." },
  { _id: "faq_004", categoria: "entrega", id_faq: "faq_004", orden: 3, pregunta: "¿En cuánto tiempo recibo mi cuenta?", respuesta: "La activación es inmediata. En cuanto validamos el pago recibes las credenciales por WhatsApp y en tu panel." },
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
export const CHATS_SOPORTE = [
  {
    _id: "chat_0001", actualizadoEn: AHORA, email_usuario: "cliente.demo@example.com",
    estado_canal: "esperando_soporte", id_canal: "chat_0001", nombre_usuario: "Cliente Demo",
    rol_usuario: "cliente", ultimo_mensaje: "Hola, no puedo entrar a mi perfil de Netflix",
    mensajes: [
      { fecha: T("2026-06-16T10:00:00Z"), id_mensaje: "m1", leido: true, remitente: "cliente", texto: "Hola, buenas tardes" },
      { fecha: T("2026-06-16T10:01:00Z"), id_mensaje: "m2", leido: true, remitente: "soporte", texto: "¡Hola! ¿En qué podemos ayudarte?" },
      { fecha: T("2026-06-16T10:02:00Z"), id_mensaje: "m3", leido: false, remitente: "cliente", texto: "Hola, no puedo entrar a mi perfil de Netflix" },
    ],
  },
  {
    _id: "chat_0002", actualizadoEn: T("2026-06-15T18:00:00Z"), email_usuario: "carlos@example.com",
    estado_canal: "resuelto", id_canal: "chat_0002", nombre_usuario: "Carlos R.",
    rol_usuario: "cliente", ultimo_mensaje: "¡Gracias, ya funciona!",
    mensajes: [
      { fecha: T("2026-06-15T17:58:00Z"), id_mensaje: "m1", leido: true, remitente: "cliente", texto: "Mi Spotify pide contraseña" },
      { fecha: T("2026-06-15T17:59:00Z"), id_mensaje: "m2", leido: true, remitente: "soporte", texto: "Te reenvío las credenciales actualizadas" },
      { fecha: T("2026-06-15T18:00:00Z"), id_mensaje: "m3", leido: true, remitente: "cliente", texto: "¡Gracias, ya funciona!" },
    ],
  },
];

export const TICKETS = [
  { _id: "tk_0001", creadoEn: T("2026-06-16"), email_usuario: "cliente.demo@example.com", estado: "en_revision", historial_respuestas: ["Estamos revisando tu caso."], id_suscripcion_afectada: "sus_0001", id_ticket: "tk_0001", mensaje_cliente: "El PIN de mi perfil no funciona", tipo_falla: "pin_incorrecto" },
  { _id: "tk_0002", creadoEn: T("2026-06-14"), email_usuario: "maria@example.com", estado: "resuelto", historial_respuestas: ["Cuenta reemplazada.", "Confirmado por el cliente."], id_suscripcion_afectada: "sus_0003", id_ticket: "tk_0002", mensaje_cliente: "La cuenta pide verificación", tipo_falla: "cuenta_caida" },
];

/* ────────────────────  NOTIFICACIONES (cliente/admin)  ─────────────── */
export const NOTIFICACIONES = [
  { _id: "not_0001", creadoEn: T("2026-06-15"), leida: false, mensaje: "Servicio de NETFLIX activo", tipo: "nuevo_pedido", uid_origen: "cliente_demo_uid", url_destinas: "mi-cuenta.html" },
  { _id: "not_0002", creadoEn: T("2026-06-14"), leida: true, mensaje: "Tu recarga fue aprobada", tipo: "recarga", uid_origen: "reseller_demo_uid", url_destinas: "billetera.html" },
];

export const NOTIFICACIONES_ADMIN = [
  { _id: "nadm_0001", creadoEn: T("2026-06-16"), email: "cliente.demo@example.com", leido: false, mensaje: "Nuevo pedido pendiente de aprobación", tipo: "nuevo_pedido" },
  { _id: "nadm_0002", creadoEn: T("2026-06-16"), email: "revendedor@nvstreaming.com", leido: false, mensaje: "Recarga de billetera pendiente por 50 USD", tipo: "recarga_billetera" },
  { _id: "nadm_0003", creadoEn: T("2026-06-15"), email: "carlos@example.com", leido: true, mensaje: "Ticket de soporte resuelto", tipo: "ticket" },
];

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
  { _id: "disney", nombre: "Disney+", id_servicio: "disney", estado: 1, keywords: ["disney", "disney+", "disney plus"] },
  { _id: "hbo", nombre: "Max (HBO)", id_servicio: "hbo", estado: 1, keywords: ["hbo", "max", "hbo max"] },
  { _id: "spotify", nombre: "Spotify", id_servicio: "spotify", estado: 1, keywords: ["spotify"] },
  { _id: "appletv", nombre: "Apple TV+", id_servicio: "appletv", estado: 1, keywords: ["apple", "apple tv", "appletv"] },
  { _id: "paramount", nombre: "Paramount+", id_servicio: "paramount", estado: 1, keywords: ["paramount"] },
  { _id: "crunchyroll", nombre: "Crunchyroll", id_servicio: "crunchyroll", estado: 1, keywords: ["crunchyroll"] },
  { _id: "chatgpt", nombre: "ChatGPT", id_servicio: "chatgpt", estado: 1, keywords: ["chatgpt", "openai"] },
  { _id: "vix", nombre: "ViX", id_servicio: "vix", estado: 1, keywords: ["vix"] },
];

/* `codigos_verificacion` — historial/recepción de OTP.
 * cuenta_madre_id → doc de `inventario`; plataforma_id → `plataformas`. */
export const CODIGOS_VERIFICACION = [
  { _id: "otp_0001", cuenta_madre_id: "cuenta_netflix_001", plataforma_id: "netflix", codigo: "834192", recibido_via: "Telegram", remitente: "bot_netflix", texto_original: "Tu código de acceso de Netflix es 834192", fecha_recepcion: T("2026-06-16T11:58:00Z"), expira_at: T("2026-06-16T12:08:00Z"), leido: 0, obsoleto: false, perfil_id: "sus_0001", cliente_id: "cliente_demo_uid" },
  { _id: "otp_0002", cuenta_madre_id: "cuenta_disney_001", plataforma_id: "disney", codigo: "5521", recibido_via: "WhatsApp", remitente: "bot_disney", texto_original: "Disney+: tu código de verificación es 5521", fecha_recepcion: T("2026-06-16T11:40:00Z"), expira_at: T("2026-06-16T11:50:00Z"), leido: 1, obsoleto: false, perfil_id: "sus_0003", cliente_id: "" },
  { _id: "otp_0003", cuenta_madre_id: "cuenta_spotify_001", plataforma_id: "spotify", codigo: "77219340", recibido_via: "Telegram", remitente: "bot_spotify", texto_original: "Spotify code: 77219340", fecha_recepcion: T("2026-06-16T10:15:00Z"), expira_at: T("2026-06-16T10:25:00Z"), leido: 1, obsoleto: true, perfil_id: "sus_0002", cliente_id: "" },
];

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
