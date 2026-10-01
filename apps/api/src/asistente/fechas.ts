/** Fechas en hora de Venezuela para el asistente (el modelo nunca recibe husos horarios sueltos). */
const ZONA = 'America/Caracas';

const FECHA_HORA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const LEGIBLE = new Intl.DateTimeFormat('es-VE', {
  timeZone: ZONA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "2026-09-24 14:30" (hora de Caracas), o null. */
export function fechaCaracas(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const f = new Date(d);
  return Number.isNaN(f.getTime()) ? null : FECHA_HORA.format(f);
}

/** "2026-09-24": el día en Caracas (clave del límite diario). */
export const diaCaracas = (d = new Date()): string => DIA.format(d);

/** "2026-09": el mes en Caracas (clave del uso y del tope mensual). */
export const mesCaracas = (d = new Date()): string => diaCaracas(d).slice(0, 7);

/** "jueves, 24 de septiembre de 2026". */
export const hoyLegible = (d = new Date()): string => LEGIBLE.format(d);
