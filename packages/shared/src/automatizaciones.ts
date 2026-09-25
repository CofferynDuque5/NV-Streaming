import { z } from 'zod';
import { montoSchema } from './esquemas/dinero.js';
import { PRIORIDADES_TICKET } from './esquemas/soporte.js';

/**
 * Catálogo de automatizaciones (fase 3). Cada tipo tiene una fila en la tabla
 * `automatizaciones` con sus parámetros, que se validan con el esquema de aquí.
 * Las horas son de Venezuela.
 */
export const ZONA_HORARIA = 'America/Caracas';

export const CANALES_AVISO = ['correo', 'whatsapp'] as const;
export type CanalAviso = (typeof CANALES_AVISO)[number];

export const TIPOS_AUTOMATIZACION = [
  'recordatorio_vencimiento',
  'factura_renovacion',
  'aviso_gracia',
  'aviso_suspension',
  'escalado_suspension',
  'aviso_recuperacion',
  'saldo_bajo_revendedor',
  'tasa_automatica',
  'alerta_sla_tickets',
  'alerta_pagos_pendientes',
  'cobro_automatico',
  'stock_bajo_codigos',
] as const;
export type TipoAutomatizacion = (typeof TIPOS_AUTOMATIZACION)[number];

export const FUENTES_TASA = ['bcv', 'json'] as const;
export type FuenteTasa = (typeof FUENTES_TASA)[number];

const hora = z.coerce
  .number({ error: 'Escribe una hora entre 0 y 23.' })
  .int('Escribe una hora entre 0 y 23.')
  .min(0, 'Escribe una hora entre 0 y 23.')
  .max(23, 'Escribe una hora entre 0 y 23.');

/** Entero entre `min` y `max` con el mensaje de error en español. */
const entero = (min: number, max: number, unidad: string) => {
  const m = `Escribe un número entero entre ${min} y ${max} ${unidad}.`;
  return z.coerce.number({ error: m }).int(m).min(min, m).max(max, m);
};

const DIAS_AVISO = 'Escribe días entre 1 y 30, separados por comas.';

const listaSinRepetir = <T extends z.ZodType>(item: T, max: number, nombre: string) =>
  z
    .array(item)
    .min(1, `Indica al menos un valor en ${nombre}.`)
    .max(max, `Como máximo ${max} valores en ${nombre}.`)
    .refine((v) => new Set(v as unknown[]).size === v.length, {
      error: `No repitas valores en ${nombre}.`,
    });

export const PARAMETROS_AUTOMATIZACION = {
  recordatorio_vencimiento: z.object({
    diasAntes: listaSinRepetir(
      z.coerce.number({ error: DIAS_AVISO }).int(DIAS_AVISO).min(1, DIAS_AVISO).max(30, DIAS_AVISO),
      5,
      'los días de aviso',
    ),
    hora,
  }),
  factura_renovacion: z.object({
    diasAntes: entero(1, 15, 'días'),
    hora,
  }),
  aviso_gracia: z.object({}),
  aviso_suspension: z.object({}),
  escalado_suspension: z.object({
    diasSuspendida: entero(1, 30, 'días'),
    prioridad: z.enum(PRIORIDADES_TICKET, { error: 'Elige una prioridad válida.' }),
  }),
  aviso_recuperacion: z.object({}),
  saldo_bajo_revendedor: z.object({ umbralUsd: montoSchema }),
  tasa_automatica: z.object({
    fuente: z.enum(FUENTES_TASA, { error: 'Elige una fuente válida.' }),
    horas: listaSinRepetir(hora, 6, 'las horas'),
    variacionMaximaPct: entero(1, 50, '%'),
  }),
  alerta_sla_tickets: z.object({
    cadaMinutos: entero(15, 1440, 'minutos'),
  }),
  alerta_pagos_pendientes: z.object({
    horasEspera: entero(1, 72, 'horas'),
    hora,
  }),
  cobro_automatico: z.object({
    reintentosDias: listaSinRepetir(entero(1, 10, 'días'), 3, 'los días de reintento'),
    hora,
  }),
  stock_bajo_codigos: z.object({
    umbral: entero(1, 10000, 'códigos'),
    hora,
  }),
} as const satisfies Record<TipoAutomatizacion, z.ZodType>;

export type ParametrosAutomatizacion<T extends TipoAutomatizacion> = z.output<
  (typeof PARAMETROS_AUTOMATIZACION)[T]
>;

export interface DefinicionAutomatizacion<T extends TipoAutomatizacion = TipoAutomatizacion> {
  tipo: T;
  nombre: string;
  descripcion: string;
  /** A quién va dirigida. */
  grupo: 'clientes' | 'revendedores' | 'equipo' | 'finanzas';
  /** "programada": corre a sus horas. "evento": la dispara un cambio (p. ej. una suspensión). */
  disparo: 'programada' | 'evento';
  /** Canales que admite. Los avisos al equipo solo van por correo. */
  canales: readonly CanalAviso[];
  activaPorDefecto: boolean;
  parametrosPorDefecto: ParametrosAutomatizacion<T>;
}

export const AUTOMATIZACIONES: { [T in TipoAutomatizacion]: DefinicionAutomatizacion<T> } = {
  recordatorio_vencimiento: {
    tipo: 'recordatorio_vencimiento',
    nombre: 'Recordatorio de vencimiento',
    descripcion:
      'Avisa al cliente unos días antes de que venza su suscripción, con el enlace para pagar.',
    grupo: 'clientes',
    disparo: 'programada',
    canales: ['correo', 'whatsapp'],
    activaPorDefecto: true,
    parametrosPorDefecto: { diasAntes: [7, 3, 1], hora: 9 },
  },
  factura_renovacion: {
    tipo: 'factura_renovacion',
    nombre: 'Factura de renovación',
    descripcion:
      'Emite la factura de renovación unos días antes del vencimiento y envía las instrucciones de pago.',
    grupo: 'clientes',
    disparo: 'programada',
    canales: ['correo', 'whatsapp'],
    activaPorDefecto: true,
    parametrosPorDefecto: { diasAntes: 3, hora: 8 },
  },
  aviso_gracia: {
    tipo: 'aviso_gracia',
    nombre: 'Aviso de periodo de gracia',
    descripcion: 'Avisa al cliente cuando su suscripción vence sin pago y entra en gracia.',
    grupo: 'clientes',
    disparo: 'evento',
    canales: ['correo', 'whatsapp'],
    activaPorDefecto: true,
    parametrosPorDefecto: {},
  },
  aviso_suspension: {
    tipo: 'aviso_suspension',
    nombre: 'Aviso de suspensión',
    descripcion: 'Avisa al cliente cuando se agota la gracia y el servicio queda suspendido.',
    grupo: 'clientes',
    disparo: 'evento',
    canales: ['correo', 'whatsapp'],
    activaPorDefecto: true,
    parametrosPorDefecto: {},
  },
  escalado_suspension: {
    tipo: 'escalado_suspension',
    nombre: 'Escalado a soporte',
    descripcion:
      'Abre un ticket para el equipo cuando una suscripción lleva varios días suspendida sin pago.',
    grupo: 'equipo',
    disparo: 'programada',
    canales: ['correo'],
    activaPorDefecto: true,
    parametrosPorDefecto: { diasSuspendida: 3, prioridad: 'alta' },
  },
  aviso_recuperacion: {
    tipo: 'aviso_recuperacion',
    nombre: 'Aviso de reactivación',
    descripcion: 'Confirma al cliente que su servicio volvió a estar activo tras pagar.',
    grupo: 'clientes',
    disparo: 'evento',
    canales: ['correo', 'whatsapp'],
    activaPorDefecto: true,
    parametrosPorDefecto: {},
  },
  saldo_bajo_revendedor: {
    tipo: 'saldo_bajo_revendedor',
    nombre: 'Saldo bajo del revendedor',
    descripcion: 'Avisa al revendedor cuando su saldo queda por debajo del umbral.',
    grupo: 'revendedores',
    disparo: 'evento',
    canales: ['correo'],
    activaPorDefecto: true,
    parametrosPorDefecto: { umbralUsd: '5.00' },
  },
  tasa_automatica: {
    tipo: 'tasa_automatica',
    nombre: 'Tasa del bolívar automática',
    descripcion:
      'Consulta la tasa oficial y la registra sola. Si cambia más de lo permitido, no la aplica y avisa a administración.',
    grupo: 'finanzas',
    disparo: 'programada',
    canales: ['correo'],
    activaPorDefecto: false,
    parametrosPorDefecto: { fuente: 'bcv', horas: [9, 13], variacionMaximaPct: 10 },
  },
  alerta_sla_tickets: {
    tipo: 'alerta_sla_tickets',
    nombre: 'Tickets fuera de plazo',
    descripcion: 'Avisa al equipo de soporte de los tickets que pasaron su plazo de respuesta.',
    grupo: 'equipo',
    disparo: 'programada',
    canales: ['correo'],
    activaPorDefecto: true,
    parametrosPorDefecto: { cadaMinutos: 60 },
  },
  alerta_pagos_pendientes: {
    tipo: 'alerta_pagos_pendientes',
    nombre: 'Pagos por conciliar',
    descripcion:
      'Resumen diario al equipo de cobros con los pagos y recargas que llevan horas esperando revisión.',
    grupo: 'equipo',
    disparo: 'programada',
    canales: ['correo'],
    activaPorDefecto: true,
    parametrosPorDefecto: { horasEspera: 12, hora: 10 },
  },
  cobro_automatico: {
    tipo: 'cobro_automatico',
    nombre: 'Cobro automático autorizado',
    descripcion:
      'El día del vencimiento cobra la renovación con el método que el cliente autorizó; si falla, reintenta y le avisa. Nunca cobra sin autorización.',
    grupo: 'clientes',
    disparo: 'programada',
    canales: ['correo', 'whatsapp'],
    activaPorDefecto: true,
    parametrosPorDefecto: { reintentosDias: [1, 3, 5], hora: 7 },
  },
  stock_bajo_codigos: {
    tipo: 'stock_bajo_codigos',
    nombre: 'Pocos códigos en inventario',
    descripcion:
      'Resumen diario a administración con los planes que entregan códigos y tienen pocos disponibles (o entregas esperando stock).',
    grupo: 'equipo',
    disparo: 'programada',
    canales: ['correo'],
    activaPorDefecto: true,
    parametrosPorDefecto: { umbral: 10, hora: 9 },
  },
};

/** Cambios que administración hace a una automatización. */
export const actualizarAutomatizacionSchema = z.object({
  activa: z.boolean().optional(),
  canales: z
    .array(z.enum(CANALES_AVISO))
    .min(1, 'Elige al menos un canal.')
    .refine((v) => new Set(v).size === v.length, { error: 'No repitas canales.' })
    .optional(),
  /** Se valida con el esquema del tipo en la API. */
  parametros: z.record(z.string(), z.unknown()).optional(),
});
export type ActualizarAutomatizacionEntrada = z.output<typeof actualizarAutomatizacionSchema>;

export const ESTADOS_NOTIFICACION = ['pendiente', 'enviada', 'fallida', 'omitida'] as const;
export type EstadoNotificacion = (typeof ESTADOS_NOTIFICACION)[number];

export const filtroNotificacionesSchema = z.object({
  canal: z.enum(CANALES_AVISO).optional(),
  estado: z.enum(ESTADOS_NOTIFICACION).optional(),
  automatizacion: z.enum(TIPOS_AUTOMATIZACION).optional(),
  clienteId: z.uuid().optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

/** Mensaje de prueba para comprobar un canal desde el panel. */
export const avisoPruebaSchema = z.object({
  canal: z.enum(CANALES_AVISO),
  /** Correo o teléfono en formato internacional (+58...). */
  destino: z.string().trim().min(5).max(254),
});

/** Consulta de prueba de la tasa automática (sin guardar). Sin fuente usa la configurada. */
export const probarTasaSchema = z.object({
  fuente: z.enum(FUENTES_TASA).optional(),
});

export const preferenciasAvisosSchema = z.object({
  recibirRecordatorios: z.boolean(),
});
