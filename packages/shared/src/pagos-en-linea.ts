import { z } from 'zod';
import { type Moneda, MONEDAS } from './monedas.js';

/**
 * Pagos en línea (fase 4). Cada pasarela es un adaptador en la API; aquí solo
 * viven sus datos públicos, el texto de autorización y los esquemas de entrada.
 * Venezuela (VES) sigue con pago manual: ninguna pasarela de aquí cobra en bolívares.
 */
export const PASARELAS = ['paypal', 'mercadopago', 'sandbox'] as const;
export type Pasarela = (typeof PASARELAS)[number];

export interface InfoPasarela {
  nombre: string;
  /** Monedas en las que la pasarela puede cobrar. */
  monedas: readonly Moneda[];
  /** Admite guardar un método y cobrar después sin el cliente presente. */
  admiteCobroRecurrente: boolean;
}

export const INFO_PASARELA: Record<Pasarela, InfoPasarela> = {
  paypal: { nombre: 'PayPal', monedas: ['USD', 'EUR'], admiteCobroRecurrente: true },
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
