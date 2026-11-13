/**
 * Datos de la tienda pública derivados del catálogo que entrega la API. Aquí
 * no se calcula ningún precio: solo se elige, ordena y filtra entre los precios
 * que ya vienen del servidor en cada moneda.
 */
import { CATEGORIAS_SERVICIO, type CategoriaServicio, INFO_CATEGORIA } from './categorias.js';
import { esCompraUnica, type TipoPlan, type UnidadDuracion } from './tipos-plan.js';
import type { Moneda } from './monedas.js';
import type {
  CatalogoPublico,
  ComboPublico,
  PlanPublico,
  PreciosPorMoneda,
  ServicioCatalogo,
} from './tipos-negocio.js';

/** Tarjetas de servicio disponibles como imagen (archivo /servicios/<clave>.webp) y su color. */
export const ARTE_SERVICIOS = {
  netflix: '#e50914',
  disney: '#2f6bff',
  hbomax: '#9b5cff',
  paramount: '#38bdf8',
  appletv: '#cbd5e1',
  vix: '#f97316',
  crunchyroll: '#f97316',
  youtube: '#ef4444',
  flujo: '#fb923c',
  tvmagico: '#38bdf8',
  spotify: '#84cc16',
  deezer: '#a855f7',
  tidal: '#a3e635',
  chatgpt: '#ef4444',
  office: '#3b82f6',
  googleone: '#22c55e',
} as const;
export type ClaveArte = keyof typeof ARTE_SERVICIOS;

/** Otros nombres con los que el equipo puede escribir el slug de un servicio. */
const ALIAS_ARTE: Record<string, ClaveArte> = {
  disneyplus: 'disney',
  hbo: 'hbomax',
  max: 'hbomax',
  paramountplus: 'paramount',
  apple: 'appletv',
  youtubepremium: 'youtube',
  microsoft: 'office',
  m365: 'office',
  office365: 'office',
  google: 'googleone',
  openai: 'chatgpt',
};

/** Color de cada universo (categoría) de la tienda. */
export const COLOR_CATEGORIA: Record<CategoriaServicio, string> = {
  streaming: '#4f8dff',
  musica: '#a855f7',
  ia: '#22d3ee',
  juegos: '#ec4899',
  software: '#10b981',
  nube: '#f59e0b',
};

const COLOR_SIN_CATEGORIA = '#5b98ff';

function normalizar(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Tarjeta de imagen que corresponde a un servicio por su slug (p. ej.
 * «netflix-premium» → netflix). `null` si no hay una: se muestra un orbe.
 */
export function claveArte(slug: string): ClaveArte | null {
  const s = normalizar(slug);
  if (!s) return null;
  if (s === 'max') return 'hbomax';
  const claves = Object.keys(ARTE_SERVICIOS) as ClaveArte[];
  const directa = claves.find((c) => s.startsWith(c));
  if (directa) return directa;
  const alias = Object.keys(ALIAS_ARTE)
    .filter((a) => a !== 'max')
    .sort((a, b) => b.length - a.length)
    .find((a) => s.startsWith(a));
  return alias ? (ALIAS_ARTE[alias] ?? null) : null;
}

/** Duración legible: «1 mes», «3 meses», «1 año», «2 años», «30 días». */
export function etiquetaDuracion(cantidad: number, unidad: UnidadDuracion): string {
  if (unidad === 'mes' && cantidad % 12 === 0) {
    const anios = cantidad / 12;
    return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  }
  if (unidad === 'mes') return `${cantidad} ${cantidad === 1 ? 'mes' : 'meses'}`;
  return `${cantidad} ${cantidad === 1 ? 'día' : 'días'}`;
}

/**
 * Cómo se nombra la opción de un plan: su duración, o su nombre si es una compra
 * única (monedas de un juego, paquetes, pases…), que no tiene duración.
 */
export function etiquetaPlan(
  p: Pick<PlanPublico, 'duracionCantidad' | 'duracionUnidad' | 'nombre'> & { tipo?: TipoPlan },
): string {
  return p.tipo && esCompraUnica(p.tipo)
    ? p.nombre
    : etiquetaDuracion(p.duracionCantidad, p.duracionUnidad);
}

/** Clave de una duración para los filtros (p. ej. «12-mes»). */
export function claveDuracion(p: Pick<PlanPublico, 'duracionCantidad' | 'duracionUnidad'>) {
  return `${p.duracionCantidad}-${p.duracionUnidad}`;
}

function dias(p: Pick<PlanPublico, 'duracionCantidad' | 'duracionUnidad'>): number {
  return p.duracionUnidad === 'mes' ? p.duracionCantidad * 30 : p.duracionCantidad;
}

/** Oferta HOT del plan si sigue vigente (la API la publica; aquí se descarta al vencer). */
export function ofertaActiva(
  plan: Pick<PlanPublico, 'oferta'>,
  ahora: number = Date.now(),
): PlanPublico['oferta'] {
  const o = plan.oferta;
  return o && new Date(o.hasta).getTime() > ahora ? o : null;
}

/** Precios que paga hoy un cliente: los de la oferta HOT si está vigente. */
export function preciosVigentes(plan: Pick<PlanPublico, 'oferta' | 'precios'>): PreciosPorMoneda {
  return ofertaActiva(plan)?.precios ?? plan.precios;
}

/** Precio de un plan en una moneda como número, solo para comparar u ordenar. */
export function valorEn(plan: PlanPublico, moneda: Moneda): number | null {
  const p = preciosVigentes(plan)[moneda];
  if (!p) return null;
  const n = Number(p.precio);
  return Number.isFinite(n) ? n : null;
}

/** El plan más barato en la moneda (a igual precio, el primero del catálogo). */
export function planMasBarato(planes: PlanPublico[], moneda: Moneda): PlanPublico | null {
  let mejor: PlanPublico | null = null;
  let mejorValor = Number.POSITIVE_INFINITY;
  for (const p of planes) {
    const v = valorEn(p, moneda);
    if (v === null) continue;
    if (v < mejorValor || (v === mejorValor && mejor && p.orden < mejor.orden)) {
      mejor = p;
      mejorValor = v;
    }
  }
  return mejor;
}

/**
 * Imagen y color con los que se muestra un servicio: su logo subido si tiene;
 * si no, la tarjeta de su marca (por el slug); si tampoco, ninguna (orbe).
 * `arte` es la dirección de la imagen.
 */
export function aspectoServicio(
  slug: string,
  categoria: CategoriaServicio | null,
  imagen: string | null = null,
): { arte: string | null; color: string } {
  const clave = claveArte(slug);
  return {
    arte: imagen ?? (clave ? `/servicios/${clave}.webp` : null),
    color: clave
      ? ARTE_SERVICIOS[clave]
      : categoria
        ? COLOR_CATEGORIA[categoria]
        : COLOR_SIN_CATEGORIA,
  };
}

export interface ServicioTienda {
  servicio: ServicioCatalogo;
  /** Planes visibles del servicio, ordenados de menor a mayor duración. */
  planes: PlanPublico[];
  color: string;
  /** Dirección de la imagen del servicio (logo subido o tarjeta de la marca). */
  arte: string | null;
  /** Posición en «Lo más pedido» (0 = el más pedido); null si no tuvo pedidos. */
  ranking: number | null;
}

/** Servicios del catálogo con sus planes, en el orden del catálogo. */
export function serviciosTienda(catalogo: CatalogoPublico): ServicioTienda[] {
  const porServicio = new Map<string, PlanPublico[]>();
  for (const p of catalogo.planes) {
    const lista = porServicio.get(p.servicio.id) ?? [];
    lista.push(p);
    porServicio.set(p.servicio.id, lista);
  }
  return catalogo.servicios
    .filter((s) => porServicio.has(s.id))
    .map((s) => {
      const planes = [...(porServicio.get(s.id) ?? [])].sort(
        (a, b) => dias(a) - dias(b) || a.orden - b.orden,
      );
      const posicion = catalogo.masPedidos.indexOf(s.id);
      return {
        servicio: s,
        planes,
        ...aspectoServicio(s.slug, s.categoria, s.imagen),
        ranking: posicion === -1 ? null : posicion,
      };
    });
}

export interface CategoriaTienda {
  id: CategoriaServicio;
  nombre: string;
  descripcion: string;
  color: string;
  servicios: number;
  /** Plan más barato de la categoría en la moneda (para «desde»). */
  desde: PlanPublico | null;
}

/** Universos que tienen al menos un servicio, en el orden fijo de la tienda. */
export function categoriasTienda(servicios: ServicioTienda[], moneda: Moneda): CategoriaTienda[] {
  return CATEGORIAS_SERVICIO.flatMap((id) => {
    const suyos = servicios.filter((s) => s.servicio.categoria === id);
    if (suyos.length === 0) return [];
    return [
      {
        id,
        ...INFO_CATEGORIA[id],
        color: COLOR_CATEGORIA[id],
        servicios: suyos.length,
        desde: planMasBarato(
          suyos.flatMap((s) => s.planes),
          moneda,
        ),
      },
    ];
  });
}

export const ORDENES_CATALOGO = ['recomendados', 'menor', 'mayor', 'az'] as const;
export type OrdenCatalogo = (typeof ORDENES_CATALOGO)[number];

export interface FiltrosCatalogo {
  categoria?: CategoriaServicio | null;
  /** Clave de duración (claveDuracion); solo cuentan los planes de esa duración. */
  duracion?: string | null;
  /** Precio máximo en la moneda (del plan que se muestra). */
  precioMax?: number | null;
  texto?: string | null;
  orden?: OrdenCatalogo;
  /** Solo servicios con algún plan en oferta HOT (y se muestra ese plan). */
  soloOfertas?: boolean;
}

export interface ResultadoCatalogo {
  item: ServicioTienda;
  /** Plan que representa al servicio con estos filtros: el más barato que cumple. */
  plan: PlanPublico;
  valor: number;
}

function sinAcentos(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** ¿El texto buscado aparece en el nombre, el slug o el universo del servicio? */
export function coincideBusqueda(item: ServicioTienda, texto: string): boolean {
  const q = sinAcentos(texto);
  if (!q) return true;
  const { nombre, slug, categoria, descripcion } = item.servicio;
  const campos = [nombre, slug, categoria ? INFO_CATEGORIA[categoria].nombre : '', descripcion];
  return campos.some((c) => c && sinAcentos(c).includes(q));
}

/**
 * Filtra y ordena los servicios del catálogo. «Recomendados» pone primero lo
 * más pedido y luego respeta el orden del catálogo.
 */
export function filtrarCatalogo(
  servicios: ServicioTienda[],
  moneda: Moneda,
  filtros: FiltrosCatalogo,
): ResultadoCatalogo[] {
  const resultado: ResultadoCatalogo[] = [];
  for (const item of servicios) {
    if (filtros.categoria && item.servicio.categoria !== filtros.categoria) continue;
    if (filtros.texto && !coincideBusqueda(item, filtros.texto)) continue;
    let candidatos = filtros.duracion
      ? item.planes.filter((p) => !esCompraUnica(p.tipo) && claveDuracion(p) === filtros.duracion)
      : item.planes;
    if (filtros.soloOfertas) candidatos = candidatos.filter((p) => ofertaActiva(p) !== null);
    const plan = planMasBarato(candidatos, moneda);
    if (!plan) continue;
    const valor = valorEn(plan, moneda) ?? 0;
    if (typeof filtros.precioMax === 'number' && valor > filtros.precioMax) continue;
    resultado.push({ item, plan, valor });
  }
  const orden = filtros.orden ?? 'recomendados';
  const indice = new Map(servicios.map((s, i) => [s.servicio.id, i]));
  const pos = (r: ResultadoCatalogo) => indice.get(r.item.servicio.id) ?? 0;
  const rank = (r: ResultadoCatalogo) => r.item.ranking ?? Number.POSITIVE_INFINITY;
  const comparar: Record<OrdenCatalogo, (a: ResultadoCatalogo, b: ResultadoCatalogo) => number> = {
    recomendados: (a, b) => rank(a) - rank(b) || pos(a) - pos(b),
    menor: (a, b) => a.valor - b.valor || pos(a) - pos(b),
    mayor: (a, b) => b.valor - a.valor || pos(a) - pos(b),
    az: (a, b) => a.item.servicio.nombre.localeCompare(b.item.servicio.nombre, 'es'),
  };
  return resultado.sort(comparar[orden]);
}

/** Duraciones que existen en el catálogo, de la más corta a la más larga. */
export function duracionesCatalogo(
  servicios: ServicioTienda[],
): { clave: string; etiqueta: string }[] {
  const vistas = new Map<string, PlanPublico>();
  for (const s of servicios)
    for (const p of s.planes) if (!esCompraUnica(p.tipo)) vistas.set(claveDuracion(p), p);
  return [...vistas.values()]
    .sort((a, b) => dias(a) - dias(b))
    .map((p) => ({
      clave: claveDuracion(p),
      etiqueta: etiquetaDuracion(p.duracionCantidad, p.duracionUnidad),
    }));
}

/** Enlace para abrir un chat de WhatsApp con el número (y un texto opcional). */
export function enlaceWhatsapp(numero: string, texto?: string): string {
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/**
 * Precio de un combo en una moneda, lo que costaría por separado y el
 * porcentaje que se ahorra (redondeado hacia abajo). null si esa moneda no
 * tiene precio o el combo no ahorra nada.
 */
export function ahorroCombo(
  combo: Pick<ComboPublico, 'precios' | 'sinCombo'>,
  moneda: Moneda,
): { precio: string; sinCombo: string; porcentaje: number } | null {
  const precio = combo.precios[moneda];
  const sinCombo = combo.sinCombo[moneda];
  if (!precio || !sinCombo || !(Number(sinCombo) > Number(precio))) return null;
  const porcentaje = Math.floor(((Number(sinCombo) - Number(precio)) / Number(sinCombo)) * 100);
  return { precio, sinCombo, porcentaje };
}
