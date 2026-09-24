import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EstadoNotificacion, PrismaClient } from '@nv/db';
import type { CanalAviso, TipoAutomatizacion } from '@nv/shared';
import { ConfigAutomatizacionesService } from '../automatizaciones/configuracion.service.js';
import { ENTORNO, PRISMA } from '../comun/tokens.js';
import type { Entorno } from '../config/entorno.js';
import { CorreoService } from '../correo/correo.service.js';
import type { CorreoRenderizado, NombrePlantilla } from '../correo/plantillas.js';
import { normalizarTelefono } from './destinos.js';
import { type CanalWhatsApp, PLANTILLAS_WHATSAPP, WHATSAPP } from './whatsapp.js';

/** Contenido de un aviso, según el nombre de quien lo recibe. */
export interface ContenidoAviso {
  correo: CorreoRenderizado;
  /** Parámetros de la plantilla de WhatsApp, en orden (ver PLANTILLAS_WHATSAPP). */
  whatsapp?: string[];
}

export interface Aviso {
  plantilla: NombrePlantilla;
  destinatario: { clienteId: string } | { usuarioId: string };
  /** Evita mandar dos veces el mismo aviso: se guarda por canal ("<clave>:correo"). */
  claveUnica: string;
  /** Automatización que lo envía: define los canales y aparece en el registro. */
  automatizacion: TipoAutomatizacion | null;
  entidad?: { tipo: string; id: string };
  /** Canales a usar. Por defecto, los configurados en la automatización (o solo correo). */
  canales?: CanalAviso[];
  contenido: (nombre: string) => ContenidoAviso;
}

export interface ResultadoAviso {
  enviadas: number;
  omitidas: number;
  fallidas: number;
  /** Ya se había enviado (misma clave): no se repite. */
  repetidas: number;
}

/** Avisos que el cliente puede apagar con `recibirRecordatorios`. Pagos y suspensiones siempre llegan. */
const PLANTILLAS_RECORDATORIO: readonly NombrePlantilla[] = ['recordatorioVencimiento'];

interface Destinatario {
  nombre: string;
  clienteId: string | null;
  usuarioId: string | null;
  correo: string | null;
  /** Número con consentimiento, o el motivo por el que no hay. */
  whatsapp: { numero: string } | { motivo: string };
  deRevendedor: boolean;
  recibirRecordatorios: boolean;
}

/**
 * Envía avisos por correo y WhatsApp y deja una fila en `notificaciones` por
 * canal: enviada, fallida u omitida (con el motivo en español). La clave única
 * garantiza que el mismo aviso no sale dos veces, aunque la automatización se
 * ejecute de nuevo.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger('Avisos');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENTORNO) private readonly entorno: Entorno,
    @Inject(CorreoService) private readonly correo: CorreoService,
    @Inject(WHATSAPP) readonly whatsapp: CanalWhatsApp,
    @Inject(ConfigAutomatizacionesService) private readonly config: ConfigAutomatizacionesService,
  ) {}

  async avisar(a: Aviso): Promise<ResultadoAviso> {
    const r: ResultadoAviso = { enviadas: 0, omitidas: 0, fallidas: 0, repetidas: 0 };
    const canales =
      a.canales ??
      (a.automatizacion ? (await this.config.leer(a.automatizacion)).canales : ['correo']);
    const d = await this.destinatario(a.destinatario);
    if (!d) return r;
    const contenido = a.contenido(d.nombre);

    for (const canal of canales) {
      let destino = '';
      let motivo: string | null = null;
      if (d.clienteId && d.deRevendedor) {
        motivo = 'Cliente de un revendedor: el revendedor le cobra y le avisa.';
      } else if (
        d.clienteId &&
        !d.recibirRecordatorios &&
        PLANTILLAS_RECORDATORIO.includes(a.plantilla)
      ) {
        motivo = 'El cliente desactivó los recordatorios.';
      } else if (canal === 'correo') {
        destino = d.correo ?? '';
        if (!destino) motivo = d.clienteId ? 'El cliente no tiene correo.' : 'No tiene correo.';
      } else if (!this.whatsapp.listo) {
        motivo = 'WhatsApp desactivado.';
      } else if (!PLANTILLAS_WHATSAPP[a.plantilla]) {
        motivo = 'Este aviso no tiene plantilla de WhatsApp.';
      } else if ('motivo' in d.whatsapp) {
        motivo = d.whatsapp.motivo;
      } else {
        destino = d.whatsapp.numero;
      }

      const id = randomUUID();
      const creada = await this.prisma.notificacion.createMany({
        data: [
          {
            id,
            canal,
            plantilla: a.plantilla,
            destino: destino.slice(0, 254),
            clienteId: d.clienteId,
            usuarioId: d.usuarioId,
            automatizacion: a.automatizacion,
            entidad: a.entidad?.tipo ?? null,
            entidadId: a.entidad?.id ?? null,
            estado: motivo ? 'omitida' : 'pendiente',
            motivo,
            claveUnica: `${a.claveUnica}:${canal}`.slice(0, 200),
          },
        ],
        skipDuplicates: true,
      });
      if (creada.count === 0) {
        r.repetidas += 1;
        continue;
      }
      if (motivo) {
        r.omitidas += 1;
        continue;
      }
      const estado = await this.enviar(id, canal, destino, a.plantilla, contenido);
      if (estado === 'enviada') r.enviadas += 1;
      else r.fallidas += 1;
    }
    return r;
  }

  /** Envía por un canal y actualiza la fila. */
  private async enviar(
    id: string,
    canal: CanalAviso,
    destino: string,
    plantilla: NombrePlantilla,
    contenido: ContenidoAviso,
  ): Promise<EstadoNotificacion> {
    let estado: EstadoNotificacion = 'enviada';
    let error: string | null = null;
    let referencia: string | null = null;
    let proveedor: string;
    if (canal === 'correo') {
      proveedor = this.entorno.CORREO_PROVEEDOR;
      const r = await this.correo.enviar(destino, plantilla, contenido.correo);
      if (!r.enviado) {
        estado = 'fallida';
        error = r.error ?? 'No se pudo enviar el correo.';
      }
    } else {
      proveedor = this.whatsapp.proveedor;
      const def = PLANTILLAS_WHATSAPP[plantilla]!;
      try {
        const r = await this.whatsapp.enviar({
          telefono: destino,
          plantilla: def.nombre,
          idioma: def.idioma ?? this.entorno.WHATSAPP_IDIOMA,
          parametros: contenido.whatsapp ?? [],
        });
        referencia = r.referencia;
      } catch (e) {
        estado = 'fallida';
        error = e instanceof Error ? e.message : 'No se pudo enviar el WhatsApp.';
        this.logger.warn(`WhatsApp "${plantilla}" no enviado: ${error}`);
      }
    }
    await this.prisma.notificacion.update({
      where: { id },
      data: {
        estado,
        proveedor,
        error: error?.slice(0, 500) ?? null,
        referenciaExterna: referencia,
        enviadaEn: estado === 'enviada' ? new Date() : null,
      },
    });
    return estado;
  }

  private async destinatario(
    d: { clienteId: string } | { usuarioId: string },
  ): Promise<Destinatario | null> {
    if ('usuarioId' in d) {
      const u = await this.prisma.usuario.findUnique({ where: { id: d.usuarioId } });
      if (!u) return null;
      return {
        nombre: u.nombre,
        clienteId: null,
        usuarioId: u.id,
        correo: u.correo,
        whatsapp: { motivo: 'WhatsApp solo se envía a clientes.' },
        deRevendedor: false,
        recibirRecordatorios: true,
      };
    }
    const c = await this.prisma.cliente.findUnique({
      where: { id: d.clienteId },
      include: {
        usuario: { select: { correo: true } },
        contactos: { where: { tipo: 'whatsapp' }, orderBy: { consentimientoEn: 'desc' } },
      },
    });
    if (!c) return null;
    let whatsapp: Destinatario['whatsapp'];
    const conConsentimiento = c.contactos.find((x) => x.consentimientoEn !== null);
    if (c.contactos.length === 0) whatsapp = { motivo: 'El cliente no tiene WhatsApp registrado.' };
    else if (!conConsentimiento) whatsapp = { motivo: 'Sin consentimiento de WhatsApp.' };
    else {
      const numero = normalizarTelefono(conConsentimiento.valor);
      whatsapp = numero ? { numero } : { motivo: 'El número de WhatsApp no es válido.' };
    }
    return {
      nombre: c.nombre,
      clienteId: c.id,
      usuarioId: null,
      correo: c.usuario?.correo ?? c.correo,
      whatsapp,
      deRevendedor: c.revendedorId !== null,
      recibirRecordatorios: c.recibirRecordatorios,
    };
  }

  /** Suma de resultados, para los contadores de una ejecución. */
  static clasificar(r: ResultadoAviso): 'procesado' | 'omitido' | 'error' {
    if (r.fallidas > 0) return 'error';
    return r.enviadas > 0 ? 'procesado' : 'omitido';
  }
}
