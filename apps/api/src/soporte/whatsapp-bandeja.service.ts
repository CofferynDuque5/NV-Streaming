import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import {
  type BandejaWhatsApp,
  type ConversacionWhatsAppDetalle,
  type ConversacionWhatsAppResumen,
  MEDIO_WHATSAPP_MAX_MB,
  type MensajeWhatsAppPublico,
  type PresenciaWhatsApp,
  type TipoMedioWhatsApp,
  ventanaWhatsAppHasta,
} from '@nv/shared';
import { type ArchivoRecibido, AlmacenService } from '../almacen/almacen.service.js';
import { detectarTipo } from '../almacen/tipos-archivo.js';
import { type CanalWhatsApp, WHATSAPP } from '../avisos/whatsapp.js';
import type { ContextoAuth } from '../comun/contexto.js';
import { ErrorApp } from '../comun/errores.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { aNotaDeVoz, esAudio } from './whatsapp-audio.js';
import { leyendaDeMedio } from './whatsapp-qr-mensajes.js';
import {
  type MensajeQr,
  type ReceptorWhatsAppQr,
  WhatsAppQrService,
} from './whatsapp-qr.service.js';

const MAX_CONVERSACIONES = 100;
/** Mensajes que se muestran al abrir un chat; los anteriores se cargan hacia arriba. */
const MAX_MENSAJES = 80;
/** Tope de un archivo que se baja de WhatsApp para verlo en el panel. */
const MAX_BAJAR_BYTES = 16 * 1024 * 1024;

const TIPOS_MEDIO = new Set<TipoMedioWhatsApp>([
  'imagen',
  'audio',
  'video',
  'sticker',
  'documento',
]);

/** Tipo de archivo de un mensaje guardado (por su «tipo» de WhatsApp). */
function claseDeMedio(tipo: string): TipoMedioWhatsApp | null {
  const t = tipo.toLowerCase();
  if (t === 'image') return 'imagen';
  if (t === 'audio' || t === 'voice' || t === 'ptt') return 'audio';
  if (t === 'video' || t === 'ptv') return 'video';
  if (t === 'sticker') return 'sticker';
  if (t === 'document' || t === 'documentwithcaption') return 'documento';
  return TIPOS_MEDIO.has(t as TipoMedioWhatsApp) ? (t as TipoMedioWhatsApp) : null;
}

const conAutor = { autor: { select: { id: true, nombre: true } } } as const;

interface FilaMensaje {
  id: string;
  direccion: 'entrante' | 'saliente';
  texto: string;
  tipo: string;
  estado: string | null;
  autor: { id: string; nombre: string } | null;
  creadoEn: Date;
  medioClave: string | null;
  medioMime: string | null;
  medioSegundos: number | null;
  medioRef: string | null;
  fijadoEn: Date | null;
}

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
 * Bandeja de WhatsApp: guarda lo que escriben los clientes al número de la
 * empresa y el equipo responde desde Soporte. Llega por el número vinculado con
 * código QR (gratis, sin límite de 24 h) o por el webhook de la Cloud API de
 * Meta, que solo admite texto libre en las 24 h siguientes al último mensaje.
 */
@Injectable()
export class WhatsAppBandejaService implements ReceptorWhatsAppQr {
  private readonly logger = new Logger('WhatsAppBandeja');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WHATSAPP) private readonly canal: CanalWhatsApp,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(WhatsAppQrService) private readonly qr: WhatsAppQrService,
    @Inject(AlmacenService) private readonly almacen: AlmacenService,
  ) {
    this.qr.escuchar(this);
  }

  /** La Cloud API de Meta (o el modo de pruebas) puede enviar. */
  private get canalMeta(): boolean {
    return this.canal.listo && this.canal.proveedor !== 'desactivado';
  }

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
    const segundos = Number(m.timestamp);
    const ahora = new Date();
    const fecha =
      Number.isFinite(segundos) && segundos > 0 && segundos * 1000 <= ahora.getTime() + 60_000
        ? new Date(segundos * 1000)
        : ahora;
    await this.entrante({
      telefono,
      waId: m.id.slice(0, 160),
      ...textoMensajeMeta(m),
      fecha,
      nombre: nombres.get(m.from) ?? null,
    });
  }

  /** Mensaje de un cliente (por el webhook de Meta o por el número vinculado con QR). */
  async entrante(m: MensajeQr & { nombre: string | null }): Promise<void> {
    const { telefono, waId, tipo, texto: contenido, fecha, nombre } = m;
    if (await this.prisma.mensajeWhatsApp.findUnique({ where: { waId }, select: { id: true } })) {
      return; // Reintento: ya está guardado.
    }
    const existente = await this.prisma.conversacionWhatsApp.findUnique({
      where: { telefono },
      select: { id: true, clienteId: true, ultimoMensajeEn: true, ultimoEntranteEn: true },
    });
    const clienteId = existente?.clienteId ?? (await this.clientePorTelefono(telefono));
    const medio = this.datosMedio(m);
    if (m.historico) {
      // Del historial: se guarda leído, sin reabrir el chat ni moverlo si ya hay algo más nuevo.
      await this.guardarHistorico(existente, telefono, nombre, clienteId, fecha, {
        direccion: 'entrante',
        texto: contenido,
        tipo,
        waId,
        creadoEn: fecha,
        ...medio,
      });
      return;
    }
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
            create: {
              direccion: 'entrante',
              texto: contenido,
              tipo,
              waId,
              creadoEn: fecha,
              ...medio,
            },
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
            create: {
              direccion: 'entrante',
              texto: contenido,
              tipo,
              waId,
              creadoEn: fecha,
              ...medio,
            },
          },
        },
      });
    } catch (e) {
      // Dos reintentos a la vez: el segundo choca con wa_id único y no pasa nada.
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }

  /**
   * Lo que el equipo escribió desde el teléfono vinculado o WhatsApp Web: se
   * guarda para que la conversación se vea completa. Lo enviado desde el panel
   * ya está guardado (mismo id) y se ignora.
   */
  async salienteDesdeTelefono(m: MensajeQr): Promise<void> {
    const { telefono, waId, tipo, texto: contenido, fecha } = m;
    if (await this.prisma.mensajeWhatsApp.findUnique({ where: { waId }, select: { id: true } })) {
      return;
    }
    const existente = await this.prisma.conversacionWhatsApp.findUnique({
      where: { telefono },
      select: { id: true, clienteId: true, ultimoMensajeEn: true, ultimoEntranteEn: true },
    });
    const clienteId = existente?.clienteId ?? (await this.clientePorTelefono(telefono));
    const mensaje = {
      direccion: 'saliente' as const,
      texto: contenido,
      tipo,
      waId,
      estado: 'enviado',
      creadoEn: fecha,
      ...this.datosMedio(m),
    };
    if (m.historico) {
      await this.guardarHistorico(existente, telefono, null, clienteId, fecha, mensaje);
      return;
    }
    try {
      await this.prisma.conversacionWhatsApp.upsert({
        where: { telefono },
        create: { telefono, clienteId, ultimoMensajeEn: fecha, mensajes: { create: mensaje } },
        update: { clienteId, ultimoMensajeEn: fecha, noLeidos: 0, mensajes: { create: mensaje } },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }

  private datosMedio(m: MensajeQr) {
    return m.medio
      ? {
          medioMime: m.medio.mime,
          medioSegundos: m.medio.segundos,
          // Los muy pesados no se bajan: se avisa que se vean en el teléfono.
          medioRef:
            m.medio.tamano !== null && m.medio.tamano > MAX_BAJAR_BYTES ? null : m.medio.ref,
        }
      : {};
  }

  private async guardarHistorico(
    existente: {
      id: string;
      ultimoMensajeEn: Date;
      ultimoEntranteEn: Date | null;
    } | null,
    telefono: string,
    nombre: string | null,
    clienteId: string | null,
    fecha: Date,
    mensaje: {
      direccion: 'entrante' | 'saliente';
      texto: string;
      tipo: string;
      waId: string;
      creadoEn: Date;
      estado?: string;
      medioMime?: string | null;
      medioSegundos?: number | null;
      medioRef?: string | null;
    },
  ): Promise<void> {
    const entrante = mensaje.direccion === 'entrante';
    try {
      if (!existente) {
        await this.prisma.conversacionWhatsApp.create({
          data: {
            telefono,
            nombre,
            clienteId,
            ultimoMensajeEn: fecha,
            ...(entrante ? { ultimoEntranteEn: fecha } : {}),
            mensajes: { create: mensaje },
          },
        });
        return;
      }
      await this.prisma.conversacionWhatsApp.update({
        where: { id: existente.id },
        data: {
          ...(nombre ? { nombre } : {}),
          clienteId,
          ...(fecha > existente.ultimoMensajeEn ? { ultimoMensajeEn: fecha } : {}),
          ...(entrante && (!existente.ultimoEntranteEn || fecha > existente.ultimoEntranteEn)
            ? { ultimoEntranteEn: fecha }
            : {}),
          mensajes: { create: mensaje },
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }

  /** Un archivo recién llegado por el número vinculado: se baja y guarda enseguida. */
  async medioNuevo(waId: string): Promise<void> {
    const m = await this.prisma.mensajeWhatsApp.findUnique({
      where: { waId },
      select: { id: true, medioClave: true, medioRef: true },
    });
    if (m && !m.medioClave && m.medioRef) await this.bajarYGuardar(m.id, m.medioRef);
  }

  private async bajarYGuardar(
    id: string,
    ref: string,
  ): Promise<{ clave: string; contenido: Buffer }> {
    const contenido = await this.qr.bajarMedio(ref);
    if (contenido.length > MAX_BAJAR_BYTES) throw new Error('El archivo es demasiado pesado.');
    const clave = await this.almacen.guardarWhatsApp(contenido);
    await this.prisma.mensajeWhatsApp.update({ where: { id }, data: { medioClave: clave } });
    return { clave, contenido };
  }

  /** El archivo de un mensaje (imagen, audio…): guardado, o se baja de WhatsApp la primera vez. */
  async medio(id: string): Promise<{ contenido: Buffer; mime: string }> {
    const m = await this.prisma.mensajeWhatsApp.findUnique({
      where: { id },
      select: { id: true, tipo: true, medioClave: true, medioMime: true, medioRef: true },
    });
    if (!m || !claseDeMedio(m.tipo)) {
      throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese mensaje no tiene archivo.');
    }
    const mime = m.medioMime ?? 'application/octet-stream';
    if (m.medioClave) return { contenido: await this.almacen.leer({ clave: m.medioClave }), mime };
    if (!m.medioRef) {
      throw new ErrorApp(404, 'NO_ENCONTRADO', 'Este archivo solo se puede ver en el teléfono.');
    }
    if (!this.qr.conectado) {
      throw new ErrorApp(409, 'WHATSAPP_SIN_CONECTAR', 'Conecta el número para ver el archivo.');
    }
    try {
      const { contenido } = await this.bajarYGuardar(m.id, m.medioRef);
      return { contenido, mime };
    } catch (e) {
      this.logger.warn(`No se pudo bajar un archivo de WhatsApp: ${(e as Error).message}`);
      throw new ErrorApp(
        502,
        'WHATSAPP_RECHAZO',
        'WhatsApp ya no tiene este archivo. Ábrelo en el teléfono.',
      );
    }
  }

  /** Estado de entrega que avisa el número vinculado con QR. */
  async estado(waId: string, estado: string): Promise<void> {
    await this.aplicarEstado(waId, estado);
  }

  private async actualizarEstado(s: { id?: unknown; status?: unknown }): Promise<void> {
    if (typeof s.id !== 'string' || typeof s.status !== 'string') return;
    if (!ESTADOS_SALIENTE.has(s.status)) return;
    await this.aplicarEstado(s.id, ESTADO_ES[s.status]!);
  }

  private async aplicarEstado(waId: string, nuevo: string): Promise<void> {
    const mensaje = await this.prisma.mensajeWhatsApp.findUnique({
      where: { waId: waId.slice(0, 160) },
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
    fijadaEn: Date | null;
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
      fijada: c.fijadaEn !== null,
      ventanaHasta: ventanaWhatsAppHasta(c.ultimoEntranteEn)?.toISOString() ?? null,
    };
  }

  async bandeja(estado: 'abiertas' | 'cerradas'): Promise<BandejaWhatsApp> {
    const [filas, sinLeer] = await Promise.all([
      this.prisma.conversacionWhatsApp.findMany({
        where: { cerrada: estado === 'cerradas' },
        // Las fijadas arriba (la última que se fijó primero) y luego por el último mensaje.
        orderBy: [{ fijadaEn: { sort: 'desc', nulls: 'last' } }, { ultimoMensajeEn: 'desc' }],
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
      canalListo: this.qr.conectado || this.canalMeta,
      sinVentana: this.qr.conectado,
      vinculo: this.qr.resumen(),
      proveedor: this.canal.proveedor,
      webhookListo: this.webhookListo,
      conversaciones: filas.map((c) => this.resumen(c)),
      sinLeer,
    };
  }

  private publico(m: FilaMensaje): MensajeWhatsAppPublico {
    const clase = claseDeMedio(m.tipo);
    return {
      id: m.id,
      direccion: m.direccion,
      texto: clase ? leyendaDeMedio(m.texto) : m.texto,
      tipo: m.tipo,
      estado: m.estado,
      autor: m.autor,
      creadoEn: m.creadoEn.toISOString(),
      medio: clase
        ? {
            tipo: clase,
            mime: m.medioMime,
            segundos: m.medioSegundos,
            disponible: Boolean(m.medioClave || m.medioRef),
          }
        : null,
      fijado: m.fijadoEn !== null,
    };
  }

  /** Abre la conversación y la marca leída; con «antes», trae los mensajes anteriores a ese. */
  async detalle(id: string, antes?: string): Promise<ConversacionWhatsAppDetalle> {
    const tope = antes
      ? await this.prisma.mensajeWhatsApp.findFirst({
          where: { id: antes, conversacionId: id },
          select: { creadoEn: true },
        })
      : null;
    const c = await this.prisma.conversacionWhatsApp.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true } },
        mensajes: {
          ...(tope ? { where: { creadoEn: { lt: tope.creadoEn } } } : {}),
          orderBy: { creadoEn: 'desc' },
          take: MAX_MENSAJES + 1,
          include: conAutor,
        },
      },
    });
    if (!c) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    if (c.noLeidos > 0 && !antes) {
      await this.prisma.conversacionWhatsApp.update({ where: { id }, data: { noLeidos: 0 } });
    }
    const fijados = antes
      ? []
      : await this.prisma.mensajeWhatsApp.findMany({
          where: { conversacionId: id, fijadoEn: { not: null } },
          orderBy: { fijadoEn: 'desc' },
          take: 10,
          include: conAutor,
        });
    const hayAnteriores = c.mensajes.length > MAX_MENSAJES;
    const filas = c.mensajes.slice(0, MAX_MENSAJES).reverse();
    return {
      ...this.resumen({ ...c, mensajes: filas.slice(-1) }),
      noLeidos: 0,
      mensajes: filas.map((m) => this.publico(m)),
      fijados: fijados.map((m) => this.publico(m)),
      hayAnteriores,
      puedePedirHistorial: this.qr.conectado,
    };
  }

  /** Pide al teléfono los mensajes de antes del más viejo guardado; llegan en unos segundos. */
  async pedirHistorial(id: string): Promise<{ pedido: true }> {
    const c = await this.prisma.conversacionWhatsApp.findUnique({
      where: { id },
      select: {
        telefono: true,
        mensajes: {
          where: { waId: { not: null } },
          orderBy: { creadoEn: 'asc' },
          take: 1,
          select: { waId: true, direccion: true, creadoEn: true },
        },
      },
    });
    if (!c) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    const viejo = c.mensajes[0];
    if (!this.qr.conectado || !viejo?.waId) {
      throw new ErrorApp(
        409,
        'WHATSAPP_SIN_CONECTAR',
        'Para traer mensajes anteriores, el número tiene que estar vinculado con QR.',
      );
    }
    try {
      await this.qr.pedirHistorial(c.telefono, {
        waId: viejo.waId,
        deMi: viejo.direccion === 'saliente',
        fecha: viejo.creadoEn,
      });
    } catch (e) {
      throw new ErrorApp(502, 'WHATSAPP_RECHAZO', (e as Error).message.slice(0, 300));
    }
    return { pedido: true };
  }

  async presencia(id: string): Promise<PresenciaWhatsApp | null> {
    const c = await this.prisma.conversacionWhatsApp.findUnique({
      where: { id },
      select: { telefono: true },
    });
    if (!c) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    return this.qr.presencia(c.telefono);
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
    const porQr = this.qr.conectado;
    if (!porQr && !this.canalMeta) {
      throw new ErrorApp(
        409,
        'WHATSAPP_SIN_CONFIGURAR',
        'El número de WhatsApp no está vinculado: no se puede responder desde aquí.',
      );
    }
    // Por el número vinculado con QR no hay ventana de 24 h (eso es una regla de la API de Meta).
    if (!porQr && !ventanaWhatsAppHasta(c.ultimoEntranteEn)) {
      throw new ErrorApp(
        409,
        'VENTANA_CERRADA',
        'Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo deja escribirle de nuevo con una plantilla aprobada, o cuando vuelva a escribir.',
      );
    }
    let referencia: string;
    try {
      ({ referencia } = await (porQr ? this.qr : this.canal).enviarTexto(c.telefono, contenido));
    } catch (e) {
      this.logger.warn(`No se pudo enviar una respuesta de WhatsApp: ${(e as Error).message}`);
      throw new ErrorApp(502, 'WHATSAPP_RECHAZO', (e as Error).message.slice(0, 300));
    }
    const ahora = new Date();
    const waId = referencia.slice(0, 160);
    const [m] = await this.prisma.$transaction([
      // upsert: si el aviso del propio envío llegó antes, se completa con el autor.
      this.prisma.mensajeWhatsApp.upsert({
        where: { waId },
        create: {
          conversacionId: id,
          direccion: 'saliente',
          texto: contenido,
          waId,
          estado: 'enviado',
          autorId: auth.usuario.id,
          creadoEn: ahora,
        },
        update: { autorId: auth.usuario.id },
        include: conAutor,
      }),
      this.prisma.conversacionWhatsApp.update({
        where: { id },
        data: { ultimoMensajeEn: ahora, noLeidos: 0 },
      }),
    ]);
    return this.publico(m);
  }

  /** Envía una imagen (con texto opcional) o una nota de voz; solo por el número vinculado con QR. */
  async enviarMedio(
    auth: ContextoAuth,
    id: string,
    archivo: ArchivoRecibido | null,
    datos: { texto?: string; segundos?: number },
  ): Promise<MensajeWhatsAppPublico> {
    const c = await this.prisma.conversacionWhatsApp.findUnique({
      where: { id },
      select: { id: true, telefono: true },
    });
    if (!c) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    if (!this.qr.conectado) {
      throw new ErrorApp(
        409,
        'WHATSAPP_SIN_CONECTAR',
        'Las imágenes y notas de voz salen por el número vinculado con QR. Vincúlalo primero.',
      );
    }
    if (!archivo || archivo.buffer.length === 0) {
      throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige una imagen o graba una nota de voz.');
    }
    if (archivo.buffer.length > MEDIO_WHATSAPP_MAX_MB * 1024 * 1024) {
      throw new ErrorApp(
        413,
        'CONTENIDO_DEMASIADO_GRANDE',
        `El archivo no puede superar ${MEDIO_WHATSAPP_MAX_MB} MB.`,
      );
    }
    const imagen = detectarTipo(archivo.buffer);
    let medio: Parameters<WhatsAppQrService['enviarMedio']>[1];
    if (imagen && imagen.startsWith('image/')) {
      medio = { tipo: 'imagen', contenido: archivo.buffer, mime: imagen, texto: datos.texto };
    } else if (esAudio(archivo.buffer)) {
      let ogg: Buffer;
      try {
        ogg = await aNotaDeVoz(archivo.buffer);
      } catch (e) {
        throw new ErrorApp(422, 'AUDIO_INVALIDO', (e as Error).message.slice(0, 300));
      }
      medio = {
        tipo: 'audio',
        contenido: ogg,
        mime: 'audio/ogg; codecs=opus',
        segundos: datos.segundos,
      };
    } else {
      throw new ErrorApp(
        415,
        'TIPO_NO_ADMITIDO',
        'Envía una imagen JPG, PNG o WebP, o una nota de voz.',
      );
    }
    let referencia: string;
    try {
      ({ referencia } = await this.qr.enviarMedio(c.telefono, medio));
    } catch (e) {
      this.logger.warn(`No se pudo enviar un archivo por WhatsApp: ${(e as Error).message}`);
      throw new ErrorApp(502, 'WHATSAPP_RECHAZO', (e as Error).message.slice(0, 300));
    }
    // Una copia queda en el almacén para verla en el panel.
    const clave = await this.almacen.guardarWhatsApp(medio.contenido);
    const ahora = new Date();
    const waId = referencia.slice(0, 160);
    const etiqueta = medio.tipo === 'imagen' ? '📷 Imagen' : '🎤 Nota de voz';
    const texto = medio.tipo === 'imagen' && datos.texto ? `${etiqueta}: ${datos.texto}` : etiqueta;
    const [m] = await this.prisma.$transaction([
      this.prisma.mensajeWhatsApp.upsert({
        where: { waId },
        create: {
          conversacionId: id,
          direccion: 'saliente',
          texto: texto.slice(0, 4096),
          tipo: medio.tipo === 'imagen' ? 'image' : 'audio',
          waId,
          estado: 'enviado',
          autorId: auth.usuario.id,
          creadoEn: ahora,
          medioClave: clave,
          medioMime: medio.tipo === 'imagen' ? medio.mime : 'audio/ogg',
          medioSegundos: medio.segundos ?? null,
        },
        update: { autorId: auth.usuario.id, medioClave: clave },
        include: conAutor,
      }),
      this.prisma.conversacionWhatsApp.update({
        where: { id },
        data: { ultimoMensajeEn: ahora, noLeidos: 0 },
      }),
    ]);
    return this.publico(m);
  }

  async fijarMensaje(id: string, fijado: boolean): Promise<{ fijado: boolean }> {
    const r = await this.prisma.mensajeWhatsApp.updateMany({
      where: { id },
      data: { fijadoEn: fijado ? new Date() : null },
    });
    if (!r.count) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Ese mensaje no existe.');
    return { fijado };
  }

  async cambiarEstado(
    id: string,
    cambio: { cerrada?: boolean; fijada?: boolean },
  ): Promise<{ cerrada?: boolean; fijada?: boolean }> {
    const r = await this.prisma.conversacionWhatsApp.updateMany({
      where: { id },
      data: {
        ...(cambio.cerrada !== undefined ? { cerrada: cambio.cerrada } : {}),
        ...(cambio.fijada !== undefined ? { fijadaEn: cambio.fijada ? new Date() : null } : {}),
      },
    });
    if (!r.count) throw new ErrorApp(404, 'NO_ENCONTRADO', 'Esa conversación no existe.');
    return cambio;
  }
}
