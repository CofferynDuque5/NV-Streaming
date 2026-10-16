import { z } from 'zod';
import { ESTADOS_TICKET, PRIORIDADES_TICKET } from './esquemas/soporte.js';
import type { Permiso } from './permisos.js';

/**
 * Asistente de IA del equipo (fase 5). El modelo nunca toca la base de datos:
 * pide herramientas de un catálogo cerrado que la API ejecuta con los permisos
 * de quien pregunta, y todo lo que devuelven pasa por un filtro de redacción.
 * Lo que tiene efecto solo crea una acción propuesta que una persona confirma.
 */

/**
 * Motores. "local": modelo abierto servido por Ollama en el mismo servidor
 * (gratis, los datos no salen). "claude": API de Anthropic (de pago, con tope
 * mensual). "sandbox": respuestas fijas para desarrollo y pruebas.
 */
export const PROVEEDORES_IA = ['local', 'claude', 'sandbox'] as const;
export type ProveedorIa = (typeof PROVEEDORES_IA)[number];

export const INFO_PROVEEDOR_IA: Record<ProveedorIa, { nombre: string; deCosto: boolean }> = {
  local: { nombre: 'Modelo local (Ollama)', deCosto: false },
  claude: { nombre: 'Claude (Anthropic)', deCosto: true },
  sandbox: { nombre: 'Asistente de pruebas', deCosto: false },
};

export type TipoHerramienta = 'consulta' | 'accion';

export interface DefinicionHerramienta {
  nombre: string;
  /** Lo que lee el modelo para decidir cuándo usarla. */
  descripcion: string;
  tipo: TipoHerramienta;
  /** Permiso que necesita quien pregunta (y quien confirma, si es acción). */
  permiso: Permiso;
  /** Texto corto para la persona (en el historial y en la tarjeta de confirmación). */
  etiqueta: string;
}

const uuid = z.uuid({ error: 'El identificador no es válido.' });
const textoCorto = (max: number) => z.string().trim().min(1).max(max);

/**
 * Parámetros de cada herramienta. Se convierten a JSON Schema para el modelo y
 * se validan en la API antes de ejecutar nada.
 */
export const PARAMETROS_HERRAMIENTA = {
  // ── Consultas ──────────────────────────────────────────────────────────────
  buscar_clientes: z.object({
    texto: textoCorto(100).describe('Nombre, correo, teléfono o documento (o parte).'),
  }),
  ver_cliente: z.object({ clienteId: uuid }),
  suscripciones_por_vencer: z.object({
    dias: z.number().int().min(0).max(60).default(7).describe('Días hacia adelante.'),
  }),
  ver_suscripcion: z.object({ suscripcionId: uuid }),
  facturas_pendientes: z.object({
    clienteId: uuid.optional().describe('Solo las de este cliente.'),
  }),
  pagos_por_conciliar: z.object({}),
  tickets_abiertos: z.object({
    prioridad: z.enum(PRIORIDADES_TICKET).optional(),
    soloMios: z.boolean().default(false).describe('Solo los asignados a quien pregunta.'),
  }),
  ver_ticket: z.object({ ticketId: uuid }),
  resumen_metricas: z.object({}),
  tasa_del_dia: z.object({}),
  revendedores_saldo_bajo: z.object({}),
  // ── Acciones (solo propuestas) ─────────────────────────────────────────────
  pausar_suscripcion: z.object({ suscripcionId: uuid, motivo: textoCorto(500) }),
  reanudar_suscripcion: z.object({ suscripcionId: uuid }),
  emitir_renovacion: z.object({ suscripcionId: uuid }),
  responder_ticket: z.object({
    ticketId: uuid,
    texto: textoCorto(4000).describe('Respuesta al cliente, en español y en tono cordial.'),
    interno: z.boolean().default(false).describe('Nota interna que el cliente no ve.'),
  }),
  actualizar_ticket: z
    .object({
      ticketId: uuid,
      estado: z.enum(ESTADOS_TICKET).optional(),
      prioridad: z.enum(PRIORIDADES_TICKET).optional(),
    })
    .refine((d) => d.estado !== undefined || d.prioridad !== undefined, 'No hay cambios.'),
  agregar_nota_cliente: z.object({ clienteId: uuid, texto: textoCorto(2000) }),
} as const;

export type NombreHerramienta = keyof typeof PARAMETROS_HERRAMIENTA;
export const NOMBRES_HERRAMIENTA = Object.keys(PARAMETROS_HERRAMIENTA) as NombreHerramienta[];

export type ParametrosHerramienta<N extends NombreHerramienta> = z.output<
  (typeof PARAMETROS_HERRAMIENTA)[N]
>;

export const HERRAMIENTAS: Record<NombreHerramienta, DefinicionHerramienta> = {
  buscar_clientes: {
    nombre: 'buscar_clientes',
    descripcion: 'Busca clientes por nombre, correo, teléfono o documento. Devuelve hasta 10.',
    tipo: 'consulta',
    permiso: 'clientes.ver',
    etiqueta: 'Buscó clientes',
  },
  ver_cliente: {
    nombre: 'ver_cliente',
    descripcion: 'Ficha de un cliente: datos de contacto, suscripciones y últimas facturas.',
    tipo: 'consulta',
    permiso: 'clientes.ver',
    etiqueta: 'Consultó un cliente',
  },
  suscripciones_por_vencer: {
    nombre: 'suscripciones_por_vencer',
    descripcion: 'Suscripciones que vencen en los próximos días, con su cliente y plan.',
    tipo: 'consulta',
    permiso: 'suscripciones.ver',
    etiqueta: 'Consultó vencimientos',
  },
  ver_suscripcion: {
    nombre: 'ver_suscripcion',
    descripcion: 'Detalle de una suscripción: estado, periodo, plan y facturas.',
    tipo: 'consulta',
    permiso: 'suscripciones.ver',
    etiqueta: 'Consultó una suscripción',
  },
  facturas_pendientes: {
    nombre: 'facturas_pendientes',
    descripcion: 'Facturas emitidas sin pagar, de todos o de un cliente.',
    tipo: 'consulta',
    permiso: 'facturas.ver',
    etiqueta: 'Consultó facturas pendientes',
  },
  pagos_por_conciliar: {
    nombre: 'pagos_por_conciliar',
    descripcion: 'Pagos manuales reportados que esperan revisión, con su antigüedad.',
    tipo: 'consulta',
    permiso: 'pagos.gestionar',
    etiqueta: 'Consultó pagos por conciliar',
  },
  tickets_abiertos: {
    nombre: 'tickets_abiertos',
    descripcion: 'Tickets de soporte sin resolver, con prioridad y plazo.',
    tipo: 'consulta',
    permiso: 'tickets.ver',
    etiqueta: 'Consultó tickets',
  },
  ver_ticket: {
    nombre: 'ver_ticket',
    descripcion: 'Un ticket con su conversación completa.',
    tipo: 'consulta',
    permiso: 'tickets.ver',
    etiqueta: 'Leyó un ticket',
  },
  resumen_metricas: {
    nombre: 'resumen_metricas',
    descripcion: 'Métricas del panel: ingresos del mes en bolívares, suscripciones y tickets.',
    tipo: 'consulta',
    permiso: 'metricas.ver',
    etiqueta: 'Consultó métricas',
  },
  tasa_del_dia: {
    nombre: 'tasa_del_dia',
    descripcion: 'Tasas de cambio vigentes de cada moneda frente al USD.',
    tipo: 'consulta',
    permiso: 'panel.ver',
    etiqueta: 'Consultó la tasa',
  },
  revendedores_saldo_bajo: {
    nombre: 'revendedores_saldo_bajo',
    descripcion: 'Revendedores activos con saldo por debajo del umbral configurado.',
    tipo: 'consulta',
    permiso: 'revendedores.ver',
    etiqueta: 'Consultó revendedores',
  },
  pausar_suscripcion: {
    nombre: 'pausar_suscripcion',
    descripcion: 'Propone pausar una suscripción. Una persona debe confirmarlo.',
    tipo: 'accion',
    permiso: 'suscripciones.gestionar',
    etiqueta: 'Pausar suscripción',
  },
  reanudar_suscripcion: {
    nombre: 'reanudar_suscripcion',
    descripcion: 'Propone reanudar una suscripción pausada. Una persona debe confirmarlo.',
    tipo: 'accion',
    permiso: 'suscripciones.gestionar',
    etiqueta: 'Reanudar suscripción',
  },
  emitir_renovacion: {
    nombre: 'emitir_renovacion',
    descripcion:
      'Propone emitir la factura de renovación de una suscripción (no cobra nada). Una persona debe confirmarlo.',
    tipo: 'accion',
    permiso: 'suscripciones.crear',
    etiqueta: 'Emitir factura de renovación',
  },
  responder_ticket: {
    nombre: 'responder_ticket',
    descripcion:
      'Propone una respuesta para un ticket. Se envía solo cuando una persona la confirma.',
    tipo: 'accion',
    permiso: 'tickets.gestionar',
    etiqueta: 'Responder ticket',
  },
  actualizar_ticket: {
    nombre: 'actualizar_ticket',
    descripcion: 'Propone cambiar el estado o la prioridad de un ticket.',
    tipo: 'accion',
    permiso: 'tickets.gestionar',
    etiqueta: 'Actualizar ticket',
  },
  agregar_nota_cliente: {
    nombre: 'agregar_nota_cliente',
    descripcion: 'Propone guardar una nota interna en la ficha de un cliente.',
    tipo: 'accion',
    permiso: 'clientes.notas',
    etiqueta: 'Agregar nota interna',
  },
};

/** Minutos que una acción propuesta espera confirmación antes de caducar. */
export const MINUTOS_VIGENCIA_ACCION = 60;

export const ESTADOS_ACCION_PROPUESTA = [
  'propuesta',
  'ejecutada',
  'rechazada',
  'fallida',
  'expirada',
] as const;
export type EstadoAccionPropuesta = (typeof ESTADOS_ACCION_PROPUESTA)[number];

// ── Entradas ────────────────────────────────────────────────────────────────

export const enviarMensajeAsistenteSchema = z.object({
  /** Sin conversación: empieza una nueva. */
  conversacionId: uuid.optional(),
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe tu pregunta.')
    .max(4000, 'El mensaje es demasiado largo (máximo 4000 caracteres).'),
});
export type EnviarMensajeAsistenteEntrada = z.output<typeof enviarMensajeAsistenteSchema>;

/** Confirmar o rechazar una acción propuesta. */
export const decidirAccionSchema = z.object({
  confirmar: z.boolean(),
  motivo: z.string().trim().max(500).optional(),
});

const montoTope = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Escribe un importe en USD con hasta 2 decimales.');

export const configurarAsistenteSchema = z.object({
  activo: z.boolean(),
  proveedor: z.enum(PROVEEDORES_IA, { error: 'Elige un motor válido.' }),
  /** Vacío = el modelo por defecto del motor. */
  modelo: z
    .string()
    .trim()
    .max(80)
    .regex(/^[\w.:/-]*$/, 'El nombre del modelo tiene caracteres no válidos.')
    .transform((v) => v || null),
  topeMensualUsd: montoTope,
  mensajesDiariosPorUsuario: z.coerce
    .number({ error: 'Escribe un número entre 1 y 1000.' })
    .int('Escribe un número entre 1 y 1000.')
    .min(1, 'Escribe un número entre 1 y 1000.')
    .max(1000, 'Escribe un número entre 1 y 1000.'),
});
export type ConfigurarAsistenteEntrada = z.output<typeof configurarAsistenteSchema>;

export const filtroAccionesSchema = z.object({
  estado: z.enum(ESTADOS_ACCION_PROPUESTA).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});
