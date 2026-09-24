import {
  AUTOMATIZACIONES,
  type ParametrosAutomatizacion,
  type TipoAutomatizacion,
  ZONA_HORARIA,
} from '@nv/shared';

/**
 * Horas de Venezuela. Venezuela usa UTC−4 todo el año (sin horario de verano
 * desde 2016), así que el desfase es fijo y las cuentas no dependen de la zona
 * horaria del servidor. Una prueba unitaria lo contrasta con `Intl`.
 */
export const DESFASE_CARACAS_MS = -4 * 3600_000;
export const DIA_MS = 24 * 3600_000;
const MINUTO_MS = 60_000;

/** El escalado a soporte no tiene hora propia: se revisa cada hora. */
export const MINUTOS_ESCALADO = 60;

/** Fecha y hora "de pared" en Caracas. */
export function partesCaracas(d: Date) {
  const l = new Date(d.getTime() + DESFASE_CARACAS_MS);
  return {
    anio: l.getUTCFullYear(),
    mes: l.getUTCMonth() + 1,
    dia: l.getUTCDate(),
    hora: l.getUTCHours(),
    minuto: l.getUTCMinutes(),
  };
}

/** Medianoche de Caracas del día de `d` (más `sumarDias`), como instante UTC. */
export function inicioDiaCaracas(d: Date, sumarDias = 0): Date {
  const local = d.getTime() + DESFASE_CARACAS_MS;
  const medianoche = Math.floor(local / DIA_MS) * DIA_MS;
  return new Date(medianoche - DESFASE_CARACAS_MS + sumarDias * DIA_MS);
}

/** Día del calendario venezolano, "AAAA-MM-DD". */
export function fechaCaracas(d: Date): string {
  const p = partesCaracas(d);
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

const formatoFecha = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: ZONA_HORARIA,
});
const formatoFechaHora = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: ZONA_HORARIA,
});

/** "24 de septiembre de 2026" (hora de Venezuela). */
export const fechaLarga = (d: Date) => formatoFecha.format(d);
/** "24 de septiembre, 3:05 p. m." (hora de Venezuela). */
export const fechaHora = (d: Date) => formatoFechaHora.format(d);

/** Cuándo corre una automatización programada. */
export type Programa =
  { tipo: 'diaria'; horas: readonly number[] } | { tipo: 'intervalo'; minutos: number };

/** Programa de una automatización según su tipo y parámetros; null si la dispara un evento. */
export function programaDe<T extends TipoAutomatizacion>(
  tipo: T,
  parametros: ParametrosAutomatizacion<T>,
): Programa | null {
  if (AUTOMATIZACIONES[tipo].disparo !== 'programada') return null;
  const p = parametros as Record<string, unknown>;
  if (tipo === 'escalado_suspension') return { tipo: 'intervalo', minutos: MINUTOS_ESCALADO };
  if (typeof p['cadaMinutos'] === 'number') return { tipo: 'intervalo', minutos: p['cadaMinutos'] };
  if (Array.isArray(p['horas'])) return { tipo: 'diaria', horas: (p['horas'] as number[]).slice() };
  if (typeof p['hora'] === 'number') return { tipo: 'diaria', horas: [p['hora']] };
  return null;
}

/**
 * Última ranura que ya debió ejecutarse (≤ ahora), o null. Las diarias solo
 * recuperan la ranura más reciente del mismo día de Venezuela: si el trabajador
 * estuvo caído, al volver ejecuta una vez lo pendiente de hoy, no lo de ayer.
 */
export function ranuraActual(programa: Programa, ahora: Date): Date | null {
  if (programa.tipo === 'intervalo') {
    const paso = programa.minutos * MINUTO_MS;
    const local = ahora.getTime() + DESFASE_CARACAS_MS;
    return new Date(Math.floor(local / paso) * paso - DESFASE_CARACAS_MS);
  }
  const inicio = inicioDiaCaracas(ahora).getTime();
  let mejor: number | null = null;
  for (const h of programa.horas) {
    const t = inicio + h * 3600_000;
    if (t <= ahora.getTime() && (mejor === null || t > mejor)) mejor = t;
  }
  return mejor === null ? null : new Date(mejor);
}

/** Próxima ranura estrictamente posterior a `ahora`. */
export function proximaRanura(programa: Programa, ahora: Date): Date {
  if (programa.tipo === 'intervalo') {
    const actual = ranuraActual(programa, ahora)!;
    return new Date(actual.getTime() + programa.minutos * MINUTO_MS);
  }
  const horas = [...programa.horas].sort((a, b) => a - b);
  for (const dias of [0, 1]) {
    const inicio = inicioDiaCaracas(ahora, dias).getTime();
    for (const h of horas) {
      const t = inicio + h * 3600_000;
      if (t > ahora.getTime()) return new Date(t);
    }
  }
  // Inalcanzable: siempre hay al menos una hora.
  return inicioDiaCaracas(ahora, 1);
}

/** Clave que impide encolar dos veces la misma ranura (varios trabajadores o reinicios). */
export const claveRanura = (tipo: TipoAutomatizacion, ranura: Date) =>
  `auto:${tipo}:${ranura.toISOString()}`;
