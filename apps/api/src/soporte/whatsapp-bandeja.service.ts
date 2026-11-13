import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type BandejaWhatsApp,
  type ConversacionWhatsAppDetalle,
  type ConversacionWhatsAppResumen,
  type MensajeWhatsAppPublico,
  ventanaWhatsAppHasta,
} from '@nv/shared';
import { type CanalWhatsApp, WHATSAPP } from '../avisos/whatsapp.js';
import type { ContextoAuth } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';

const MAX_CONVERSACIONES = 100;
const MAX_MENSAJES = 200;

/** Lo que se guarda de un mensaje que no es texto: el equipo lo abre en su WhatsApp. */
const TIPO_LEGIBLE: Record<string, string> = {
  image: '📷 Imagen',
  audio: '🎤 Nota de voz',
  voice: '🎤 Nota de voz',
  video: '🎬 Video',
  document: '📄 Documento',
  sticker: 'Sticker',
  location: '📍 Ubicación',
  contacts: '👤 Contacto',
  reaction: 'Reacción',
};

const ESTADOS_SALIENTE = new Set(['sent', 'delivered', 'read', 'failed']);
const ESTADO_ES: Record<string, string> = {
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
};
const ORDEN_ESTADO = ['enviado', 'entregado', 'leido'];

interface MensajeMeta {
  from?: unknown;
  id?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: { body?: unknown };
  button?: { text?: unknown };
  interactive?: { button_reply?: { title?: unknown }; list_reply?: { title?: unknown } };
  image?: { caption?: unknown };
  video?: { caption?: unknown };
  document?: { caption?: unknown; filename?: unknown };
  reaction?: { emoji?: unknown };
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Texto que se guarda para un mensaje entrante de Meta. */
export function textoMensajeMeta(m: MensajeMeta): { tipo: string; texto: string } {
  const tipo = typeof m.type === 'string' ? m.type.slice(0, 20) : 'desconocido';
  const leido =
    texto(m.text?.body) ??
    texto(m.button?.text) ??
    texto(m.interactive?.button_reply?.title) ??
    texto(m.interactive?.list_reply?.title);
  if (leido) return { tipo, texto: leido.slice(0, 4096) };
  const etiqueta = TIPO_LEGIBLE[tipo] ?? 'Mensaje que no se puede mostrar aquí';
  const extra =
    texto(m.image?.caption) ??
    texto(m.video?.caption) ??
    texto(m.document?.caption) ??
    texto(m.document?.filename) ??
    texto(m.reaction?.emoji);
  return { tipo, texto: (extra ? `${etiqueta}: ${extra}` : etiqueta).slice(0, 4096) };
}

/**
 * Bandeja de WhatsApp: el webhook de Meta guarda lo que escriben los clientes
 * al número de la empresa y el equipo responde desde Soporte. Meta solo admite
 * texto libre dentro de las 24 h siguientes al último mensaje del cliente.
 */
@Injectable()
export class WhatsAppBandejaService {
  private readonly logger = new Logger('WhatsAppBandeja');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WHATSAPP) private readonly canal: CanalWhatsApp,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  private get webhookListo(): boolean {
    return Boolean(this.entorno.WHATSAPP_VERIFICAR_TOKEN && this.entorno.WHATSAPP_SECRETO_APP);
  }

  /** Respuesta al «hub.challenge» con que Meta comprueba el webhook al registrarlo. */
  verificar(modo: unknown, token: unknown, reto: unknown): string {
    const esperado = this.entorno.WHATSAPP_VERIFICAR_TOKEN;
    const valido =
      Boolean(esperado) &&
      modo === 'subscribe' &&
      typeof token === 'string' &&
      token.length === esperado.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(esperado)) &&
      typeof reto === 'string' &&
      /^[\w-]{1,200}$/.test(reto);
    if (!valido) throw new ErrorApp(403, 'NO_AUTORIZADO', 'El token de verificación no coincide.');
    return reto as string;
  }

  private firmaValida(firma: unknown, cuerpo: Buffer): boolean {
    const secreto = this.entorno.WHATSAPP_SECRETO_APP;
    if (!secreto || typeof firma !== 'string' || !firma.startsWith('sha256=')) return false;
    const recibida = Buffer.from(firma.slice(7), 'hex');
    const esperada = createHmac('sha256', secreto).update(cuerpo).digest();
    return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
  }

  /** Aviso de Meta: mensajes nuevos y cambios de estado de lo que enviamos. */
  async recibir(firma: unknown, cuerpo: Buffer | undefined): Promise<{ ok: true }> {
    if (!cuerpo || !this.firmaValida(firma, cuerpo)) {
      throw new ErrorApp(401, 'FIRMA_INVALIDA', 'La firma del aviso no es válida.');
    }
    let datos: { entry?: { changes?: { field?: string; value?: unknown }[] }[] };
    try {
      datos = JSON.parse(cuerpo.toString('utf8')) as typeof datos;
    } catch {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'El aviso no es JSON.');
    }
    for (const entrada of datos.entry ?? []) {
      for (const cambio of entrada.changes ?? []) {
        if (cambio.field !== 'messages' || !cambio.value || typeof cambio.value !== 'object') {
          continue;
        }
        const valor = cambio.value as {
          contacts?: { wa_id?: unknown; profile?: { name?: unknown } }[];
          messages?: MensajeMeta[];
          statuses?: { id?: unknown; status?: unknown }[];
        };
        const nombres = new Map<string, string>();
        for (const c of valor.contacts ?? []) {
          const nombre = texto(c.profile?.name);
          if (typeof c.wa_id === 'string' && nombre) nombres.set(c.wa_id, nombre.slice(0, 120));
        }
        for (const m of valor.messages ?? []) await this.guardarEntrante(m, nombres);
        for (const s of valor.statuses ?? []) await this.actualizarEstado(s);
      }
    }
    return { ok: true };
  }

  private async clientePorTelefono(telefono: string): Promise<string | null> {
    const filas = await this.prisma.$queryRaw<{ cliente_id: string }[]>`
      SELECT cliente_id FROM contactos_cliente
      WHERE tipo IN ('whatsapp', 'telefono')
        AND regexp_replace(valor, '\\D', '', 'g') = ${telefono}
      ORDER BY (tipo = 'whatsapp') DESC, creado_en
      LIMIT 1`;
    return filas[0]?.cliente_id ?? null;
  }

  private async guardarEntrante(m: MensajeMeta, nombres: Map<string, string>): Promise<void> {
    if (typeof m.from !== 'string' || typeof m.id !== 'string') return;
    const telefono = m.from.replace(/\D/g, '').slice(0, 20);
    if (!telefono) return;
    const waId = m.id.slice(0, 160);
    if (await this.prisma.mensajeWhatsApp.findUnique({ where: { waId }, select: { id: true } })) {
      return; // Meta reintenta: ya está guardado.
    }
    const segundos = Number(m.timestamp);
    const ahora = new Date();
    const fecha =
      Number.isFinite(segundos) && segundos > 0 && segundos * 1000 <= ahora.getTime() + 60_000
        ? new Date(segundos * 1000)
        : ahora;
    const { tipo, texto: contenido } = textoMensajeMeta(m);
    const nombre = nombres.get(m.from) ?? null;
    const existente = await this.prisma.conversacionWhatsApp.findUnique({
      where: { telefono },
      select: { id: true, clienteId: true },
    });
    const clienteId = existente?.clienteId ?? (await this.clientePorTelefono(telefono));
    try {
      await this.prisma.conversacionWhatsApp.upsert({
        where: { telefono },
        create: {
          telefono,
          nombre,
          clienteId,
          ultimoEntranteEn: fecha,
          ultimoMensajeEn: fecha,
          noLeidos: 1,
          mensajes: {
            create: { direccion: 'entrante', texto: contenido, tipo, waId, creadoEn: fecha },
          },
        },
        update: {
          ...(nombre ? { nombre } : {}),
          clienteId,
          ultimoEntranteEn: fecha,
          ultimoMensajeEn: fecha,
          noLeidos: { increment: 1 },
          cerrada: false,
          mensajes: {
            create: { direccion: 'entrante', texto: contenido, tipo, waId, creadoEn: fecha },
          },
        },
      });
    } catch (e) {
      // Dos reintentos a la vez: el segundo choca con wa_id único y no pasa nada.
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }

  private async actualizarEstado(s: { id?: unknown; status?: unknown }): Promise<void> {
    if (typeof s.id !== 'string' || typeof s.status !== 'string') return;
    if (!ESTADOS_SALIENTE.has(s.status)) return;
    const nuevo = ESTADO_ES[s.status]!;
    const mensaje = await this.prisma.mensajeWhatsApp.findUnique({
      where: { waId: s.id.slice(0, 160) },
      select: { id: true, estado: true, direccion: true },
    });
    if (!mensaje || mensaje.direccion !== 'saliente') return;
    // Los avisos pueden llegar desordenados: «entregado» no pisa a «leído».
    const antes = ORDEN_ESTADO.indexOf(mensaje.estado ?? '');
    if (nuevo !== 'fallido' && ORDEN_ESTADO.indexOf(nuevo) <= antes) return;
    await this.prisma.mensajeWhatsApp.update({
      where: { id: mensaje.id },
      data: { estado: nuevo },
    });
  }

  private resumen(c: {
    id: string;
    telefono: string;
    nombre: string | null;
    cliente: { id: string; nombre: string } | null;
    ultimoEntranteEn: Date | null;
    ultimoMensajeEn: Date;
    noLeidos: number;
    cerrada: boolean;
    mensajes: { texto: string; direccion: 'entrante' | 'saliente'; creadoEn: Date }[];
  }): ConversacionWhatsAppResumen {
    const ultimo = c.mensajes[0];
    return {
      id: c.id,
      telefono: `+${c.telefono}`,
      nombre: c.nombre,
      cliente: c.cliente,
      ultimoMensaje: ultimo
        ? {
            texto: ultimo.texto.slice(0, 160),
            direccion: ultimo.direccion,
            creadoEn: ultimo.creadoEn.toISOString(),
          }
        : null,
      ultimoMensajeEn: c.ultimoMensajeEn.toISOString(),
      noLeidos: c.noLeidos,
      cerrada: c.cerrada,
      ventanaHasta: ventanaWhatsAppHasta(c.ultimoEntranteEn)?.toISOString() ?? null,
    };
  }

  async bandeja(estado: 'abiertas' | 'cerradas'): Promise<BandejaWhatsApp> {
    const [filas, sinLeer] = await Promise.all([
      this.prisma.conversacionWhatsApp.findMany({
        where: { cerrada: estado === 'cerradas' },
        orderBy: { ultimoMensajeEn: 'desc' },
        take: MAX_CONVERSACIONES,
        include: {
          cliente: { select: { id: true, nombre: true } },
          mensajes: {
            orderBy: { creadoEn: 'desc' },
            take: 1,
            select: { texto: true, direccion: true, creadoEn: true },
          },
        },
      }),
      this.prisma.conversacionWhatsApp.count({ where: { cerrada: false, noLeidos: { gt: 0 } } }),
    ]);
    return {
      canalListo: this.canal.listo && this.canal.proveedor !== 'desactivado',
      proveedor: this.canal.proveedor,
      webhookListo: this.webhookListo,
      conversaciones: filas.map((c) => this.resumen(c)),
      sinLeer,
    };
  }

  /** Abre la conversación y la marca leída. */
  async detalle(id: string): Promise<ConversacionWhatsAppDetalle> {
    const c = await this.prisma.conversacionWhatsApp.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true } },
        mensajes: {
          orderBy: { creadoEn: 'desc' },
          take: MAX_MENSAJES,
          include: { autor: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!c) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    if (c.noLeidos > 0) {
      await this.prisma.conversacionWhatsApp.update({ where: { id }, data: { noLeidos: 0 } });
    }
    const mensajes: MensajeWhatsAppPublico[] = c.mensajes.reverse().map((m) => ({
      id: m.id,
      direccion: m.direccion,
      texto: m.texto,
      tipo: m.tipo,
      estado: m.estado,
      autor: m.autor,
      creadoEn: m.creadoEn.toISOString(),
    }));
    return {
      ...this.resumen({ ...c, mensajes: c.mensajes.slice(-1) }),
      noLeidos: 0,
      mensajes,
    };
  }

  async responder(
    auth: ContextoAuth,
    id: string,
    contenido: string,
  ): Promise<MensajeWhatsAppPublico> {
    const c = await this.prisma.conversacionWhatsApp.findUnique({
      where: { id },
      select: { id: true, telefono: true, ultimoEntranteEn: true },
    });
    if (!c) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    if (!this.canal.listo || this.canal.proveedor === 'desactivado') {
      throw new ErrorApp(
        409,
        'WHATSAPP_SIN_CONFIGURAR',
        'WhatsApp no está configurado en el servidor: no se puede responder desde aquí.',
      );
    }
    if (!ventanaWhatsAppHasta(c.ultimoEntranteEn)) {
      throw new ErrorApp(
        409,
        'VENTANA_CERRADA',
        'Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo deja escribirle de nuevo con una plantilla aprobada, o cuando vuelva a escribir.',
      );
    }
    let referencia: string;
    try {
      ({ referencia } = await this.canal.enviarTexto(c.telefono, contenido));
    } catch (e) {
      this.logger.warn(`No se pudo enviar una respuesta de WhatsApp: ${(e as Error).message}`);
      throw new ErrorApp(502, 'WHATSAPP_RECHAZO', (e as Error).message.slice(0, 300));
    }
    const ahora = new Date();
    const [m] = await this.prisma.$transaction([
      this.prisma.mensajeWhatsApp.create({
        data: {
          conversacionId: id,
          direccion: 'saliente',
          texto: contenido,
          waId: referencia.slice(0, 160),
          estado: 'enviado',
          autorId: auth.usuario.id,
          creadoEn: ahora,
        },
        include: { autor: { select: { id: true, nombre: true } } },
      }),
      this.prisma.conversacionWhatsApp.update({
        where: { id },
        data: { ultimoMensajeEn: ahora, noLeidos: 0 },
      }),
    ]);
    return {
      id: m.id,
      direccion: m.direccion,
      texto: m.texto,
      tipo: m.tipo,
      estado: m.estado,
      autor: m.autor,
      creadoEn: m.creadoEn.toISOString(),
    };
  }

  async cambiarEstado(id: string, cerrada: boolean): Promise<{ cerrada: boolean }> {
    const r = await this.prisma.conversacionWhatsApp.updateMany({
      where: { id },
      data: { cerrada },
    });
    if (!r.count) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    return { cerrada };
  }
}
