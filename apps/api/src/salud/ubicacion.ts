import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { isIP } from 'node:net';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paisValido } from '@nv/shared';
import { Publica } from '../comun/contexto.js';

/**
 * País de una IP con la base pública geo-whois-asn-country (CC0, sin claves ni
 * servicios externos). La usa la web cuando la petición no trae la cabecera de
 * país de Cloudflare (proxy apagado o «IP Geolocation» desactivado), para
 * mostrar los precios en la moneda del visitante. Solo se obtiene el país.
 */
interface Tabla<T> {
  inicios: T[] | Uint32Array;
  fines: T[] | Uint32Array;
  paises: string[];
}

let v4: Tabla<number> | null = null;
let v6: Tabla<bigint> | null = null;

function carpetaBase(): string {
  const requerir = createRequire(import.meta.url);
  return dirname(requerir.resolve('@ip-location-db/geo-whois-asn-country/package.json'));
}

function cargarV4(): Tabla<number> {
  const texto = readFileSync(join(carpetaBase(), 'geo-whois-asn-country-ipv4-num.csv'), 'utf8');
  const lineas = texto.split('\n').filter(Boolean);
  const inicios = new Uint32Array(lineas.length);
  const fines = new Uint32Array(lineas.length);
  const paises: string[] = new Array(lineas.length);
  lineas.forEach((l, i) => {
    const [a, b, p] = l.split(',');
    inicios[i] = Number(a);
    fines[i] = Number(b);
    paises[i] = (p ?? '').trim();
  });
  return { inicios, fines, paises };
}

function cargarV6(): Tabla<bigint> {
  const texto = readFileSync(join(carpetaBase(), 'geo-whois-asn-country-ipv6-num.csv'), 'utf8');
  const inicios: bigint[] = [];
  const fines: bigint[] = [];
  const paises: string[] = [];
  for (const l of texto.split('\n')) {
    if (!l) continue;
    const [a, b, p] = l.split(',');
    inicios.push(BigInt(a ?? '0'));
    fines.push(BigInt(b ?? '0'));
    paises.push((p ?? '').trim());
  }
  return { inicios, fines, paises };
}

function buscar<T extends number | bigint>(t: Tabla<T>, valor: T): string | null {
  let bajo = 0;
  let alto = t.inicios.length - 1;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    const inicio = t.inicios[medio] as T;
    if (valor < inicio) alto = medio - 1;
    else if (valor > (t.fines[medio] as T)) bajo = medio + 1;
    else return t.paises[medio] ?? null;
  }
  return null;
}

function numeroV4(ip: string): number {
  return ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
}

function numeroV6(ip: string): bigint {
  const [izq = '', resto = ''] = ip.split('::');
  const der = ip.includes('::') ? resto : '';
  const a = izq ? izq.split(':') : [];
  const b = der ? der.split(':') : [];
  // IPv4 al final (::ffff:1.2.3.4).
  const ultima = (b.length ? b : a).at(-1) ?? '';
  if (ultima.includes('.')) {
    const n = numeroV4(ultima);
    const lista = b.length ? b : a;
    lista.splice(-1, 1, ((n >>> 16) & 0xffff).toString(16), (n & 0xffff).toString(16));
  }
  const ceros = new Array(8 - a.length - b.length).fill('0');
  return [...a, ...ceros, ...b].reduce((n, g) => (n << 16n) + BigInt(`0x${g || '0'}`), 0n);
}

/** Direcciones privadas, locales o reservadas: no tienen país. */
function esPrivada(ip: string): boolean {
  return (
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
      ip,
    ) || /^(::1?$|f[cd]|fe[89ab])/i.test(ip)
  );
}

/** País (ISO de 2 letras) de una IP pública, o null si no se sabe. */
export function paisDeIp(entrada: string | null | undefined): string | null {
  let ip = (entrada ?? '').trim();
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const version = isIP(ip);
  if (!version || esPrivada(ip)) return null;
  try {
    if (version === 4) {
      v4 ??= cargarV4();
      return paisValido(buscar(v4, numeroV4(ip)));
    }
    v6 ??= cargarV6();
    return paisValido(buscar(v6, numeroV6(ip)));
  } catch {
    return null;
  }
}

@ApiTags('Salud')
@Controller('ubicacion')
export class UbicacionController {
  /** País de la IP que pasa la web (la del visitante). No guarda nada. */
  @Publica()
  @Get('pais')
  pais(@Query('ip') ip?: string) {
    return { pais: paisDeIp(ip) };
  }
}
