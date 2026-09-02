/**
 * message-handler.ts — Enrutador de Intenciones del Asistente NV (POO · SRP).
 *
 * Cada intención es una regla (patrón Strategy: predicado + manejador) que dispara
 * una consulta/mutación REAL a PostgreSQL vía repositorios y devuelve un contrato
 * limpio `{ intent, reply }`. Responsabilidades separadas en colaboradores:
 *   · DetectorPlataforma  → reconoce la plataforma mencionada.
 *   · Vigencia            → decide si una suscripción da acceso.
 *   · Menu / respuesta()  → fábricas de acciones y respuestas (sin literales repetidos).
 * Ninguna función supera ~20 líneas ni hace más de una tarea.
 */

import { UsersRepository } from '../../db/repositories/users.repo.js';
import { SubscriptionsRepository } from '../../db/repositories/subscriptions.repo.js';
import { AccountsRepository } from '../../db/repositories/accounts.repo.js';
import { PlansRepository } from '../../db/repositories/plans.repo.js';
import type { SuscripcionServicio, SuscripcionDetallada } from '../../db/repositories/subscriptions.repo.js';

/* ─────────────────────────── Contratos ─────────────────────────── */
export interface EntradaChat { message: string; userId?: string | null; }
export interface AccionChat { id: string; label: string; comando: string; }
export type TarjetaChat = Record<string, string>;
export interface RespuestaChat {
  intent: string;
  reply: { text: string; card?: TarjetaChat; actions?: AccionChat[] };
  datos?: unknown;
}

/** Normaliza el texto del cliente: minúsculas, sin acentos ni espacios extra. */
export function normalizar(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Colaborador: detección de plataforma (una sola responsabilidad) ── */
class DetectorPlataforma {
  private static readonly ALIAS: Readonly<Record<string, string>> = {
    netflix: 'netflix', spotify: 'spotify', disney: 'disney', hbo: 'hbo', max: 'hbo',
    chatgpt: 'chatgpt', gpt: 'chatgpt', crunchyroll: 'crunchyroll', prime: 'prime',
    paramount: 'paramount', appletv: 'appletv', apple: 'appletv', youtube: 'youtube',
    deezer: 'deezer', vix: 'vix', tidal: 'tidal', office: 'office365', windows: 'windows11',
  };
  static detectar(texto: string): string | null {
    const alias = Object.keys(DetectorPlataforma.ALIAS).find((clave) => texto.includes(clave));
    return alias ? DetectorPlataforma.ALIAS[alias]! : null;
  }
}

/** Colaborador: decide si una suscripción concede acceso ahora mismo. */
class Vigencia {
  static concedeAcceso(sub: SuscripcionServicio): boolean {
    return sub.estado === 'activa' && sub.pagada && new Date(sub.fecha_vencimiento) > new Date();
  }
}

/* ── Fábricas de acciones y menús (evitan literales repetidos) ── */
const accion = (id: string, label: string, comando: string): AccionChat => ({ id, label, comando });
const fechaCorta = (f: Date | string): string => new Date(f).toLocaleDateString('es-VE');

class Menu {
  static principal(): AccionChat[] {
    return [
      accion('saldo', '📊 Mis servicios', '/saldo'),
      accion('renovar', '🔄 Renovar', '/renovar'),
      accion('catalogo', '🛒 Catálogo', '/catalogo'),
      accion('soporte', '🆘 Tengo una falla', '/soporte'),
    ];
  }
  static soloCatalogo(): AccionChat[] { return [accion('catalogo', '🛒 Ver catálogo', '/catalogo')]; }
}

/** Fábrica de respuestas: una sola forma de construir el contrato de salida. */
function respuesta(
  intent: string,
  text: string,
  extra: { card?: TarjetaChat; actions?: AccionChat[]; datos?: unknown } = {},
): RespuestaChat {
  const reply: RespuestaChat['reply'] = { text };
  if (extra.card) reply.card = extra.card;
  if (extra.actions) reply.actions = extra.actions;
  const salida: RespuestaChat = { intent, reply };
  if (extra.datos !== undefined) salida.datos = extra.datos;
  return salida;
}

/* ─────────────────────── Dependencias inyectables ─────────────────────── */
interface Dependencias {
  users: typeof UsersRepository;
  subs: typeof SubscriptionsRepository;
  accounts: typeof AccountsRepository;
  plans: typeof PlansRepository;
}
interface ReglaIntencion {
  intent: string;
  coincide: (texto: string) => boolean;
  responder: (texto: string, userId: string | null) => Promise<RespuestaChat>;
}

const DIAS_RENOVACION = 30;

export class MessageHandler {
  private readonly deps: Dependencias;
  private readonly reglas: readonly ReglaIntencion[];

  constructor(deps: Partial<Dependencias> = {}) {
    this.deps = {
      users: deps.users ?? UsersRepository,
      subs: deps.subs ?? SubscriptionsRepository,
      accounts: deps.accounts ?? AccountsRepository,
      plans: deps.plans ?? PlansRepository,
    };
    this.reglas = this.construirReglas();
  }

  /** Punto de entrada: enruta el mensaje a la primera regla que coincide. */
  async procesar({ message, userId }: EntradaChat): Promise<RespuestaChat> {
    const texto = normalizar(message);
    if (!texto) return this.mensajeVacio();
    const regla = this.reglas.find((r) => r.coincide(texto));
    try {
      return await (regla ?? this.reglaPorDefecto()).responder(texto, this.normalizarId(userId));
    } catch (error) {
      return this.errorInterno(error);
    }
  }

  /* ─────────────── Tabla de reglas (Strategy) ─────────────── */
  private construirReglas(): readonly ReglaIntencion[] {
    // Orden importa: de la intención más específica a la más general.
    return [
      { intent: 'saludo',   coincide: (t) => /^(hola|buenas|hey|holi|buenos dias|buenas tardes|buenas noches)\b/.test(t) || t === 'hi', responder: (t, u) => this.saludar(t, u) },
      { intent: 'soporte',  coincide: (t) => /(no puedo entrar|no me deja|no funciona|error|falla|problema|acceso|no carga|no sirve|\/soporte|\/falla)/.test(t), responder: (t, u) => this.atenderSoporte(t, u) },
      { intent: 'renovar',  coincide: (t) => /(renovar|renueva|renovacion|\/renovar|extender)/.test(t), responder: (t, u) => this.atenderRenovacion(t, u) },
      { intent: 'saldo',    coincide: (t) => /(saldo|mis servicios|mi cuenta|suscripcion|estado|vence|\/saldo|que tengo)/.test(t), responder: (t, u) => this.consultarSaldo(u) },
      { intent: 'catalogo', coincide: (t) => /(catalogo|precio|precios|cuanto|comprar|servicios|planes|\/catalogo|\/precios)/.test(t), responder: () => this.mostrarCatalogo() },
      { intent: 'ayuda',    coincide: (t) => /(ayuda|help|comandos|menu|\/ayuda|que puedes hacer)/.test(t), responder: () => this.mostrarAyuda() },
    ];
  }
  private reglaPorDefecto(): ReglaIntencion {
    return { intent: 'ayuda', coincide: () => true, responder: () => this.mostrarAyuda() };
  }

  /* ─────────────── Utilidades de una sola tarea ─────────────── */
  private normalizarId(userId?: string | null): string | null { return userId ? String(userId) : null; }
  private async resolverUsuario(userId: string | null): Promise<{ id: string; nombre: string | null } | null> {
    // `userId` es el id de usuario del JWT verificado (no un teléfono del cliente).
    if (!userId) return null;
    try { return await this.deps.users.findById(userId); } catch { return null; }
  }
  private mensajeVacio(): RespuestaChat {
    return respuesta('vacio', 'Escríbeme tu consulta 🙂 (por ejemplo: /saldo, /renovar o "no puedo entrar a Netflix").');
  }
  private errorInterno(error: unknown): RespuestaChat {
    return respuesta('error', 'Tuve un problema consultando tus datos. Intenta de nuevo en un momento.', { datos: { error: (error as Error).message } });
  }

  /* ─────────────── Intención: saludo / ayuda ─────────────── */
  private async saludar(_texto: string, userId: string | null): Promise<RespuestaChat> {
    const usuario = await this.resolverUsuario(userId);
    const nombre = usuario?.nombre ? `, ${usuario.nombre.split(' ')[0]}` : '';
    return respuesta('saludo', `¡Hola${nombre}! 👋 Soy tu Asistente NV. Puedo mostrarte tus servicios, renovarlos o ayudarte con una falla de acceso. ¿Qué necesitas?`, { actions: Menu.principal() });
  }
  private async mostrarAyuda(): Promise<RespuestaChat> {
    const texto = 'Puedo ayudarte con:\n• /saldo — tus servicios activos y vencimientos\n• /renovar — renovar un servicio\n• /catalogo — precios y planes\n• "No puedo entrar a Netflix" — soporte de acceso';
    return respuesta('ayuda', texto, { actions: Menu.principal() });
  }

  /* ─────────────── Intención: saldo ─────────────── */
  private async consultarSaldo(userId: string | null): Promise<RespuestaChat> {
    const usuario = await this.resolverUsuario(userId);
    if (!usuario) return this.saldoSinCuenta();
    const subs = await this.deps.subs.findActiveDetailedByUser(usuario.id);
    return subs.length ? this.saldoConSuscripciones(subs) : this.saldoSinSuscripciones();
  }
  private saldoSinCuenta(): RespuestaChat {
    return respuesta('saldo', 'No encuentro una cuenta asociada. Inicia sesión o escríbenos tu número de WhatsApp para vincularte.', { actions: Menu.principal() });
  }
  private saldoSinSuscripciones(): RespuestaChat {
    return respuesta('saldo', 'No tienes servicios activos ahora mismo. ¿Quieres ver el catálogo?', { actions: Menu.soloCatalogo() });
  }
  private saldoConSuscripciones(subs: SuscripcionDetallada[]): RespuestaChat {
    const lineas = subs.map((s) => `• ${s.plan_nombre} — vence en ${s.dias_restantes} día(s) (${fechaCorta(s.fecha_vencimiento)})`).join('\n');
    const acciones = subs.slice(0, 3).map((s) => accion('renovar_' + s.plataforma_id, `🔄 Renovar ${s.plan_nombre}`, `/renovar ${s.plataforma_id}`));
    return respuesta('saldo', `Tienes ${subs.length} servicio(s) activo(s):\n${lineas}`, { actions: acciones, datos: subs });
  }

  /* ─────────────── Intención: soporte ─────────────── */
  private async atenderSoporte(texto: string, userId: string | null): Promise<RespuestaChat> {
    const plataforma = DetectorPlataforma.detectar(texto);
    if (!plataforma) return this.soportePedirPlataforma();
    const usuario = await this.resolverUsuario(userId);
    const suscripcion = usuario ? await this.deps.subs.findForService(usuario.id, plataforma) : null;
    if (suscripcion) return this.soporteDeSuscripcion(suscripcion, plataforma);
    return this.soporteSinSuscripcion(plataforma);
  }
  private soportePedirPlataforma(): RespuestaChat {
    return respuesta('soporte', '¿Con qué servicio tienes el problema? (por ejemplo: "no puedo entrar a Netflix").');
  }
  private soporteDeSuscripcion(sub: SuscripcionServicio, plataforma: string): RespuestaChat {
    return Vigencia.concedeAcceso(sub) ? this.guiaDeAcceso(sub, plataforma) : this.avisoDePago(sub, plataforma);
  }
  private guiaDeAcceso(sub: SuscripcionServicio, plataforma: string): RespuestaChat {
    const card: TarjetaChat = { titulo: sub.plan_nombre, perfil: sub.perfil, correo: sub.correo, estado: 'Activo', vence: fechaCorta(sub.fecha_vencimiento) };
    const acciones = [accion('codigo', '📩 Reenviar código', `/codigo ${plataforma}`), accion('renovar', '🔄 Renovar', `/renovar ${plataforma}`)];
    const texto = `Detecté tu ${sub.plan_nombre}. Sigue estos pasos para recuperar el acceso:\n1) Usa el correo y perfil asignados.\n2) Ingresa el PIN de tu perfil.\n3) Si pide verificación, pídeme "reenviar código".`;
    return respuesta('soporte', texto, { card, actions: acciones, datos: { plataforma, estado: sub.estado } });
  }
  private avisoDePago(sub: SuscripcionServicio, plataforma: string): RespuestaChat {
    const situacion = sub.pagada ? 'vencido' : 'pendiente de pago';
    return respuesta('soporte', `Tu ${sub.plan_nombre} figura como ${situacion}. Puedo ayudarte a renovarlo para restablecer el acceso.`,
      { actions: [accion('renovar', '🔄 Renovar ahora', `/renovar ${plataforma}`)] });
  }
  private async soporteSinSuscripcion(plataforma: string): Promise<RespuestaChat> {
    const stock = await this.deps.accounts.countAvailableFor(plataforma).catch(() => 0);
    const texto = stock > 0
      ? `No veo una suscripción de ${plataforma} a tu nombre, pero hay disponibilidad inmediata. ¿Quieres adquirirla?`
      : `No veo una suscripción de ${plataforma} a tu nombre. Puedo avisarte cuando haya stock o mostrarte alternativas.`;
    return respuesta('soporte', texto, { actions: Menu.soloCatalogo(), datos: { plataforma, stock } });
  }

  /* ─────────────── Intención: renovar ─────────────── */
  private async atenderRenovacion(texto: string, userId: string | null): Promise<RespuestaChat> {
    const usuario = await this.resolverUsuario(userId);
    if (!usuario) return this.renovarExigirIdentidad();
    const plataforma = DetectorPlataforma.detectar(texto);
    if (!plataforma) return this.renovarElegirServicio(usuario.id);
    return this.renovarServicio(usuario.id, plataforma);
  }
  private renovarExigirIdentidad(): RespuestaChat {
    return respuesta('renovar', 'Para renovar necesito identificar tu cuenta. Inicia sesión o vincúlate con tu número de WhatsApp.');
  }
  private async renovarElegirServicio(usuarioId: string): Promise<RespuestaChat> {
    const subs = await this.deps.subs.findActiveDetailedByUser(usuarioId);
    if (!subs.length) return respuesta('renovar', 'No tienes servicios para renovar. ¿Ver catálogo?', { actions: Menu.soloCatalogo() });
    const acciones = subs.map((s) => accion('r_' + s.plataforma_id, `🔄 ${s.plan_nombre}`, `/renovar ${s.plataforma_id}`));
    return respuesta('renovar', '¿Cuál servicio quieres renovar?', { actions: acciones });
  }
  private async renovarServicio(usuarioId: string, plataforma: string): Promise<RespuestaChat> {
    const sub = await this.deps.subs.findForService(usuarioId, plataforma);
    if (!sub) return respuesta('renovar', `No encuentro una suscripción de ${plataforma} a tu nombre.`);
    const nuevaFecha = await this.deps.subs.renovar(sub.id, DIAS_RENOVACION);
    return this.confirmarRenovacion(sub, plataforma, nuevaFecha);
  }
  private confirmarRenovacion(sub: SuscripcionServicio, plataforma: string, nuevaFecha: Date | null): RespuestaChat {
    const fechaTexto = nuevaFecha ? fechaCorta(nuevaFecha) : 'próximamente';
    const card: TarjetaChat = { titulo: sub.plan_nombre, estado: 'Renovado', vence: fechaTexto, monto: `${sub.plan_precio} ${sub.plan_moneda}` };
    const texto = `✅ Renovación aplicada a ${sub.plan_nombre}. Nueva fecha de vencimiento: ${fechaTexto}. El cobro se descuenta según tu método/saldo configurado.`;
    return respuesta('renovar', texto, { card, datos: { plataforma, nuevaFecha } });
  }

  /* ─────────────── Intención: catálogo ─────────────── */
  private async mostrarCatalogo(): Promise<RespuestaChat> {
    const planes = await this.deps.plans.allActive().catch(() => []);
    if (!planes.length) return respuesta('catalogo', 'El catálogo se está actualizando. Intenta en un momento.');
    const lineas = planes.slice(0, 8).map((p) => `• ${p.nombre} — ${p.precio} ${p.moneda}`).join('\n');
    const texto = `Estos son algunos de nuestros planes activos:\n${lineas}\n\nDime cuál te interesa y te guío para comprarlo.`;
    return respuesta('catalogo', texto, { actions: [accion('soporte', '🆘 Ayuda', '/ayuda')], datos: { total: planes.length } });
  }
}

export const messageHandler = new MessageHandler();
export default MessageHandler;
