import { z } from 'zod';
import type { Referencia } from './tipos-negocio.js';

/** Meta solo deja escribir texto libre hasta 24 h después del último mensaje del cliente. */
export const VENTANA_WHATSAPP_HORAS = 24;

export const listarConversacionesWhatsAppSchema = z.object({
  estado: z.enum(['abiertas', 'cerradas']).default('abiertas'),
  /** Nombre, teléfono o texto de algún mensaje. */
  busqueda: z.string().trim().max(80).optional(),
});

export const responderWhatsAppSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe la respuesta.')
    .max(4096, 'WhatsApp admite hasta 4096 caracteres.'),
  /** Mensaje al que se responde (citado). */
  respuestaDe: z.string().uuid().optional(),
});

/** Reacción del equipo a un mensaje; nulo la quita. */
export const reaccionWhatsAppSchema = z.object({
  emoji: z.string().trim().min(1).max(16).nullable(),
});

/** Cerrar o reabrir, y fijar o soltar una conversación (cualquiera de los dos). */
export const estadoConversacionWhatsAppSchema = z
  .object({
    cerrada: z.boolean().optional(),
    fijada: z.boolean().optional(),
    /** Volver a marcarla como no leída. */
    noLeida: z.boolean().optional(),
  })
  .refine(
    (v) => v.cerrada !== undefined || v.fijada !== undefined || v.noLeida !== undefined,
    'Indica qué cambiar.',
  );

export const fijarMensajeWhatsAppSchema = z.object({ fijado: z.boolean() });

/** Mensajes más viejos que uno dado, para ir cargando el historial hacia arriba. */
export const mensajesWhatsAppSchema = z.object({ antes: z.string().uuid().optional() });

/** Lo que se sube con una imagen o nota de voz (multipart, el archivo va en «archivo»). */
export const medioWhatsAppSchema = z.object({
  texto: z
    .string()
    .trim()
    .max(1024, 'El texto de la imagen admite hasta 1024 caracteres.')
    .optional(),
  segundos: z.coerce.number().int().min(0).max(3600).optional(),
  respuestaDe: z.string().uuid().optional(),
});

/** Tope de una imagen o audio que se envía desde el panel. */
export const MEDIO_WHATSAPP_MAX_MB = 16;

export type TipoMedioWhatsApp = 'imagen' | 'audio' | 'video' | 'sticker' | 'documento';

export interface MedioWhatsApp {
  tipo: TipoMedioWhatsApp;
  mime: string | null;
  segundos: number | null;
  /** El archivo ya está guardado o se puede bajar de WhatsApp. */
  disponible: boolean;
}

/** Si el contacto está en línea, escribiendo o cuándo se conectó (si su privacidad lo deja ver). */
export interface PresenciaWhatsApp {
  enLinea: boolean;
  escribiendo: boolean;
  grabando: boolean;
  /** Última vez en línea, si WhatsApp la comparte. */
  vistoEn: string | null;
}

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
  fijada: boolean;
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
  /** Imagen, audio, video, sticker o documento; el texto es su descripción (puede ir vacío). */
  medio: MedioWhatsApp | null;
  fijado: boolean;
  /** El mensaje citado, si es una respuesta. */
  respuestaDe: {
    id: string;
    direccion: 'entrante' | 'saliente';
    texto: string;
    medio: TipoMedioWhatsApp | null;
  } | null;
  reacciones: { cliente: string | null; equipo: string | null };
  /** Quien lo envió lo borró para todos. */
  eliminado: boolean;
  editado: boolean;
}

export interface ConversacionWhatsAppDetalle extends ConversacionWhatsAppResumen {
  mensajes: MensajeWhatsAppPublico[];
  /** Mensajes fijados del chat (aunque no estén entre los cargados), el más reciente primero. */
  fijados: MensajeWhatsAppPublico[];
  /** Hay mensajes más viejos guardados (se piden con «antes»). */
  hayAnteriores: boolean;
  /** Se pueden pedir a WhatsApp mensajes anteriores (número vinculado por QR). */
  puedePedirHistorial: boolean;
}

/** Número de la empresa vinculado por código QR, como WhatsApp Web (Baileys). */
export interface VinculoWhatsApp {
  estado: 'desvinculado' | 'conectando' | 'esperando_qr' | 'conectado';
  /** Con «+», cuando está conectado. */
  numero: string | null;
  /** Imagen del código QR (data URL), mientras espera que lo escaneen. */
  qr: string | null;
  /** Por qué se cortó, si se cortó. */
  error: string | null;
}

export interface BandejaWhatsApp {
  /** Se puede responder desde el panel: número vinculado por QR, o Cloud API configurada. */
  canalListo: boolean;
  /** Las respuestas salen por el número vinculado por QR: sin límite de 24 h. */
  sinVentana: boolean;
  vinculo: Pick<VinculoWhatsApp, 'estado' | 'numero'>;
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
