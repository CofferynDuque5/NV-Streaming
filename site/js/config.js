/**
 * config.js — Configuración central del frontend de NV Stream.
 *
 * ÚNICO lugar para editar marca, rutas de assets, logo, colores, WhatsApp,
 * sonidos y velocidades de animación. Se carga como script clásico ANTES del
 * runtime, exponiendo `window.NV_CONFIG`, de modo que cualquier componente,
 * módulo o plantilla pueda leer de aquí sin buscar valores dispersos.
 *
 * Para cambiar el logo, el número de WhatsApp o un sonido, EDITA SOLO ESTE
 * ARCHIVO. (En un pipeline con bundler, estos valores pueden inyectarse desde
 * variables de entorno del frontend.)
 */
(function () {
  "use strict";

  var ASSETS = "assets/";        // carpeta base de imágenes
  var SOUNDS = ASSETS + "sounds/"; // carpeta de sonidos (dentro de assets/)

  window.NV_CONFIG = {
    /* ── Marca (IDENTIDAD CANÓNICA — fuente de verdad: blueprint + logo real) ── */
    marca: {
      nombre: "NV Streaming",
      subtitulo: "Nathan y Valeryn Streaming",
      // Logo: si `imagen` tiene ruta se usa la imagen; si no, se muestra el texto.
      // El logo real de la marca (monograma cósmico NV) vive en assets/logo-nv.svg.
      logo: {
        texto: "NV",
        wordmark: "STREAMING",            // subtítulo del lockup (antes decía "PLATFORM")
        nombreCompleto: "NV STREAMING",
        imagen: ASSETS + "logo-nv-header.svg",   // lockup horizontal para el header
        gradiente: "linear-gradient(135deg,#0A3AAE,#00CFFF 60%,#9B3FFF)",
      },
    },

    /* ── Rutas de assets (centralizadas) ── */
    assets: {
      base: ASSETS,
      sounds: SOUNDS,
      // Imágenes de marca reutilizables (identidad NV, NO logos de terceros).
      img: {
        favicon: ASSETS + "favicon-nv.svg",
        logo: ASSETS + "logo-nv.svg",
      },
    },

    /* ── Paleta (tokens; el tema de PostgreSQL puede sobreescribirlos) ── */
    colores: {
      void: "#04040C",
      energyBlue: "#00CFFF",
      energyViolet: "#9B3FFF",
      auroraPink: "#FF30A0",
      success: "#00D4A0",
      danger: "#FF4466",
      whatsapp: "#25D366",
    },

    /* ── Backend real (catálogo/precios por fetch) ── */
    api: {
      base: "http://localhost:3000",   // agente NV Streaming (Node/Express)
      servicios: "/api/servicios",
      config: "/api/config",           // parametros (tasa_bcv) + tema
      chat: "/api/chat",               // asistente NV (enrutador de intenciones)
      perfil: "/api/user/profile",     // perfil real o estado Guest
    },

    // Acceso con Google (opcional). Pega aquí tu Client ID OAuth de Google (Web)
    // y define el MISMO en el backend (GOOGLE_CLIENT_ID). Vacío ⇒ botón desactivado.
    // Cómo obtenerlo: console.cloud.google.com → APIs & Services → Credenciales →
    // "ID de cliente de OAuth" tipo Web → Orígenes autorizados: tu dominio.
    googleClientId: "",

    /* ── Moneda / conversor ── */
    moneda: {
      base: "USD",
      // Tasa base USD→VES (editable; el backend/parametros.tasa_bcv la sobreescribe).
      tasaVES: 36.5,
    },

    /* ── ImgBB (persistencia de imágenes · plan gratuito sin caducidad) ── */
    // Pega aquí tu API key de https://api.imgbb.com/ para habilitar las subidas.
    imgbb: {
      apiKey: "",                      // ← configúrala en el panel; NO se hardcodea.
    },

    /* ── WhatsApp (asistente → soporte humano) ── */
    // Número CANÓNICO del negocio (blueprint · parametros.whatsapp).
    whatsapp: {
      numero: "584164600411",          // solo dígitos, formato internacional sin '+'
      mensaje: "Hola, necesito asistencia con mi cuenta de NV Streaming",
      habilitado: true,                // canal de WhatsApp activo (botones enlazados)
    },

    /* ── Redes / canales oficiales (EDITA aquí tus enlaces reales) ── */
    // Deja en "" cualquiera que no uses y el botón correspondiente se ocultará.
    redes: {
      telegram: "https://t.me/nathanstreaming",   // canal de Telegram del negocio
      instagram: "",                   // p.ej. "https://instagram.com/nvstreaming"
      x: "",                           // p.ej. "https://x.com/nvstreaming"
    },

    /* ── Métodos de pago aceptados (se muestran en el modal "Métodos de pago") ── */
    // Datos NO sensibles para orientar al cliente; los detalles reales de la
    // transferencia se confirman por WhatsApp. Edita libremente.
    pagos: [
      { nombre: "Pago Móvil",        detalle: "Bancos de Venezuela · confirmación por WhatsApp", icono: "movil"  },
      { nombre: "Transferencia",     detalle: "Cuenta en bolívares · envía el comprobante",       icono: "banco"  },
      { nombre: "Binance / USDT",    detalle: "Cripto (red BEP20/TRC20) · tasa del día",          icono: "cripto" },
      { nombre: "Zelle",             detalle: "Pagos en USD · consulta disponibilidad",            icono: "dolar"  },
    ],

    /* ── Sonidos (rutas dentro de web/assets/sounds/) ── */
    sonido: {
      habilitado: true,
      volumen: 0.35,
      pistas: {
        click: SOUNDS + "click.wav",
        success: SOUNDS + "success.wav",
        notify: SOUNDS + "notify.wav",
        error: SOUNDS + "error.wav",
      },
    },

    /* ── Velocidades de animación (fácilmente editables) ── */
    animacion: {
      transicion: "0.22s",
      curva: "cubic-bezier(0.32,0.72,0,1)",
      marquesina: "25s",
      pulso: "2.2s",
    },

    /* ── Flags de funcionalidad ── */
    flags: {
      whatsappFab: true,
      sonidos: true,
      modales: true,
    },
  };
})();
