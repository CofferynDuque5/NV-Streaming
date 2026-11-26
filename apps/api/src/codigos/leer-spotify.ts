import type { SituacionSpotify } from '@nv/shared';
import { codigoDe, normalizar } from './extraer.js';

/**
 * Lee lo que muestra Spotify en la página de la cuenta (plan, próximo cobro, pago
 * fallido, pausa) y en la del plan familiar (cupos), y el código de inicio de
 * sesión del correo. Funciones puras: no tocan la red ni la base.
 */

export interface LecturaSpotify {
  plan: string | null;
  situacion: SituacionSpotify;
  /** AAAA-MM-DD, o null si no se encontró la fecha. */
  vencimiento: string | null;
  cuposUsados: number | null;
  cuposTotal: number | null;
}

/** ¿Es el correo de Spotify con el código para entrar? */
export function esCorreoCodigoSpotify(de: string, asunto: string): boolean {
  if (!/spotify/i.test(de)) return false;
  return /c[oó]digo|code|inicio de sesi[oó]n|iniciar sesi[oó]n|log ?in|sign ?in|verific/i.test(
    asunto,
  );
}

/** Código de 6 dígitos del correo de Spotify. */
export function codigoSpotify(asunto: string, texto: string): string | null {
  const c = codigoDe(asunto, texto);
  if (c && /^\d{6}$/.test(c)) return c;
  // Spotify lo pone solo en su línea: «123456».
  const solo = texto
    .split(/\n/)
    .map((l) => l.replace(/\s/g, ''))
    .find((l) => /^\d{6}$/.test(l));
  return solo ?? null;
}

const MESES: Record<string, number> = {
  ene: 1,
  enero: 1,
  jan: 1,
  january: 1,
  feb: 2,
  febrero: 2,
  february: 2,
  mar: 3,
  marzo: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  june: 6,
  jul: 7,
  julio: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  september: 9,
  oct: 10,
  octubre: 10,
  october: 10,
  nov: 11,
  noviembre: 11,
  november: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
  december: 12,
};

function fechaValida(a: number, m: number, d: number): string | null {
  const anio = a < 100 ? 2000 + a : a;
  if (anio < 2020 || anio > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(anio, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;
  return `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Primera fecha de un texto. `diaPrimero`: en español «5/12/25» es 5 de diciembre;
 * en inglés (EE. UU.) es 12 de mayo, salvo que el primer número pase de 12.
 */
export function fechaDe(texto: string, diaPrimero: boolean): string | null {
  const t = normalizar(texto).replace(/\./g, ' ');
  const candidatos: { pos: number; fecha: string | null }[] = [];
  for (const m of t.matchAll(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/g)) {
    candidatos.push({ pos: m.index!, fecha: fechaValida(+m[1]!, +m[2]!, +m[3]!) });
  }
  for (const m of t.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|20\d\d)\b/g)) {
    const x = +m[1]!;
    const y = +m[2]!;
    const dp = x > 12 ? true : y > 12 ? false : diaPrimero;
    candidatos.push({
      pos: m.index!,
      fecha: dp ? fechaValida(+m[3]!, y, x) : fechaValida(+m[3]!, x, y),
    });
  }
  // «15 de diciembre de 2026», «15 dic 2026», «15 December 2026».
  for (const m of t.matchAll(/\b(\d{1,2})(?:\s+de)?\s+([a-z]{3,10})(?:\s+de)?,?\s+(20\d\d)\b/g)) {
    const mes = MESES[m[2]!];
    if (mes) candidatos.push({ pos: m.index!, fecha: fechaValida(+m[3]!, mes, +m[1]!) });
  }
  // «December 15, 2026», «Dec 15 2026».
  for (const m of t.matchAll(/\b([a-z]{3,10})\s+(\d{1,2}),?\s+(20\d\d)\b/g)) {
    const mes = MESES[m[1]!];
    if (mes) candidatos.push({ pos: m.index!, fecha: fechaValida(+m[3]!, mes, +m[2]!) });
  }
  const valido = candidatos.filter((c) => c.fecha).sort((a, b) => a.pos - b.pos)[0];
  return valido?.fecha ?? null;
}

const CLAVE_FECHA =
  /proxim[oa] (factura|pago|cobro|facturacion|renovacion)|se renovar|se renueva|renovacion|renews?|renewal|next (bill|billing|payment|charge)|vence|vencimiento|finaliza|termina|caduca|expira|ends? on|will end|expires?|cancel|hasta el|until|pausad[oa] hasta|paused until/;

const PAGO_FALLIDO =
  /pago fallido|fallo (el|tu) pago|no (pudimos|se pudo) (procesar|cobrar|completar)|problema con (tu|el) (pago|metodo de pago)|actualiza (tu|el) (metodo|forma|medio) de pago|payment (failed|issue|problem|declined)|failed payment|couldn.?t (process|charge|complete)|problem with your payment|update your payment|pago rechazado|tarjeta rechazada|card (was )?declined/;
const PAUSA = /en pausa|pausad[oa]|esta pausad|paused|is on pause|plan pausado/;
const FAMILIAR = /familiar|family/;
const DUO = /\bduo\b/;
const GRATIS =
  /spotify free|plan gratuito|\bgratis\b|\bfree\b plan|plan\s*:?\s*free\b|^free$|spotify gratis/m;
const PREMIUM = /premium/;

/** Nombre del plan tal como aparece («Premium Family», «Premium Familiar»…). */
function planDe(texto: string): string | null {
  const m =
    /(premium\s+(?:family|familiar|duo|individual|student|estudiantes?|lite|basic|basico|standard)|spotify\s+(?:free|gratis)|premium)/i.exec(
      texto.normalize('NFD').replace(/\p{M}/gu, ''),
    );
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : null;
}

/** Cupos del plan: «4 de 6», «4/6 miembros», «quedan 2 lugares», «plan completo». */
export function cuposDe(
  textoFamilia: string,
  total: number | null,
  miembrosContados: number | null,
): { usados: number | null; total: number | null } {
  const t = normalizar(textoFamilia);
  const de =
    /(\d)\s*(?:de|of|\/)\s*(\d)\s*(?:miembros|cuentas|personas|lugares|cupos|espacios|members|accounts|people|spots|slots)/.exec(
      t,
    ) ?? /(?:miembros|cuentas|members|accounts)\s*\(?\s*(\d)\s*(?:de|of|\/)\s*(\d)/.exec(t);
  if (de) return { usados: +de[1]!, total: +de[2]! };
  const libres =
    /(?:quedan|queda|tienes|hay)\s+(\d)\s+(?:lugar|lugares|cupo|cupos|espacio|espacios|cuenta|cuentas|invitacion|invitaciones)/.exec(
      t,
    ) ??
    /(\d)\s+(?:lugar|lugares|cupo|cupos|espacio|espacios|cuentas?)\s+(?:libres?|disponibles?)/.exec(
      t,
    ) ??
    /(\d)\s+(?:spots?|slots?|places?|accounts?|invites?)\s+(?:left|available|remaining)/.exec(t);
  if (libres && total) return { usados: Math.max(0, total - +libres[1]!), total };
  if (
    /plan (esta )?(completo|lleno)|no (quedan|hay) (lugares|cupos|espacios)|plan is full|no (spots|slots) left|is full/.test(
      t,
    ) &&
    total
  ) {
    return { usados: total, total };
  }
  if (miembrosContados !== null && miembrosContados > 0) {
    return { usados: total ? Math.min(miembrosContados, total) : miembrosContados, total };
  }
  return { usados: null, total };
}

/**
 * Lee la página de la cuenta (`textoCuenta`) y la del plan familiar (`textoFamilia`).
 * `miembrosContados`: personas que el navegador contó en la lista del plan, si pudo.
 */
export function leerCuentaSpotify(
  textoCuenta: string,
  textoFamilia: string,
  miembrosContados: number | null = null,
): LecturaSpotify {
  const t = normalizar(textoCuenta);
  const plan = planDe(textoCuenta);
  const p = plan ? normalizar(plan) : '';
  const espanol = /\b(tu|cuenta|plan|factura|proxim|pago|miembros)\b/.test(t);

  let situacion: SituacionSpotify = 'desconocida';
  if (PAGO_FALLIDO.test(t)) situacion = 'pago_fallido';
  else if (PAUSA.test(t)) situacion = 'pausa';
  else if (GRATIS.test(p) || (!PREMIUM.test(t) && GRATIS.test(t))) situacion = 'caida';
  else if (PREMIUM.test(t)) situacion = 'al_dia';

  // La fecha va en la misma línea que «próxima factura», «se renueva», «vence»… o en la siguiente.
  const lineas = textoCuenta
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let vencimiento: string | null = null;
  for (let i = 0; i < lineas.length && !vencimiento; i++) {
    if (!CLAVE_FECHA.test(normalizar(lineas[i]!))) continue;
    vencimiento =
      fechaDe(lineas[i]!, espanol) ?? fechaDe(`${lineas[i]} ${lineas[i + 1] ?? ''}`, espanol);
  }

  const total = FAMILIAR.test(p) ? 6 : DUO.test(p) ? 2 : null;
  const cupos = textoFamilia.trim()
    ? cuposDe(textoFamilia, total, miembrosContados)
    : { usados: null, total };
  return { plan, situacion, vencimiento, cuposUsados: cupos.usados, cuposTotal: cupos.total };
}

/** ¿La lectura permite poner la fecha en la cuenta? Solo si está al día y hay fecha. */
export function fechaAplicable(l: LecturaSpotify): l is LecturaSpotify & { vencimiento: string } {
  return l.situacion === 'al_dia' && l.vencimiento !== null;
}
