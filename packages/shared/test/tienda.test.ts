import { describe, expect, it } from 'vitest';
import {
  ahorroCombo,
  type CatalogoPublico,
  categoriasTienda,
  claveDato,
  claveArte,
  duracionesCatalogo,
  etiquetaDuracion,
  etiquetaPlan,
  filtrarCatalogo,
  ofertaActiva,
  preciosVigentes,
  type PlanPublico,
  planMasBarato,
  datosDelPlan,
  revisarDatos,
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
    tipo: 'suscripcion',
    entrega: 'alquiler',
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
    oferta: null,
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
    expect(servicios[1]?.arte).toBe('/servicios/spotify.webp');
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

describe('tienda: compras únicas (juegos)', () => {
  it('nombra la opción por su nombre y no la cuenta como duración', () => {
    const s = { id: 's9', nombre: 'Free Fire', slug: 'free-fire' };
    const recarga = {
      ...plan('r1', s, '1.00', null, 1),
      nombre: '100 diamantes',
      tipo: 'recarga' as const,
    };
    expect(etiquetaPlan(recarga)).toBe('100 diamantes');
    expect(etiquetaPlan(plan('p1', s, '1.00', null, 3))).toBe('3 meses');
  });

  it('revisa los datos que pide el servicio', () => {
    const pedidos = [
      {
        clave: 'id-de-jugador',
        etiqueta: 'ID de jugador',
        ayuda: null,
        obligatorio: true,
        tipo: 'numero' as const,
        opciones: [],
        largo: 12,
      },
      {
        clave: 'servidor',
        etiqueta: 'Servidor',
        ayuda: null,
        obligatorio: false,
        tipo: 'texto' as const,
        opciones: [],
        largo: null,
      },
      {
        clave: 'acceso',
        etiqueta: 'Forma de acceso',
        ayuda: null,
        obligatorio: false,
        tipo: 'lista' as const,
        opciones: ['Activision', 'Facebook'],
        largo: null,
      },
    ];
    expect(revisarDatos(pedidos, {}).errores).toEqual({
      'id-de-jugador': 'Escribe ID de jugador.',
    });
    expect(revisarDatos(pedidos, { 'id-de-jugador': ' 123 ', otro: 'x' })).toEqual({
      limpios: { 'id-de-jugador': '123' },
      errores: {},
    });
    expect(claveDato('ID de jugador')).toBe('id-de-jugador');
    expect(revisarDatos(pedidos, { 'id-de-jugador': '12a' }).errores['id-de-jugador']).toBe(
      'Escribe solo números.',
    );
    expect(
      revisarDatos(pedidos, { 'id-de-jugador': '1234567890123' }).errores['id-de-jugador'],
    ).toBe('Máximo 12 caracteres.');
    expect(revisarDatos(pedidos, { 'id-de-jugador': '1', acceso: 'Google' }).errores).toEqual({
      acceso: 'Elige Forma de acceso de la lista.',
    });
    expect(revisarDatos(pedidos, { 'id-de-jugador': '1', acceso: 'Facebook' }).errores).toEqual({});
  });

  it('la activación en su correo pide correo y contraseña de su cuenta', () => {
    expect(datosDelPlan([], { tipo: 'suscripcion', entrega: 'alquiler' })).toEqual([]);
    const pide = datosDelPlan([], { tipo: 'suscripcion', entrega: 'activacion' });
    expect(pide.map((d) => d.tipo)).toEqual(['correo', 'clave']);
    expect(revisarDatos(pide, { 'correo-cuenta': 'yo@', 'clave-cuenta': 'x' }).errores).toEqual({
      'correo-cuenta': 'Escribe un correo válido.',
    });
    // Una recarga nunca pide la cuenta del cliente.
    expect(datosDelPlan([], { tipo: 'recarga', entrega: 'activacion' })).toEqual([]);
  });
});

describe('ahorroCombo', () => {
  const combo = {
    precios: { USD: '6.00', VES: '240.00', COP: null, EUR: null },
    sinCombo: { USD: '8.00', VES: '320.00', COP: null, EUR: null },
  } as unknown as Parameters<typeof ahorroCombo>[0];

  it('da el precio, lo que costaría por separado y el porcentaje redondeado hacia abajo', () => {
    expect(ahorroCombo(combo, 'VES')).toEqual({
      precio: '240.00',
      sinCombo: '320.00',
      porcentaje: 25,
    });
  });

  it('sin precio en la moneda o sin ahorro, no hay combo que mostrar', () => {
    expect(ahorroCombo(combo, 'COP')).toBeNull();
    expect(ahorroCombo({ ...combo, precios: { ...combo.precios, USD: '8.00' } }, 'USD')).toBeNull();
  });
});

describe('ofertas HOT', () => {
  const base = plan('o1', cine, '10.00', '400.00', 1);
  const enOferta = (hasta: string): PlanPublico => ({
    ...base,
    oferta: {
      porcentaje: 20,
      hasta,
      precios: { ...base.precios, USD: { precio: '8.00', fijo: false } },
    },
  });

  it('usa el precio rebajado mientras la oferta está vigente', () => {
    const futura = enOferta(new Date(Date.now() + 3600_000).toISOString());
    expect(ofertaActiva(futura)?.porcentaje).toBe(20);
    expect(preciosVigentes(futura).USD?.precio).toBe('8.00');
  });

  it('al vencer vuelve al precio normal aunque la página siga abierta', () => {
    const vencida = enOferta(new Date(Date.now() - 1000).toISOString());
    expect(ofertaActiva(vencida)).toBeNull();
    expect(preciosVigentes(vencida).USD?.precio).toBe('10.00');
  });

  it('el filtro «solo ofertas» deja los servicios con algún plan en oferta', () => {
    const futura = enOferta(new Date(Date.now() + 3600_000).toISOString());
    const cat: CatalogoPublico = {
      ...catalogo,
      planes: [...catalogo.planes.filter((p) => p.servicio.id !== cine.id), futura],
    };
    const r = filtrarCatalogo(serviciosTienda(cat), 'USD', { soloOfertas: true });
    expect(r.map((x) => x.plan.id)).toEqual(['o1']);
    expect(r[0]?.valor).toBe(8);
  });
});
