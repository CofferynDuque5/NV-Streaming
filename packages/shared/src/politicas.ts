import { LONGITUD_MINIMA_CONTRASENA } from './contrasenas.js';
import {
  CLAVE_CARRITO,
  COOKIE_AVISO_TASA,
  DURACION_AVISO_TASA_SEGUNDOS,
  DURACION_COOKIE_MONEDA_SEGUNDOS,
} from './cookies.js';
import { CATEGORIAS_TICKET } from './esquemas/soporte.js';
import type { EstadoSuscripcion } from './esquemas/suscripciones.js';
import { type Moneda, MONEDAS_CON_TASA, REGLAS_COBRO } from './monedas.js';
import { INFO_PASARELA } from './pagos-en-linea.js';
import { type ClavePorDefinir, POR_DEFINIR } from './politicas-por-definir.js';
import { exige2fa } from './roles.js';
import { NOMBRES_COOKIE_SESION } from './sesion.js';
import { COOKIE_MONEDA } from './ubicacion.js';

/**
 * Políticas y términos de NV Streaming (/politicas): el único lugar donde vive
 * su texto, con su versión y la fecha desde la que rige.
 *
 * Todo lo que afirma sale de lo que el sistema hace: los plazos de REGLAS_COBRO,
 * las pasarelas y monedas, los nombres de las cookies y, con `CifrasPoliticas`,
 * lo que la API tiene configurado (sesión, comprobantes, límites de uso, avisos
 * y reintentos). Lo que el código no define va como «Por definir»
 * (politicas-por-definir.ts) y nunca se inventa.
 *
 * Si cambias el texto (o completas un «Por definir»), sube `version` y
 * `vigenteDesde`: al registrarse, cada cliente queda con la versión que aceptó.
 *
 * Marcado del texto: **negrita**, [enlace](/ruta) y {pd:clave} para un dato
 * por definir.
 */
export const POLITICAS = {
  version: '1.0',
  /** Fecha (AAAA-MM-DD, hora de Venezuela) desde la que rige esta versión. */
  vigenteDesde: '2026-10-05',
} as const;

export const RUTA_POLITICAS = '/politicas';

/** Secciones de la página, en orden. Cada una es un ancla (/politicas#terminos…). */
export const ANCLAS_POLITICAS = [
  'terminos',
  'privacidad',
  'reembolsos',
  'entregas',
  'revendedores',
  'cookies',
  'contacto',
] as const;
export type AnclaPolitica = (typeof ANCLAS_POLITICAS)[number];

export const enlacePoliticas = (ancla: AnclaPolitica) => `${RUTA_POLITICAS}#${ancla}`;

/** Límite de uso de la API: `maximo` intentos cada `ventanaSegundos`. */
export interface LimiteUsoPublico {
  maximo: number;
  ventanaSegundos: number;
}

/** Lo que la API tiene configurado y el texto nombra (GET /sitio/publico/politicas). */
export interface CifrasPoliticas {
  /** Nombre de la cookie de sesión que pone la API (con HTTPS lleva el prefijo __Host-). */
  cookieSesion: string;
  sesionHoras: number;
  sesionInactividadMinutos: number;
  /** Tamaño máximo de un comprobante de pago. */
  comprobanteMaxMb: number;
  revelarCodigos: LimiteUsoPublico;
  reportarRecargas: LimiteUsoPublico;
  /** Días antes del vencimiento en que se recuerda; `null` si el recordatorio está apagado. */
  recordatorioDias: number[] | null;
  avisoGracia: boolean;
  avisoSuspension: boolean;
  avisoReactivacion: boolean;
  /** Días de reintento del cobro automático autorizado; `null` si está apagado. */
  reintentosCobroDias: number[] | null;
}

export type BloquePolitica =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'lista'; elementos: string[] }
  | { tipo: 'datos'; filas: { termino: string; detalle: string }[] }
  | { tipo: 'estados'; filas: { estado: EstadoSuscripcion; detalle: string }[] }
  | { tipo: 'cookies'; filas: { nombre: string; uso: string; duracion: string }[] }
  /** Botones para escribir a soporte (WhatsApp si está configurado, o un ticket). */
  | { tipo: 'contacto' };

export interface SeccionPolitica {
  id: AnclaPolitica;
  titulo: string;
  /** Nombre corto para el índice. */
  corto: string;
  bloques: BloquePolitica[];
}

export interface DocumentoPoliticas {
  version: string;
  vigenteDesde: string;
  /** «Lo esencial en 1 minuto». */
  esencial: string[];
  secciones: SeccionPolitica[];
}

/* ------------------------------------------------------------------ formato */

/** «a, b y c» (o «a, b o c»), con «e» y «u» cuando el último empieza por «i» u «o». */
export function enumerar(partes: readonly string[], conjuncion: 'y' | 'o' = 'y'): string {
  if (partes.length <= 1) return partes.join('');
  const ultimo = partes[partes.length - 1] as string;
  const nexo =
    conjuncion === 'y' ? (/^h?i(?!e)/i.test(ultimo) ? 'e' : 'y') : /^h?o/i.test(ultimo) ? 'u' : 'o';
  return `${partes.slice(0, -1).join(', ')} ${nexo} ${ultimo}`;
}

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);

/** «7, 3 y 1 días» (o «1 día»). */
function listaDias(lista: readonly number[]): string {
  return lista.length === 1 && lista[0] === 1 ? '1 día' : `${enumerar(lista.map(String))} días`;
}

/** Duración legible: «1 año», «12 horas», «2 horas», «90 minutos». */
export function duracionLegible(segundos: number): string {
  const unidades: [number, string, string][] = [
    [365 * 24 * 3600, 'año', 'años'],
    [24 * 3600, 'día', 'días'],
    [3600, 'hora', 'horas'],
    [60, 'minuto', 'minutos'],
  ];
  for (const [s, uno, varios] of unidades) {
    if (segundos >= s && segundos % s === 0) {
      const n = segundos / s;
      return `${n} ${n === 1 ? uno : varios}`;
    }
  }
  return `${segundos} segundos`;
}

const porVentana = (segundos: number) =>
  segundos === 3600
    ? 'por hora'
    : segundos === 24 * 3600
      ? 'por día'
      : `cada ${duracionLegible(segundos)}`;

const PLURAL_MONEDA: Record<Moneda, string> = {
  VES: 'bolívares',
  USD: 'dólares',
  ARS: 'pesos argentinos',
  COP: 'pesos colombianos',
  PEN: 'soles',
  EUR: 'euros',
};
const monedas = (lista: readonly Moneda[]) =>
  enumerar(
    lista.map((m) => PLURAL_MONEDA[m]),
    'o',
  );

const TEMA_TICKET: Record<(typeof CATEGORIAS_TICKET)[number], string> = {
  pagos: 'pagos',
  acceso: 'acceso',
  suscripcion: 'suscripción',
  cuenta: 'cuenta',
  otro: 'otro tema',
};

const pd = (clave: ClavePorDefinir) => `{pd:${clave}}`;

/* -------------------------------------------------------------------- texto */

/**
 * El documento completo. `cifras` es `null` si la API no respondió: entonces las
 * frases que dependen de su configuración se dicen sin el número (o se omiten).
 */
export function textoPoliticas(datos: {
  cifras: CifrasPoliticas | null;
  /** Hay un WhatsApp de soporte configurado en el editor (Contacto y redes). */
  whatsapp: boolean;
}): DocumentoPoliticas {
  const { cifras, whatsapp } = datos;
  const R = REGLAS_COBRO;
  const paypal = INFO_PASARELA.paypal;
  const mercadoPago = INFO_PASARELA.mercadopago;
  const recurrentes = [paypal, mercadoPago].filter((p) => p.admiteCobroRecurrente);
  const sinRecurrente = [paypal, mercadoPago].filter((p) => !p.admiteCobroRecurrente);

  const avisos = cifras
    ? [
        cifras.recordatorioDias?.length
          ? `antes del vencimiento (${listaDias([...cifras.recordatorioDias].sort((a, b) => b - a))} antes)`
          : null,
        cifras.avisoGracia ? 'al entrar en gracia' : null,
        cifras.avisoSuspension ? 'al suspenderse' : null,
        cifras.avisoReactivacion ? 'al reactivarse' : null,
      ].filter((x): x is string => x !== null)
    : [];

  const terminos: BloquePolitica[] = [
    {
      tipo: 'parrafo',
      texto:
        'Estos términos se aplican cuando usas la tienda NV Streaming, creas una cuenta o compras un servicio. Al crear tu cuenta marcas que los aceptas junto con la política de privacidad.',
    },
    { tipo: 'subtitulo', texto: 'Quién vende' },
    { tipo: 'parrafo', texto: `NV Streaming, de Nathan y Valeryn. ${pd('vendedor')}` },
    { tipo: 'subtitulo', texto: 'Qué vendemos' },
    {
      tipo: 'lista',
      elementos: [
        'Activaciones, códigos y tarjetas de regalo de **distribuidores oficiales**, y nuestro servicio propio con licencia.',
        'Todo se activa en **tu propia cuenta** del servicio: la que ya usas o una que creas gratis en su página.',
        'Nunca vendemos cuentas compartidas ni entregamos usuarios o contraseñas de terceros. El sistema no deja enviar una entrega que lo parezca.',
      ],
    },
    { tipo: 'subtitulo', texto: 'Tu cuenta' },
    {
      tipo: 'lista',
      elementos: [
        `Te registras con tu nombre, tu correo y una contraseña de al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres. Confirmas tu correo antes de entrar.`,
        `Puedes activar la verificación en dos pasos con una app de códigos.${exige2fa('revendedor') ? ' Para revendedores es obligatoria.' : ''}`,
        'Cuida tu contraseña y tus códigos de verificación: no los compartas con nadie, tampoco con alguien que diga ser del equipo.',
        `Edad mínima para comprar: ${pd('edadMinima')}`,
      ],
    },
    { tipo: 'subtitulo', texto: 'Uso correcto' },
    {
      tipo: 'lista',
      elementos: [
        `Los códigos y enlaces de activación son para la cuenta a la que se compraron: **no los compartas**, no los publiques y no los revendas (si eres revendedor, mira [Revendedores](${enlacePoliticas('revendedores')})).`,
        'Usa cada servicio según las condiciones de su proveedor oficial.',
        cifras
          ? `Para evitar abusos hay límites de uso: por ejemplo, puedes mostrar tus códigos hasta ${cifras.revelarCodigos.maximo} veces ${porVentana(cifras.revelarCodigos.ventanaSegundos)} y reportar hasta ${cifras.reportarRecargas.maximo} recargas de billetera ${porVentana(cifras.reportarRecargas.ventanaSegundos)}.`
          : 'Para evitar abusos hay límites de uso, por ejemplo para mostrar tus códigos o reportar recargas de billetera.',
      ],
    },
    { tipo: 'subtitulo', texto: 'Suspensión de cuentas' },
    {
      tipo: 'parrafo',
      texto: `El equipo puede suspender una cuenta. Mientras está suspendida no puedes entrar; escribe a soporte para saber el motivo. ${pd('motivosSuspension')}`,
    },
    { tipo: 'subtitulo', texto: 'Cambios y ley aplicable' },
    {
      tipo: 'parrafo',
      texto: `Si cambiamos estas reglas, actualizamos la fecha y la versión al inicio de esta página. ${pd('avisoCambios')}`,
    },
    { tipo: 'parrafo', texto: pd('leyAplicable') },
  ];

  const privacidad: BloquePolitica[] = [
    {
      tipo: 'parrafo',
      texto: 'Guardamos solo los datos que la tienda necesita para funcionar. Así los usamos:',
    },
    {
      tipo: 'datos',
      filas: [
        {
          termino: 'Nombre y correo',
          detalle:
            'Para tu cuenta, tus facturas y tus avisos, y para enviarte el enlace que confirma tu correo.',
        },
        {
          termino: 'Contraseña',
          detalle:
            'Se guarda protegida con un algoritmo que no permite leerla (Argon2id). Nadie del equipo puede verla.',
        },
        {
          termino: 'WhatsApp (opcional)',
          detalle:
            'Solo te escribimos por WhatsApp si aceptas recibir mensajes. Guardamos la fecha en que aceptaste.',
        },
        {
          termino: 'Cédula o RIF, país y moneda (opcionales)',
          detalle: 'Para tus datos de facturación y para mostrarte los precios en tu moneda.',
        },
        {
          termino: 'Pagos',
          detalle: `Monto, fecha, referencia del banco y la captura del comprobante (imagen o PDF${cifras ? ` de hasta ${cifras.comprobanteMaxMb} MB` : ''}), para revisar tu pago. Los comprobantes se guardan fuera de la parte pública de la web.`,
        },
        {
          termino: 'Sesiones',
          detalle:
            'La IP y el navegador de cada inicio de sesión, para que veas y cierres tus sesiones abiertas.',
        },
        {
          termino: 'Registro de seguridad',
          detalle:
            'Las acciones importantes (pagos, cambios de estado, códigos mostrados) quedan anotadas con fecha e IP. Ese registro no se puede modificar ni borrar.',
        },
        {
          termino: 'Cobros automáticos (si los autorizas)',
          detalle:
            'El texto que aceptaste, la fecha, tu IP y tu navegador. De tu método de pago solo un identificador cifrado de la pasarela, nunca los datos de tu tarjeta.',
        },
      ],
    },
    { tipo: 'subtitulo', texto: 'Con quién se comparten' },
    {
      tipo: 'lista',
      elementos: [
        `**Pasarelas de pago** (${paypal.nombre} y ${mercadoPago.nombre}) cuando pagas en línea.`,
        '**Servicios de envío**: el de correo y, si aceptaste WhatsApp, WhatsApp Business de Meta, para enviarte avisos.',
        '**Distribuidores oficiales** que activan el servicio de forma automática: reciben el plan y, solo si ese proveedor lo necesita, tu correo.',
        '**Asistente de IA del equipo**: viene apagado y solo lo usa el equipo. Puede funcionar en nuestro servidor o con un proveedor externo (Anthropic); antes de enviarle algo, un filtro oculta contraseñas, claves y números de tarjeta.',
        pd('otrosTerceros'),
      ],
    },
    { tipo: 'subtitulo', texto: 'Lo que puedes hacer' },
    {
      tipo: 'lista',
      elementos: [
        'Cambiar tu WhatsApp, tu cédula o RIF, tu país y tu moneda desde tu cuenta.',
        'Dejar de recibir recordatorios de vencimiento. Los avisos de pagos y suspensiones siguen llegando.',
        'Ver y cerrar tus sesiones abiertas, y activar o desactivar la verificación en dos pasos.',
        'Revocar cuando quieras la autorización de cobro automático.',
        pd('copiaBorrado'),
      ],
    },
    { tipo: 'subtitulo', texto: 'Cuánto tiempo los guardamos' },
    { tipo: 'parrafo', texto: pd('conservacion') },
  ];

  const reembolsos: BloquePolitica[] = [
    { tipo: 'subtitulo', texto: 'Precios y monedas' },
    {
      tipo: 'lista',
      elementos: [
        `Los precios se fijan en **dólares (USD)**. Los ves en ${monedas(MONEDAS_CON_TASA)} con la tasa del día que registra el equipo, salvo los planes con precio fijo en tu moneda.`,
        'La tasa del bolívar puede tomarse de la tasa oficial (BCV). Si cambia más de lo permitido, no se aplica sola: la revisa la administración.',
        'Al emitir tu factura, el monto en tu moneda queda fijado con la tasa de ese momento. Si la tasa cambia antes de que pagues, puedes recalcularla con la de hoy o pasarla a otra moneda.',
      ],
    },
    { tipo: 'subtitulo', texto: 'Cómo pagas' },
    {
      tipo: 'lista',
      elementos: [
        '**Pago manual** (Pago Móvil, transferencia y otros métodos activos): subes la captura del comprobante y el equipo lo revisa antes de confirmarlo. Si lo rechaza, te dice el motivo.',
        `**Pago en línea**: ${paypal.nombre} (${monedas(paypal.monedas)}) y ${mercadoPago.nombre} (${monedas(mercadoPago.monedas)}), según lo que esté activo. Los bolívares se pagan siempre a mano.`,
        '**Billetera NV**: saldo en dólares que recargas con un pago manual revisado por el equipo. Con él pagas tus facturas al instante. La tasa de tu recarga queda fijada al reportarla.',
        `Tienes **${dias(R.diasParaPagar)}** para pagar una factura emitida. Caben hasta ${R.articulosPorPedido} planes por pedido y puedes tener hasta ${R.pendientesPorCliente} suscripciones esperando pago a la vez.`,
      ],
    },
    { tipo: 'subtitulo', texto: 'Estados de tu suscripción' },
    {
      tipo: 'estados',
      filas: [
        { estado: 'pendiente_pago', detalle: 'La contrataste y falta confirmar el pago.' },
        { estado: 'activa', detalle: 'Pagada y vigente hasta su fecha de vencimiento.' },
        {
          estado: 'en_gracia',
          detalle: `Venció sin pago. Tienes ${dias(R.diasGracia)} para renovarla.`,
        },
        {
          estado: 'suspendida',
          detalle: `Pasaron los ${dias(R.diasGracia)} de gracia sin pago. Si pagas, se reactiva.`,
        },
        {
          estado: 'vencida',
          detalle: `Estuvo ${dias(R.diasSuspension)} suspendida. Puedes renovarla si el plan sigue disponible.`,
        },
        {
          estado: 'pausada',
          detalle: 'El equipo la pausó. Al reanudarla recuperas el tiempo que te quedaba.',
        },
        { estado: 'cancelada', detalle: 'Terminó y no se renovará.' },
      ],
    },
    ...(avisos.length > 0
      ? [{ tipo: 'parrafo' as const, texto: `Te avisamos ${enumerar(avisos)}.` }]
      : []),
    { tipo: 'subtitulo', texto: 'Cancelar' },
    {
      tipo: 'lista',
      elementos: [
        'Desde tu panel programas la cancelación: tu suscripción sigue activa hasta su vencimiento y no se renueva. Puedes revertirla antes de esa fecha.',
        'Si todavía no pagaste, se cancela en el acto.',
        'Cancelar no genera por sí solo un reembolso del tiempo que queda.',
      ],
    },
    { tipo: 'subtitulo', texto: 'Cobros automáticos' },
    {
      tipo: 'lista',
      elementos: [
        `**Solo con tu autorización expresa.** Al pagar en línea con ${enumerar(
          recurrentes.map((p) => p.nombre),
          'o',
        )} puedes guardar el método y aceptar el texto de autorización.${
          sinRecurrente.length
            ? ` ${enumerar(sinRecurrente.map((p) => p.nombre))} no permite cobros automáticos.`
            : ''
        }`,
        ...(cifras?.reintentosCobroDias?.length
          ? [
              `Se cobra el día del vencimiento. Si falla, se reintenta (${listaDias([...cifras.reintentosCobroDias].sort((a, b) => a - b))} después) y te avisamos antes y después de cada cobro.`,
            ]
          : []),
        'Puedes revocarla cuando quieras desde «Mis métodos de pago», sin costo; aplica a los cobros siguientes. Sin una autorización activa, el sistema nunca cobra solo.',
      ],
    },
    { tipo: 'subtitulo', texto: 'Reembolsos' },
    {
      tipo: 'lista',
      elementos: [
        '**Pagos en línea**: el equipo puede devolverlos, todo o una parte, por la misma pasarela y nunca por más de lo que pagaste. La devolución no cancela sola la suscripción.',
        `**Pagos manuales**: ${pd('devolucionManual')}`,
        `**Saldo de la billetera**: ${pd('saldoBilletera')}`,
        `**Cuándo procede**: ${pd('casosReembolso')}`,
      ],
    },
  ];

  const entregas: BloquePolitica[] = [
    {
      tipo: 'lista',
      elementos: [
        'Cuando se confirma tu pago, preparamos la entrega. Según el proveedor llega como un **código de activación**, una **activación automática** del distribuidor o los **pasos** que completa el equipo.',
        'La ves en **Mis accesos**, en tu panel. Los códigos se guardan cifrados y se muestran uno por uno al tocar «Mostrar»; cada vez queda registrado.',
        'Solo entregamos códigos, enlaces de activación oficiales o pasos para activar. **Nunca usuarios ni contraseñas.**',
        'Tus códigos son personales: trátalos como una contraseña y no los compartas.',
        'Cuando la suscripción termina (cancelada o vencida), las activaciones automáticas del proveedor se revocan. Los códigos ya entregados quedan como están.',
        `Tiempo de entrega: ${pd('tiempoEntrega')}`,
        `Si un código no funciona: ${pd('codigoFalla')}`,
      ],
    },
  ];

  const revendedores: BloquePolitica[] = [
    {
      tipo: 'lista',
      elementos: [
        `Para ser revendedor envías una solicitud desde tu cuenta con el nombre de tu negocio (y, si quieres, tu documento, tu teléfono y una presentación). El equipo la aprueba o la rechaza. ${pd('requisitosRevendedor')}`,
        ...(exige2fa('revendedor')
          ? ['La verificación en dos pasos es **obligatoria** para operar.']
          : []),
        'Compras a **precio de mayorista según tu nivel** (por ejemplo Bronce, Plata u Oro). Solo ves los planes que el acuerdo con su proveedor permite revender.',
        '**Saldo prepagado en dólares**: lo recargas con un pago manual que concilia el equipo y compras al momento. El saldo nunca queda en negativo.',
        'El equipo puede fijar un **límite de compras por día** (el día se cuenta en hora de Venezuela).',
        'Activas siempre en la **cuenta propia de tu cliente**, con las mismas reglas: nada de cuentas compartidas ni contraseñas.',
        'Tú le cobras a tu cliente: NV no le emite facturas ni le hace cobros automáticos.',
        'Registra solo datos de clientes que te autorizaron a hacerlo.',
        'El equipo puede reembolsar una compra a tu saldo; la suscripción de esa compra se cancela.',
        `El equipo puede suspender tu cuenta de revendedor indicando el motivo. Mientras tanto ves tu panel, pero no recargas ni compras. ${pd('suspensionRevendedor')}`,
      ],
    },
  ];

  const cookies: BloquePolitica[] = [
    { tipo: 'parrafo', texto: 'La tienda usa pocas cookies, todas necesarias para que funcione:' },
    {
      tipo: 'cookies',
      filas: [
        {
          nombre: cifras?.cookieSesion ?? NOMBRES_COOKIE_SESION[0],
          uso: 'Mantiene tu sesión iniciada. El código de la página no puede leerla.',
          duracion: cifras
            ? `Hasta ${duracionLegible(cifras.sesionHoras * 3600)}; se cierra tras ${duracionLegible(cifras.sesionInactividadMinutos * 60)} sin actividad`
            : 'Mientras dure tu sesión',
        },
        {
          nombre: COOKIE_MONEDA,
          uso: 'Recuerda la moneda que elegiste. Solo guarda su código (por ejemplo VES).',
          duracion: duracionLegible(DURACION_COOKIE_MONEDA_SEGUNDOS),
        },
        {
          nombre: COOKIE_AVISO_TASA,
          uso: 'Recuerda que cerraste el aviso de la tasa del día.',
          duracion: duracionLegible(DURACION_AVISO_TASA_SEGUNDOS),
        },
        {
          nombre: CLAVE_CARRITO,
          uso: 'Almacenamiento del navegador, no es una cookie: los planes de tu carrito, nunca sus precios.',
          duracion: 'Hasta que vacíes el carrito',
        },
      ],
    },
    {
      tipo: 'parrafo',
      texto:
        'Para sugerirte una moneda usamos el país de tu conexión o el idioma de tu navegador. Nunca tu ubicación exacta, y no guardamos tu IP para esto.',
    },
    {
      tipo: 'parrafo',
      texto: `Hoy la tienda no usa cookies de publicidad ni de analítica, y sus letras se cargan desde nuestro propio servidor. Si pagas en ${paypal.nombre} o ${mercadoPago.nombre}, esas páginas usan sus propias cookies.`,
    },
  ];

  const temas = enumerar(
    CATEGORIAS_TICKET.map((c) => TEMA_TICKET[c]),
    'o',
  );
  const contacto: BloquePolitica[] = [
    {
      tipo: 'lista',
      elementos: [
        `**Soporte**: ${whatsapp ? 'por WhatsApp o ' : ''}con un ticket desde tu panel (${temas}).`,
        `**Privacidad y reclamos**: ${pd('responsableDatos')}`,
        `**Dirección para notificaciones**: ${pd('direccion')}`,
      ],
    },
    { tipo: 'contacto' },
  ];

  return {
    version: POLITICAS.version,
    vigenteDesde: POLITICAS.vigenteDesde,
    esencial: [
      'Solo vendemos servicios **autorizados** y los activamos en **tu propia cuenta**. Nunca vendemos cuentas compartidas ni entregamos usuarios o contraseñas de terceros.',
      'Los precios se fijan en dólares y los ves en tu moneda con la **tasa del día**. Al emitir tu factura, el monto queda fijado.',
      'Si pagas a mano, el equipo **revisa tu comprobante** antes de activar tu pedido. Con el saldo de tu billetera no hace falta.',
      `Si tu suscripción vence sin pago tienes **${dias(R.diasGracia)} de gracia**; después se suspende y, a los ${dias(R.diasSuspension)} suspendida, vence.`,
      'Solo te cobramos de forma automática si tú lo **autorizas**, y puedes revocarlo cuando quieras.',
      'Usamos tu nombre, tu correo y lo que decidas agregar (WhatsApp, cédula o RIF) para tu cuenta, tus pedidos y tus avisos.',
    ],
    secciones: [
      { id: 'terminos', titulo: 'Términos de uso', corto: 'Términos', bloques: terminos },
      { id: 'privacidad', titulo: 'Privacidad', corto: 'Privacidad', bloques: privacidad },
      {
        id: 'reembolsos',
        titulo: 'Pagos, renovaciones y reembolsos',
        corto: 'Pagos y reembolsos',
        bloques: reembolsos,
      },
      { id: 'entregas', titulo: 'Entregas y activaciones', corto: 'Entregas', bloques: entregas },
      { id: 'revendedores', titulo: 'Revendedores', corto: 'Revendedores', bloques: revendedores },
      { id: 'cookies', titulo: 'Cookies y almacenamiento', corto: 'Cookies', bloques: cookies },
      { id: 'contacto', titulo: 'Contacto', corto: 'Contacto', bloques: contacto },
    ],
  };
}

/* ------------------------------------------------------------- por definir */

/** Un trozo de texto: marcado normal o un dato por definir. */
export type TrozoPolitica =
  { tipo: 'texto'; texto: string } | { tipo: 'pd'; clave: ClavePorDefinir };

const MARCA_PD = /\{pd:([a-zA-Z]+)\}/g;

/** Separa los {pd:clave} del resto del texto (que sigue con su marcado). */
export function trozosPolitica(texto: string): TrozoPolitica[] {
  const trozos: TrozoPolitica[] = [];
  let desde = 0;
  for (const m of texto.matchAll(MARCA_PD)) {
    const clave = m[1] as string;
    if (!(clave in POR_DEFINIR)) continue;
    const antes = texto.slice(desde, m.index);
    if (antes) trozos.push({ tipo: 'texto', texto: antes });
    trozos.push({ tipo: 'pd', clave: clave as ClavePorDefinir });
    desde = m.index + m[0].length;
  }
  const resto = texto.slice(desde);
  if (resto) trozos.push({ tipo: 'texto', texto: resto });
  return trozos;
}

/** Todos los textos del documento, para recorrerlos (claves por definir, pruebas). */
export function textosPolitica(doc: DocumentoPoliticas): string[] {
  const textos = [...doc.esencial];
  for (const s of doc.secciones) {
    for (const b of s.bloques) {
      if (b.tipo === 'parrafo' || b.tipo === 'subtitulo') textos.push(b.texto);
      else if (b.tipo === 'lista') textos.push(...b.elementos);
      else if (b.tipo === 'datos') textos.push(...b.filas.flatMap((f) => [f.termino, f.detalle]));
      else if (b.tipo === 'estados') textos.push(...b.filas.map((f) => f.detalle));
      else if (b.tipo === 'cookies') textos.push(...b.filas.flatMap((f) => [f.uso, f.duracion]));
    }
  }
  return textos;
}

/** Claves por definir que usa el documento, en orden de aparición. */
export function clavesPorDefinir(doc: DocumentoPoliticas): ClavePorDefinir[] {
  return textosPolitica(doc).flatMap((t) =>
    trozosPolitica(t).flatMap((x) => (x.tipo === 'pd' ? [x.clave] : [])),
  );
}

/** Cuántos datos del documento siguen sin definir. */
export function pendientesPorDefinir(doc: DocumentoPoliticas): number {
  return clavesPorDefinir(doc).filter((c) => POR_DEFINIR[c].valor === null).length;
}
