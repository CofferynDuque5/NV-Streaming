import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DiagnosticoSpotify } from '@nv/shared';
import type { Browser, BrowserContextOptions, Locator, Page } from 'playwright-core';
import { tapar } from './extraer-proveedor.js';
import { RobotProveedor } from './robot-proveedor.js';

/**
 * Entra a una cuenta Spotify con el código de inicio de sesión que llega al correo
 * y copia el texto de la página de la cuenta y la del plan familiar. Solo lee:
 * nunca cambia nada dentro de Spotify. Usa el mismo navegador que el robot de
 * ikercuentas y se comporta como una persona (teclea con pausas, mueve el mouse).
 * Nunca escribe en registros el correo, el código ni las cookies.
 * En las pruebas se reemplaza por uno falso.
 */

export interface PedidoSpotify {
  correo: string;
  /** Cookies guardadas (JSON de Playwright), o null para entrar de cero. */
  sesion: string | null;
  /** Busca en los buzones el código que Spotify mandó desde `desde`. null si no llegó. */
  pedirCodigo: (desde: Date) => Promise<string | null>;
}

export interface PaginasSpotify {
  textoCuenta: string;
  textoFamilia: string;
  /** Personas que se vieron en la lista del plan familiar, si se pudo contar. */
  miembrosContados: number | null;
  /** Cookies para la próxima vez. */
  sesion: string;
  diagnostico: DiagnosticoSpotify;
}

export type MotivoErrorSpotify = 'CAPTCHA' | 'SIN_CODIGO' | 'ENTRADA' | 'NAVEGADOR' | 'LECTURA';

/** Error con un mensaje que se puede mostrar al equipo (sin datos sensibles). */
export class ErrorSpotify extends Error {
  constructor(
    readonly motivo: MotivoErrorSpotify,
    mensaje: string,
    readonly diagnostico: DiagnosticoSpotify | null = null,
  ) {
    super(mensaje);
  }
}

export interface UrlsSpotify {
  cuenta: string;
  familia: string;
  plan: string;
  login: string;
}

const CUENTA = 'https://www.spotify.com/account/overview/';
/**
 * Proxy residencial por el que sale el robot de Spotify (SPOTIFY_PROXY en .env.produccion),
 * p. ej. «http://usuario:clave@geo.iproyal.com:12321». Sin él, sale con la IP del servidor,
 * y Spotify le pone captcha a los inicios de sesión desde servidores.
 * Con IPRoyal se pide una IP fija durante cada cuenta («_session-…_lifetime-30m») y, si se
 * indica SPOTIFY_PROXY_PAIS (p. ej. «ve»), una IP de ese país. Devuelve null si no hay proxy.
 */
export function proxySpotify(
  entorno: NodeJS.ProcessEnv = process.env,
  sesion: string = randomBytes(4).toString('hex'),
): BrowserContextOptions['proxy'] | null {
  const crudo = entorno['SPOTIFY_PROXY']?.trim();
  if (!crudo) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z0-9]+:\/\//i.test(crudo) ? crudo : `http://${crudo}`);
  } catch {
    return null;
  }
  let clave = decodeURIComponent(u.password);
  if (/iproyal/i.test(u.hostname) && clave) {
    const pais = entorno['SPOTIFY_PROXY_PAIS']?.trim().toLowerCase();
    if (pais && /^[a-z]{2}$/.test(pais) && !/_country-/i.test(clave)) clave += `_country-${pais}`;
    if (!/_session-/i.test(clave)) clave += `_session-${sesion}_lifetime-30m`;
  }
  return {
    server: `${u.protocol}//${u.host}`,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(clave ? { password: clave } : {}),
  };
}

/** Zona horaria del navegador según el país del proxy, para que coincida con la IP. */
const ZONAS: Record<string, string> = {
  in: 'Asia/Kolkata',
  ve: 'America/Caracas',
  co: 'America/Bogota',
  us: 'America/New_York',
  mx: 'America/Mexico_City',
  br: 'America/Sao_Paulo',
  es: 'Europe/Madrid',
};
export const zonaSpotify = (entorno: NodeJS.ProcessEnv = process.env) =>
  (entorno['SPOTIFY_PROXY']?.trim() &&
    ZONAS[entorno['SPOTIFY_PROXY_PAIS']?.trim().toLowerCase() ?? '']) ||
  'America/Caracas';

export const URLS_SPOTIFY: UrlsSpotify = {
  cuenta: CUENTA,
  familia: 'https://www.spotify.com/account/family/',
  plan: 'https://www.spotify.com/account/subscription/',
  login: `https://accounts.spotify.com/es/login?continue=${encodeURIComponent(CUENTA)}`,
};
/** Cuánto se espera el correo con el código. */
const ESPERA_CODIGO_MS = 150_000;

const CAMPO_CORREO = '#login-username, input[data-testid="login-username"], input[name="username"]';
const CAMPO_CLAVE = '#login-password, input[data-testid="login-password"], input[type="password"]';
const CAMPO_CODIGO = [
  'input[autocomplete="one-time-code"]',
  'input[data-testid*="otp" i]',
  'input[name*="code" i]',
  'input[id*="code" i]',
  'input[inputmode="numeric"]',
].join(', ');
const SIN_CLAVE =
  /sin contrase[nñ]a|without (a )?password|c[oó]digo de 6|6-digit code|enviar (un )?c[oó]digo|send (a )?code|con un c[oó]digo|with a code/i;
const CONTINUAR =
  /^(continuar|continue|siguiente|next|iniciar sesi[oó]n|log ?in|entrar|enviar|submit)$/i;
const CAPTCHA = /captcha|no eres un robot|not a robot|verifica que eres|challenge/i;

const azar = (min: number, max: number) => min + Math.random() * (max - min);
/** Multiplica todas las pausas (en las pruebas se acorta). */
let ritmo = 1;
export const ritmoSpotify = (r: number) => {
  ritmo = r;
};
const pausa = (min: number, max: number) =>
  new Promise((r) => setTimeout(r, Math.round(azar(min, max) * ritmo)));

function sinConsulta(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return '';
  }
}

async function textoDe(page: Page): Promise<string> {
  return page
    .locator('main')
    .first()
    .innerText({ timeout: 8_000 })
    .catch(() => page.locator('body').innerText({ timeout: 8_000 }))
    .catch(() => '');
}

async function diagnosticoDe(page: Page, paso: string): Promise<DiagnosticoSpotify> {
  const texto = await textoDe(page);
  return {
    paso,
    url: sinConsulta(page.url()),
    textos: texto
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 1)
      .slice(0, 40)
      .map(tapar),
    en: new Date().toISOString(),
  };
}

/** Mueve el mouse hasta el elemento como lo haría una persona y hace clic. */
async function clicHumano(page: Page, el: Locator) {
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  const caja = await el.boundingBox().catch(() => null);
  if (caja) {
    await page.mouse.move(
      caja.x + caja.width * azar(0.3, 0.7),
      caja.y + caja.height * azar(0.3, 0.7),
      { steps: Math.round(azar(8, 20)) },
    );
    await pausa(150, 450);
  }
  await el.click({ delay: Math.round(azar(40, 120)) });
}

/** Escribe letra por letra con pausas irregulares. */
async function teclear(page: Page, el: Locator, texto: string) {
  await clicHumano(page, el);
  await pausa(250, 700);
  for (const letra of texto) {
    await page.keyboard.type(letra, { delay: Math.round(azar(60, 180) * ritmo) });
    if (Math.random() < 0.08) await pausa(300, 800);
  }
}

async function visible(l: Locator, ms = 1_500): Promise<boolean> {
  return l
    .first()
    .waitFor({ state: 'visible', timeout: ms })
    .then(() => true)
    .catch(() => false);
}

/** Avisos legales de reCAPTCHA que salen siempre al pie del inicio de sesión: no son un reto. */
const AVISO_RECAPTCHA =
  /protegid[oa] por recaptcha|protected by recaptcha|recaptcha.*(google|privacidad|privacy|t[eé]rminos|terms)/i;

/**
 * ¿Spotify está pidiendo de verdad un captcha? El inicio de sesión carga siempre un
 * reCAPTCHA invisible (y su aviso al pie): eso no cuenta. Cuenta solo la página de reto,
 * un recuadro de captcha visible y de tamaño real, o un texto que lo pida.
 */
async function hayCaptcha(page: Page): Promise<boolean> {
  if (/challenge\.spotify\.com/i.test(page.url())) return true;
  const marcos = page.locator(
    'iframe[src*="captcha" i], iframe[title*="captcha" i], iframe[src*="arkoselabs" i], iframe[src*="funcaptcha" i]',
  );
  const n = await marcos.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const m = marcos.nth(i);
    const src = (await m.getAttribute('src').catch(() => null)) ?? '';
    if (/size=invisible/i.test(src)) continue;
    if (await m.evaluate((el) => !!el.closest('.grecaptcha-badge')).catch(() => false)) continue;
    if (!(await m.isVisible().catch(() => false))) continue;
    const caja = await m.boundingBox().catch(() => null);
    if (caja && caja.width >= 250 && caja.height >= 70) return true;
  }
  const t = await page
    .locator('body')
    .innerText({ timeout: 3_000 })
    .catch(() => '');
  const lineas = t.split('\n').filter((l) => !AVISO_RECAPTCHA.test(l));
  return CAPTCHA.test(lineas.join('\n')) && !/account|cuenta/i.test(sinConsulta(page.url()));
}

/** ¿Está en las páginas de la cuenta (ya entró)? */
const enLaCuenta = (page: Page) =>
  /\/([a-z-]+\/)?account\//i.test(sinConsulta(page.url()).replace(/^[^/]+/, ''));

@Injectable()
export class RobotSpotify {
  /** Direcciones de Spotify (en las pruebas, las de un sitio falso). */
  urls: UrlsSpotify = URLS_SPOTIFY;

  constructor(@Inject(RobotProveedor) private readonly base: RobotProveedor) {}

  /** Entra (o reusa la sesión) y copia las páginas de la cuenta y del plan. Un pedido a la vez. */
  revisar(p: PedidoSpotify): Promise<PaginasSpotify> {
    return this.base.usarNavegador((n) => this.revisarCon(n, p));
  }

  private async revisarCon(navegador: Browser, p: PedidoSpotify): Promise<PaginasSpotify> {
    let estado: BrowserContextOptions['storageState'];
    try {
      estado = p.sesion ? JSON.parse(p.sesion) : undefined;
    } catch {
      estado = undefined;
    }
    let ctx;
    try {
      const proxy = proxySpotify();
      ctx = await navegador.newContext({
        ...(proxy ? { proxy } : {}),
        storageState: estado,
        locale: 'es-419',
        timezoneId: zonaSpotify(),
        viewport: { width: 1366, height: 768 },
        extraHTTPHeaders: { 'Accept-Language': 'es-419,es;q=0.9,en;q=0.6' },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      });
    } catch {
      throw new ErrorSpotify('NAVEGADOR', 'No se pudo abrir el navegador del servidor.');
    }
    ctx.setDefaultTimeout(20_000);
    try {
      const page = await ctx.newPage();
      await page.goto(this.urls.cuenta, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      await pausa(1_500, 3_500);
      if (!enLaCuenta(page)) await this.entrar(page, p);

      const textoCuenta = await textoDe(page);
      await pausa(2_500, 6_000);
      await page.mouse.wheel(0, Math.round(azar(200, 600))).catch(() => undefined);
      await pausa(800, 2_000);

      // Algunas cuentas muestran la fecha solo en «Administrar tu plan».
      let textoPlan = '';
      if (!/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\b20\d\d\b/.test(textoCuenta)) {
        await page.goto(this.urls.plan, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
        await pausa(2_000, 4_000);
        if (enLaCuenta(page)) textoPlan = await textoDe(page);
      }

      await page.goto(this.urls.familia, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      await pausa(2_000, 4_500);
      let textoFamilia = '';
      let miembrosContados: number | null = null;
      if (enLaCuenta(page)) {
        textoFamilia = await textoDe(page);
        const n = await page
          .locator('[data-testid*="member" i]:not([data-testid*="invite" i])')
          .count()
          .catch(() => 0);
        miembrosContados = n > 0 && n <= 6 ? n : null;
      }
      const diagnostico = await diagnosticoDe(page, 'leida');
      if (!textoCuenta.trim()) {
        throw new ErrorSpotify(
          'LECTURA',
          'Entró a Spotify, pero la página de la cuenta salió vacía.',
          diagnostico,
        );
      }
      return {
        textoCuenta: textoPlan ? `${textoCuenta}\n${textoPlan}` : textoCuenta,
        textoFamilia,
        miembrosContados,
        sesion: JSON.stringify(await ctx.storageState()),
        diagnostico,
      };
    } catch (err) {
      if (err instanceof ErrorSpotify) throw err;
      throw new ErrorSpotify('LECTURA', 'Spotify tardó demasiado o cambió su página.');
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }

  /** Inicio de sesión con el código de 6 dígitos que llega al correo. */
  private async entrar(page: Page, p: PedidoSpotify) {
    if (!(await visible(page.locator(CAMPO_CORREO), 1_000))) {
      await page.goto(this.urls.login, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      await pausa(1_500, 3_000);
    }
    if (await hayCaptcha(page)) {
      throw new ErrorSpotify(
        'CAPTCHA',
        'Spotify pidió un captcha. Se detuvo para no insistir; prueba más tarde.',
        await diagnosticoDe(page, 'captcha'),
      );
    }
    const correo = page.locator(CAMPO_CORREO).first();
    if (!(await visible(correo, 10_000))) {
      throw new ErrorSpotify(
        'ENTRADA',
        'No apareció el campo del correo en Spotify.',
        await diagnosticoDe(page, 'sin_campo_correo'),
      );
    }
    await teclear(page, correo, p.correo);
    await pausa(600, 1_500);
    // El código se pide desde aquí: el correo que llegue antes no sirve.
    const desde = new Date(Date.now() - 30_000);
    await this.pulsarContinuar(page);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    await pausa(1_500, 3_000);

    // Si pide la clave, se elige entrar con un código.
    if (!(await visible(page.locator(CAMPO_CODIGO), 2_000))) {
      const sinClave = page
        .getByRole('button', { name: SIN_CLAVE })
        .or(page.getByRole('link', { name: SIN_CLAVE }));
      if (await visible(sinClave, 4_000)) {
        await clicHumano(page, sinClave.first());
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
        await pausa(1_500, 3_000);
      } else if (await visible(page.locator(CAMPO_CLAVE), 1_000)) {
        throw new ErrorSpotify(
          'ENTRADA',
          'Spotify pidió la clave y no ofreció entrar con código.',
          await diagnosticoDe(page, 'pide_clave'),
        );
      }
    }
    if (await hayCaptcha(page)) {
      throw new ErrorSpotify(
        'CAPTCHA',
        'Spotify pidió un captcha. Se detuvo para no insistir; prueba más tarde.',
        await diagnosticoDe(page, 'captcha'),
      );
    }
    const campo = page.locator(CAMPO_CODIGO);
    if (!(await visible(campo, 15_000))) {
      throw new ErrorSpotify(
        'ENTRADA',
        'Spotify no mostró dónde escribir el código.',
        await diagnosticoDe(page, 'sin_campo_codigo'),
      );
    }

    const codigo = await this.esperarCodigo(p, desde);
    if (!codigo) {
      throw new ErrorSpotify(
        'SIN_CODIGO',
        'No llegó el código de Spotify a los buzones (nathanstreamingcodigos@ o info@). Revisa que estén agregados en «Buzones».',
        await diagnosticoDe(page, 'sin_codigo'),
      );
    }
    await pausa(1_000, 2_500);
    // Un campo por dígito o uno solo: al teclear, el foco pasa al siguiente.
    await teclear(page, campo.first(), codigo);
    await pausa(800, 1_800);
    if (!enLaCuenta(page)) await this.pulsarContinuar(page).catch(() => undefined);
    await page
      .waitForURL((u) => /\/([a-z-]+\/)?account\//i.test(u.pathname), { timeout: 25_000 })
      .catch(() => undefined);
    if (!enLaCuenta(page)) {
      // Algunas veces se queda en open.spotify.com o en el inicio: se va directo a la cuenta.
      await page.goto(this.urls.cuenta, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    }
    if (!enLaCuenta(page)) {
      throw new ErrorSpotify(
        (await hayCaptcha(page)) ? 'CAPTCHA' : 'ENTRADA',
        'Spotify no dejó entrar con el código.',
        await diagnosticoDe(page, 'no_entro'),
      );
    }
    await pausa(1_500, 3_000);
  }

  private async pulsarContinuar(page: Page) {
    const boton = page.locator('#login-button, button[data-testid="login-button"]');
    if (await visible(boton, 1_500)) return clicHumano(page, boton.first());
    const otro = page.getByRole('button', { name: CONTINUAR });
    if (await visible(otro, 3_000)) return clicHumano(page, otro.first());
    await page.keyboard.press('Enter');
  }

  private async esperarCodigo(p: PedidoSpotify, desde: Date): Promise<string | null> {
    const limite = Date.now() + ESPERA_CODIGO_MS * Math.max(ritmo, 0.1);
    await pausa(8_000, 12_000);
    while (Date.now() < limite) {
      const c = await p.pedirCodigo(desde).catch(() => null);
      if (c) return c;
      await pausa(7_000, 11_000);
    }
    return null;
  }
}
