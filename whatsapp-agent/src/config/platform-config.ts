/**
 * platform-config.ts — Configuración canónica de la plataforma (fuente única del
 * gateway HTTP). Refleja `configuracion_sistema/parametros` y `tema_interfaz`
 * del blueprint. La web la consume por `GET /api/config` para leer, entre otros,
 * la `tasa_bcv` viva del conversor de monedas. Sin datos inventados: son los
 * valores canónicos del negocio (editables aquí o vía variables de entorno).
 */

export const PARAMETROS = {
  moneda_defecto: 'USD',
  tasa_bcv: 36.5,
  tasa_cop: 4000,
  tasa_eur: 0.92,
  tasa_pen: 3.8,
  garantia_dias: 7,
  email_soporte: 'soporte@nvstreaming.com',
  whatsapp: '584164600411',
  instagram: '@nvstreaming',
  telegram: '@nvstreaming',
  tiktok: '@nvstreaming',
  facebook: 'https://facebook.com/nvstreaming',
  topbar_texto: '⚡ NV Streaming — Activación inmediata · Soporte 24/7',
} as const;

export const TEMA_INTERFAZ = {
  bg_space_core: '#0d0d1b',
  bg_space_dark: '#05050b',
  bg_surface_opaque: '#0d0d13',
  curva_animacion: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  fuente_body: 'Lexend',
  fuente_display: 'Orbitron',
  fuente_sans: 'Inter',
  logo_texto: 'NV STREAMING',
  logo_url_img: '',
  neon_cyan: '#00d2ff',
  neon_green: '#00ffcc',
  neon_orange: '#ff6b00',
  neon_purple: '#bc00dd',
  velocidad_marquesina: '25s',
  velocidad_transiciones: '0.3s',
} as const;

export const PLANTILLAS_MENSAJES = {
  notificacion_pedido_aprobado:
    '✅ Hola {{nombre}}, tu pedido {{id_pedido}} fue APROBADO. Tus credenciales: {{credenciales}}. Garantía: {{dias_garantia}} días. ¡Gracias por confiar en NV Streaming!',
  notificacion_pedido_pendiente:
    'Hola {{nombre}}, recibimos tu pedido {{id_pedido}} por {{total_usd}} ({{total_local}} {{moneda}}). Referencia: {{referencia}}. Lo validamos y te avisamos.',
  notificacion_pedido_rechazado:
    'Hola {{nombre}}, tu trámite {{id_tramite}} no pudo validarse. Escríbenos para ayudarte.',
  notificacion_recarga_aprobada:
    'Hola {{nombre}}, tu recarga {{id_recarga}} por {{monto_usd}} fue acreditada. Nuevo saldo: {{nuevo_saldo}}.',
} as const;

export type Parametros = typeof PARAMETROS;
export type TemaInterfaz = typeof TEMA_INTERFAZ;
export type PlantillasMensajes = typeof PLANTILLAS_MENSAJES;
