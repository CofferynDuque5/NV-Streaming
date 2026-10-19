import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Entorno } from '../config/entorno.js';
import { enmascararDestino } from './destinos.js';

/** Token de inyección del canal de WhatsApp. */
export const WHATSAPP = Symbol('WHATSAPP');

export interface MensajeWhatsApp {
  /** Teléfono internacional, p. ej. +584141234567. */
  telefono: string;
  /** Nombre de la plantilla aprobada en Meta. */
  plantilla: string;
  idioma: string;
  /** Valores de {{1}}, {{2}}… del cuerpo de la plantilla, en orden. */
  parametros: string[];
}

/** Adaptador de WhatsApp. Cambiar de proveedor es escribir otra implementación. */
export interface CanalWhatsApp {
  readonly proveedor: 'desactivado' | 'sandbox' | 'cloud_api';
  /** Tiene lo necesario para enviar. */
  readonly listo: boolean;
  enviar(m: MensajeWhatsApp): Promise<{ referencia: string }>;
}

/**
 * Plantillas de WhatsApp por aviso. Meta solo permite que la empresa inicie
 * una conversación con plantillas aprobadas: hay que crearlas en WhatsApp
 * Manager con estos nombres, en el idioma de WHATSAPP_IDIOMA y con los
 * parámetros del cuerpo en este orden. Un aviso sin plantilla no se envía por
 * WhatsApp (queda "omitido").
 */
export const PLANTILLAS_WHATSAPP: Record<
  string,
  { nombre: string; parametros: readonly string[]; idioma?: string }
> = {
  recordatorioVencimiento: {
    nombre: 'nv_recordatorio_vencimiento',
    parametros: ['nombre', 'servicio', 'fecha de vencimiento', 'enlace'],
  },
  facturaRenovacion: {
    nombre: 'nv_factura_renovacion',
    parametros: ['nombre', 'servicio', 'número de factura', 'total', 'enlace'],
  },
  avisoGracia: {
    nombre: 'nv_aviso_gracia',
    parametros: ['nombre', 'servicio', 'fecha de suspensión', 'enlace'],
  },
  avisoSuspension: {
    nombre: 'nv_aviso_suspension',
    parametros: ['nombre', 'servicio', 'enlace'],
  },
  avisoRecuperacion: {
    nombre: 'nv_aviso_reactivacion',
    parametros: ['nombre', 'servicio', 'fecha de vencimiento'],
  },
  // Plantilla de ejemplo que Meta crea en toda cuenta nueva (en inglés, sin parámetros).
  avisoPrueba: { nombre: 'hello_world', parametros: [], idioma: 'en_US' },
};

class WhatsAppDesactivado implements CanalWhatsApp {
  readonly proveedor = 'desactivado' as const;
  readonly listo = false;
  enviar(): Promise<{ referencia: string }> {
    return Promise.reject(new Error('WhatsApp está desactivado.'));
  }
}

/** No envía nada: registra el mensaje (sin datos personales) para desarrollo. */
class WhatsAppSandbox implements CanalWhatsApp {
  readonly proveedor = 'sandbox' as const;
  readonly listo = true;
  private readonly logger = new Logger('WhatsApp');

  constructor(private readonly silencioso: boolean) {}

  enviar(m: MensajeWhatsApp): Promise<{ referencia: string }> {
    if (!this.silencioso) {
      this.logger.log(
        `[sandbox] Para: ${enmascararDestino(m.telefono)} · plantilla ${m.plantilla} (${m.idioma})`,
      );
    }
    return Promise.resolve({ referencia: `sandbox-${randomUUID()}` });
  }
}

type Fetch = typeof fetch;

/**
 * WhatsApp Cloud API oficial de Meta: POST /{telefono-id}/messages con una
 * plantilla. El token nunca se registra ni se devuelve en los errores.
 */
export class WhatsAppCloudApi implements CanalWhatsApp {
  readonly proveedor = 'cloud_api' as const;
  readonly listo: boolean;

  constructor(
    private readonly token: string,
    private readonly telefonoId: string,
    private readonly version: string,
    private readonly pedir: Fetch = fetch,
    private readonly tiempoMs = 10_000,
  ) {
    this.listo = Boolean(token && telefonoId);
  }

  async enviar(m: MensajeWhatsApp): Promise<{ referencia: string }> {
    if (!this.listo) throw new Error('Faltan WHATSAPP_TOKEN o WHATSAPP_TELEFONO_ID.');
    const url = `https://graph.facebook.com/${this.version}/${this.telefonoId}/messages`;
    const cuerpo = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: m.telefono.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: m.plantilla,
        language: { code: m.idioma },
        ...(m.parametros.length
          ? {
              components: [
                {
                  type: 'body',
                  // Meta rechaza saltos de línea, tabuladores y más de 4 espacios seguidos.
                  parameters: m.parametros.map((p) => ({
                    type: 'text',
                    text: p.replace(/\s+/g, ' ').trim().slice(0, 1000) || '-',
                  })),
                },
              ],
            }
          : {}),
      },
    };
    let respuesta: Response;
    try {
      respuesta = await this.pedir(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
        redirect: 'error',
        signal: AbortSignal.timeout(this.tiempoMs),
      });
    } catch (e) {
      const tiempo = e instanceof Error && e.name === 'TimeoutError';
      throw new Error(
        tiempo ? 'WhatsApp no respondió a tiempo.' : 'No se pudo conectar con WhatsApp.',
      );
    }
    const datos = (await respuesta.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    } | null;
    if (!respuesta.ok) {
      const detalle = datos?.error?.message ? `: ${datos.error.message}` : '';
      const codigo = datos?.error?.code ? ` (código ${datos.error.code})` : '';
      throw new Error(`WhatsApp rechazó el mensaje${codigo}${detalle}`.slice(0, 500));
    }
    const id = datos?.messages?.[0]?.id;
    if (!id) throw new Error('WhatsApp no devolvió el id del mensaje.');
    return { referencia: id.slice(0, 120) };
  }
}

export function crearCanalWhatsApp(entorno: Entorno): CanalWhatsApp {
  switch (entorno.WHATSAPP_PROVEEDOR) {
    case 'sandbox':
      return new WhatsAppSandbox(entorno.NODE_ENV === 'test');
    case 'cloud_api':
      return new WhatsAppCloudApi(
        entorno.WHATSAPP_TOKEN,
        entorno.WHATSAPP_TELEFONO_ID,
        entorno.WHATSAPP_API_VERSION,
      );
    default:
      return new WhatsAppDesactivado();
  }
}
