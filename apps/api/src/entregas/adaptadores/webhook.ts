import { randomUUID } from 'node:crypto';
import { esUrlHttp, LARGO_CODIGO, pareceCredenciales } from '@nv/shared';
import { CABECERA_FIRMA, cabeceraFirma } from '../firma.js';
import {
  ErrorConexion,
  ErrorDestinoNoPermitido,
  enviarJson,
  type RespuestaHttp,
} from '../red-segura.js';
import type {
  Adaptador,
  ContextoEntrega,
  DatosCliente,
  ResultadoEntrega,
  ResultadoRevocacion,
} from './tipos.js';

/**
 * Webhook firmado hacia la plataforma del servicio propio o la API de un
 * distribuidor oficial. Contrato (documentado en el README):
 *
 * - `POST <webhookUrl>` con JSON y las cabeceras `NV-Evento`, `NV-Id-Entrega`,
 *   `Idempotency-Key` (= idEntrega) y `NV-Firma: t=<unix>,v1=<HMAC-SHA256 hex de "<t>.<cuerpo>">`.
 * - Eventos: `entrega.solicitada`, `entrega.revocada` y `ping` (prueba del panel).
 * - 2xx: entregada; el cuerpo puede traer `{ referencia, enlace, codigo, instrucciones }`.
 *   409 (o `{"codigo":"ya_existe"}`) cuenta como éxito: el proveedor ya la tenía.
 * - Otro 4xx: fallida (no se reintenta). 408/425/429, 5xx o sin conexión: se reintenta.
 * - Nunca se siguen redirecciones ni se llama a direcciones privadas.
 */
export const USUARIO_AGENTE_ENTREGAS = 'NV-Streaming-Entregas/1.0';

export interface OpcionesWebhook {
  permitirLocal: boolean;
}

interface Envio {
  evento: 'entrega.solicitada' | 'entrega.revocada' | 'ping';
  id: string;
  cuerpo: Record<string, unknown>;
}

type Clasificacion = 'exito' | 'reintentar' | 'fallida';

const recortar = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

function yaExiste(r: RespuestaHttp): boolean {
  const j = r.json as Record<string, unknown> | null;
  return (
    r.estado === 409 ||
    (r.estado >= 400 &&
      r.estado < 500 &&
      !!j &&
      typeof j === 'object' &&
      (j['codigo'] === 'ya_existe' || j['error'] === 'ya_existe'))
  );
}

/** Clasifica la respuesta del proveedor. */
export function clasificarRespuesta(r: RespuestaHttp): Clasificacion {
  if (r.estado >= 200 && r.estado < 300) return 'exito';
  if (yaExiste(r)) return 'exito';
  if ([408, 425, 429].includes(r.estado)) return 'reintentar';
  if (r.estado >= 500 || r.estado < 200) return 'reintentar';
  return 'fallida';
}

/** Mensaje del proveedor (si lo hay), recortado y sin nada que parezca una credencial. */
function detalleProveedor(r: RespuestaHttp): string {
  const j = r.json as Record<string, unknown> | null;
  const texto =
    (j && typeof j === 'object' && (recortar(j['mensaje'], 200) ?? recortar(j['message'], 200))) ||
    null;
  return texto && !pareceCredenciales(texto) ? `: ${texto}` : '';
}

export class AdaptadorWebhook implements Adaptador {
  readonly adaptador = 'webhook' as const;
  readonly transaccional = false;

  constructor(private readonly opciones: OpcionesWebhook) {}

  async entregar(ctx: ContextoEntrega): Promise<ResultadoEntrega> {
    const e = ctx.entrega;
    const envio: Envio = {
      evento: 'entrega.solicitada',
      id: e.id,
      cuerpo: {
        evento: 'entrega.solicitada',
        idEntrega: e.id,
        fecha: new Date().toISOString(),
        motivo: e.motivo,
        plan: { id: ctx.plan.id, sku: ctx.plan.skuProveedor, nombre: ctx.plan.nombre },
        cliente: {
          id: ctx.cliente.id,
          ...(ctx.configuracion.incluirCorreo && ctx.cliente.correo
            ? { correo: ctx.cliente.correo }
            : {}),
        },
        periodo: {
          inicio: e.periodoInicio?.toISOString() ?? null,
          fin: e.periodoFin?.toISOString() ?? null,
        },
      },
    };
    const r = await this.enviar(ctx, envio);
    if ('error' in r) return r.error;
    const clase = clasificarRespuesta(r.respuesta);
    if (clase === 'reintentar') {
      return {
        estado: 'pendiente',
        reintentar: true,
        mensaje: `El proveedor respondió ${r.respuesta.estado}${detalleProveedor(r.respuesta)}. Se reintentará.`,
      };
    }
    if (clase === 'fallida') {
      return {
        estado: 'fallida',
        mensaje:
          r.respuesta.estado >= 300 && r.respuesta.estado < 400
            ? `El proveedor respondió con una redirección (${r.respuesta.estado}); no se sigue. Revisa la URL.`
            : `El proveedor rechazó la entrega (${r.respuesta.estado})${detalleProveedor(r.respuesta)}.`,
      };
    }
    if (r.respuesta.estado < 200 || r.respuesta.estado >= 300) {
      // «Ya existe» (409): el proveedor ya la tenía; su cuerpo no trae datos para el cliente.
      const j = r.respuesta.json as Record<string, unknown> | null;
      const referencia = j && typeof j === 'object' ? recortar(j['referencia'], 200) : null;
      return { estado: 'entregada', ...(referencia ? { referenciaExterna: referencia } : {}) };
    }
    return this.leerRespuesta(r.respuesta);
  }

  async revocar(ctx: ContextoEntrega): Promise<ResultadoRevocacion> {
    const e = ctx.entrega;
    const r = await this.enviar(ctx, {
      evento: 'entrega.revocada',
      id: e.id,
      cuerpo: {
        evento: 'entrega.revocada',
        idEntrega: e.id,
        fecha: new Date().toISOString(),
        referencia: e.referenciaExterna,
        motivo: ctx.motivoRevocacion ?? 'La suscripción terminó.',
      },
    });
    if ('error' in r) {
      return {
        estado: r.error.reintentar ? 'reintentar' : 'fallida',
        mensaje: r.error.mensaje ?? 'No se pudo avisar al proveedor.',
      };
    }
    // 404/410: el proveedor ya no la tiene; también cuenta como revocada.
    if ([404, 410].includes(r.respuesta.estado)) return { estado: 'revocada' };
    const clase = clasificarRespuesta(r.respuesta);
    if (clase === 'exito') return { estado: 'revocada' };
    return {
      estado: clase === 'reintentar' ? 'reintentar' : 'fallida',
      mensaje: `El proveedor respondió ${r.respuesta.estado} a la revocación${detalleProveedor(r.respuesta)}.`,
    };
  }

  /** Envía un `ping` firmado para probar la configuración desde el panel. */
  async probar(ctx: Pick<ContextoEntrega, 'configuracion' | 'secreto'>) {
    const id = randomUUID();
    const inicio = Date.now();
    const r = await this.enviar(ctx, {
      evento: 'ping',
      id,
      cuerpo: { evento: 'ping', idPrueba: id, fecha: new Date().toISOString() },
    });
    const duracionMs = Date.now() - inicio;
    if ('error' in r) {
      return {
        ok: false,
        estadoHttp: null,
        mensaje: r.error.mensaje ?? 'Sin respuesta.',
        duracionMs,
      };
    }
    const ok = r.respuesta.estado >= 200 && r.respuesta.estado < 300;
    return {
      ok,
      estadoHttp: r.respuesta.estado,
      mensaje: ok
        ? `El proveedor respondió ${r.respuesta.estado}: la URL y la firma están listas.`
        : `El proveedor respondió ${r.respuesta.estado}${detalleProveedor(r.respuesta)}. Revisa que verifique la firma con la clave actual.`,
      duracionMs,
    };
  }

  private async enviar(
    ctx: Pick<ContextoEntrega, 'configuracion' | 'secreto'>,
    envio: Envio,
  ): Promise<{ respuesta: RespuestaHttp } | { error: ResultadoEntrega }> {
    const url = ctx.configuracion.webhookUrl;
    if (!url) {
      return {
        error: {
          estado: 'fallida',
          mensaje: 'El proveedor no tiene URL de webhook: configúrala en el catálogo.',
        },
      };
    }
    if (!ctx.secreto) {
      return {
        error: {
          estado: 'fallida',
          mensaje:
            'Falta la clave de firma del webhook: genérala en la configuración del proveedor.',
        },
      };
    }
    const cuerpo = JSON.stringify(envio.cuerpo);
    try {
      const respuesta = await enviarJson({
        url,
        cuerpo,
        tiempoMs: ctx.configuracion.tiempoLimiteSegundos * 1000,
        permitirLocal: this.opciones.permitirLocal,
        cabeceras: {
          'user-agent': USUARIO_AGENTE_ENTREGAS,
          'nv-evento': envio.evento,
          'nv-id-entrega': envio.id,
          'idempotency-key': envio.id,
          [CABECERA_FIRMA]: cabeceraFirma(ctx.secreto, cuerpo),
        },
      });
      return { respuesta };
    } catch (e) {
      if (e instanceof ErrorDestinoNoPermitido) {
        return { error: { estado: 'fallida', mensaje: e.message } };
      }
      const mensaje =
        e instanceof ErrorConexion ? e.message : 'No se pudo conectar con el proveedor.';
      return { error: { estado: 'pendiente', reintentar: true, mensaje } };
    }
  }

  /** Lee `{ referencia, enlace, codigo, instrucciones }` de una respuesta correcta. */
  private leerRespuesta(r: RespuestaHttp): ResultadoEntrega {
    const j =
      r.json && typeof r.json === 'object' && !Array.isArray(r.json)
        ? (r.json as Record<string, unknown>)
        : {};
    const referencia = recortar(j['referencia'], 200);
    const enlace = recortar(j['enlace'], 1000);
    const codigo = recortar(j['codigo'], LARGO_CODIGO.max);
    const instrucciones = recortar(j['instrucciones'], 2000);
    if (
      pareceCredenciales(enlace) ||
      pareceCredenciales(codigo) ||
      pareceCredenciales(instrucciones)
    ) {
      return {
        estado: 'fallida',
        mensaje:
          'La respuesta del proveedor parece contener un usuario y una contraseña: NV no entrega credenciales de cuentas. Pide al proveedor un código o un enlace de activación.',
      };
    }
    if (enlace && !(esUrlHttp(enlace) && enlace.toLowerCase().startsWith('https://'))) {
      return {
        estado: 'fallida',
        mensaje: 'El proveedor devolvió un enlace que no es https: no se entrega.',
      };
    }
    const datos: DatosCliente = {
      ...(codigo ? { codigo } : {}),
      ...(enlace ? { enlace } : {}),
      ...(instrucciones ? { instrucciones } : {}),
    };
    return {
      estado: 'entregada',
      ...(referencia ? { referenciaExterna: referencia } : {}),
      datosCliente: datos,
    };
  }
}
