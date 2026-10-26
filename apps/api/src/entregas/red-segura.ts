import { type LookupAddress, lookup as buscarDns } from 'node:dns';
import { type IncomingMessage, request as pedirHttp, type RequestOptions } from 'node:http';
import { request as pedirHttps } from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * Salida segura hacia los webhooks de los proveedores (protección SSRF): solo
 * https, sin usuario ni contraseña en la URL, sin redirecciones y nunca a
 * direcciones privadas, locales o reservadas. La resolución DNS se valida en el
 * momento de conectar (todas las direcciones del nombre), así un DNS que cambia
 * de respuesta no puede llevar la petición a la red interna.
 *
 * `permitirLocal` (ENTREGAS_WEBHOOK_RED_LOCAL, solo pruebas) admite http y
 * direcciones locales para los servidores falsos de las pruebas.
 */

/** La URL o el destino no están permitidos (no se reintenta: es un problema de configuración). */
export class ErrorDestinoNoPermitido extends Error {}
/** No se pudo conectar o no respondió a tiempo (se puede reintentar). */
export class ErrorConexion extends Error {}

// Una lista por familia: en Node, una regla IPv6 como ::ffff:0:0/96 también
// atrapa todas las IPv4 si comparten lista.
const BLOQUEADAS_V4 = new BlockList();
const BLOQUEADAS_V6 = new BlockList();
for (const [red, prefijo] of [
  ['0.0.0.0', 8], // «esta red»
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // bucle local
  ['169.254.0.0', 16], // enlace local (metadatos de la nube)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // IETF
  ['192.0.2.0', 24], // documentación
  ['192.88.99.0', 24], // 6to4
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // pruebas de rendimiento
  ['198.51.100.0', 24], // documentación
  ['203.0.113.0', 24], // documentación
  ['224.0.0.0', 4], // multidifusión
  ['240.0.0.0', 4], // reservada y difusión
] as const) {
  BLOQUEADAS_V4.addSubnet(red, prefijo, 'ipv4');
}
for (const [red, prefijo] of [
  ['::', 96], // sin especificar, bucle local e IPv4 compatibles (obsoletas)
  ['::ffff:0:0', 96], // IPv4 mapeada que no se pudo leer (las legibles se revisan como IPv4)
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // NAT64 local
  ['100::', 64], // descarte
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentación
  ['2002::', 16], // 6to4
  ['fc00::', 7], // única local
  ['fe80::', 10], // enlace local
  ['fec0::', 10], // sitio local (obsoleta)
  ['ff00::', 8], // multidifusión
] as const) {
  BLOQUEADAS_V6.addSubnet(red, prefijo, 'ipv6');
}

/** IPv4 dentro de una IPv6 mapeada (::ffff:a.b.c.d o ::ffff:7f00:1). */
function ipv4Mapeada(ip: string): string | null {
  const m = /^::ffff:(?:0:)?(.+)$/i.exec(ip);
  if (!m) return null;
  const resto = m[1]!;
  if (isIP(resto) === 4) return resto;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(resto);
  if (!hex) return null;
  const a = parseInt(hex[1]!, 16);
  const b = parseInt(hex[2]!, 16);
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

/** ¿La dirección IP es privada, local, reservada o no enrutable? (Una cadena que no es IP cuenta como no permitida.) */
export function esDireccionNoPublica(ip: string): boolean {
  const limpia = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const version = isIP(limpia);
  if (version === 4) return BLOQUEADAS_V4.check(limpia, 'ipv4');
  if (version === 6) {
    const v4 = ipv4Mapeada(limpia);
    if (v4) return BLOQUEADAS_V4.check(v4, 'ipv4');
    return BLOQUEADAS_V6.check(limpia, 'ipv6');
  }
  return true;
}

const NOMBRES_LOCALES = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/i;

/**
 * Comprueba una URL de webhook antes de guardarla o de llamarla. Devuelve la
 * URL analizada o lanza `ErrorDestinoNoPermitido` con un mensaje en español.
 */
export function validarUrlWebhook(texto: string, opciones: { permitirLocal: boolean }): URL {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErrorDestinoNoPermitido('La URL del webhook no es válida.');
  }
  const permitidos = opciones.permitirLocal ? ['https:', 'http:'] : ['https:'];
  if (!permitidos.includes(url.protocol)) {
    throw new ErrorDestinoNoPermitido('La URL del webhook debe usar https://');
  }
  if (url.username || url.password) {
    throw new ErrorDestinoNoPermitido(
      'La URL del webhook no puede llevar usuario ni contraseña: la firma autentica cada envío.',
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new ErrorDestinoNoPermitido('La URL del webhook no tiene servidor.');
  if (!opciones.permitirLocal) {
    if (isIP(host) && esDireccionNoPublica(host)) {
      throw new ErrorDestinoNoPermitido(
        'La URL del webhook apunta a una dirección privada o local. Usa la dirección pública del proveedor.',
      );
    }
    if (!isIP(host) && (NOMBRES_LOCALES.test(host) || !host.includes('.'))) {
      throw new ErrorDestinoNoPermitido(
        'La URL del webhook apunta a un nombre local. Usa el dominio público del proveedor.',
      );
    }
  }
  return url;
}

type LlamadaDns = (
  error: NodeJS.ErrnoException | null,
  direccion: string | LookupAddress[],
  familia?: number,
) => void;

/** Resolución DNS que rechaza el nombre si CUALQUIERA de sus direcciones no es pública. */
function resolverSeguro(permitirLocal: boolean) {
  return (nombre: string, opciones: { all?: boolean; family?: number }, listo: LlamadaDns) => {
    buscarDns(nombre, { all: true, family: opciones.family ?? 0 }, (error, direcciones) => {
      if (error) return listo(error, '');
      if (direcciones.length === 0) {
        return listo(Object.assign(new Error('Sin direcciones'), { code: 'ENOTFOUND' }), '');
      }
      if (!permitirLocal && direcciones.some((d) => esDireccionNoPublica(d.address))) {
        return listo(
          new ErrorDestinoNoPermitido(
            `El nombre ${nombre} resuelve a una dirección privada o local: no se envía nada.`,
          ),
          '',
        );
      }
      if (opciones.all) return listo(null, direcciones);
      return listo(null, direcciones[0]!.address, direcciones[0]!.family);
    });
  };
}

export interface RespuestaHttp {
  estado: number;
  texto: string;
  /** Cuerpo interpretado como JSON, o null si no lo es. */
  json: unknown;
}

export interface OpcionesEnvio {
  url: string;
  cuerpo: string;
  cabeceras: Record<string, string>;
  tiempoMs: number;
  permitirLocal: boolean;
  /** Tamaño máximo de la respuesta (por defecto 64 KB). */
  maxBytes?: number;
}

/**
 * POST de un cuerpo JSON ya serializado (el mismo texto que se firmó). No
 * sigue redirecciones: un 3xx se devuelve tal cual. Lanza
 * `ErrorDestinoNoPermitido` si el destino no está permitido y `ErrorConexion`
 * si no se pudo conectar, si no respondió a tiempo o si la respuesta es
 * demasiado grande.
 */
export async function enviarJson(o: OpcionesEnvio): Promise<RespuestaHttp> {
  const url = validarUrlWebhook(o.url, { permitirLocal: o.permitirLocal });
  const maxBytes = o.maxBytes ?? 64 * 1024;
  const cuerpo = Buffer.from(o.cuerpo, 'utf8');
  const opciones: RequestOptions = {
    method: 'POST',
    headers: {
      ...o.cabeceras,
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(cuerpo.length),
      accept: 'application/json',
    },
    lookup: resolverSeguro(o.permitirLocal) as unknown as RequestOptions['lookup'],
    signal: AbortSignal.timeout(o.tiempoMs),
    timeout: o.tiempoMs,
  };
  const pedir = url.protocol === 'https:' ? pedirHttps : pedirHttp;
  return new Promise((resolver, rechazar) => {
    let terminado = false;
    const fallar = (e: Error) => {
      if (terminado) return;
      terminado = true;
      rechazar(e);
    };
    const peticion = pedir(url, opciones, (r: IncomingMessage) => {
      const partes: Buffer[] = [];
      let total = 0;
      r.on('data', (trozo: Buffer) => {
        total += trozo.length;
        if (total > maxBytes) {
          r.destroy();
          fallar(new ErrorConexion('La respuesta del proveedor es demasiado grande.'));
          return;
        }
        partes.push(trozo);
      });
      r.on('error', () => fallar(new ErrorConexion('Se cortó la respuesta del proveedor.')));
      r.on('end', () => {
        if (terminado) return;
        terminado = true;
        const texto = Buffer.concat(partes).toString('utf8');
        let json: unknown = null;
        try {
          json = texto ? JSON.parse(texto) : null;
        } catch {
          json = null;
        }
        resolver({ estado: r.statusCode ?? 0, texto, json });
      });
    });
    peticion.on('timeout', () => {
      peticion.destroy(new ErrorConexion('El proveedor no respondió a tiempo.'));
    });
    peticion.on('error', (e: Error) => {
      if (e instanceof ErrorDestinoNoPermitido || e instanceof ErrorConexion) return fallar(e);
      const tiempo = e.name === 'TimeoutError' || e.name === 'AbortError';
      fallar(
        new ErrorConexion(
          tiempo
            ? 'El proveedor no respondió a tiempo.'
            : `No se pudo conectar con el proveedor (${url.hostname}).`,
        ),
      );
    });
    peticion.end(cuerpo);
  });
}
