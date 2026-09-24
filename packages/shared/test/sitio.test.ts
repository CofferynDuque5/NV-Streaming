import { describe, expect, it } from 'vitest';
import {
  analizarTexto,
  BLOQUES_INICIO,
  contenidoPaginaSchema,
  contraste,
  crearPaginaSchema,
  enlaceSchema,
  esEnlaceSeguro,
  FONDOS_SITIO,
  guardarBorradorSchema,
  MAX_BLOQUES,
  PALETAS_SITIO,
  RUTA_PAGINA_REGEX,
  RUTAS_RESERVADAS,
  rutaPaginaSchema,
} from '../src/index.js';

const banner = (id: string) => ({ id, tipo: 'banner', texto: 'Aviso', tono: 'info' });

describe('enlaces del sitio', () => {
  it.each(['/', '/planes', '/#como-funciona', '/nosotros?x=1', 'https://nv.test/ayuda'])(
    'acepta %s',
    (url) => {
      expect(esEnlaceSeguro(url)).toBe(true);
      expect(enlaceSchema.safeParse(url).success).toBe(true);
    },
  );

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//malo.test',
    '/\\malo.test',
    'http://nv.test',
    'https://usuario:clave@nv.test',
    'https://',
    'ftp://nv.test',
    'planes',
    '#ancla',
    '/con espacio',
    'vbscript:msgbox',
    '',
  ])('rechaza %s', (url) => {
    expect(esEnlaceSeguro(url)).toBe(false);
    expect(enlaceSchema.safeParse(url).success).toBe(false);
  });

  it('rechaza un botón con un enlace peligroso', () => {
    const r = contenidoPaginaSchema.safeParse([
      {
        id: 'llama1',
        tipo: 'llamada',
        titulo: 'Hola',
        boton: { texto: 'Ir', enlace: 'javascript:alert(1)' },
      },
    ]);
    expect(r.success).toBe(false);
  });

  it('rechaza un texto con un enlace peligroso en el marcado', () => {
    const r = contenidoPaginaSchema.safeParse([
      { id: 'texto1', tipo: 'texto', contenido: 'Mira [esto](javascript:alert(1)) ahora' },
    ]);
    expect(r.success).toBe(false);
    const ok = contenidoPaginaSchema.safeParse([
      { id: 'texto1', tipo: 'texto', contenido: 'Mira [los planes](/planes) ahora' },
    ]);
    expect(ok.success).toBe(true);
  });
});

describe('bloques', () => {
  it(`admite hasta ${MAX_BLOQUES} bloques`, () => {
    const lista = (n: number) => Array.from({ length: n }, (_, i) => banner(`bloque${i}`));
    expect(contenidoPaginaSchema.safeParse(lista(MAX_BLOQUES)).success).toBe(true);
    expect(contenidoPaginaSchema.safeParse(lista(MAX_BLOQUES + 1)).success).toBe(false);
  });

  it('rechaza ids repetidos, tipos desconocidos y textos demasiado largos', () => {
    expect(contenidoPaginaSchema.safeParse([banner('abcd1'), banner('abcd1')]).success).toBe(false);
    expect(contenidoPaginaSchema.safeParse([{ id: 'abcd1', tipo: 'html' }]).success).toBe(false);
    expect(
      contenidoPaginaSchema.safeParse([{ ...banner('abcd1'), texto: 'x'.repeat(201) }]).success,
    ).toBe(false);
  });

  it('exige el texto alternativo de las imágenes', () => {
    const imagen = {
      id: 'imagen1',
      tipo: 'imagen',
      medioId: '0b6f7c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f',
    };
    expect(contenidoPaginaSchema.safeParse([{ ...imagen, alt: '  ' }]).success).toBe(false);
    expect(contenidoPaginaSchema.safeParse([{ ...imagen, alt: 'Panel de NV' }]).success).toBe(true);
  });

  it('la portada predeterminada es válida y no nombra servicios de terceros', () => {
    expect(contenidoPaginaSchema.safeParse(BLOQUES_INICIO).success).toBe(true);
    expect(JSON.stringify(BLOQUES_INICIO)).not.toMatch(/Netflix|Disney|HBO|Spotify/);
  });

  it('valida el borrador completo con la fecha de la versión editada', () => {
    const r = guardarBorradorSchema.safeParse({
      titulo: 'Inicio',
      bloques: [banner('abcd1')],
      borradorActualizadoEn: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });
});

describe('rutas de las páginas', () => {
  it.each(['/', '/nosotros', '/preguntas-frecuentes', '/ayuda/pagos-moviles', '/a1'])(
    'acepta %s',
    (ruta) => {
      expect(RUTA_PAGINA_REGEX.test(ruta)).toBe(true);
      expect(rutaPaginaSchema.safeParse(ruta).success).toBe(true);
    },
  );

  it.each(['/Nosotros ', 'nosotros', '/nosotros/'])('normaliza %s', (ruta) => {
    expect(rutaPaginaSchema.parse(ruta)).toBe('/nosotros');
  });

  it.each(['//x', '/a--b', '/-a', '/a-', '/a_b', '/á', '/a b', '/a/../b', '/a.html', '/%2e'])(
    'rechaza el formato de %s',
    (ruta) => {
      expect(rutaPaginaSchema.safeParse(ruta).success).toBe(false);
    },
  );

  it('rechaza las rutas que usa la aplicación', () => {
    for (const r of ['admin', 'cuenta', 'revendedor', 'api', 'planes', 'ingresar', 'marca']) {
      expect(RUTAS_RESERVADAS).toContain(r);
    }
    for (const ruta of ['/admin', '/admin/sitio', '/planes', '/registro', '/cuenta/x', '/api/v1']) {
      expect(rutaPaginaSchema.safeParse(ruta).success).toBe(false);
    }
    expect(crearPaginaSchema.safeParse({ ruta: '/terminos', titulo: 'T' }).success).toBe(false);
    expect(crearPaginaSchema.safeParse({ ruta: '/administracion', titulo: 'T' }).success).toBe(
      true,
    );
  });
});

describe('marcado del bloque de texto', () => {
  it('convierte párrafos, negritas, cursivas, listas y enlaces en un árbol', () => {
    const arbol = analizarTexto(
      'Hola **mundo** y *todos*.\nSegunda línea\n\n- uno\n- [dos](/planes)\n\n1. primero\n2. segundo',
    );
    expect(arbol).toEqual([
      {
        tipo: 'parrafo',
        hijos: [
          { tipo: 'texto', texto: 'Hola ' },
          { tipo: 'negrita', hijos: [{ tipo: 'texto', texto: 'mundo' }] },
          { tipo: 'texto', texto: ' y ' },
          { tipo: 'cursiva', hijos: [{ tipo: 'texto', texto: 'todos' }] },
          { tipo: 'texto', texto: '.' },
          { tipo: 'salto' },
          { tipo: 'texto', texto: 'Segunda línea' },
        ],
      },
      {
        tipo: 'lista',
        ordenada: false,
        elementos: [
          [{ tipo: 'texto', texto: 'uno' }],
          [{ tipo: 'enlace', href: '/planes', hijos: [{ tipo: 'texto', texto: 'dos' }] }],
        ],
      },
      {
        tipo: 'lista',
        ordenada: true,
        elementos: [[{ tipo: 'texto', texto: 'primero' }], [{ tipo: 'texto', texto: 'segundo' }]],
      },
    ]);
  });

  it('deja el HTML como texto literal', () => {
    const fuente = '<script>alert(1)</script> <b>hola</b> <img src=x onerror=alert(1)>';
    expect(analizarTexto(fuente)).toEqual([
      { tipo: 'parrafo', hijos: [{ tipo: 'texto', texto: fuente }] },
    ]);
  });

  it('quita el destino de los enlaces no permitidos', () => {
    expect(analizarTexto('[clic](javascript:alert(1))')).toEqual([
      {
        tipo: 'parrafo',
        hijos: [
          { tipo: 'texto', texto: 'clic' },
          { tipo: 'texto', texto: ')' },
        ],
      },
    ]);
    const nodos = JSON.stringify(analizarTexto('[a](//malo.test) [b](data:x) [c](http://x.test)'));
    expect(nodos).not.toContain('"enlace"');
  });

  it('respeta los caracteres escapados y no anida enlaces', () => {
    expect(analizarTexto('\\*no es cursiva\\*')).toEqual([
      { tipo: 'parrafo', hijos: [{ tipo: 'texto', texto: '*no es cursiva*' }] },
    ]);
    const [p] = analizarTexto('[[x](/a)](/b)');
    expect(JSON.stringify(p)).not.toMatch(/"enlace".*"enlace"/);
  });
});

describe('paletas del sitio', () => {
  it('el texto sobre el color de la marca cumple WCAG AA en los dos modos', () => {
    for (const [id, p] of Object.entries(PALETAS_SITIO)) {
      for (const modo of ['oscuro', 'claro'] as const) {
        const c = p[modo];
        const fondos = FONDOS_SITIO[modo];
        const casos = {
          'tinta/marca': contraste(c.marcaTinta, c.marca),
          'tinta/marca fuerte': contraste(c.marcaTinta, c.marcaFuerte),
          'marca/fondo': contraste(c.marca, fondos.fondo),
          'marca/superficie': contraste(c.marca, fondos.superficie),
          'acento/fondo': contraste(c.acento, fondos.fondo),
        };
        for (const [caso, valor] of Object.entries(casos)) {
          expect(valor, `${id} ${modo} ${caso}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('calcula el contraste como WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});
