import { describe, expect, it } from 'vitest';
import {
  ANCLAS_POLITICAS,
  analizarEnLinea,
  type CifrasPoliticas,
  CLAVE_CARRITO,
  clavesPorDefinir,
  COOKIE_AVISO_TASA,
  COOKIE_MONEDA,
  crearPaginaSchema,
  duracionLegible,
  enlacePoliticas,
  enumerar,
  NOMBRES_COOKIE_SESION,
  pendientesPorDefinir,
  POLITICAS,
  POR_DEFINIR,
  REGLAS_COBRO,
  textoPoliticas,
  textosPolitica,
  trozosPolitica,
} from '../src/index.js';

const CIFRAS: CifrasPoliticas = {
  cookieSesion: '__Host-nv_sesion',
  sesionHoras: 12,
  sesionInactividadMinutos: 120,
  comprobanteMaxMb: 5,
  revelarCodigos: { maximo: 30, ventanaSegundos: 3600 },
  reportarRecargas: { maximo: 10, ventanaSegundos: 3600 },
  recordatorioDias: [1, 7, 3],
  avisoGracia: true,
  avisoSuspension: true,
  avisoReactivacion: true,
  reintentosCobroDias: [5, 1, 3],
};

const todo = (doc: ReturnType<typeof textoPoliticas>) => textosPolitica(doc).join('\n');

describe('Políticas y términos', () => {
  const doc = textoPoliticas({ cifras: CIFRAS, whatsapp: true });

  it('tiene versión, fecha y las siete secciones con su ancla, en orden', () => {
    expect(doc.version).toBe(POLITICAS.version);
    expect(POLITICAS.vigenteDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.secciones.map((s) => s.id)).toEqual([...ANCLAS_POLITICAS]);
    expect(ANCLAS_POLITICAS).toEqual([
      'terminos',
      'privacidad',
      'reembolsos',
      'entregas',
      'revendedores',
      'cookies',
      'contacto',
    ]);
    expect(enlacePoliticas('privacidad')).toBe('/politicas#privacidad');
    expect(doc.esencial.length).toBeGreaterThanOrEqual(5);
  });

  it('usa cada dato por definir una vez, en el orden del archivo, y los cuenta', () => {
    expect(clavesPorDefinir(doc)).toEqual(Object.keys(POR_DEFINIR));
    expect(Object.keys(POR_DEFINIR)).toHaveLength(17);
    const faltan = Object.values(POR_DEFINIR).filter((d) => d.valor === null).length;
    expect(pendientesPorDefinir(doc)).toBe(faltan);
  });

  it('lee los plazos de las reglas de cobro', () => {
    const texto = todo(doc);
    expect(texto).toContain(`**${REGLAS_COBRO.diasGracia} días de gracia**`);
    expect(texto).toContain(`a los ${REGLAS_COBRO.diasSuspension} días suspendida`);
    expect(texto).toContain(`Tienes **${REGLAS_COBRO.diasParaPagar} días** para pagar`);
    expect(texto).toContain(`Caben hasta ${REGLAS_COBRO.articulosPorPedido} planes por pedido`);
    expect(texto).toContain(
      `hasta ${REGLAS_COBRO.pendientesPorCliente} suscripciones esperando pago`,
    );
  });

  it('nombra las cookies que pone el código, con su duración', () => {
    const filas = doc.secciones
      .flatMap((s) => s.bloques)
      .flatMap((b) => (b.tipo === 'cookies' ? b.filas : []));
    expect(filas.map((f) => f.nombre)).toEqual([
      '__Host-nv_sesion',
      COOKIE_MONEDA,
      COOKIE_AVISO_TASA,
      CLAVE_CARRITO,
    ]);
    expect(filas.map((f) => f.duracion)).toEqual([
      'Hasta 12 horas; se cierra tras 2 horas sin actividad',
      '1 año',
      '12 horas',
      'Hasta que vacíes el carrito',
    ]);
  });

  it('dice la configuración de la API: límites, comprobantes, avisos y reintentos', () => {
    const texto = todo(doc);
    expect(texto).toContain('hasta 30 veces por hora y reportar hasta 10 recargas');
    expect(texto).toContain('imagen o PDF de hasta 5 MB');
    expect(texto).toContain(
      'Te avisamos antes del vencimiento (7, 3 y 1 días antes), al entrar en gracia, al suspenderse y al reactivarse.',
    );
    expect(texto).toContain('se reintenta (1, 3 y 5 días después)');
  });

  it('calla lo que está apagado', () => {
    const apagado = todo(
      textoPoliticas({
        cifras: {
          ...CIFRAS,
          recordatorioDias: null,
          avisoReactivacion: false,
          reintentosCobroDias: null,
        },
        whatsapp: false,
      }),
    );
    expect(apagado).toContain('Te avisamos al entrar en gracia y al suspenderse.');
    expect(apagado).not.toContain('se reintenta');
    expect(apagado).not.toContain('por WhatsApp o con un ticket');
    expect(apagado).toContain(
      'con un ticket desde tu panel (pagos, acceso, suscripción, cuenta u otro tema)',
    );
  });

  it('sin respuesta de la API no da cifras que no conoce', () => {
    const sinApi = textoPoliticas({ cifras: null, whatsapp: true });
    const texto = todo(sinApi);
    expect(texto).not.toMatch(/\bMB\b|veces por hora|Te avisamos|se reintenta/);
    const sesion = sinApi.secciones
      .flatMap((s) => s.bloques)
      .flatMap((b) => (b.tipo === 'cookies' ? b.filas : []))[0];
    expect(sesion?.nombre).toBe(NOMBRES_COOKIE_SESION[0]);
    expect(sesion?.duracion).toBe('Mientras dure tu sesión');
    // Los plazos fijos del código siguen ahí.
    expect(texto).toContain(`**${REGLAS_COBRO.diasGracia} días de gracia**`);
  });

  it('separa los datos por definir del resto del texto', () => {
    expect(trozosPolitica('Edad mínima: {pd:edadMinima}')).toEqual([
      { tipo: 'texto', texto: 'Edad mínima: ' },
      { tipo: 'pd', clave: 'edadMinima' },
    ]);
    // Una clave que no existe se queda como texto.
    expect(trozosPolitica('{pd:noExiste}')).toEqual([{ tipo: 'texto', texto: '{pd:noExiste}' }]);
  });

  it('el enlace interno del texto es seguro para el marcado del sitio', () => {
    const nodos = analizarEnLinea('mira [Revendedores](/politicas#revendedores).');
    expect(nodos[1]).toMatchObject({ tipo: 'enlace', href: '/politicas#revendedores' });
  });

  it('el editor visual no puede ocupar /politicas', () => {
    expect(crearPaginaSchema.safeParse({ ruta: '/politicas', titulo: 'P' }).success).toBe(false);
  });
});

describe('formato del texto legal', () => {
  it('enumera con «y», «e», «o» y «u»', () => {
    expect(enumerar(['a'])).toBe('a');
    expect(enumerar(['a', 'b', 'c'])).toBe('a, b y c');
    expect(enumerar(['texto', 'imágenes'])).toBe('texto e imágenes');
    expect(enumerar(['dólares', 'euros'], 'o')).toBe('dólares o euros');
    expect(enumerar(['cuenta', 'otro tema'], 'o')).toBe('cuenta u otro tema');
  });

  it('escribe duraciones legibles', () => {
    expect(duracionLegible(365 * 24 * 3600)).toBe('1 año');
    expect(duracionLegible(12 * 3600)).toBe('12 horas');
    expect(duracionLegible(3600)).toBe('1 hora');
    expect(duracionLegible(90 * 60)).toBe('90 minutos');
    expect(duracionLegible(2 * 24 * 3600)).toBe('2 días');
  });
});
