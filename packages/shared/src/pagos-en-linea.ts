import { z } from 'zod';
import { type Moneda, MONEDAS } from './monedas.js';

/**
 * Pagos en línea (fase 4). Cada pasarela es un adaptador en la API; aquí solo
 * viven sus datos públicos, el texto de autorización y los esquemas de entrada.
 * Venezuela (VES) sigue con pago manual: ninguna pasarela de aquí cobra en bolívares.
 */
export const PASARELAS = ['paypal', 'mercadopago', 'binance', 'paypal_correo', 'sandbox'] as const;
export type Pasarela = (typeof PASARELAS)[number];

export interface InfoPasarela {
  nombre: string;
  /** Monedas en las que la pasarela puede cobrar. */
  monedas: readonly Moneda[];
  /** Admite guardar un método y cobrar después sin el cliente presente. */
  admiteCobroRecurrente: boolean;
}

/**
 * Pasarelas que se ofrecen al crear un método «Automático», en este orden. PayPal Business
 * (con API) queda fuera: se mantiene solo para los métodos que ya la usan.
 */
export const PASARELAS_OFRECIDAS: readonly Pasarela[] = [
  'binance',
  'paypal_correo',
  'mercadopago',
  'sandbox',
];

export const INFO_PASARELA: Record<Pasarela, InfoPasarela> = {
  /** PayPal Business con API (credenciales en el entorno). Ya no se ofrece para métodos nuevos. */
  paypal: { nombre: 'PayPal Business', monedas: ['USD', 'EUR'], admiteCobroRecurrente: true },
  /**
   * Checkout Pro (pago único). Sin cobros automáticos: Mercado Pago no permite que el
   * comercio cobre una tarjeta guardada sin que el cliente vuelva a poner el CVV en un
   * formulario de nuestra web, y sus Suscripciones cobran con su propio calendario.
   * Una cuenta opera en un solo país: la API solo ofrece la moneda de MERCADOPAGO_MONEDA.
   */
  mercadopago: {
    nombre: 'Mercado Pago',
    monedas: ['ARS', 'COP', 'PEN'],
    admiteCobroRecurrente: false,
  },
  /**
   * Binance Pay entre usuarios (USDT). No hay API: NV confirma leyendo los correos
   * «Pago recibido correctamente» que Binance envía al vendedor (ver CorreosBinanceService).
   * 1 USDT = 1 USD. Sin cobros automáticos ni devoluciones por la pasarela.
   */
  binance: { nombre: 'Binance Pay', monedas: ['USD'], admiteCobroRecurrente: false },
  /**
   * PayPal con cuenta personal (sin API). NV confirma leyendo los avisos «Ha recibido
   * un pago» firmados por paypal.com: por la referencia de NV en la nota o por el
   * nombre del pagador y el monto exacto (ver CorreosPaypalService).
   */
  paypal_correo: {
    nombre: 'PayPal',
    monedas: ['USD'],
    admiteCobroRecurrente: false,
  },
  /** Pasarela de pruebas: solo en desarrollo y pruebas, nunca en producción. */
  sandbox: {
    nombre: 'Pasarela de pruebas',
    monedas: MONEDAS.filter((m) => m !== 'VES'),
    admiteCobroRecurrente: true,
  },
};

export const TIPOS_METODO_COBRO = ['manual', 'pasarela'] as const;
export type TipoMetodoCobro = (typeof TIPOS_METODO_COBRO)[number];

/**
 * Texto que el cliente acepta para autorizar cobros automáticos. Se guarda tal
 * cual (con los datos ya sustituidos) junto a la fecha, la IP y el navegador.
 * Si cambia el texto, sube la versión.
 */
export const VERSION_TEXTO_AUTORIZACION = '2026-09-24';

export function textoAutorizacion(d: {
  pasarela: string;
  moneda: Moneda;
  titular: string;
}): string {
  return (
    `Yo, ${d.titular}, autorizo a NV Streaming a cobrar con mi cuenta de ${d.pasarela}, en ${d.moneda}, ` +
    'el importe de la renovación de las suscripciones en las que active el cobro automático, ' +
    'el día de su vencimiento y, si ese cobro falla, en los reintentos avisados. ' +
    'Recibiré un aviso antes y después de cada cobro. Puedo revocar esta autorización ' +
    'cuando quiera desde "Mis métodos de pago", sin costo; la revocación aplica a los cobros siguientes.'
  );
}

const uuid = (que: string) => z.uuid({ error: `${que} no es válido.` });

/** El cliente elige pagar una factura en línea. */
export const iniciarPagoEnLineaSchema = z
  .object({
    metodoCobroId: uuid('El método de pago'),
    /** Guardar el método para cobros automáticos. */
    guardarMetodo: z.boolean().default(false),
    /** Obligatorio (true) si guardarMetodo es true. */
    aceptoAutorizacion: z.boolean().default(false),
  })
  .refine((v) => !v.guardarMetodo || v.aceptoAutorizacion, {
    path: ['aceptoAutorizacion'],
    error: 'Para guardar el método tienes que aceptar la autorización de cobro.',
  });
export type IniciarPagoEnLineaEntrada = z.output<typeof iniciarPagoEnLineaSchema>;

/** Parámetros con los que la pasarela devuelve al cliente (token, PayerID, payment_id...). */
export const retornoPagoSchema = z.object({
  parametros: z.record(z.string().max(60), z.string().max(500)).default({}),
});

/** Activa (con un método autorizado) o desactiva (null) el cobro automático de una suscripción. */
export const cobroAutomaticoSuscripcionSchema = z.object({
  metodoAutorizadoId: uuid('El método autorizado').nullable(),
});

export const revocarMetodoSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
});

/** Devolución de un pago en línea. Sin monto = devolución total de lo que queda. */
export const reembolsoSchema = z.object({
  monto: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Escribe un importe válido (hasta 2 decimales).')
    .optional(),
  motivo: z.string().trim().min(5, 'Explica el motivo de la devolución.').max(500),
});

export const ESTADOS_INTENTO_PAGO = [
  'creado',
  'pendiente',
  'aprobado',
  'rechazado',
  'cancelado',
  'expirado',
] as const;
export type EstadoIntentoPago = (typeof ESTADOS_INTENTO_PAGO)[number];

export const ESTADOS_COBRO_AUTOMATICO = [
  'programado',
  'en_curso',
  'exitoso',
  'fallido',
  'cancelado',
] as const;
export type EstadoCobroAutomatico = (typeof ESTADOS_COBRO_AUTOMATICO)[number];

export const ESTADOS_EVENTO_PASARELA = ['recibido', 'procesado', 'ignorado', 'error'] as const;
export type EstadoEventoPasarela = (typeof ESTADOS_EVENTO_PASARELA)[number];

export const filtroCobrosAutomaticosSchema = z.object({
  estado: z.enum(ESTADOS_COBRO_AUTOMATICO).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

export const filtroEventosPasarelaSchema = z.object({
  pasarela: z.enum(PASARELAS).optional(),
  estado: z.enum(ESTADOS_EVENTO_PASARELA).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

/** Resultado que elige quien prueba en la pasarela de pruebas. */
export const simularSandboxSchema = z.object({
  resultado: z.enum(['aprobar', 'rechazar', 'cancelar']),
});

// ── Binance Pay confirmado por correo ────────────────────────────────────────

/**
 * Categorías de servicio que se entregan solas cuando Binance confirma el pago.
 * Las demás (juegos, nube…) quedan en revisión del equipo aunque el pago llegue bien.
 */
export const CATEGORIAS_ENTREGA_AUTOMATICA_BINANCE = [
  'streaming',
  'musica',
  'ia',
  'software',
] as const;

/** Minutos que espera NV el correo de Binance después de que el cliente declara su pago. */
export const MINUTOS_ESPERA_BINANCE = 30;

/** El cliente dice con qué usuario de Binance pagó y cuánto envió (USDT). */
export const declararPagoBinanceSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(2, 'Escribe tu usuario de Binance tal como aparece en tu perfil.')
    .max(60, 'El usuario es demasiado largo.')
    .regex(/^[^\s<>]+(?: [^\s<>]+)*$/, 'El usuario tiene caracteres no válidos.'),
  monto: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Escribe el monto exacto que enviaste, p. ej. 2.50.'),
});
export type DeclararPagoBinanceEntrada = z.output<typeof declararPagoBinanceSchema>;

/** Buzón donde llegan los correos de Binance (Gmail con contraseña de aplicación). */
export const configBinanceSchema = z.object({
  host: z.string().trim().min(3).max(120).default('imap.gmail.com'),
  puerto: z.coerce.number().int().min(1).max(65535).default(993),
  usuario: z.email({ error: 'Escribe el correo donde llegan los avisos de Binance.' }).max(200),
  /** Vacío al editar = no cambia. */
  clave: z.string().max(200).optional(),
  carpeta: z.string().trim().min(1).max(120).default('NV-Binance'),
  /** Código anti-phishing configurado en Binance. Vacío al editar = no cambia. */
  codigoAntiPhishing: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\w-]*$/, 'El código anti-phishing solo lleva letras, números, - y _.')
    .optional(),
  activo: z.boolean().default(true),
});
export type ConfigBinanceEntrada = z.output<typeof configBinanceSchema>;

// ── PayPal (cuenta personal) confirmado por correo ───────────────────────────

/** Minutos que espera NV el aviso de PayPal después de que el cliente dice que pagó. */
export const MINUTOS_ESPERA_PAYPAL = 30;

/** El cliente dice a nombre de quién está su cuenta PayPal (la captura va aparte). */
export const declararPagoPaypalSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, 'Escribe el nombre de tu cuenta PayPal, tal como aparece en tu perfil.')
    .max(100, 'El nombre es demasiado largo.')
    .regex(/^[^<>\n]+$/, 'El nombre tiene caracteres no válidos.'),
});
export type DeclararPagoPaypalEntrada = z.output<typeof declararPagoPaypalSchema>;

/** Buzón donde llegan los avisos de PayPal (Gmail con contraseña de aplicación). */
export const configPaypalCorreoSchema = z.object({
  host: z.string().trim().min(3).max(120).default('imap.gmail.com'),
  puerto: z.coerce.number().int().min(1).max(65535).default(993),
  usuario: z.email({ error: 'Escribe el correo donde llegan los avisos de PayPal.' }).max(200),
  /** Vacío al editar = no cambia. */
  clave: z.string().max(200).optional(),
  carpeta: z.string().trim().min(1).max(120).default('NV-PayPal'),
  activo: z.boolean().default(true),
});
export type ConfigPaypalCorreoEntrada = z.output<typeof configPaypalCorreoSchema>;
