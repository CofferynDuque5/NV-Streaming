/**
 * message-handler.ts — Enrutador de Intenciones del Asistente NV (POO · SRP).
 *
 * Toma el texto crudo del cliente, lo limpia (minúsculas, sin acentos) y evalúa
 * la intención mediante un mapa de reglas (diccionario de comandos + regex). Cada
 * intención dispara una CONSULTA/MUTACIÓN REAL a la base de datos (PostgreSQL vía
 * repositorios) y devuelve un contrato limpio para la UI: `{ intent, reply }`.
 *
 * No hay respuestas quemadas por subcadena en el cliente: el algoritmo vive aquí,
 * en el servidor, y responde con datos reales (suscripciones, stock, renovación).
 */

import { UsersRepository } from '../../db/repositories/users.repo.js';
import { SubscriptionsRepository } from '../../db/repositories/subscriptions.repo.js';
import { AccountsRepository } from '../../db/repositories/accounts.repo.js';
import { PlansRepository } from '../../db/repositories/plans.repo.js';

export interface EntradaChat { message: string; userId?: string | null; }
export interface AccionChat { id: string; label: string; comando: string; }
export interface RespuestaChat {
  intent: string;
  reply: { text: string; card?: Record<string, unknown>; actions?: AccionChat[] };
  datos?: unknown;
}

/** Mapa de palabras del cliente → id de plataforma real del catálogo. */
const ALIAS_PLATAFORMA: Record<string, string> = {
  netflix: 'netflix', spotify: 'spotify', disney: 'disney', hbo: 'hbo', max: 'hbo',
  chatgpt: 'chatgpt', gpt: 'chatgpt', crunchyroll: 'crunchyroll', prime: 'prime',
  paramount: 'paramount', appletv: 'appletv', apple: 'appletv', youtube: 'youtube',
  deezer: 'deezer', vix: 'vix', tidal: 'tidal', office: 'office365', windows: 'windows11',
};

export function normalizar(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .replace(/\s+/g, ' ')
    .trim();
}

function detectarPlataforma(txt: string): string | null {
  for (const [alias, id] of Object.entries(ALIAS_PLATAFORMA)) {
    if (txt.includes(alias)) return id;
  }
  return null;
}

type Dependencias = {
  users: typeof UsersRepository;
  subs: typeof SubscriptionsRepository;
  accounts: typeof AccountsRepository;
  plans: typeof PlansRepository;
};

export class MessageHandler {
  private deps: Dependencias;
  private reglas: Array<{ intent: string; test: (t: string) => boolean; run: (t: string, userId: string | null) => Promise<RespuestaChat> }>;

  constructor(deps?: Partial<Dependencias>) {
    this.deps = {
      users: deps?.users ?? UsersRepository,
      subs: deps?.subs ?? SubscriptionsRepository,
      accounts: deps?.accounts ?? AccountsRepository,
      plans: deps?.plans ?? PlansRepository,
    };
    // Orden importa: reglas más específicas primero.
    this.reglas = [
      { intent: 'saludo', test: (t) => /^(hola|buenas|hey|holi|buenos dias|buenas tardes|buenas noches)\b/.test(t) || t === 'hi', run: (t, u) => this.saludo(t, u) },
      { intent: 'soporte', test: (t) => /(no puedo entrar|no me deja|no funciona|error|falla|problema|acceso|no carga|no sirve|\/soporte|\/falla)/.test(t), run: (t, u) => this.soporte(t, u) },
      { intent: 'renovar', test: (t) => /(renovar|renueva|renovacion|\/renovar|extender)/.test(t), run: (t, u) => this.renovar(t, u) },
      { intent: 'saldo', test: (t) => /(saldo|mis servicios|mi cuenta|suscripcion|estado|vence|\/saldo|que tengo)/.test(t), run: (t, u) => this.saldo(t, u) },
      { intent: 'catalogo', test: (t) => /(catalogo|precio|precios|cuanto|comprar|servicios|planes|\/catalogo|\/precios)/.test(t), run: (t, u) => this.catalogo(t, u) },
      { intent: 'ayuda', test: (t) => /(ayuda|help|comandos|menu|\/ayuda|que puedes hacer)/.test(t), run: (t, u) => this.ayuda(t, u) },
    ];
  }

  /** Punto de entrada: enruta el mensaje y devuelve la respuesta real. */
  async procesar({ message, userId }: EntradaChat): Promise<RespuestaChat> {
    const t = normalizar(message);
    if (!t) return { intent: 'vacio', reply: { text: 'Escríbeme tu consulta 🙂 (por ejemplo: /saldo, /renovar o "no puedo entrar a Netflix").' } };
    const regla = this.reglas.find((r) => r.test(t));
    const uid = userId ? String(userId) : null;
    try {
      return regla ? await regla.run(t, uid) : await this.fallback(t, uid);
    } catch (e) {
      return { intent: 'error', reply: { text: 'Tuve un problema consultando tus datos. Intenta de nuevo en un momento.' }, datos: { error: (e as Error).message } };
    }
  }

  /** Resuelve el usuario real (si `userId` corresponde a un WhatsApp/registro). */
  private async resolverUsuario(userId: string | null) {
    if (!userId) return null;
    try { return await this.deps.users.findByWhatsapp(userId); } catch { return null; }
  }

  private menuAcciones(): AccionChat[] {
    return [
      { id: 'saldo', label: '📊 Mis servicios', comando: '/saldo' },
      { id: 'renovar', label: '🔄 Renovar', comando: '/renovar' },
      { id: 'catalogo', label: '🛒 Catálogo', comando: '/catalogo' },
      { id: 'soporte', label: '🆘 Tengo una falla', comando: '/soporte' },
    ];
  }

  private async saludo(_t: string, userId: string | null): Promise<RespuestaChat> {
    const u = await this.resolverUsuario(userId);
    const nombre = u?.nombre ? `, ${u.nombre.split(' ')[0]}` : '';
    return { intent: 'saludo', reply: { text: `¡Hola${nombre}! 👋 Soy tu Asistente NV. Puedo mostrarte tus servicios, renovarlos o ayudarte con una falla de acceso. ¿Qué necesitas?`, actions: this.menuAcciones() } };
  }

  private async ayuda(_t: string, _userId: string | null): Promise<RespuestaChat> {
    return { intent: 'ayuda', reply: { text: 'Puedo ayudarte con:\n• /saldo — tus servicios activos y vencimientos\n• /renovar — renovar un servicio\n• /catalogo — precios y planes\n• "No puedo entrar a Netflix" — soporte de acceso', actions: this.menuAcciones() } };
  }

  private async saldo(_t: string, userId: string | null): Promise<RespuestaChat> {
    const u = await this.resolverUsuario(userId);
    if (!u) return { intent: 'saldo', reply: { text: 'No encuentro una cuenta asociada. Inicia sesión o escríbenos tu número de WhatsApp para vincularte.', actions: this.menuAcciones() } };
    const subs = await this.deps.subs.findActiveDetailedByUser(u.id);
    if (!subs.length) return { intent: 'saldo', reply: { text: 'No tienes servicios activos ahora mismo. ¿Quieres ver el catálogo?', actions: [{ id: 'catalogo', label: '🛒 Ver catálogo', comando: '/catalogo' }] } };
    const lineas = subs.map((s) => `• ${s.plan_nombre} — vence en ${s.dias_restantes} día(s) (${new Date(s.fecha_vencimiento).toLocaleDateString('es-VE')})`).join('\n');
    return {
      intent: 'saldo',
      reply: {
        text: `Tienes ${subs.length} servicio(s) activo(s):\n${lineas}`,
        actions: subs.slice(0, 3).map((s) => ({ id: 'renovar_' + s.plataforma_id, label: `🔄 Renovar ${s.plan_nombre}`, comando: `/renovar ${s.plataforma_id}` })),
      },
      datos: subs,
    };
  }

  private async soporte(t: string, userId: string | null): Promise<RespuestaChat> {
    const plataforma = detectarPlataforma(t);
    if (!plataforma) return { intent: 'soporte', reply: { text: '¿Con qué servicio tienes el problema? (por ejemplo: "no puedo entrar a Netflix").' } };
    const u = await this.resolverUsuario(userId);
    if (u) {
      const sub = await this.deps.subs.findForService(u.id, plataforma);
      if (sub) {
        const vigente = sub.estado === 'activa' && sub.pagada && new Date(sub.fecha_vencimiento) > new Date();
        if (vigente) {
          return {
            intent: 'soporte',
            reply: {
              text: `Detecté tu ${sub.plan_nombre}. Sigue estos pasos para recuperar el acceso:\n1) Usa el correo y perfil asignados.\n2) Ingresa el PIN de tu perfil.\n3) Si pide verificación, pídeme "reenviar código".`,
              card: { titulo: sub.plan_nombre, perfil: sub.perfil, correo: sub.correo, estado: 'Activo', vence: new Date(sub.fecha_vencimiento).toLocaleDateString('es-VE') },
              actions: [{ id: 'codigo', label: '📩 Reenviar código', comando: `/codigo ${plataforma}` }, { id: 'renovar', label: '🔄 Renovar', comando: `/renovar ${plataforma}` }],
            },
            datos: { plataforma, estado: sub.estado },
          };
        }
        return { intent: 'soporte', reply: { text: `Tu ${sub.plan_nombre} figura como ${sub.pagada ? 'vencido' : 'pendiente de pago'}. Puedo ayudarte a renovarlo para restablecer el acceso.`, actions: [{ id: 'renovar', label: '🔄 Renovar ahora', comando: `/renovar ${plataforma}` }] } };
      }
    }
    // Sin cuenta: consulta stock real de esa plataforma.
    const stock = await this.deps.accounts.countAvailableFor(plataforma).catch(() => 0);
    return {
      intent: 'soporte',
      reply: {
        text: stock > 0
          ? `No veo una suscripción de ${plataforma} a tu nombre, pero hay disponibilidad inmediata. ¿Quieres adquirirla?`
          : `No veo una suscripción de ${plataforma} a tu nombre. Puedo avisarte cuando haya stock o mostrarte alternativas.`,
        actions: [{ id: 'catalogo', label: '🛒 Ver catálogo', comando: '/catalogo' }],
      },
      datos: { plataforma, stock },
    };
  }

  private async renovar(t: string, userId: string | null): Promise<RespuestaChat> {
    const plataforma = detectarPlataforma(t);
    const u = await this.resolverUsuario(userId);
    if (!u) return { intent: 'renovar', reply: { text: 'Para renovar necesito identificar tu cuenta. Inicia sesión o vincúlate con tu número de WhatsApp.' } };
    if (!plataforma) {
      const subs = await this.deps.subs.findActiveDetailedByUser(u.id);
      if (!subs.length) return { intent: 'renovar', reply: { text: 'No tienes servicios para renovar. ¿Ver catálogo?', actions: [{ id: 'catalogo', label: '🛒 Catálogo', comando: '/catalogo' }] } };
      return { intent: 'renovar', reply: { text: '¿Cuál servicio quieres renovar?', actions: subs.map((s) => ({ id: 'r_' + s.plataforma_id, label: `🔄 ${s.plan_nombre}`, comando: `/renovar ${s.plataforma_id}` })) } };
    }
    const sub = await this.deps.subs.findForService(u.id, plataforma);
    if (!sub) return { intent: 'renovar', reply: { text: `No encuentro una suscripción de ${plataforma} a tu nombre.` } };
    // MUTACIÓN REAL: extiende el vencimiento en la base de datos por id.
    const dias = 30;
    const nuevaFecha = await this.deps.subs.renovar(sub.id, dias);
    const fechaTxt = nuevaFecha ? new Date(nuevaFecha).toLocaleDateString('es-VE') : 'próximamente';
    return {
      intent: 'renovar',
      reply: {
        text: `✅ Renovación aplicada a ${sub.plan_nombre}. Nueva fecha de vencimiento: ${fechaTxt}. El cobro se descuenta según tu método/saldo configurado.`,
        card: { titulo: sub.plan_nombre, estado: 'Renovado', vence: fechaTxt, monto: `${sub.plan_precio} ${sub.plan_moneda}` },
      },
      datos: { plataforma, nuevaFecha },
    };
  }

  private async catalogo(_t: string, _userId: string | null): Promise<RespuestaChat> {
    const planes = await this.deps.plans.allActive().catch(() => []);
    if (!planes.length) return { intent: 'catalogo', reply: { text: 'El catálogo se está actualizando. Intenta en un momento.' } };
    const top = planes.slice(0, 8).map((p) => `• ${p.nombre} — ${p.precio} ${p.moneda}`).join('\n');
    return { intent: 'catalogo', reply: { text: `Estos son algunos de nuestros planes activos:\n${top}\n\nDime cuál te interesa y te guío para comprarlo.`, actions: [{ id: 'soporte', label: '🆘 Ayuda', comando: '/ayuda' }] }, datos: { total: planes.length } };
  }

  private async fallback(_t: string, userId: string | null): Promise<RespuestaChat> {
    // Sin intención clara: ofrece el menú real (nunca inventa una respuesta).
    return this.ayuda(_t, userId);
  }
}

export const messageHandler = new MessageHandler();
export default MessageHandler;
