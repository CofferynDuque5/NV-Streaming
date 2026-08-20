/**
 * Herramientas (Tools) que el LLM puede invocar mediante Function Calling.
 *
 * Arquitectura de seguridad (reglas de negocio 2 y 3):
 *   · El LLM SOLO decide qué herramienta llamar y con qué `servicio`. Nunca
 *     genera SQL ni credenciales ni precios.
 *   · El `whatsappId` NO lo aporta el modelo: lo inyecta el backend desde el
 *     contexto autenticado del webhook (`ctx.whatsappId`). Así un usuario no
 *     puede pedir los datos de otro número.
 *   · Los ejecutores llaman a los repositorios (consultas parametrizadas) y
 *     devuelven un contrato JSON con `encontrado`. Si la BD viene vacía →
 *     `encontrado:false` y el prompt del sistema PROHÍBE inventar datos.
 *
 * Se usa inyección de dependencias (`ToolDeps`) para poder testear sin BD.
 */
import type OpenAI from 'openai';
import { UsersRepository } from '../../db/repositories/users.repo.js';
import { SubscriptionsRepository } from '../../db/repositories/subscriptions.repo.js';
import type { SuscripcionDetallada, SuscripcionServicio } from '../../db/repositories/subscriptions.repo.js';
import { AccountsRepository, type StockPlataforma } from '../../db/repositories/accounts.repo.js';
import type { Usuario } from '../../db/models.js';
import { decrypt } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

/* ─────────────────────────  Dependencias inyectables  ───────────────────── */
export interface ToolDeps {
  users: { findByWhatsapp(id: string): Promise<Usuario | null> };
  subs: {
    findActiveDetailedByUser(usuarioId: string): Promise<SuscripcionDetallada[]>;
    findForService(usuarioId: string, plataformaId: string): Promise<SuscripcionServicio | null>;
  };
  accounts: {
    countAvailableByPlatform(): Promise<StockPlataforma[]>;
    countAvailableFor(plataformaId: string): Promise<number>;
  };
  decrypt: (s: string) => string | null;
  /** Reloj inyectable (facilita testear vencimientos). */
  now?: () => Date;
}

export const defaultToolDeps: ToolDeps = {
  users: UsersRepository,
  subs: SubscriptionsRepository,
  accounts: AccountsRepository,
  decrypt,
};

/** Contexto autenticado: el whatsappId REAL del remitente (no viene del modelo). */
export interface ToolContext {
  whatsappId: string;
}

// Normaliza el nombre de servicio dicho por el usuario a un id de plataforma.
const ALIAS: Record<string, string> = {
  netflix: 'netflix', disney: 'disney', 'disney+': 'disney', 'disney plus': 'disney',
  max: 'hbo', hbo: 'hbo', 'hbo max': 'hbo', spotify: 'spotify', 'apple tv': 'appletv',
  appletv: 'appletv', apple: 'appletv', paramount: 'paramount', 'paramount+': 'paramount',
  crunchyroll: 'crunchyroll', vix: 'vix', chatgpt: 'chatgpt',
};
function normalizarServicio(servicio: string): string | null {
  const key = String(servicio || '').trim().toLowerCase();
  return ALIAS[key] ?? (key ? key.replace(/[^a-z0-9]+/g, '') : null);
}

/* ═══════════════════  FUNCIÓN 1 · verificarEstadoSuscripcion  ═══════════════════ */
export async function verificarEstadoSuscripcion(whatsappId: string, deps: ToolDeps = defaultToolDeps) {
  const usuario = await deps.users.findByWhatsapp(whatsappId);
  if (!usuario) {
    return { encontrado: false, motivo: 'usuario_no_registrado', mensaje: 'No hay ninguna cuenta asociada a este número.' };
  }
  const subs = await deps.subs.findActiveDetailedByUser(usuario.id);
  if (subs.length === 0) {
    return { encontrado: false, motivo: 'sin_suscripciones_activas', cliente: usuario.nombre ?? null, suscripciones: [] };
  }
  return {
    encontrado: true,
    cliente: usuario.nombre ?? null,
    suscripciones: subs.map((s) => ({
      servicio: s.plataforma_id,
      plan: s.plan_nombre,
      estado: s.estado,
      perfil: s.perfil,        // perfil único privado asignado (tiempo real)
      pagada: s.pagada,
      dias_restantes: s.dias_restantes,
      vence: s.fecha_vencimiento instanceof Date ? s.fecha_vencimiento.toISOString() : String(s.fecha_vencimiento),
      renovacion_automatica: s.renovacion_automatica,
      precio: s.plan_precio,   // proviene de la BD, no del modelo
      moneda: s.plan_moneda,
    })),
  };
}

/* ═══════════════════  FUNCIÓN 3 · consultarInventario  ═══════════════════ */
/**
 * Visibilidad del stock: cuántos perfiles/cuentas 'disponible' quedan por
 * plataforma. Si `servicio` se especifica, devuelve el stock de esa plataforma;
 * si no, el inventario completo. La IA lo usa ANTES de ofrecer o procesar un
 * servicio para no prometer lo que no hay.
 */
export async function consultarInventario(servicio: string | undefined, deps: ToolDeps = defaultToolDeps) {
  if (servicio) {
    const plataformaId = normalizarServicio(servicio);
    if (!plataformaId) return { ok: false, motivo: 'servicio_invalido' };
    const disponibles = await deps.accounts.countAvailableFor(plataformaId);
    return { ok: true, servicio: plataformaId, disponibles, hay_stock: disponibles > 0 };
  }
  const stock = await deps.accounts.countAvailableByPlatform();
  return {
    ok: true,
    inventario: stock.map((s) => ({ servicio: s.plataforma_id, disponibles: s.disponibles })),
    total_disponibles: stock.reduce((a, s) => a + Number(s.disponibles), 0),
  };
}

/* ═══════════════════  FUNCIÓN 2 · obtenerCredencialesPerfil  ═══════════════════ */
/**
 * LÓGICA DE CONTROL (gate de entrega de credenciales).
 *
 * El backend valida en la BD, ANTES de exponer nada:
 *   1. Que exista una suscripción del cliente para ese servicio.
 *   2. Que esté ACTIVA, PAGADA y VIGENTE (fecha_vencimiento en el futuro).
 *
 * Solo si las tres condiciones se cumplen se exponen correo, contraseña y el
 * número de perfil asignado. En cualquier otro caso la entrega se BLOQUEA y se
 * devuelve a la IA una señal (`accion_sugerida: "guiar_al_pago"`) para que
 * conduzca al usuario a renovar/pagar — nunca se filtran credenciales.
 */
export async function obtenerCredencialesPerfil(whatsappId: string, servicio: string, deps: ToolDeps = defaultToolDeps) {
  const ahora = (deps.now ?? (() => new Date()))();
  const plataformaId = normalizarServicio(servicio);
  if (!plataformaId) return { encontrado: false, motivo: 'servicio_invalido', mensaje: 'No reconozco ese servicio.' };

  const usuario = await deps.users.findByWhatsapp(whatsappId);
  if (!usuario) return { encontrado: false, motivo: 'usuario_no_registrado' };

  const sus = await deps.subs.findForService(usuario.id, plataformaId);

  // (a) El cliente nunca tuvo esa suscripción → no hay nada que entregar.
  if (!sus) {
    return { encontrado: false, entrega_bloqueada: true, motivo: 'sin_suscripcion', accion_sugerida: 'ofrecer_compra', servicio: plataformaId };
  }

  const venc = sus.fecha_vencimiento instanceof Date ? sus.fecha_vencimiento : new Date(sus.fecha_vencimiento);
  const vigente = venc.getTime() > ahora.getTime();
  const activaYPagada = sus.estado === 'activa' && sus.pagada === true && vigente;

  // (b) BLOQUEO: vencida, impaga, pausada o cancelada → guiar al pago.
  if (!activaYPagada) {
    const motivo =
      sus.estado === 'cancelada' ? 'suscripcion_cancelada'
      : sus.estado === 'pausada' ? 'suscripcion_pausada'
      : (!vigente || sus.estado === 'vencida') ? 'suscripcion_vencida'
      : !sus.pagada ? 'pago_pendiente'
      : 'suscripcion_no_activa';

    logger.info({ usuarioId: usuario.id, servicio: plataformaId, motivo }, 'Entrega de credenciales BLOQUEADA');
    return {
      encontrado: false,
      entrega_bloqueada: true,
      motivo,
      accion_sugerida: 'guiar_al_pago',
      servicio: plataformaId,
      // Datos (de la BD) para que la IA guíe al pago SIN inventar precios.
      plan: sus.plan_nombre,
      precio: sus.plan_precio,
      moneda: sus.plan_moneda,
      vencio_el: venc.toISOString(),
    };
  }

  // (c) ACTIVA + PAGADA + VIGENTE → exponer credenciales del perfil único.
  const contrasena = deps.decrypt(sus.contrasena_cifrada);
  if (contrasena === null) {
    logger.error({ servicio: plataformaId }, 'No se pudo descifrar la credencial');
    return { encontrado: false, entrega_bloqueada: true, motivo: 'error_credencial' };
  }

  logger.info({ usuarioId: usuario.id, servicio: plataformaId }, 'Entrega de credenciales AUTORIZADA');
  return {
    encontrado: true,
    servicio: sus.plataforma_id,
    correo: sus.correo,
    contrasena,               // se entrega al cliente dueño de la suscripción
    perfil: sus.perfil,       // número/nombre del perfil ÚNICO privado asignado
    pin: sus.pin,
    vence: venc.toISOString(),
  };
}

/* ═══════════════════  Esquemas para el LLM (Function Calling)  ═══════════════════ */
// Nótese: NINGÚN esquema expone `whatsappId`; lo inyecta el backend por seguridad.
export const TOOL_SCHEMAS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'verificarEstadoSuscripcion',
      description:
        'Consulta el estado de las suscripciones activas del cliente que está escribiendo (días restantes, vencimiento, renovación). Úsala cuando pregunte por su suscripción, vencimiento o estado de su cuenta.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obtenerCredencialesPerfil',
      description:
        'Obtiene las credenciales (correo, contraseña, perfil, PIN) de la suscripción ACTIVA del cliente para un servicio concreto. Úsala solo cuando el cliente pida sus datos de acceso a un servicio.',
      parameters: {
        type: 'object',
        properties: {
          servicio: { type: 'string', description: 'Nombre del servicio, p. ej. "Netflix", "Disney+", "Spotify".' },
        },
        required: ['servicio'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultarInventario',
      description:
        'Consulta cuántos perfiles/cuentas quedan DISPONIBLES por plataforma (stock real del inventario). Úsala antes de ofrecer o prometer un servicio. Sin "servicio" devuelve el inventario completo; con "servicio" el stock de esa plataforma.',
      parameters: {
        type: 'object',
        properties: {
          servicio: { type: 'string', description: 'Opcional. Nombre del servicio, p. ej. "Netflix", "Max".' },
        },
        additionalProperties: false,
      },
    },
  },
];

/* ═══════════════════  Dispatcher seguro  ═══════════════════ */
/**
 * Ejecuta la herramienta solicitada por el modelo. El `whatsappId` SIEMPRE es el
 * del contexto autenticado; si el modelo intentara pasar otro, se ignora y se
 * registra.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  deps: ToolDeps = defaultToolDeps,
): Promise<unknown> {
  if ('whatsappId' in args && args['whatsappId'] !== ctx.whatsappId) {
    logger.warn({ pedido: args['whatsappId'], real: ctx.whatsappId }, 'El modelo intentó usar otro whatsappId — ignorado');
  }
  switch (name) {
    case 'verificarEstadoSuscripcion':
      return verificarEstadoSuscripcion(ctx.whatsappId, deps);
    case 'obtenerCredencialesPerfil':
      return obtenerCredencialesPerfil(ctx.whatsappId, String(args['servicio'] ?? ''), deps);
    case 'consultarInventario':
      return consultarInventario(args['servicio'] ? String(args['servicio']) : undefined, deps);
    default:
      return { error: `herramienta_desconocida: ${name}` };
  }
}
