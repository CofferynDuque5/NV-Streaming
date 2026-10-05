/**
 * Plantillas de página del editor visual. Una plantilla crea la página como
 * borrador con sus bloques: nunca se publica sola. Lo que solo pueden escribir
 * los dueños (su historia, su misión, una foto) queda como borrador para que
 * lo reescriban antes de publicar.
 */
import type { BloqueSitio } from './esquemas/sitio.js';

export const IDS_PLANTILLAS = ['quienes-somos'] as const;
export type IdPlantilla = (typeof IDS_PLANTILLAS)[number];

export interface PlantillaPagina {
  /** Nombre en el selector del editor. */
  nombre: string;
  /** Qué trae, en una línea. */
  resumen: string;
  /** Ruta, título y descripción con los que se propone crear la página. */
  ruta: string;
  titulo: string;
  descripcion: string;
  bloques: BloqueSitio[];
}

/** Bloque de la historia: un borrador corto que los dueños deben reescribir. */
export const ID_BLOQUE_HISTORIA = 'qs02';

const QUIENES_SOMOS: PlantillaPagina = {
  nombre: 'Quiénes somos',
  resumen: 'Historia, lo que nos importa, cómo trabajamos, pagos y preguntas',
  ruta: '/quienes-somos',
  titulo: 'Quiénes somos',
  descripcion:
    'Conoce NV Streaming: servicios digitales autorizados que activamos en tu propia cuenta, con precios en bolívares y atención por WhatsApp.',
  bloques: [
    {
      id: 'qs01',
      tipo: 'portada',
      ancla: null,
      fondo: 'normal',
      etiqueta: 'Quiénes somos',
      titulo: 'Servicios digitales autorizados para Venezuela',
      destacado: 'para Venezuela',
      subtitulo:
        'Somos NV Streaming. Activamos streaming, música, IA y más en tu propia cuenta, con precios en bolívares a la tasa del día y soporte por WhatsApp.',
      botonPrimario: { texto: 'Ver catálogo', enlace: '/catalogo' },
      // Sin número inventado: lleva al formulario de soporte de la tienda.
      botonSecundario: { texto: 'Escríbenos', enlace: '/cuenta/soporte/nueva' },
      imagen: null,
      ilustracion: true,
    },
    {
      id: ID_BLOQUE_HISTORIA,
      tipo: 'texto',
      ancla: 'historia',
      fondo: 'normal',
      titulo: 'Nuestra historia',
      contenido:
        '**NV** son las iniciales de **Nathan y Valeryn**.\n\n' +
        'Vendemos solo servicios digitales autorizados y los activamos en tu propia cuenta, con precios en bolívares y atención por WhatsApp.\n\n' +
        '*Borrador: reemplaza este párrafo con su historia, en sus palabras: cómo nació la tienda, qué los motivó a crearla y qué quieren para cada cliente. Cierren con una frase que diga su misión.*',
    },
    {
      id: 'qs04',
      tipo: 'beneficios',
      ancla: 'valores',
      fondo: 'suave',
      etiqueta: null,
      titulo: 'Lo que nos importa',
      subtitulo: 'Lo que puedes esperar de NV en cada compra.',
      variante: 'tarjetas',
      boton: null,
      elementos: [
        {
          icono: 'escudo',
          titulo: 'Tu cuenta, a tu nombre',
          texto:
            'Activamos el servicio en tu propia cuenta con activaciones, códigos o tarjetas de regalo de distribuidores oficiales. Nunca vendemos cuentas compartidas ni entregamos usuarios o contraseñas de terceros.',
        },
        {
          icono: 'globo',
          titulo: 'Precios en bolívares',
          texto:
            'Ves cada precio en bolívares con la tasa del día. Si lo prefieres, también cobramos en dólares, euros, pesos colombianos, soles y pesos argentinos.',
        },
        {
          icono: 'soporte',
          titulo: 'Personas que te responden',
          texto:
            'El equipo te atiende por WhatsApp. En la tienda también tienes el chat para resolver dudas rápidas.',
        },
        {
          icono: 'rayo',
          titulo: 'Entrega en tu panel',
          texto:
            'Cuando el equipo confirma tu pago, tu activación y sus instrucciones aparecen en tu panel.',
        },
        {
          icono: 'billetera',
          titulo: 'Billetera NV',
          texto:
            'Recarga saldo una vez y paga tus próximos pedidos sin enviar un comprobante cada vez.',
        },
        {
          icono: 'check',
          titulo: 'Cada pago, revisado',
          texto: 'El equipo revisa cada comprobante antes de activar tu pedido.',
        },
      ],
    },
    {
      id: 'qs05',
      tipo: 'pasos',
      ancla: 'como-trabajamos',
      fondo: 'normal',
      etiqueta: null,
      titulo: 'Cómo trabajamos',
      subtitulo: 'Comprar en NV toma tres pasos.',
      elementos: [
        {
          titulo: 'Elige tu servicio',
          texto: 'Busca en el catálogo y agrega tus planes al carrito, hasta 5 por pedido.',
        },
        {
          titulo: 'Paga y envía tu comprobante',
          texto:
            'Paga con el método que prefieras y sube la captura. Si pagas con el saldo de tu billetera, no hace falta.',
        },
        {
          titulo: 'Recibe tu activación en tu panel',
          texto: 'Cuando el equipo confirma tu pago, te avisamos y ves en tu panel cómo activarlo.',
        },
      ],
    },
    {
      id: 'qs06',
      tipo: 'metodos-pago',
      ancla: 'pagos',
      fondo: 'normal',
      etiqueta: null,
      titulo: 'Cómo puedes pagar',
      subtitulo: 'Estos son los métodos activos hoy. Pagas en bolívares o en tu moneda.',
    },
    {
      id: 'qs07',
      tipo: 'panel',
      ancla: 'revendedores',
      fondo: 'normal',
      etiqueta: 'Para revendedores',
      titulo: 'Vende servicios digitales con precio de mayorista',
      resaltado: 'precio de mayorista',
      texto: 'Recarga saldo por adelantado y compra para tus clientes al precio de tu nivel.',
      puntos: [
        'Tres niveles: Bronce, Plata y Oro',
        'Precio de mayorista según tu nivel',
        'Saldo prepagado para comprar al momento',
        'Las mismas activaciones autorizadas, en la cuenta de tu cliente',
      ],
      boton: { texto: 'Quiero ser revendedor', enlace: '/cuenta/revendedor' },
      botonSecundario: null,
      visual: 'universo',
      categoria: 'streaming',
    },
    {
      id: 'qs08',
      tipo: 'canal',
      ancla: null,
      fondo: 'normal',
      etiqueta: null,
      titulo: 'Entérate primero en WhatsApp',
      texto: 'Únete a nuestro canal y recibe las ofertas y novedades de la tienda.',
      boton: 'Unirme al canal',
    },
    {
      id: 'qs09',
      tipo: 'preguntas',
      ancla: 'preguntas',
      fondo: 'suave',
      etiqueta: null,
      titulo: 'Preguntas sobre NV',
      subtitulo: null,
      elementos: [
        {
          pregunta: '¿Lo que venden es legal?',
          respuesta:
            'Sí. Solo vendemos servicios autorizados: activaciones, códigos o tarjetas de regalo de distribuidores oficiales, y servicios propios con licencia. Todo se activa en **tu propia cuenta**.',
        },
        {
          pregunta: '¿Me van a dar un usuario y una contraseña?',
          respuesta:
            'No. Nunca vendemos cuentas compartidas ni entregamos usuarios o contraseñas de terceros. Usas tu cuenta de siempre o creas una gratis en la página del servicio.',
        },
        {
          pregunta: '¿Cuánto tarda la entrega?',
          respuesta:
            'Depende del servicio. Cuando el equipo confirma tu pago, ves tu activación y sus instrucciones en tu panel, y te avisamos por correo.',
        },
        {
          pregunta: '¿Por qué tengo que enviar un comprobante?',
          respuesta:
            'Los pagos como Pago Móvil o transferencia los revisa el equipo uno por uno. Con el comprobante confirmamos tu pago y activamos tu pedido. Si pagas con el saldo de tu billetera, no tienes que enviarlo.',
        },
        {
          pregunta: '¿Puedo pedir un reembolso?',
          respuesta:
            'Cada caso se revisa según nuestras [Políticas y términos](/terminos). Escríbenos por WhatsApp con tu número de pedido.',
        },
        {
          pregunta: '¿En qué monedas puedo pagar?',
          respuesta:
            'Los precios se muestran en bolívares con la tasa del día. También cobramos en dólares, euros, pesos colombianos, soles y pesos argentinos: cambia la moneda arriba y elige un método de pago.',
        },
        {
          pregunta: '¿Cómo me hago revendedor?',
          respuesta:
            'Entra en [Ser revendedor](/cuenta/revendedor) y envía tu solicitud. Como revendedor recargas saldo por adelantado y compras a precio de mayorista según tu nivel: **Bronce, Plata u Oro**.',
        },
      ],
    },
    {
      id: 'qs10',
      tipo: 'llamada',
      ancla: null,
      fondo: 'acento',
      titulo: '¿Listo para empezar?',
      texto: 'Elige tu servicio, paga en bolívares y recibe tu activación en tu panel.',
      boton: { texto: 'Ver catálogo', enlace: '/catalogo' },
      botonSecundario: null,
    },
  ],
};

export const PLANTILLAS_PAGINA: Record<IdPlantilla, PlantillaPagina> = {
  'quienes-somos': QUIENES_SOMOS,
};

/** Ruta de la página «Quiénes somos» (el pie de la tienda la enlaza cuando está publicada). */
export const RUTA_QUIENES_SOMOS = QUIENES_SOMOS.ruta;
