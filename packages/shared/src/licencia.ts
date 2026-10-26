import { z } from 'zod';
import { ZONA_HORARIA } from './automatizaciones.js';

/**
 * Licencia de la instalación (G8). Cada negocio que compra el Gestor tiene su propia
 * instalación con su propia base PostgreSQL; la licencia dice hasta cuándo puede usar
 * el panel del equipo. La emite quien vende el sistema con su clave privada Ed25519
 * (`infra/licencias/licencias.mjs`) y la instalación solo guarda la clave pública, así
 * que nadie más puede fabricar ni alargar una licencia. No llama a ningún servicio.
 *
 * Formato: `NVL1.<datos en base64url>.<firma en base64url>`; la firma cubre
 * `NVL1.<datos en base64url>`.
 */
export const PREFIJO_LICENCIA = 'NVL1';

/** Días antes del vencimiento en los que el panel avisa. */
export const DIAS_AVISO_LICENCIA = 7;
/** Días después del vencimiento en los que todo sigue funcionando, con aviso. */
export const DIAS_GRACIA_LICENCIA = 3;
export const MAX_LARGO_LICENCIA = 2000;

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const f = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(f.getTime()) && f.toISOString().startsWith(d);
  });

/** Lo que firma el vendedor. */
export const datosLicenciaSchema = z.object({
  v: z.literal(1),
  /** Identificador de la licencia, para reconocerla al renovar. */
  id: z.string().min(6).max(64),
  /** Nombre del negocio que la compró. */
  negocio: z.string().trim().min(2).max(120),
  /** Dirección pública de su instalación (WEB_ORIGEN): la licencia no sirve en otra. */
  origen: z.url().regex(/^https?:\/\/[^/]+$/, 'Solo el origen, sin ruta ni barra final.'),
  /** Nombre del plan tal como se vendió («Mensual», «Anual»…). */
  plan: z.string().trim().min(1).max(60),
  /** Prueba gratis. */
  prueba: z.boolean(),
  emitida: fecha,
  /** Último día de uso (hora de Venezuela), antes de la gracia. */
  vence: fecha,
});
export type DatosLicencia = z.infer<typeof datosLicenciaSchema>;

export const cargarLicenciaSchema = z.object({
  licencia: z
    .string({ error: 'Pega la licencia.' })
    .trim()
    .min(10, 'Pega la licencia completa.')
    .max(MAX_LARGO_LICENCIA, 'La licencia es demasiado larga.')
    .regex(/^NVL1\.[\w-]+\.[\w-]+$/, 'No parece una licencia: empieza por NVL1.'),
});
export type CargarLicenciaEntrada = z.infer<typeof cargarLicenciaSchema>;

/**
 * - `sin_control`: esta instalación no usa licencia (la del dueño del sistema).
 * - `vigente` / `por_vencer`: todo funciona; `por_vencer` muestra un aviso.
 * - `en_gracia`: ya venció, pero todo sigue funcionando unos días con aviso.
 * - `vencida`, `falta`, `invalida`: el panel del equipo queda en solo lectura.
 */
export const ESTADOS_LICENCIA = [
  'sin_control',
  'vigente',
  'por_vencer',
  'en_gracia',
  'vencida',
  'falta',
  'invalida',
] as const;
export type EstadoLicencia = (typeof ESTADOS_LICENCIA)[number];

export interface LicenciaPublica {
  estado: EstadoLicencia;
  /** El equipo puede crear y cambiar cosas. */
  permiteCambios: boolean;
  negocio: string | null;
  plan: string | null;
  prueba: boolean;
  vence: string | null;
  /** Días que faltan hasta `vence` (negativo si ya pasó). */
  diasRestantes: number | null;
  /** Último día de gracia. */
  graciaHasta: string | null;
  /** Por qué no es válida, sin detalles internos. */
  motivo: string | null;
  cargadaEn: string | null;
}

/** Fecha de hoy (AAAA-MM-DD) en Venezuela. */
export function hoyEnVenezuela(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(ahora);
}

function sumarDias(dia: string, dias: number): string {
  const f = new Date(`${dia}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

/** Estado de una licencia ya verificada en la fecha `hoy` (AAAA-MM-DD, Venezuela). */
export function estadoLicencia(datos: DatosLicencia, hoy: string): EstadoLicencia {
  const dias = diasEntre(hoy, datos.vence);
  if (dias > DIAS_AVISO_LICENCIA) return 'vigente';
  if (dias >= 0) return 'por_vencer';
  if (dias >= -DIAS_GRACIA_LICENCIA) return 'en_gracia';
  return 'vencida';
}

export function licenciaPublica(
  datos: DatosLicencia | null,
  estado: EstadoLicencia,
  hoy: string,
  extra: { motivo?: string | null; cargadaEn?: Date | null } = {},
): LicenciaPublica {
  return {
    estado,
    permiteCambios: permiteCambios(estado),
    negocio: datos?.negocio ?? null,
    plan: datos?.plan ?? null,
    prueba: datos?.prueba ?? false,
    vence: datos?.vence ?? null,
    diasRestantes: datos ? diasEntre(hoy, datos.vence) : null,
    graciaHasta: datos ? sumarDias(datos.vence, DIAS_GRACIA_LICENCIA) : null,
    motivo: extra.motivo ?? null,
    cargadaEn: extra.cargadaEn?.toISOString() ?? null,
  };
}

export function permiteCambios(estado: EstadoLicencia): boolean {
  return estado !== 'vencida' && estado !== 'falta' && estado !== 'invalida';
}

/** Separa la licencia en sus partes, sin verificar la firma ni decodificar. */
export function partesLicencia(
  licencia: string,
): { firmado: string; datos: string; firma: string } | null {
  const partes = licencia.trim().split('.');
  if (partes.length !== 3 || partes[0] !== PREFIJO_LICENCIA) return null;
  const [prefijo, datos, firma] = partes as [string, string, string];
  if (!/^[\w-]+$/.test(datos) || !/^[\w-]+$/.test(firma)) return null;
  return { firmado: `${prefijo}.${datos}`, datos, firma };
}

/** Valida los datos ya decodificados (el JSON de la parte central). */
export function leerDatosLicencia(json: unknown): DatosLicencia | null {
  const r = datosLicenciaSchema.safeParse(json);
  return r.success ? r.data : null;
}

export const ETIQUETA_ESTADO_LICENCIA: Record<EstadoLicencia, string> = {
  sin_control: 'Sin licencia (instalación propia)',
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  en_gracia: 'Vencida, en días de gracia',
  vencida: 'Vencida',
  falta: 'Sin licencia',
  invalida: 'No válida',
};
