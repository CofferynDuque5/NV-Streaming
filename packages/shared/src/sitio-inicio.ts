/**
 * Contenido de la página de inicio de la tienda. La semilla lo publica como
 * versión 1 y la web lo muestra si la API no responde o todavía no hay una
 * portada publicada. Sin datos inventados: los bloques de la tienda (servicios,
 * universos, lo más pedido, métodos de pago, canal) se llenan con datos reales
 * y no se muestran si no los hay.
 */
import type { BloqueSitio } from './esquemas/sitio.js';
import { REGLAS_COBRO } from './monedas.js';

const MAX_PLANES = REGLAS_COBRO.articulosPorPedido;

export const PAGINA_INICIO = {
  ruta: '/',
  titulo: 'NV Streaming',
  descripcion:
    'Streaming, música y más servicios autorizados en un solo portal. Pagas en tu moneda y lo gestionas desde tu panel.',
} as const;

export const BLOQUES_INICIO: BloqueSitio[] = [
  {
    id: 'portada',
    tipo: 'portada',
    fondo: 'normal',
    etiqueta: 'Bienvenido al multiverso NV',
    titulo: 'Todos tus universos, en un solo portal',
    destacado: 'en un solo portal',
    subtitulo:
      'Streaming, música y más servicios autorizados. Pagas en tu moneda y lo gestionas todo desde tu panel.',
    botonPrimario: { texto: 'Explorar servicios', enlace: '/catalogo' },
    botonSecundario: { texto: 'Cómo comprar', enlace: '/#como-comprar' },
    imagen: null,
    ilustracion: true,
  },
  {
    id: 'tira',
    tipo: 'servicios',
    fondo: 'normal',
    variante: 'tira',
    etiqueta: null,
    titulo: 'Servicios disponibles',
    subtitulo: null,
    categoria: null,
    orden: 'recomendados',
    limite: 24,
    filtros: false,
  },
  {
    id: 'confianza',
    tipo: 'beneficios',
    fondo: 'normal',
    variante: 'compacta',
    etiqueta: null,
    titulo: 'Por qué comprar en NV',
    subtitulo: null,
    boton: null,
    elementos: [
      {
        icono: 'globo',
        titulo: 'Pagas en tu moneda',
        texto: 'Bolívares, dólares y más, con la tasa del día',
      },
      {
        icono: 'escudo',
        titulo: 'Solo servicios autorizados',
        texto: 'Nada de cuentas compartidas',
      },
      {
        icono: 'soporte',
        titulo: 'Soporte en español',
        texto: 'Personas reales que siguen tu caso',
      },
      {
        icono: 'billetera',
        titulo: 'Billetera NV',
        texto: 'Recarga saldo y compra en un toque',
      },
    ],
  },
  {
    id: 'universos',
    tipo: 'universos',
    fondo: 'normal',
    etiqueta: null,
    titulo: 'Elige tu universo',
    subtitulo: 'Cada categoría es un mundo con sus propios planes',
  },
  {
    id: 'ranking',
    tipo: 'ranking',
    fondo: 'normal',
    etiqueta: null,
    titulo: 'Lo más pedido',
    subtitulo: 'Según las activaciones y renovaciones del último mes',
    limite: 5,
  },
  {
    id: 'streaming',
    tipo: 'panel',
    fondo: 'normal',
    etiqueta: 'Universo streaming',
    titulo: 'Cine, series y TV de todas las galaxias',
    resaltado: 'de todas las galaxias',
    texto: 'Eliges tu plataforma, pagas en tu moneda y la gestionas desde tu panel.',
    puntos: ['Planes de 1 mes en adelante', 'Para teléfono, TV y computadora'],
    boton: { texto: 'Ver planes de streaming', enlace: '/catalogo?categoria=streaming' },
    botonSecundario: null,
    visual: 'universo',
    categoria: 'streaming',
  },
  {
    id: 'todos',
    tipo: 'servicios',
    fondo: 'normal',
    variante: 'rejilla',
    etiqueta: null,
    titulo: 'Todos los servicios',
    subtitulo: 'Precios en tu moneda, con la tasa del día',
    categoria: null,
    orden: 'recomendados',
    limite: 12,
    filtros: true,
  },
  {
    id: 'billetera',
    tipo: 'panel',
    fondo: 'normal',
    etiqueta: 'Billetera NV',
    titulo: 'Recarga una vez y compra en un toque',
    resaltado: 'en un toque',
    texto:
      'Reportas tu recarga con el comprobante, el equipo la confirma y el saldo queda listo para tus próximas compras.',
    puntos: [
      'Paga pedidos completos con tu saldo',
      'Si lo eliges, tus facturas pendientes se pagan al confirmarse tu recarga',
      'Cada movimiento queda en tu panel',
    ],
    boton: { texto: 'Recargar saldo', enlace: '/cuenta/billetera' },
    botonSecundario: null,
    visual: 'billetera',
    categoria: null,
  },
  {
    id: 'pasos',
    tipo: 'pasos',
    ancla: 'como-comprar',
    fondo: 'normal',
    etiqueta: null,
    titulo: 'Cómo comprar',
    subtitulo: null,
    elementos: [
      {
        titulo: 'Elige tus servicios',
        texto: `Agrega hasta ${MAX_PLANES} planes al carrito y págalos juntos.`,
      },
      {
        titulo: 'Paga y sube el comprobante',
        texto: 'Con los métodos de pago activos o con el saldo de tu billetera.',
      },
      {
        titulo: 'Gestiónalo desde tu panel',
        texto: 'Cuando confirmamos tu pago, tu plan se activa y lo ves en tu panel.',
      },
    ],
  },
  {
    id: 'pagos',
    tipo: 'metodos-pago',
    fondo: 'normal',
    etiqueta: null,
    titulo: 'Métodos de pago',
    subtitulo: 'Los que el equipo tiene activos hoy',
  },
  {
    id: 'preguntas',
    tipo: 'preguntas',
    ancla: 'preguntas',
    fondo: 'normal',
    etiqueta: null,
    titulo: 'Preguntas frecuentes',
    subtitulo: null,
    elementos: [
      {
        pregunta: '¿Cómo pago?',
        respuesta:
          'Eliges tus planes, pagas con uno de los métodos de pago activos o con el saldo de tu billetera y subes tu comprobante desde tu panel. El equipo lo revisa y lo confirma.',
      },
      {
        pregunta: '¿Puedo pagar en bolívares?',
        respuesta:
          'Sí. Los precios en bolívares se calculan con la tasa del día que publica el equipo y el monto exacto queda fijado en tu factura.',
      },
      {
        pregunta: '¿Puedo comprar varios servicios a la vez?',
        respuesta: `Sí. Agrega hasta ${MAX_PLANES} planes al carrito y págalos juntos en un solo pedido.`,
      },
      {
        pregunta: '¿Me dan una cuenta compartida?',
        respuesta:
          'No. Solo vendemos servicios autorizados y nunca te pedimos ni te damos contraseñas de otras personas.',
      },
      {
        pregunta: '¿Cómo recargo mi billetera?',
        respuesta:
          'Desde tu panel, en Billetera: reportas tu recarga con el comprobante y, cuando el equipo la confirma, el saldo queda listo.',
      },
      {
        pregunta: '¿Qué pasa si mi servicio falla?',
        respuesta: 'Abre un ticket de soporte desde tu panel y te respondemos con seguimiento.',
      },
    ],
  },
  {
    id: 'canal',
    tipo: 'canal',
    fondo: 'normal',
    etiqueta: null,
    titulo: 'Novedades primero en tu WhatsApp',
    texto: 'Únete al canal de NV y entérate de los servicios nuevos antes que nadie.',
    boton: 'Unirme al canal',
  },
  {
    id: 'reventa',
    tipo: 'panel',
    ancla: 'revendedores',
    fondo: 'acento',
    etiqueta: 'Para revendedores',
    titulo: 'Vende todos los universos con precio de mayorista',
    resaltado: 'precio de mayorista',
    texto:
      'Recargas saldo, compras activaciones al instante y tu precio mejora según tu nivel. El equipo de NV habilita las cuentas de revendedor.',
    puntos: [],
    boton: { texto: 'Quiero ser revendedor', enlace: '/cuenta/revendedor' },
    botonSecundario: null,
    visual: 'ninguno',
    categoria: null,
  },
];
