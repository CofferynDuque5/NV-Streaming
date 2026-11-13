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
export const TIPOS_PLAN = [
  'suscripcion',
  'recarga',
  'suministro',
  'paquete',
  'pase',
  'tarjeta',
] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];
export const ETIQUETA_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Suscripción (con duración)',
  recarga: 'Monedas del juego o saldo (diamantes, CP, USD…)',
  suministro: 'Suministros (objetos, cajas, skins)',
  paquete: 'Paquete',
  pase: 'Pase o membresía',
  tarjeta: 'Tarjeta o código',
};
/** Nombre corto del tipo para la tienda (la etiqueta sobre el precio). */
export const NOMBRE_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Suscripción',
  recarga: 'Monedas',
  suministro: 'Suministro',
  paquete: 'Paquete',
  pase: 'Pase',
  tarjeta: 'Tarjeta',
};
/** Nombre de cada grupo en las pestañas de la ficha («Monedas · Suministros · Pases»). */
export const GRUPO_TIPO_PLAN: Record<TipoPlan, string> = {
  suscripcion: 'Planes',
  recarga: 'Monedas',
  suministro: 'Suministros',
  paquete: 'Paquetes',
  pase: 'Pases',
  tarjeta: 'Tarjetas',
};
export const esCompraUnica = (tipo: TipoPlan) => tipo !== 'suscripcion';

/**
 * Cómo se entrega una suscripción: «alquiler» da al cliente una cuenta o perfil
 * del inventario; «activacion» la activa en la cuenta del propio cliente, que
 * escribe su correo y contraseña al comprar.
 */
export const ENTREGAS_PLAN = ['alquiler', 'activacion'] as const;
export type EntregaPlan = (typeof ENTREGAS_PLAN)[number];
export const ETIQUETA_ENTREGA_PLAN: Record<EntregaPlan, string> = {
  alquiler: 'Alquiler: le damos una cuenta o perfil del inventario',
  activacion: 'Activación en su correo: el cliente da su correo y contraseña',
};
export const NOMBRE_ENTREGA_PLAN: Record<EntregaPlan, string> = {
  alquiler: 'Alquiler de cuenta',
  activacion: 'Activación en tu correo',
};

/** Tipos de dato que un servicio puede pedir al comprar. */
export const TIPOS_DATO = ['texto', 'numero', 'correo', 'clave', 'lista'] as const;
export type TipoDato = (typeof TIPOS_DATO)[number];
export const ETIQUETA_TIPO_DATO: Record<TipoDato, string> = {
  texto: 'Texto',
  numero: 'Solo números (ID, zona)',
  correo: 'Correo',
  clave: 'Contraseña (se guarda cifrada)',
  lista: 'Lista de opciones',
};

/** Máximo de datos que un servicio puede pedir al comprar. */
export const MAX_DATOS_REQUERIDOS = 6;
export const MAX_OPCIONES_DATO = 12;

/** Lo que se pide al cliente cuando el plan se activa en su propia cuenta. */
export const DATOS_ACTIVACION: DatoRequerido[] = [
  {
    clave: 'correo-cuenta',
    etiqueta: 'Correo de tu cuenta',
    ayuda: 'El correo con el que entras al servicio. Ahí lo activamos.',
    obligatorio: true,
    tipo: 'correo',
    opciones: [],
    largo: null,
  },
  {
    clave: 'clave-cuenta',
    etiqueta: 'Contraseña de tu cuenta',
    ayuda: 'Se guarda cifrada y solo la ve quien hace la activación.',
    obligatorio: true,
    tipo: 'clave',
    opciones: [],
    largo: null,
  },
];

/** Todo lo que pide un plan al comprar: los datos del servicio y, si se activa en su correo, su cuenta. */
export function datosDelPlan(
  delServicio: DatoRequerido[],
  plan: { tipo: TipoPlan; entrega?: EntregaPlan },
): DatoRequerido[] {
  if (plan.tipo !== 'suscripcion' || plan.entrega !== 'activacion') return delServicio;
  const claves = new Set(delServicio.map((d) => d.clave));
  return [...delServicio, ...DATOS_ACTIVACION.filter((d) => !claves.has(d.clave))];
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const v = (valores?.[d.clave] ?? '').trim().slice(0, 120);
    if (!v) {
      if (d.obligatorio) {
        errores[d.clave] = d.tipo === 'lista' ? `Elige ${d.etiqueta}.` : `Escribe ${d.etiqueta}.`;
      }
      continue;
    }
    const tipo = d.tipo ?? 'texto';
    if (tipo === 'numero' && !/^\d+$/.test(v)) errores[d.clave] = 'Escribe solo números.';
    else if (tipo === 'correo' && !CORREO.test(v)) errores[d.clave] = 'Escribe un correo válido.';
    else if (tipo === 'lista' && !(d.opciones ?? []).includes(v))
      errores[d.clave] = `Elige ${d.etiqueta} de la lista.`;
    else if (d.largo && v.length > d.largo) errores[d.clave] = `Máximo ${d.largo} caracteres.`;
    else limpios[d.clave] = v;
  }
  return { limpios, errores };
}
