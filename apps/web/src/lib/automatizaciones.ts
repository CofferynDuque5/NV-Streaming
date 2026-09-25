import {
  AUTOMATIZACIONES,
  type CanalAviso,
  type DefinicionAutomatizacion,
  type EstadoEjecucion,
  type EstadoNotificacion,
  type FuenteTasa,
  PARAMETROS_AUTOMATIZACION,
  type PrioridadTicket,
  type TipoAutomatizacion,
  TIPOS_AUTOMATIZACION,
  ZONA_HORARIA,
} from '@nv/shared';
import { PRIORIDAD_TICKET, type TonoInsignia } from './estados';

/*
 * Textos y utilidades de las pantallas de automatizaciones (fase 3).
 * Sin 'use client': sirve en páginas de servidor y en formularios.
 */

type Etiquetas<K extends string> = Record<K, { texto: string; tono: TonoInsignia }>;

export const GRUPOS_AUTOMATIZACION: {
  id: DefinicionAutomatizacion['grupo'];
  titulo: string;
  descripcion: string;
}[] = [
  {
    id: 'clientes',
    titulo: 'Clientes',
    descripcion: 'Avisos a los clientes sobre el vencimiento, el pago y el estado de su servicio.',
  },
  {
    id: 'revendedores',
    titulo: 'Revendedores',
    descripcion: 'Avisos a los revendedores sobre su cuenta.',
  },
  {
    id: 'equipo',
    titulo: 'Equipo',
    descripcion: 'Alertas internas para soporte y cobros. Solo se envían por correo.',
  },
  {
    id: 'finanzas',
    titulo: 'Finanzas',
    descripcion: 'Tareas automáticas sobre la tasa del bolívar.',
  },
];

export const CANAL_AVISO: Record<CanalAviso, string> = {
  correo: 'Correo',
  whatsapp: 'WhatsApp',
};

export const DISPARO_AUTOMATIZACION: Record<'programada' | 'evento', string> = {
  programada: 'Programada',
  evento: 'Por evento',
};

export const ESTADO_EJECUCION: Etiquetas<EstadoEjecucion> = {
  en_curso: { texto: 'En curso', tono: 'marca' },
  completada: { texto: 'Completada', tono: 'exito' },
  con_errores: { texto: 'Con errores', tono: 'aviso' },
  fallida: { texto: 'Fallida', tono: 'peligro' },
};

export const ESTADO_NOTIFICACION: Etiquetas<EstadoNotificacion> = {
  pendiente: { texto: 'En cola', tono: 'marca' },
  enviada: { texto: 'Enviada', tono: 'exito' },
  fallida: { texto: 'Fallida', tono: 'peligro' },
  omitida: { texto: 'Omitida', tono: 'neutro' },
};

export const FUENTE_TASA: Record<FuenteTasa, { nombre: string; corto: string }> = {
  bcv: { nombre: 'Banco Central de Venezuela (BCV)', corto: 'BCV' },
  json: { nombre: 'Servicio JSON configurado en el servidor', corto: 'fuente externa' },
};

/** Motivos por los que un aviso no se envió. La API puede mandar un código o una frase. */
const MOTIVOS: Record<string, string> = {
  sin_consentimiento: 'El cliente no aceptó recibir avisos por WhatsApp.',
  sin_consentimiento_whatsapp: 'El cliente no aceptó recibir avisos por WhatsApp.',
  sin_destino: 'No hay correo o teléfono al que enviarlo.',
  sin_telefono: 'El cliente no tiene un WhatsApp registrado.',
  sin_whatsapp: 'El cliente no tiene un WhatsApp registrado.',
  preferencia: 'El cliente pidió no recibir recordatorios.',
  preferencia_cliente: 'El cliente pidió no recibir recordatorios.',
  no_recibir_recordatorios: 'El cliente pidió no recibir recordatorios.',
  canal_desactivado: 'El canal está desactivado en el servidor.',
  whatsapp_desactivado: 'WhatsApp está desactivado en el servidor.',
  duplicado: 'Ya se había enviado este mismo aviso.',
  ya_enviado: 'Ya se había enviado este mismo aviso.',
  automatizacion_pausada: 'La automatización estaba pausada.',
  cuenta_inactiva: 'La cuenta del destinatario no está activa.',
};

export function textoMotivo(motivo: string | null): string | null {
  if (!motivo) return null;
  return MOTIVOS[motivo] ?? motivo;
}

/** Nombre legible de las plantillas que no vienen de una automatización. */
const PLANTILLAS: Record<string, string> = {
  avisoPrueba: 'Aviso de prueba',
  pagoConfirmado: 'Pago confirmado',
  pagoRechazado: 'Pago rechazado',
  ticketRespondido: 'Ticket respondido',
  tasaNoAplicada: 'Tasa automática no aplicada',
  alertaSla: 'Tickets fuera de plazo',
  pagosPendientes: 'Pagos por conciliar',
  servicioListo: 'Servicio listo',
  accesoListoRevendedor: 'Activación lista (revendedor)',
  entregaPendiente: 'Entrega manual pendiente',
  entregaSinStock: 'Entrega sin códigos',
  entregaFallida: 'Entrega fallida',
  stockBajoCodigos: 'Pocos códigos en inventario',
};

export function nombrePlantilla(plantilla: string): string {
  if (PLANTILLAS[plantilla]) return PLANTILLAS[plantilla];
  const texto = plantilla
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function esTipoAutomatizacion(v: string): v is TipoAutomatizacion {
  return (TIPOS_AUTOMATIZACION as readonly string[]).includes(v);
}

export function nombreAutomatizacion(tipo: TipoAutomatizacion | null): string | null {
  return tipo ? AUTOMATIZACIONES[tipo].nombre : null;
}

// ── Fechas y horas de Venezuela ─────────────────────────────────────────────

const fechaHoraVe = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONA_HORARIA,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const fechaHoraLargaVe = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONA_HORARIA,
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** "jue, 25 sept, 9:00 a. m." en hora de Venezuela. */
export const fechaHoraVenezuela = (iso: string) => fechaHoraVe.format(new Date(iso));
/** "25 sept 2026, 9:00 a. m." en hora de Venezuela. */
export const fechaHoraLargaVenezuela = (iso: string) => fechaHoraLargaVe.format(new Date(iso));

/** Hora del día (0-23) como "9:00 a. m." o "1:00 p. m.". */
export function textoHora(h: number): string {
  const doce = h % 12 === 0 ? 12 : h % 12;
  return `${doce}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Duración legible entre dos fechas ISO ("12 s", "3 min"). */
export function duracion(desde: string, hasta: string | null): string | null {
  if (!hasta) return null;
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ── Parámetros ───────────────────────────────────────────────────────────────

export type TipoCampoParametro =
  | 'lista-dias'
  | 'dias'
  | 'hora'
  | 'horas'
  | 'prioridad'
  | 'monto-usd'
  | 'fuente'
  | 'porcentaje'
  | 'minutos'
  | 'numero';

export interface CampoParametro {
  clave: string;
  tipo: TipoCampoParametro;
  etiqueta: string;
  ayuda?: string;
  /** Límites de los números, para el mensaje de error y los atributos del campo. */
  min?: number;
  max?: number;
  sufijo?: string;
}

const CAMPOS: Record<string, Omit<CampoParametro, 'clave'>> = {
  hora: {
    tipo: 'hora',
    etiqueta: 'Hora de envío',
    ayuda: 'Hora de Venezuela a la que corre cada día.',
    min: 0,
    max: 23,
  },
  horas: {
    tipo: 'horas',
    etiqueta: 'Horas de consulta',
    ayuda: 'Hora de Venezuela. Elige entre 1 y 6.',
    min: 0,
    max: 23,
  },
  diasSuspendida: {
    tipo: 'dias',
    etiqueta: 'Días suspendida antes de escalar',
    ayuda: 'Entre 1 y 30 días sin pago tras la suspensión.',
    min: 1,
    max: 30,
    sufijo: 'días',
  },
  prioridad: {
    tipo: 'prioridad',
    etiqueta: 'Prioridad del ticket',
    ayuda: 'Define el plazo de primera respuesta del ticket que se abre.',
  },
  umbralUsd: {
    tipo: 'monto-usd',
    etiqueta: 'Umbral de saldo',
    ayuda: 'Se avisa cuando el saldo del revendedor queda por debajo de este importe.',
    sufijo: 'USD',
  },
  fuente: {
    tipo: 'fuente',
    etiqueta: 'Fuente de la tasa',
  },
  variacionMaximaPct: {
    tipo: 'porcentaje',
    etiqueta: 'Variación máxima permitida',
    ayuda:
      'Si la nueva tasa cambia más que esto respecto a la vigente, no se aplica y se avisa a administración.',
    min: 1,
    max: 50,
    sufijo: '%',
  },
  cadaMinutos: {
    tipo: 'minutos',
    etiqueta: 'Revisar cada',
    ayuda: 'Entre 15 y 1440 minutos (un día).',
    min: 15,
    max: 1440,
    sufijo: 'min',
  },
  umbral: {
    tipo: 'numero',
    etiqueta: 'Mínimo de códigos por plan',
    ayuda: 'Se avisa cuando un plan con códigos tiene menos disponibles que este número.',
    min: 1,
    max: 10000,
    sufijo: 'códigos',
  },
  horasEspera: {
    tipo: 'numero',
    etiqueta: 'Horas de espera',
    ayuda: 'Incluye los pagos y recargas que llevan al menos estas horas sin revisar.',
    min: 1,
    max: 72,
    sufijo: 'h',
  },
};

/** Campos del formulario de un tipo, en el orden de sus parámetros por defecto. */
export function camposDe(tipo: TipoAutomatizacion): CampoParametro[] {
  const defecto = AUTOMATIZACIONES[tipo].parametrosPorDefecto as Record<string, unknown>;
  return Object.keys(defecto).map((clave) => {
    if (clave === 'diasAntes') {
      return Array.isArray(defecto[clave])
        ? {
            clave,
            tipo: 'lista-dias' as const,
            etiqueta: 'Días antes del vencimiento',
            ayuda: 'Separados por comas, entre 1 y 30. Hasta 5 avisos; por ejemplo: 7, 3, 1.',
            min: 1,
            max: 30,
          }
        : {
            clave,
            tipo: 'dias' as const,
            etiqueta: 'Días antes del vencimiento',
            ayuda: 'Entre 1 y 15 días antes de que venza la suscripción.',
            min: 1,
            max: 15,
            sufijo: 'días',
          };
    }
    return { clave, ...(CAMPOS[clave] ?? { tipo: 'numero' as const, etiqueta: clave }) };
  });
}

/** Resumen de una línea de los parámetros, para las tarjetas. */
export function resumenParametros(
  tipo: TipoAutomatizacion,
  parametros: Record<string, unknown>,
): string | null {
  const p = parametros;
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(Number) : []);
  switch (tipo) {
    case 'recordatorio_vencimiento': {
      const dias = lista(p.diasAntes).sort((a, b) => b - a);
      if (dias.length === 0) return null;
      return `${dias.join(', ')} ${dias.length === 1 && dias[0] === 1 ? 'día' : 'días'} antes · ${textoHora(Number(p.hora))}`;
    }
    case 'factura_renovacion':
      return `${String(p.diasAntes)} ${Number(p.diasAntes) === 1 ? 'día' : 'días'} antes · ${textoHora(Number(p.hora))}`;
    case 'escalado_suspension':
      return `Tras ${String(p.diasSuspendida)} días suspendida · prioridad ${(
        PRIORIDAD_TICKET[p.prioridad as PrioridadTicket]?.texto ?? String(p.prioridad)
      ).toLowerCase()}`;
    case 'saldo_bajo_revendedor':
      return `Por debajo de ${String(p.umbralUsd)} USD`;
    case 'tasa_automatica': {
      const horas = lista(p.horas).sort((a, b) => a - b);
      const fuente = p.fuente === 'bcv' ? 'BCV' : 'Fuente externa';
      return `${fuente} · ${horas.map(textoHora).join(', ')} · máx. ${String(p.variacionMaximaPct)} %`;
    }
    case 'alerta_sla_tickets':
      return `Cada ${String(p.cadaMinutos)} minutos`;
    case 'alerta_pagos_pendientes':
      return `Más de ${String(p.horasEspera)} h esperando · ${textoHora(Number(p.hora))}`;
    case 'stock_bajo_codigos':
      return `Menos de ${String(p.umbral)} códigos · ${textoHora(Number(p.hora))}`;
    default:
      return null;
  }
}

// ── Errores de validación ───────────────────────────────────────────────────

/** Mensaje en español para los errores genéricos de Zod (vienen en inglés). */
function mensajeCampo(campo: CampoParametro | undefined, mensaje: string): string {
  const generico = /^(Too (small|big)|Invalid|Expected)/i.test(mensaje);
  if (!generico) return mensaje;
  if (!campo) return 'Revisa este valor.';
  if (campo.tipo === 'lista-dias')
    return `Escribe días entre ${campo.min} y ${campo.max}, separados por comas.`;
  if (campo.tipo === 'hora' || campo.tipo === 'horas') return 'Escribe una hora entre 0 y 23.';
  if (campo.tipo === 'prioridad') return 'Elige una prioridad.';
  if (campo.tipo === 'fuente') return 'Elige una fuente.';
  if (campo.min !== undefined && campo.max !== undefined)
    return `Escribe un número entero entre ${campo.min} y ${campo.max}.`;
  return 'Revisa este valor.';
}

/**
 * Convierte errores por ruta ("parametros.diasAntes.0", "diasAntes") en un
 * mensaje por campo del formulario, traducido si es un mensaje genérico.
 */
export function erroresParametros(
  tipo: TipoAutomatizacion,
  errores: Record<string, string[] | string>,
): Record<string, string> {
  const campos = camposDe(tipo);
  const salida: Record<string, string> = {};
  for (const [ruta, mensajes] of Object.entries(errores)) {
    const mensaje = Array.isArray(mensajes) ? mensajes[0] : mensajes;
    if (!mensaje) continue;
    const partes = ruta.split('.');
    const clave = (partes[0] === 'parametros' ? partes[1] : partes[0]) ?? '_';
    salida[clave] ??= mensajeCampo(
      campos.find((c) => c.clave === clave),
      mensaje,
    );
  }
  return salida;
}

/** Valida los parámetros en el navegador con el esquema del tipo. */
export function validarParametros(
  tipo: TipoAutomatizacion,
  valores: Record<string, unknown>,
): { ok: true; datos: Record<string, unknown> } | { ok: false; errores: Record<string, string> } {
  const r = PARAMETROS_AUTOMATIZACION[tipo].safeParse(valores);
  if (r.success) return { ok: true, datos: r.data as Record<string, unknown> };
  const errores: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const clave = issue.path.length ? issue.path.map(String).join('.') : '_';
    (errores[clave] ??= []).push(issue.message);
  }
  return { ok: false, errores: erroresParametros(tipo, errores) };
}

// ── Tickets abiertos por el sistema ─────────────────────────────────────────

export const AUTOR_SISTEMA = 'NV (automático)';

/** ¿Lo abrió una automatización? */
export function esTicketDelSistema(t: { origen?: string }): boolean {
  return t.origen === 'sistema';
}

type AutorMensaje = { id: string; nombre: string; esEquipo: boolean };

/** Autor de un mensaje; los que escribe el sistema llegan con id "sistema" (o sin autor). */
export function autorMensaje(m: { autor: AutorMensaje | null }): AutorMensaje & {
  sistema: boolean;
} {
  if (!m.autor || m.autor.id === 'sistema')
    return { id: 'sistema', nombre: AUTOR_SISTEMA, esEquipo: true, sistema: true };
  return { ...m.autor, sistema: false };
}
