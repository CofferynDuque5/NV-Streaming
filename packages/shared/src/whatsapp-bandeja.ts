import { z } from 'zod';
import type { Referencia } from './tipos-negocio.js';

/** Meta solo deja escribir texto libre hasta 24 h después del último mensaje del cliente. */
export const VENTANA_WHATSAPP_HORAS = 24;

export const listarConversacionesWhatsAppSchema = z.object({
  estado: z.enum(['abiertas', 'cerradas']).default('abiertas'),
});

export const responderWhatsAppSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe la respuesta.')
    .max(4096, 'WhatsApp admite hasta 4096 caracteres.'),
});

export const estadoConversacionWhatsAppSchema = z.object({ cerrada: z.boolean() });

export interface ConversacionWhatsAppResumen {
  id: string;
  /** Con «+» y código de país. */
  telefono: string;
  nombre: string | null;
  cliente: Referencia | null;
  ultimoMensaje: { texto: string; direccion: 'entrante' | 'saliente'; creadoEn: string } | null;
  ultimoMensajeEn: string;
  noLeidos: number;
  cerrada: boolean;
  /** Hasta cuándo se puede responder con texto libre; nulo si ya venció o el cliente nunca escribió. */
  ventanaHasta: string | null;
}

export interface MensajeWhatsAppPublico {
  id: string;
  direccion: 'entrante' | 'saliente';
  texto: string;
  tipo: string;
  estado: string | null;
  autor: Referencia | null;
  creadoEn: string;
}

export interface ConversacionWhatsAppDetalle extends ConversacionWhatsAppResumen {
  mensajes: MensajeWhatsAppPublico[];
}

export interface BandejaWhatsApp {
  /** El canal está configurado para enviar (Cloud API con token y número). */
  canalListo: boolean;
  proveedor: 'desactivado' | 'sandbox' | 'cloud_api';
  /** El webhook tiene su token de verificación y el secreto de la app para validar la firma. */
  webhookListo: boolean;
  conversaciones: ConversacionWhatsAppResumen[];
  sinLeer: number;
}

/** Ventana de 24 h abierta a partir del último mensaje del cliente. */
export function ventanaWhatsAppHasta(
  ultimoEntranteEn: Date | null,
  ahora = new Date(),
): Date | null {
  if (!ultimoEntranteEn) return null;
  const hasta = new Date(ultimoEntranteEn.getTime() + VENTANA_WHATSAPP_HORAS * 3_600_000);
  return hasta > ahora ? hasta : null;
}
