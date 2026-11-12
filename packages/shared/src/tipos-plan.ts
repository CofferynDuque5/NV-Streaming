/**
 * Tipos de plan y ayudas de los datos que pide un servicio al comprar.
 * Sin zod a propósito: la tienda los usa en el navegador y así la portada no
 * carga la librería de validación (afecta la velocidad en móvil).
 */
import type { DatoRequerido, ValoresDatos } from './esquemas/catalogo.js';

export const TIPOS_PROVEEDOR = ['propio', 'distribuidor'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];
export const UNIDADES_DURACION = ['dia', 'mes'] as const;
export type UnidadDuracion = (typeof UNIDADES_DURACION)[number];

/**
 * Qué se vende en un plan. Solo «suscripcion» tiene duración, vence y se
 * renueva; el resto son compras únicas (monedas de un juego, paquetes, pases,
 * tarjetas o códigos).
 */
export const TIPOS_PLAN = ['suscripcion', 'recarga', 'paquete', 'pase', 'tarjeta'] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];
export const ETIQUETA_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Suscripción (con duración)',
  recarga: 'Moneda del juego o recarga',
  paquete: 'Paquete',
  pase: 'Pase',
  tarjeta: 'Tarjeta o código',
};
/** Nombre corto del tipo para la tienda (la etiqueta sobre el precio). */
export const NOMBRE_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Suscripción',
  recarga: 'Recarga',
  paquete: 'Paquete',
  pase: 'Pase',
  tarjeta: 'Tarjeta',
};
export const esCompraUnica = (tipo: TipoPlan) => tipo !== 'suscripcion';

/** Máximo de datos que un servicio puede pedir al comprar. */
export const MAX_DATOS_REQUERIDOS = 5;

/** Clave de un dato a partir de su etiqueta: «ID de jugador» → «id-de-jugador». */
export function claveDato(etiqueta: string): string {
  return etiqueta
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Comprueba los valores contra lo que pide el servicio. Devuelve los errores
 * por clave (vacío si todo está bien) y los valores limpios.
 */
export function revisarDatos(
  pedidos: DatoRequerido[],
  valores: ValoresDatos | null | undefined,
): { limpios: ValoresDatos; errores: Record<string, string> } {
  const limpios: ValoresDatos = {};
  const errores: Record<string, string> = {};
  for (const d of pedidos) {
    const v = (valores?.[d.clave] ?? '').trim();
    if (v) limpios[d.clave] = v.slice(0, 120);
    else if (d.obligatorio) errores[d.clave] = `Escribe ${d.etiqueta}.`;
  }
  return { limpios, errores };
}
