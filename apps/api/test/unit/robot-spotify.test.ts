import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leerCuentaSpotify } from '../../src/codigos/leer-spotify.js';
import { RobotProveedor } from '../../src/codigos/robot-proveedor.js';
import { ErrorSpotify, RobotSpotify, ritmoSpotify } from '../../src/codigos/robot-spotify.js';

const NAVEGADOR = [
  process.env['NAVEGADOR_PRUEBAS'],
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
].find((r) => r && existsSync(r));

const CODIGO = '482913';

/** Sitio parecido a Spotify: entrar con código de 6 dígitos, cuenta y plan familiar. */
function spotifyFalso() {
  const estado = { captcha: false, codigosPedidos: 0, pideClave: true };
  const pagina = (cuerpo: string) =>
    `<!doctype html><html lang="es"><body><main>${cuerpo}</main></body></html>`;
  const servidor = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const conSesion = /sp_dc=ok/.test(req.headers.cookie ?? '');
    const html = (codigo: number, cuerpo: string, extra: Record<string, string> = {}) => {
      res.writeHead(codigo, { 'content-type': 'text/html; charset=utf-8', ...extra });
      res.end(cuerpo);
    };
    if (url.pathname.startsWith('/account/')) {
      if (!conSesion) return html(302, '', { location: '/login' });
      if (url.pathname === '/account/overview/') {
        return html(
          200,
          pagina(
            '<h1>Tu cuenta</h1><section><h2>Tu plan</h2><p>Premium Familiar</p><p>Tu próxima factura es de US$ 10,99 y se cobrará el 5/12/26.</p></section>',
          ),
        );
      }
      if (url.pathname === '/account/family/') {
        return html(
          200,
          pagina(
            '<h1>Premium Familiar</h1><ul><li data-testid="member-row">Principal</li><li data-testid="member-row">Ana</li><li data-testid="member-row">Luis</li><li data-testid="invite-member">Invitar</li></ul>',
          ),
        );
      }
      return html(404, pagina('No existe'));
    }
    if (url.pathname === '/login') {
      if (estado.captcha)
        return html(
          200,
          pagina('<p>Confirma que no eres un robot</p><iframe title="reCAPTCHA"></iframe>'),
        );
      return html(
        200,
        pagina(`
          <input id="login-username" placeholder="Correo">
          <button id="login-button">Continuar</button>
          <div id="paso2"></div>
          <script>
            const paso2 = document.getElementById('paso2');
            const pedirCodigo = () => {
              fetch('/enviar-codigo', { method: 'POST' });
              paso2.innerHTML = '<p>Escribe el código de 6 dígitos</p><input autocomplete="one-time-code" id="otp" maxlength="6"><button id="entrar">Iniciar sesión</button>';
              document.getElementById('entrar').onclick = () => {
                location.href = '/verificar?codigo=' + document.getElementById('otp').value;
              };
            };
            document.getElementById('login-button').onclick = () => {
              document.getElementById('login-button').remove();
              if (${estado.pideClave}) {
                paso2.innerHTML = '<input type="password" id="login-password"><button id="sin-clave">Iniciar sesión sin contraseña</button>';
                document.getElementById('sin-clave').onclick = pedirCodigo;
              } else pedirCodigo();
            };
          </script>`),
      );
    }
    if (url.pathname === '/enviar-codigo') {
      estado.codigosPedidos++;
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === '/verificar') {
      if (url.searchParams.get('codigo') !== CODIGO) return html(200, pagina('Código incorrecto'));
      return html(302, '', { location: '/account/overview/', 'set-cookie': 'sp_dc=ok; Path=/' });
    }
    html(404, pagina('No existe'));
  });
  return { servidor, estado };
}

describe.skipIf(!NAVEGADOR)('robot de Spotify contra un sitio de prueba', () => {
  let servidor: Server;
  let estado: ReturnType<typeof spotifyFalso>['estado'];
  const base = new RobotProveedor();
  const robot = new RobotSpotify(base);

  beforeAll(async () => {
    process.env['NAVEGADOR_RUTA'] = NAVEGADOR!;
    ritmoSpotify(0.02);
    ({ servidor, estado } = spotifyFalso());
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    robot.urls = {
      cuenta: `${b}/account/overview/`,
      familia: `${b}/account/family/`,
      plan: `${b}/account/subscription/`,
      login: `${b}/login`,
    };
  });
  afterAll(async () => {
    ritmoSpotify(1);
    await base.onModuleDestroy();
    await new Promise((r) => servidor.close(r));
  });

  let sesion: string | null = null;

  it('entra con el código del correo y lee vencimiento y cupos', async () => {
    let desdeVisto: Date | null = null;
    const r = await robot.revisar({
      correo: 'familia1@serviciosnat.com',
      sesion: null,
      pedirCodigo: async (desde) => {
        desdeVisto = desde;
        return estado.codigosPedidos > 0 ? CODIGO : null;
      },
    });
    expect(desdeVisto).toBeInstanceOf(Date);
    expect(estado.codigosPedidos).toBe(1);
    expect(r.miembrosContados).toBe(3);
    expect(r.sesion).toContain('sp_dc');
    expect(leerCuentaSpotify(r.textoCuenta, r.textoFamilia, r.miembrosContados)).toMatchObject({
      situacion: 'al_dia',
      vencimiento: '2026-12-05',
      cuposUsados: 3,
      cuposTotal: 6,
    });
    // El diagnóstico no guarda correos ni números largos.
    expect(JSON.stringify(r.diagnostico)).not.toContain('serviciosnat');
    sesion = r.sesion;
  }, 120_000);

  it('con la sesión guardada no vuelve a pedir código', async () => {
    const r = await robot.revisar({
      correo: 'familia1@serviciosnat.com',
      sesion,
      pedirCodigo: async () => {
        throw new Error('no debía pedir código');
      },
    });
    expect(estado.codigosPedidos).toBe(1);
    expect(r.textoCuenta).toContain('Premium Familiar');
  }, 60_000);

  it('si no llega el código, avisa', async () => {
    estado.pideClave = false;
    const e = await robot
      .revisar({ correo: 'familia2@serviciosnat.com', sesion: null, pedirCodigo: async () => null })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorSpotify);
    expect((e as ErrorSpotify).motivo).toBe('SIN_CODIGO');
  }, 120_000);

  it('ante un captcha se detiene sin insistir', async () => {
    estado.captcha = true;
    const e = await robot
      .revisar({
        correo: 'familia3@serviciosnat.com',
        sesion: null,
        pedirCodigo: async () => CODIGO,
      })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorSpotify);
    expect((e as ErrorSpotify).motivo).toBe('CAPTCHA');
  }, 60_000);
});
