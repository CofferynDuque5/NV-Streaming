import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { PrismaClient } from '@nv/db';
import type { VinculoWhatsApp } from '@nv/shared';
import {
  type AuthenticationCreds,
  BufferJSON,
  Browsers,
  DisconnectReason,
  initAuthCreds,
  isLidUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  proto,
  type SignalDataTypeMap,
  type WAMessage,
  type WASocket,
} from 'baileys';
import QRCode from 'qrcode';
import { Cifrador } from '../comun/cripto.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { estadoEntregaQr, telefonoDeJid, textoMensajeQr } from './whatsapp-qr-mensajes.js';

export interface MensajeQr {
  telefono: string;
  waId: string;
  tipo: string;
  texto: string;
  fecha: Date;
}

/** Quién guarda lo que llega por el número vinculado (la bandeja). */
export interface ReceptorWhatsAppQr {
  entrante(m: MensajeQr & { nombre: string | null }): Promise<void>;
  /** Lo que el equipo escribió desde el teléfono o WhatsApp Web, para que la bandeja muestre la conversación completa. */
  salienteDesdeTelefono(m: MensajeQr): Promise<void>;
  estado(waId: string, estado: string): Promise<void>;
}

type ILogger = NonNullable<Parameters<typeof makeWASocket>[0]['logger']>;

const CREDS = 'creds';
const contexto = (clave: string) => `whatsapp-qr:${clave}`;
/** Mensajes «append» (escritos desde el teléfono) más viejos que esto son historial: no se importan. */
const RECIENTE_MS = 10 * 60_000;
const ESPERA_QR_MS = 20_000;

/** Registro de Baileys hacia el de Nest, sin contenido de mensajes ni claves. */
function registro(logger: Logger, nivel = 'warn'): ILogger {
  const texto = (obj: unknown, msg?: string) =>
    msg ?? (typeof obj === 'string' ? obj : ((obj as { msg?: string })?.msg ?? ''));
  return {
    level: nivel,
    child: () => registro(logger, nivel),
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (o: unknown, m?: string) => logger.warn(texto(o, m).slice(0, 200)),
    error: (o: unknown, m?: string) => logger.error(texto(o, m).slice(0, 200)),
  };
}

/**
 * Número de la empresa vinculado por código QR, como WhatsApp Web (librería
 * Baileys, no oficial). El teléfono sigue funcionando, no hay límite de 24 h
 * ni costo. Solo se usa para Soporte: los avisos automáticos no salen por
 * aquí, porque los envíos masivos son lo que hace que WhatsApp bloquee números.
 * La sesión se guarda cifrada en la base y se reconecta sola al reiniciar.
 */
@Injectable()
export class WhatsAppQrService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('WhatsAppQR');
  private socket: WASocket | null = null;
  private estado: VinculoWhatsApp['estado'] = 'desvinculado';
  private numero: string | null = null;
  private qr: string | null = null;
  private error: string | null = null;
  private intentos = 0;
  private reintento: NodeJS.Timeout | null = null;
  private apagando = false;
  private receptor: ReceptorWhatsAppQr | null = null;
  /** Ids enviados desde el panel: WhatsApp los repite como «escritos por nosotros» y no hay que guardarlos dos veces. */
  private readonly delPanel = new Set<string>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(Cifrador) private readonly cifrador: Cifrador,
    @Inject(ENTORNO) private readonly entorno: Entorno,
  ) {}

  escuchar(receptor: ReceptorWhatsAppQr): void {
    this.receptor = receptor;
  }

  get conectado(): boolean {
    return this.estado === 'conectado' && this.socket !== null;
  }

  resumen(): Pick<VinculoWhatsApp, 'estado' | 'numero'> {
    return { estado: this.estado, numero: this.numero };
  }

  async ver(): Promise<VinculoWhatsApp> {
    return {
      estado: this.estado,
      numero: this.numero,
      error: this.error,
      qr: this.qr ? await QRCode.toDataURL(this.qr, { margin: 1, width: 280 }) : null,
    };
  }

  onModuleInit(): void {
    if (this.entorno.NODE_ENV === 'test' || !this.entorno.WHATSAPP_QR_EN_ESTE_PROCESO) return;
    // Si ya había un número vinculado, se reconecta solo (sin bloquear el arranque).
    void this.prisma.sesionWhatsApp
      .findUnique({ where: { clave: CREDS }, select: { clave: true } })
      .then((fila) => (fila ? this.conectar() : undefined))
      .catch((e: Error) => this.logger.error(`No se pudo leer la sesión: ${e.message}`));
  }

  async onApplicationShutdown(): Promise<void> {
    this.apagando = true;
    if (this.reintento) clearTimeout(this.reintento);
    // Cerrar sin cerrar sesión: al volver a arrancar se reconecta con lo guardado.
    this.socket?.end(undefined);
    this.socket = null;
  }

  /** Empieza a vincular: devuelve el QR para escanear (o el número, si ya estaba conectado). */
  async vincular(): Promise<VinculoWhatsApp> {
    if (this.conectado) return this.ver();
    if (this.estado === 'esperando_qr' && this.qr) return this.ver();
    this.cerrarSocket();
    const registrado = await this.leerCreds();
    if (!registrado?.registered) await this.borrarSesion();
    this.error = null;
    this.intentos = 0;
    await this.conectar();
    // Espera a que llegue el QR o a que conecte, para que la pantalla lo muestre de una vez.
    const limite = Date.now() + ESPERA_QR_MS;
    while (Date.now() < limite && this.estado === 'conectando') {
      await new Promise((r) => setTimeout(r, 250));
    }
    return this.ver();
  }

  async desvincular(): Promise<VinculoWhatsApp> {
    const s = this.socket;
    this.cerrarSocket();
    if (s) await s.logout().catch(() => undefined);
    await this.borrarSesion();
    this.estado = 'desvinculado';
    this.numero = null;
    this.qr = null;
    this.error = null;
    return this.ver();
  }

  async enviarTexto(telefono: string, texto: string): Promise<{ referencia: string }> {
    const s = this.socket;
    if (!s || !this.conectado) throw new Error('El número de WhatsApp no está conectado.');
    const digitos = telefono.replace(/\D/g, '');
    const r = await s.sendMessage(`${digitos}@s.whatsapp.net`, { text: texto.slice(0, 4096) });
    const id = r?.key.id;
    if (!id) throw new Error('WhatsApp no devolvió el id del mensaje.');
    this.delPanel.add(id);
    if (this.delPanel.size > 500) this.delPanel.delete(this.delPanel.values().next().value!);
    return { referencia: id.slice(0, 160) };
  }

  // ── Conexión ───────────────────────────────────────────────────────────────

  private cerrarSocket(): void {
    if (this.reintento) clearTimeout(this.reintento);
    this.reintento = null;
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.ev.removeAllListeners('connection.update');
      s.end(undefined);
    }
  }

  private async conectar(): Promise<void> {
    if (this.apagando) return;
    this.estado = 'conectando';
    const { creds, keys, guardarCreds } = await this.estadoAuth();
    const logger = registro(this.logger);
    const s = makeWASocket({
      auth: { creds, keys: makeCacheableSignalKeyStore(keys, logger) },
      logger,
      browser: Browsers.ubuntu('NV Streaming'),
      // No aparecer «en línea» ni silenciar las notificaciones del teléfono.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async () => undefined,
    });
    this.socket = s;

    s.ev.on('creds.update', () => {
      void guardarCreds().catch((e: Error) =>
        this.logger.error(`No se pudo guardar la sesión: ${e.message}`),
      );
    });

    s.ev.on('connection.update', (u) => {
      if (this.socket !== s) return;
      if (u.qr) {
        this.estado = 'esperando_qr';
        this.qr = u.qr;
      }
      if (u.connection === 'open') {
        this.estado = 'conectado';
        this.qr = null;
        this.error = null;
        this.intentos = 0;
        const yo = telefonoDeJid(s.user?.id ?? null);
        this.numero = yo ? `+${yo}` : null;
        this.logger.log('Número de WhatsApp conectado.');
      }
      if (u.connection === 'close') {
        const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        this.socket = null;
        this.alCerrar(codigo, creds);
      }
    });

    s.ev.on('messages.upsert', ({ messages, type }) => {
      for (const m of messages) {
        void this.procesar(s, m, type).catch((e: Error) =>
          this.logger.warn(`No se pudo guardar un mensaje: ${e.message}`),
        );
      }
    });

    s.ev.on('messages.update', (cambios) => {
      for (const { key, update } of cambios) {
        const estado = estadoEntregaQr(update.status);
        if (!key.fromMe || !key.id || !estado || !this.receptor) continue;
        void this.receptor.estado(key.id, estado).catch(() => undefined);
      }
    });
  }

  private alCerrar(codigo: number | undefined, creds: AuthenticationCreds): void {
    if (this.apagando) return;
    if (codigo === DisconnectReason.loggedOut) {
      // Lo desvincularon desde el teléfono: la sesión ya no sirve.
      this.estado = 'desvinculado';
      this.numero = null;
      this.qr = null;
      this.error = 'Se cerró la sesión desde el teléfono. Vuelve a vincular el número.';
      void this.borrarSesion();
      return;
    }
    if (!creds.registered && codigo === DisconnectReason.timedOut) {
      // Nadie escaneó el QR a tiempo.
      this.estado = 'desvinculado';
      this.qr = null;
      this.error = 'El código QR venció sin escanearse. Pide uno nuevo.';
      return;
    }
    if (codigo === DisconnectReason.connectionReplaced) {
      this.estado = 'desvinculado';
      this.error =
        'Otra instalación abrió esta misma sesión. Si no fuiste tú, desvincula el número.';
      return;
    }
    // Reinicio pedido por WhatsApp (tras escanear) o corte de red: reconectar con espera creciente.
    this.estado = 'conectando';
    const espera =
      codigo === DisconnectReason.restartRequired
        ? 0
        : Math.min(60_000, 2_000 * 2 ** this.intentos);
    this.intentos = Math.min(this.intentos + 1, 6);
    this.reintento = setTimeout(() => {
      this.reintento = null;
      void this.conectar().catch((e: Error) => {
        this.estado = 'desvinculado';
        this.error = 'No se pudo reconectar con WhatsApp.';
        this.logger.error(`No se pudo reconectar: ${e.message}`);
      });
    }, espera);
  }

  private async procesar(s: WASocket, m: WAMessage, tipo: string): Promise<void> {
    if (!this.receptor || !m.key.id || !m.message) return;
    const desdeTelefono = Boolean(m.key.fromMe);
    const segundos = Number(m.messageTimestamp ?? 0);
    const ahora = Date.now();
    const fecha =
      segundos > 0 && segundos * 1000 <= ahora + 60_000 ? new Date(segundos * 1000) : new Date();
    // «append» es lo que llega al reconectar o lo escrito en otro dispositivo: solo lo reciente.
    if (tipo !== 'notify' && ahora - fecha.getTime() > RECIENTE_MS) return;

    let jid = m.key.remoteJid ?? '';
    if (isLidUser(jid)) {
      jid =
        m.key.remoteJidAlt ??
        (await s.signalRepository.lidMapping.getPNForLID(jid).catch(() => null)) ??
        '';
    }
    const telefono = telefonoDeJid(jid);
    if (!telefono) return; // Grupos, estados, canales o un contacto sin número conocido.
    if (this.numero && `+${telefono}` === this.numero) return; // Chat consigo mismo.
    const contenido = textoMensajeQr(m.message);
    if (!contenido) return;
    const datos = { telefono, waId: m.key.id.slice(0, 160), ...contenido, fecha };
    if (desdeTelefono) {
      if (this.delPanel.has(m.key.id)) return;
      await this.receptor.salienteDesdeTelefono(datos);
    } else {
      const nombre = typeof m.pushName === 'string' ? m.pushName.trim().slice(0, 120) : '';
      await this.receptor.entrante({ ...datos, nombre: nombre || null });
    }
  }

  // ── Sesión en la base (cifrada) ────────────────────────────────────────────

  private async leer(clave: string): Promise<unknown> {
    const fila = await this.prisma.sesionWhatsApp.findUnique({ where: { clave } });
    if (!fila) return null;
    try {
      return JSON.parse(this.cifrador.descifrar(fila.valor, contexto(clave)), BufferJSON.reviver);
    } catch {
      return null;
    }
  }

  private async escribir(clave: string, valor: unknown): Promise<void> {
    const cifrado = this.cifrador.cifrar(
      JSON.stringify(valor, BufferJSON.replacer),
      contexto(clave),
    );
    await this.prisma.sesionWhatsApp.upsert({
      where: { clave },
      create: { clave, valor: cifrado },
      update: { valor: cifrado },
    });
  }

  private async leerCreds(): Promise<AuthenticationCreds | null> {
    return (await this.leer(CREDS)) as AuthenticationCreds | null;
  }

  private async borrarSesion(): Promise<void> {
    await this.prisma.sesionWhatsApp.deleteMany({});
  }

  private async estadoAuth() {
    const creds = (await this.leerCreds()) ?? initAuthCreds();
    const keys = {
      get: async <T extends keyof SignalDataTypeMap>(tipo: T, ids: string[]) => {
        const datos: { [id: string]: SignalDataTypeMap[T] } = {};
        await Promise.all(
          ids.map(async (id) => {
            let valor = (await this.leer(`${tipo}-${id}`)) as SignalDataTypeMap[T] | null;
            if (tipo === 'app-state-sync-key' && valor) {
              valor = proto.Message.AppStateSyncKeyData.fromObject(
                valor as object,
              ) as unknown as SignalDataTypeMap[T];
            }
            if (valor) datos[id] = valor;
          }),
        );
        return datos;
      },
      set: async (datos: { [T in keyof SignalDataTypeMap]?: Record<string, unknown> }) => {
        const tareas: Promise<unknown>[] = [];
        for (const tipo of Object.keys(datos) as (keyof SignalDataTypeMap)[]) {
          for (const [id, valor] of Object.entries(datos[tipo] ?? {})) {
            const clave = `${tipo}-${id}`.slice(0, 200);
            tareas.push(
              valor
                ? this.escribir(clave, valor)
                : this.prisma.sesionWhatsApp.deleteMany({ where: { clave } }),
            );
          }
        }
        await Promise.all(tareas);
      },
    };
    return { creds, keys, guardarCreds: () => this.escribir(CREDS, creds) };
  }
}
