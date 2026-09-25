/**
 * Contenido de la página de inicio tal como estaba antes del editor visual. La
 * semilla lo publica como versión 1 y la web lo muestra si la API no responde
 * o todavía no hay una portada publicada. Sin datos inventados.
 */
import type { BloqueSitio } from './esquemas/sitio.js';

export const PAGINA_INICIO = {
  ruta: '/',
  titulo: 'NV Streaming',
  descripcion:
    'Servicios de streaming autorizados, con activación, pagos y soporte en un solo lugar.',
} as const;

export const BLOQUES_INICIO: BloqueSitio[] = [
  {
    id: 'portada',
    tipo: 'portada',
    fondo: 'normal',
    etiqueta: 'Solo servicios autorizados',
    titulo: 'Tu streaming, en regla y sin complicaciones.',
    destacado: 'en regla',
    subtitulo:
      'NV Streaming reúne planes autorizados, pagos seguros y soporte en español en un solo panel, para ti y para quienes revenden.',
    botonPrimario: { texto: 'Crear mi cuenta', enlace: '/registro' },
    botonSecundario: { texto: 'Ver planes y precios', enlace: '/planes' },
    imagen: null,
    ilustracion: true,
  },
  {
    id: 'pasos',
    tipo: 'pasos',
    ancla: 'como-funciona',
    fondo: 'suave',
    etiqueta: 'Cómo funciona',
    titulo: 'Tres pasos, sin sorpresas',
    subtitulo: null,
    elementos: [
      {
        titulo: 'Elige tu plan',
        texto: 'Compara planes de servicios autorizados con precios claros y sin letra pequeña.',
      },
      {
        titulo: 'Paga de forma segura',
        texto:
          'Paga en dólares, bolívares, pesos, soles o euros y envía tu comprobante. Nunca te pedimos los datos de tu tarjeta.',
      },
      {
        titulo: 'Actívalo y gestiónalo',
        texto: 'Sigue el estado de tus servicios, renovaciones y pagos desde tu panel.',
      },
    ],
  },
  {
    id: 'razones',
    tipo: 'beneficios',
    fondo: 'normal',
    variante: 'tarjetas',
    etiqueta: 'Por qué NV',
    titulo: 'Confianza desde el primer pago',
    subtitulo: null,
    boton: null,
    elementos: [
      {
        icono: 'insignia',
        titulo: 'Solo servicios autorizados',
        texto:
          'Trabajamos con contenido licenciado y distribuidores oficiales. Nada de cuentas compartidas.',
      },
      {
        icono: 'tarjeta',
        titulo: 'Pagos protegidos',
        texto:
          'Los cobros automáticos solo se activan con tu autorización expresa y los puedes cancelar.',
      },
      {
        icono: 'candado',
        titulo: 'Tu cuenta, blindada',
        texto:
          'Verificación en dos pasos, sesiones que puedes cerrar a distancia y datos cifrados.',
      },
      {
        icono: 'soporte',
        titulo: 'Soporte en español',
        texto: 'Personas reales que conocen tu historial y resuelven con seguimiento.',
      },
    ],
  },
  {
    id: 'reventa',
    tipo: 'beneficios',
    ancla: 'revendedores',
    fondo: 'acento',
    variante: 'lista',
    etiqueta: 'Para revendedores',
    titulo: 'Vende NV con precio mayorista',
    subtitulo:
      'Un panel propio para comprar activaciones con tu saldo, seguir tus ventas y atender a tus clientes. El equipo de NV habilita las cuentas de revendedor.',
    boton: { texto: 'Quiero revender', enlace: '/registro' },
    elementos: [
      {
        icono: 'billetera',
        titulo: 'Saldo prepagado',
        texto: 'Recargas tu saldo y compras activaciones al instante, sin esperar aprobaciones.',
      },
      {
        icono: 'capas',
        titulo: 'Precio mayorista por nivel',
        texto: 'Cuanto más vendes, mejor es tu precio de compra.',
      },
      {
        icono: 'tienda',
        titulo: 'Tú pones el precio final',
        texto: 'Cobras a tus clientes a tu manera y llevas el control desde tu panel.',
      },
    ],
  },
  {
    id: 'llamada',
    tipo: 'llamada',
    fondo: 'normal',
    titulo: 'Crea tu cuenta y activa tu plan hoy',
    texto: 'Registrarte es gratis y solo necesitas un correo. Paga en bolívares o en tu moneda.',
    boton: { texto: 'Crear mi cuenta', enlace: '/registro' },
    botonSecundario: { texto: 'Ver planes', enlace: '/planes' },
  },
];
