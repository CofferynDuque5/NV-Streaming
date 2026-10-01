import {
  type EstadoCobroAutomatico,
  type EstadoEventoPasarela,
  type EstadoIntentoPago,
  INFO_PASARELA,
  type MetodoAutorizadoPublico,
  type Moneda,
  type Pasarela,
  PASARELAS,
  type ReembolsoResumen,
} from '@nv/shared';
import type { TonoInsignia } from './estados';

// Sin 'use client': lo usan tanto componentes de servidor como de cliente.

type Etiquetas<K extends string> = Record<K, { texto: string; tono: TonoInsignia }>;

/** Nombre visible de una pasarela; tolera valores desconocidos. */
export function nombrePasarela(p: string | null | undefined): string {
  if (!p) return 'Pasarela';
  return (PASARELAS as readonly string[]).includes(p) ? INFO_PASARELA[p as Pasarela].nombre : p;
}

/** Monedas que se pueden cobrar en línea (el bolívar nunca: sigue con pago manual). */
export function monedaAdmitePagoEnLinea(moneda: Moneda): boolean {
  return PASARELAS.some((p) => INFO_PASARELA[p].monedas.includes(moneda));
}

export const ESTADO_INTENTO: Etiquetas<EstadoIntentoPago> = {
  creado: { texto: 'Iniciado', tono: 'neutro' },
  pendiente: { texto: 'Pendiente', tono: 'aviso' },
  aprobado: { texto: 'Aprobado', tono: 'exito' },
  rechazado: { texto: 'Rechazado', tono: 'peligro' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
  expirado: { texto: 'Expirado', tono: 'neutro' },
};

export const ESTADO_COBRO_AUTOMATICO: Etiquetas<EstadoCobroAutomatico> = {
  programado: { texto: 'Programado', tono: 'marca' },
  en_curso: { texto: 'En curso', tono: 'acento' },
  exitoso: { texto: 'Cobrado', tono: 'exito' },
  fallido: { texto: 'Fallido', tono: 'peligro' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
};

export const ESTADO_EVENTO_PASARELA: Etiquetas<EstadoEventoPasarela> = {
  recibido: { texto: 'Recibido', tono: 'aviso' },
  procesado: { texto: 'Procesado', tono: 'exito' },
  ignorado: { texto: 'Ignorado', tono: 'neutro' },
  error: { texto: 'Con error', tono: 'peligro' },
};

export const ESTADO_METODO_AUTORIZADO: Etiquetas<MetodoAutorizadoPublico['estado']> = {
  activo: { texto: 'Autorizado', tono: 'exito' },
  revocado: { texto: 'Revocado', tono: 'neutro' },
  invalido: { texto: 'No válido', tono: 'peligro' },
};

export const ESTADO_REEMBOLSO: Etiquetas<ReembolsoResumen['estado']> = {
  solicitado: { texto: 'Solicitada', tono: 'aviso' },
  completado: { texto: 'Completada', tono: 'exito' },
  fallido: { texto: 'Fallida', tono: 'peligro' },
};

/** Cómo conectar cada pasarela. Las credenciales van en el entorno del servidor, nunca en el panel. */
export const AYUDA_PASARELA: Record<Pasarela, { variables: string[]; pasos: string }> = {
  paypal: {
    variables: ['PAYPAL_CLIENTE_ID', 'PAYPAL_SECRETO', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_MODO'],
    pasos:
      'Crea una aplicación REST en developer.paypal.com, copia su Client ID y su secreto al entorno del servidor, registra la URL de avisos en la aplicación (eventos de pagos y órdenes) y guarda el Webhook ID que te da PayPal. PAYPAL_MODO=produccion cobra de verdad; por defecto usa el entorno de pruebas.',
  },
  mercadopago: {
    variables: [
      'MERCADOPAGO_TOKEN_ACCESO',
      'MERCADOPAGO_SECRETO_WEBHOOK',
      'MERCADOPAGO_MONEDA',
      'MERCADOPAGO_MODO',
    ],
    pasos:
      'En «Tus integraciones» de Mercado Pago crea una aplicación, copia el Access Token al entorno del servidor, configura la URL de avisos (Webhooks, evento «Pagos») y copia la clave secreta de la firma. Cada cuenta opera en un solo país: indica su moneda en MERCADOPAGO_MONEDA (ARS, COP o PEN); para otro país hace falta otra cuenta. Mercado Pago no admite cobros automáticos aquí: el cliente paga cada factura. MERCADOPAGO_MODO=produccion cobra de verdad; por defecto usa pruebas.',
  },
  sandbox: {
    variables: ['PASARELA_SANDBOX_HABILITADA'],
    pasos:
      'Solo para desarrollo y pruebas: simula aprobaciones, rechazos y cancelaciones sin mover dinero. Está activa por defecto fuera de producción y el servidor la rechaza en producción.',
  },
};
