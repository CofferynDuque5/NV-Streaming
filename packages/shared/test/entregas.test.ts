import { describe, expect, it } from 'vitest';
import {
  AUTOMATIZACIONES,
  completarEntregaSchema,
  configurarEntregaSchema,
  leerCodigos,
  leerConfiguracionProveedor,
  MAX_CODIGOS_POR_LOTE,
  MENSAJE_SIN_CREDENCIALES,
  normalizarCodigo,
  PARAMETROS_AUTOMATIZACION,
  pareceCredenciales,
  ROLES,
  tienePermiso,
} from '../src/index.js';

describe('detección de usuario y contraseña', () => {
  it.each([
    'Usuario: maria@gmail.com\nContraseña: Streaming123',
    'user: juan pass: 1234',
    'Correo: ana@correo.com / clave: hola',
    'maria@gmail.com:Hola1234',
    'maria@gmail.com | Secreta#9',
    'Tu contraseña es Hola1234',
    'la clave es "perrito"',
    'PIN: 0000',
    'password=abc',
    'Entra en https://usuario:secreto@ejemplo.com/login',
    'https://ejemplo.com/entrar?password=abc',
    'Login: pedro\nY la contra la mando por privado',
    'Inicia sesión con el correo ana@correo.com / clave Secreta123',
    'contraseña 1234abcd',
  ])('rechaza «%s»', (texto) => {
    expect(pareceCredenciales(texto)).toBe(true);
  });

  it.each([
    'Abre https://nv.test/activar y pega tu código de activación. Tu servicio queda listo al instante.',
    'Si olvidaste tu contraseña, recupérala desde la app oficial con tu propio correo.',
    'Código de activación: ABCD-1234-EFGH',
    'Escribe a soporte@nvstreaming.com: te respondemos en 24 h.',
    'Descarga la app, elige «Canjear tarjeta» e ingresa el código que ves en tu panel.',
    'DEMO-XXXX-0001',
    'Spin: 3 vueltas', // «pin» dentro de otra palabra
    'Si olvidaste tu contraseña, escribe a soporte@nvstreaming.com.',
    'El PIN tiene 4 dígitos.',
    '',
  ])('acepta «%s»', (texto) => {
    expect(pareceCredenciales(texto)).toBe(false);
  });

  it('el formulario para completar una entrega rechaza credenciales con un mensaje claro', () => {
    const r = completarEntregaSchema.safeParse({
      instrucciones: 'Entra con usuario: pepe y contraseña: 12345 en la app.',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(MENSAJE_SIN_CREDENCIALES);
    const enlace = completarEntregaSchema.safeParse({
      instrucciones: 'Abre el enlace oficial para activar tu servicio.',
      enlace: 'https://pepe:clave@proveedor.example/activar',
    });
    expect(enlace.success).toBe(false);
    const http = completarEntregaSchema.safeParse({
      instrucciones: 'Abre el enlace oficial para activar tu servicio.',
      enlace: 'http://proveedor.example/activar',
    });
    expect(http.success).toBe(false);
    const ok = completarEntregaSchema.parse({
      instrucciones: 'Abre el enlace oficial para activar tu servicio.',
      enlace: 'https://proveedor.example/activar/abc',
      codigo: '',
    });
    expect(ok).toEqual({
      instrucciones: 'Abre el enlace oficial para activar tu servicio.',
      enlace: 'https://proveedor.example/activar/abc',
    });
  });
});

describe('lectura de lotes de códigos', () => {
  it('lee texto plano, ignora vacías, comentarios y cabecera, y descarta repetidos', () => {
    const r = leerCodigos(
      ['codigo', 'AAAA-1111', '', '# comentario', 'bbbb-2222', 'aaaa 1111', 'AAAA1111'].join('\n'),
    );
    expect(r.codigos).toEqual(['AAAA-1111', 'bbbb-2222']);
    expect(r.repetidos).toBe(2);
    expect(r.invalidos).toEqual([]);
    expect(r.excedeMaximo).toBe(false);
  });

  it('lee CSV (primera columna, con comillas) y marca inválidas sin repetir su texto', () => {
    const r = leerCodigos(
      [
        'Código;Lote',
        '"CCCC-3333";enero',
        'DDDD-4444,febrero',
        'ab',
        'usuario: x@y.com contraseña: 123',
        '"EE""EE-5555"\tmarzo',
      ].join('\r\n'),
    );
    expect(r.codigos).toEqual(['CCCC-3333', 'DDDD-4444', 'EE"EE-5555']);
    expect(r.invalidos).toEqual([
      { linea: 4, motivo: 'Es demasiado corto.' },
      { linea: 5, motivo: 'Parece un usuario y una contraseña.' },
    ]);
    expect(JSON.stringify(r.invalidos)).not.toContain('x@y.com');
  });

  it('avisa si el lote supera el máximo', () => {
    const texto = Array.from({ length: MAX_CODIGOS_POR_LOTE + 1 }, (_, i) => `COD-${i}`).join('\n');
    expect(leerCodigos(texto).excedeMaximo).toBe(true);
    expect(leerCodigos('A1B2C3', 0).excedeMaximo).toBe(true);
  });

  it('normaliza para comparar sin cambiar el código guardado', () => {
    expect(normalizarCodigo(' abcd-12 34 ')).toBe('ABCD1234');
    expect(normalizarCodigo('ＡＢＣＤ－１２３４')).toBe('ABCD1234');
  });
});

describe('configuración de entrega del proveedor', () => {
  it('exige la URL con el adaptador webhook y aplica valores por defecto', () => {
    expect(configurarEntregaSchema.safeParse({ adaptador: 'webhook' }).success).toBe(false);
    expect(configurarEntregaSchema.parse({ adaptador: 'codigos', webhookUrl: '' })).toEqual({
      adaptador: 'codigos',
      tiempoLimiteSegundos: 10,
      incluirCorreo: false,
      entregarRenovaciones: true,
    });
    expect(
      configurarEntregaSchema.safeParse({
        adaptador: 'codigos',
        instrucciones: 'Usuario: demo / Contraseña: demo123',
      }).success,
    ).toBe(false);
  });

  it('lee la configuración guardada con valores por defecto', () => {
    expect(leerConfiguracionProveedor(null)).toEqual({
      webhookUrl: null,
      tiempoLimiteSegundos: 10,
      incluirCorreo: false,
      entregarRenovaciones: true,
      instrucciones: null,
    });
    expect(leerConfiguracionProveedor({ tiempoLimiteSegundos: 999 }).tiempoLimiteSegundos).toBe(10);
  });
});

describe('permisos y automatización de entregas', () => {
  it('administración y operación ven y gestionan entregas; solo administración el inventario', () => {
    expect(ROLES.filter((r) => tienePermiso(r, 'entregas.ver'))).toEqual(['admin', 'operador']);
    expect(ROLES.filter((r) => tienePermiso(r, 'entregas.gestionar'))).toEqual([
      'admin',
      'operador',
    ]);
    expect(ROLES.filter((r) => tienePermiso(r, 'inventario.gestionar'))).toEqual(['admin']);
  });

  it('la alerta de pocos códigos es una tarea programada del equipo con su umbral', () => {
    const def = AUTOMATIZACIONES.stock_bajo_codigos;
    expect(def.grupo).toBe('equipo');
    expect(def.canales).toEqual(['correo']);
    expect(PARAMETROS_AUTOMATIZACION.stock_bajo_codigos.parse(def.parametrosPorDefecto)).toEqual({
      umbral: 10,
      hora: 9,
    });
    expect(
      PARAMETROS_AUTOMATIZACION.stock_bajo_codigos.safeParse({ umbral: 0, hora: 9 }).success,
    ).toBe(false);
  });
});
