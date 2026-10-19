import { describe, expect, it } from 'vitest';
import {
  type CatalogoPublico,
  categoriasTienda,
  claveArte,
  duracionesCatalogo,
  etiquetaDuracion,
  filtrarCatalogo,
  type PlanPublico,
  planMasBarato,
  serviciosTienda,
} from '../src/index.js';

function plan(
  id: string,
  servicio: { id: string; nombre: string; slug: string },
  usd: string,
  ves: string | null,
  meses: number,
  orden = 0,
): PlanPublico {
  return {
    id,
    servicio,
    nombre: `${servicio.nombre} ${meses}`,
    descripcion: null,
    precioUsd: usd,
    duracionCantidad: meses,
    duracionUnidad: 'mes',
    beneficios: [],
    activo: true,
    visible: true,
    renovable: true,
    revendible: false,
    orden,
    precios: {
      USD: { precio: usd, fijo: false },
      VES: ves ? { precio: ves, fijo: false } : null,
      ARS: null,
      COP: null,
      PEN: null,
      EUR: null,
    },
  };
}

const cine = { id: 's1', nombre: 'NV Cine', slug: 'nv-cine' };
const musica = { id: 's2', nombre: 'Spotify Premium', slug: 'spotify-premium' };
const nube = { id: 's3', nombre: 'Álbum Nube', slug: 'album-nube' };

const catalogo: CatalogoPublico = {
  planes: [
    plan('c12', cine, '54.99', '8248.50', 12, 3),
    plan('c1', cine, '5.99', '898.50', 1, 1),
    plan('c3', cine, '15.99', '2398.50', 3, 2),
    plan('m1', musica, '3.49', '523.50', 1),
    plan('n1', nube, '2.00', null, 1),
  ],
  servicios: [
    { ...cine, descripcion: null, categoria: 'streaming' },
    { ...musica, descripcion: 'Música sin anuncios', categoria: 'musica' },
    { ...nube, descripcion: null, categoria: 'nube' },
    { id: 's4', nombre: 'Sin planes', slug: 'sin-planes', descripcion: null, categoria: 'ia' },
  ],
  masPedidos: ['s2'],
  monedas: ['USD', 'VES'],
  tasas: [],
};

describe('tienda: imágenes de los servicios', () => {
  it.each([
    ['netflix', 'netflix'],
    ['netflix-premium', 'netflix'],
    ['disney-plus', 'disney'],
    ['max', 'hbomax'],
    ['hbo-max', 'hbomax'],
    ['microsoft-365', 'office'],
    ['google-one', 'googleone'],
    ['apple-tv-plus', 'appletv'],
  ])('%s usa la tarjeta %s', (slug, clave) => {
    expect(claveArte(slug)).toBe(clave);
  });

  it.each(['nv-cine', 'maxima-tv', ''])('%s no tiene tarjeta (se muestra un orbe)', (slug) => {
    expect(claveArte(slug)).toBeNull();
  });
});

describe('tienda: servicios y universos', () => {
  const servicios = serviciosTienda(catalogo);

  it('agrupa por servicio, ordena por duración y omite servicios sin planes', () => {
    expect(servicios.map((s) => s.servicio.id)).toEqual(['s1', 's2', 's3']);
    expect(servicios[0]?.planes.map((p) => p.id)).toEqual(['c1', 'c3', 'c12']);
    expect(servicios[1]?.arte).toBe('spotify');
    expect(servicios[1]?.ranking).toBe(0);
    expect(servicios[0]?.ranking).toBeNull();
  });

  it('elige el plan más barato que existe en la moneda', () => {
    expect(planMasBarato(servicios[0]?.planes ?? [], 'VES')?.id).toBe('c1');
    expect(planMasBarato(servicios[2]?.planes ?? [], 'VES')).toBeNull();
  });

  it('resume los universos con su conteo y su precio desde', () => {
    const cats = categoriasTienda(servicios, 'VES');
    expect(cats.map((c) => [c.id, c.servicios, c.desde?.id ?? null])).toEqual([
      ['streaming', 1, 'c1'],
      ['musica', 1, 'm1'],
      ['nube', 1, null],
    ]);
  });

  it('etiqueta las duraciones y las lista de la más corta a la más larga', () => {
    expect(etiquetaDuracion(12, 'mes')).toBe('1 año');
    expect(etiquetaDuracion(24, 'mes')).toBe('2 años');
    expect(etiquetaDuracion(3, 'mes')).toBe('3 meses');
    expect(etiquetaDuracion(1, 'dia')).toBe('1 día');
    expect(duracionesCatalogo(servicios).map((d) => d.etiqueta)).toEqual([
      '1 mes',
      '3 meses',
      '1 año',
    ]);
  });
});

describe('tienda: filtros y orden del catálogo', () => {
  const servicios = serviciosTienda(catalogo);
  const ids = (r: ReturnType<typeof filtrarCatalogo>) => r.map((x) => x.plan.id);

  it('recomendados pone primero lo más pedido y omite lo que no tiene precio en la moneda', () => {
    expect(ids(filtrarCatalogo(servicios, 'VES', {}))).toEqual(['m1', 'c1']);
    expect(ids(filtrarCatalogo(servicios, 'USD', {}))).toEqual(['m1', 'c1', 'n1']);
  });

  it('filtra por universo, texto sin acentos, duración y precio máximo', () => {
    expect(ids(filtrarCatalogo(servicios, 'USD', { categoria: 'streaming' }))).toEqual(['c1']);
    expect(ids(filtrarCatalogo(servicios, 'USD', { texto: 'album' }))).toEqual(['n1']);
    expect(ids(filtrarCatalogo(servicios, 'USD', { texto: 'música' }))).toEqual(['m1']);
    expect(ids(filtrarCatalogo(servicios, 'USD', { duracion: '12-mes' }))).toEqual(['c12']);
    expect(ids(filtrarCatalogo(servicios, 'USD', { precioMax: 3 }))).toEqual(['n1']);
  });

  it('ordena por precio y por nombre', () => {
    expect(ids(filtrarCatalogo(servicios, 'USD', { orden: 'menor' }))).toEqual(['n1', 'm1', 'c1']);
    expect(ids(filtrarCatalogo(servicios, 'USD', { orden: 'mayor' }))).toEqual(['c1', 'm1', 'n1']);
    expect(ids(filtrarCatalogo(servicios, 'USD', { orden: 'az' }))).toEqual(['n1', 'c1', 'm1']);
  });
});
