import { existsSync } from 'node:fs';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { AccionProveedor, DiagnosticoConector, PlataformaProveedor } from '@nv/shared';
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Dialog,
  Locator,
  Page,
  Response,
} from 'playwright-core';
import { hayRespuesta, leerRespuestaProveedor, tapar, textosDeJson } from './extraer-proveedor.js';

/**
 * Navegador automático que entra al panel de un proveedor de cuentas
 * (ikercuentas.com) con el usuario del negocio y pulsa los botones de códigos.
 * Nunca escribe en registros el usuario, la clave, las cookies ni los códigos.
 * En las pruebas se reemplaza por uno falso.
 */

export interface PedidoRobot {
  urlBase: string;
  usuario: string;
  clave: string;
  /** Cookies guardadas (JSON de Playwright), o null para entrar de cero. */
  sesion: string | null;
  /**
   * Se llama cuando el panel pide aprobar la IP («Nuevo dispositivo detectado»).
   * Devuelve el enlace de aprobación que llegó al correo desde `desde`, o null si no llegó.
   */
  aprobar: (desde: Date) => Promise<string | null>;
}

export interface PedidoBoton extends PedidoRobot {
  correoCuenta: string;
  plataforma: PlataformaProveedor;
  accion: AccionProveedor;
}

export interface RespuestaRobot {
  /** Lo que mostró o respondió el panel tras pulsar (avisos, ventanas, JSON). */
  textos: string[];
  /** Cookies nuevas para la próxima vez (null si no cambiaron). */
  sesion: string | null;
  diagnostico: DiagnosticoConector;
}

export type MotivoErrorRobot =
  'CREDENCIALES' | 'APROBACION' | 'NO_ENCONTRADA' | 'SIN_BOTON' | 'NAVEGADOR' | 'PANEL';

/** Error con un mensaje que se puede mostrar al equipo (sin datos sensibles). */
export class ErrorRobot extends Error {
  constructor(
    readonly motivo: MotivoErrorRobot,
    mensaje: string,
    readonly diagnostico: DiagnosticoConector | null = null,
    /** Cookies vigentes aunque falle el paso siguiente (p. ej. ya se aprobó la IP). */
    readonly sesion: string | null = null,
  ) {
    super(mensaje);
  }
}

/** Ruta del Chromium del sistema (en la imagen Docker: apk add chromium). */
const rutaNavegador = () =>
  [process.env['NAVEGADOR_RUTA'], '/usr/bin/chromium-browser', '/usr/bin/chromium'].find(
    (r): r is string => Boolean(r) && existsSync(r!),
  ) ?? '/usr/bin/chromium';
/** Cierra el navegador tras este tiempo sin uso, para liberar memoria. */
const INACTIVO_MS = 5 * 60_000;
/** Cuánto se espera la respuesta del panel después de pulsar un botón. */
const ESPERA_RESPUESTA_MS = 45_000;

const TEXTO_BOTON: Record<Exclude<AccionProveedor, 'sobre'>, RegExp> = {
  code: /^code$/i,
  code6: /^code\s*6$/i,
  link: /^link$/i,
  hogar: /hogar/i,
};
const PESTANA: Record<PlataformaProveedor, RegExp | null> = {
  netflix: null,
  disney: /disney/i,
  hbo: /hbo|max/i,
};
const SECCION: Record<PlataformaProveedor, RegExp> = {
  netflix: /^\s*cuentas\s*$/i,
  disney: /^\s*plataformas\s*$/i,
  hbo: /^\s*plataformas\s*$/i,
};
/** Avisos y ventanas que suelen mostrar los paneles (sonner, toastify, sweetalert, radix…). */
const SELECTOR_AVISOS = [
  '[data-sonner-toast]',
  '[role="status"]',
  '[role="alert"]',
  '[role="alertdialog"]',
  '[role="dialog"]',
  '.Toastify__toast',
  '.toast',
  '.swal2-popup',
  '.modal.show',
  '.notification',
].join(',');

const DISPOSITIVO_NUEVO = /nuevo dispositivo|aprueba la ip|revisa tu correo|approve/i;
const CREDENCIALES_MAL = /incorrect|inv[aá]lid|invalid|no coincide|wrong|credenciales/i;

interface BotonFila {
  texto: string;
  titulo: string;
  icono: string;
}

/** Lo que cuenta como botón en una fila: botones, enlaces y elementos con clic. */
const CLICABLES = 'button, a, [role="button"], [onclick]';
/** Emojis de correo que algunos paneles usan como botón. */
const EMOJI_CORREO = /[\u2709\u{1F4E7}\u{1F4E8}\u{1F4E9}\u{1F48C}\u{1F4EC}\u{1F4EB}]/u;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function diagnostico(paso: string, extra: Partial<DiagnosticoConector> = {}): DiagnosticoConector {
  return { paso, rutas: [], botones: [], avisos: [], en: new Date().toISOString(), ...extra };
}

@Injectable()
export class RobotProveedor implements OnModuleDestroy {
  private navegador: Browser | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  /** Un solo pedido a la vez: el panel y la memoria del servidor lo agradecen. */
  private cola: Promise<unknown> = Promise.resolve();

  async onModuleDestroy() {
    await this.cerrar();
  }

  private async cerrar() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    const n = this.navegador;
    this.navegador = null;
    await n?.close().catch(() => undefined);
  }

  private async abrir(): Promise<Browser> {
    if (this.temporizador) clearTimeout(this.temporizador);
    if (this.navegador?.isConnected()) return this.navegador;
    try {
      const { chromium } = await import('playwright-core');
      this.navegador = await chromium.launch({
        executablePath: rutaNavegador(),
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch {
      throw new ErrorRobot(
        'NAVEGADOR',
        'No se pudo abrir el navegador del servidor. Actualiza el servidor e inténtalo de nuevo.',
      );
    }
    return this.navegador;
  }

  private enCola<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.cola.then(fn, fn);
    this.cola = r.catch(() => undefined);
    return r.finally(() => {
      if (this.temporizador) clearTimeout(this.temporizador);
      this.temporizador = setTimeout(() => void this.cerrar(), INACTIVO_MS);
      this.temporizador.unref();
    });
  }

  private async contexto(p: PedidoRobot): Promise<{ ctx: BrowserContext; host: string }> {
    const host = new URL(p.urlBase).hostname.toLowerCase();
    const navegador = await this.abrir();
    let estado: BrowserContextOptions['storageState'];
    try {
      estado = p.sesion ? JSON.parse(p.sesion) : undefined;
    } catch {
      estado = undefined;
    }
    const ctx = await navegador.newContext({
      storageState: estado,
      locale: 'es-ES',
      viewport: { width: 1366, height: 900 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    });
    ctx.setDefaultTimeout(15_000);
    // Sin imágenes ni videos: carga más rápido y gasta menos memoria.
    await ctx.route('**/*', (r) =>
      ['image', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue(),
    );
    return { ctx, host };
  }

  /** Entra (o confirma la sesión guardada). Devuelve las cookies vigentes. */
  entrar(p: PedidoRobot): Promise<{ sesion: string; diagnostico: DiagnosticoConector }> {
    return this.enCola(async () => {
      const { ctx } = await this.contexto(p);
      try {
        const page = await ctx.newPage();
        await this.iniciarSesion(page, p);
        return {
          sesion: JSON.stringify(await ctx.storageState()),
          diagnostico: diagnostico('sesion_iniciada', { rutas: [new URL(page.url()).pathname] }),
        };
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });
  }

  /** Entra, busca la cuenta, pulsa el botón y junta lo que responde el panel. */
  pulsar(p: PedidoBoton): Promise<RespuestaRobot> {
    return this.enCola(async () => {
      const { ctx, host } = await this.contexto(p);
      let sesion: string | null = null;
      try {
        const page = await ctx.newPage();
        await this.iniciarSesion(page, p);
        sesion = JSON.stringify(await ctx.storageState());
        try {
          return { ...(await this.pulsarEnFila(page, p, host)), sesion };
        } catch (err) {
          if (err instanceof ErrorRobot) {
            throw new ErrorRobot(err.motivo, err.message, err.diagnostico, sesion);
          }
          throw err;
        }
      } catch (err) {
        if (err instanceof ErrorRobot) throw err;
        throw new ErrorRobot(
          'PANEL',
          'El panel del proveedor no respondió como esperábamos.',
          diagnostico('error_inesperado'),
          sesion,
        );
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });
  }

  // ── Pasos ────────────────────────────────────────────────────────────────

  private async pideClave(page: Page): Promise<boolean> {
    return page
      .locator('input[type="password"]')
      .first()
      .isVisible()
      .catch(() => false);
  }

  private async llenarYEntrar(page: Page, p: PedidoRobot) {
    const correo = page
      .locator(
        'input[type="email"], input[name*="mail" i], input[autocomplete="username"], input[name*="user" i]',
      )
      .first();
    const campoCorreo = (await correo.count())
      ? correo
      : page.locator('input:not([type="password"]):not([type="hidden"])').first();
    await campoCorreo.fill(p.usuario);
    await page.locator('input[type="password"]').first().fill(p.clave);
    const boton = page
      .locator('button[type="submit"], button, input[type="submit"]')
      .filter({ hasText: /entrar|ingresar|iniciar|acceder|login|sign in/i })
      .first();
    if (await boton.count()) await boton.click();
    else await page.locator('input[type="password"]').first().press('Enter');
  }

  /** Qué pasó tras pulsar «Entrar»: adentro, pide aprobar la IP o clave mala. */
  private async resultadoEntrada(page: Page): Promise<'dentro' | 'aprobar' | 'credenciales'> {
    const limite = Date.now() + 20_000;
    while (Date.now() < limite) {
      await espera(700);
      const texto = await page
        .locator('body')
        .innerText()
        .catch(() => '');
      if (DISPOSITIVO_NUEVO.test(texto)) return 'aprobar';
      if (!(await this.pideClave(page))) return 'dentro';
      if (CREDENCIALES_MAL.test(texto)) return 'credenciales';
    }
    return (await this.pideClave(page)) ? 'credenciales' : 'dentro';
  }

  private async iniciarSesion(page: Page, p: PedidoRobot) {
    await page.goto(p.urlBase, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {
      throw new ErrorRobot('PANEL', 'No se pudo abrir el panel del proveedor.');
    });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    if (!(await this.pideClave(page))) {
      // ¿La portada es pública y hay que ir al acceso?
      const acceso = page
        .locator('a, button')
        .filter({ hasText: /^\s*(entrar|ingresar|iniciar sesi[oó]n|login)\s*$/i })
        .first();
      if (!(await acceso.count())) return;
      await acceso.click().catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      if (!(await this.pideClave(page))) return;
    }
    const desde = new Date(Date.now() - 60_000);
    await this.llenarYEntrar(page, p);
    let r = await this.resultadoEntrada(page);
    if (r === 'aprobar') {
      let enlace: string | null = null;
      let motivo: string | null = null;
      try {
        enlace = await p.aprobar(desde);
      } catch (err) {
        motivo = err instanceof Error ? err.message : null;
      }
      if (!enlace) {
        throw new ErrorRobot(
          'APROBACION',
          motivo
            ? `El proveedor pidió aprobar la IP del servidor. ${motivo}`
            : 'El proveedor pidió aprobar la IP del servidor y el correo no llegó a tiempo. Revisa el reenvío y el filtro, y vuelve a probar.',
          diagnostico('esperando_aprobacion'),
        );
      }
      const aprobacion = await page.context().newPage();
      await aprobacion
        .goto(enlace, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        .catch(() => undefined);
      await espera(1500);
      await aprobacion.close().catch(() => undefined);
      await page.goto(p.urlBase, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      if (await this.pideClave(page)) {
        await this.llenarYEntrar(page, p);
        r = await this.resultadoEntrada(page);
      } else {
        r = 'dentro';
      }
      if (r === 'aprobar') {
        throw new ErrorRobot(
          'APROBACION',
          'Se abrió el enlace de aprobación pero el proveedor sigue pidiendo aprobar la IP. Apruébala a mano desde el correo y vuelve a probar.',
          diagnostico('aprobacion_rechazada'),
        );
      }
    }
    if (r === 'credenciales') {
      throw new ErrorRobot(
        'CREDENCIALES',
        'El proveedor no aceptó el correo o la clave guardados.',
        diagnostico('credenciales'),
      );
    }
  }

  private async irASeccion(page: Page, urlBase: string, plataforma: PlataformaProveedor) {
    const enlace = page
      .locator('a, button, [role="link"]')
      .filter({ hasText: SECCION[plataforma] });
    if (await enlace.count()) {
      await enlace.first().click();
    } else {
      // El panel usa rutas con «#» (ikercuentas.com/#cuentas).
      await page.goto(`${urlBase}/#${plataforma === 'netflix' ? 'cuentas' : 'plataformas'}`, {
        waitUntil: 'domcontentloaded',
      });
    }
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await espera(800);
    const pestana = PESTANA[plataforma];
    if (pestana) {
      const tab = page.locator('[role="tab"], button, a').filter({ hasText: pestana }).first();
      if (await tab.count()) {
        await tab.click();
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await espera(800);
      }
    }
  }

  private async buscarFila(page: Page, correo: string): Promise<Locator> {
    // El buscador (la lupa): «Buscar por email...».
    const buscador = page
      .locator(
        'input[type="search"], input[placeholder*="buscar" i], input[placeholder*="email" i], input[placeholder*="correo" i], input[placeholder*="search" i]',
      )
      .filter({ visible: true })
      .first();
    if (await buscador.count()) {
      await buscador.fill(correo);
      await buscador.press('Enter').catch(() => undefined);
      await espera(1500);
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
    }
    const conBotones = 'xpath=ancestor-or-self::*[count(.//button | .//a | .//*[@role="button"] | .//*[@onclick]) >= 2][1]';
    // La fila de la tabla si la hay; si no, el primer contenedor con al menos dos botones.
    const filaDe = async (celda: Locator) => {
      const tr = celda.locator('xpath=ancestor-or-self::tr[1]');
      return (await tr.count()) ? tr : celda.locator(conBotones);
    };
    for (let intento = 0; intento < 3; intento++) {
      // 1) El correo completo en el texto o en un título (las celdas largas se cortan con «…»).
      const texto = page.getByText(correo, { exact: false }).first();
      if (await texto.count()) return filaDe(texto);
      const titulo = page.locator(`[title="${correo.replace(/"/g, '')}" i]`).first();
      if (await titulo.count()) return filaDe(titulo);
      // 2) El buscador dejó una sola fila: es esa.
      const filas = page.locator('tbody tr, [role="row"]:has(button)').filter({ visible: true });
      if (buscador && (await buscador.count()) && (await filas.count()) === 1) return filas.first();
      await espera(1500);
    }
    throw new ErrorRobot(
      'NO_ENCONTRADA',
      'Esa cuenta no aparece en el panel del proveedor.',
      diagnostico('cuenta_no_encontrada'),
    );
  }

  private async botonesDe(fila: Locator): Promise<BotonFila[]> {
    return fila.locator(CLICABLES).evaluateAll((els) =>
      els.map((el) => ({
        texto: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        titulo: [
          el.getAttribute('title'),
          el.getAttribute('aria-label'),
          el.getAttribute('data-tooltip'),
          el.getAttribute('data-tip'),
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 60),
        icono: [
          el.getAttribute('class') ?? '',
          ...Array.from(
            el.querySelectorAll('svg, i, img, use, span') as unknown as ArrayLike<{
              getAttribute(n: string): string | null;
            }>,
          ).map((i) =>
            ['class', 'data-icon', 'alt', 'src', 'href', 'xlink:href']
              .map((a) => i.getAttribute(a) ?? '')
              .join(' '),
          ),
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
          .slice(0, 200),
      })),
    );
  }

  private elegirBoton(botones: BotonFila[], accion: AccionProveedor): number {
    if (accion !== 'sobre') {
      const patron = TEXTO_BOTON[accion];
      const i = botones.findIndex((b) => patron.test(b.texto) || patron.test(b.titulo));
      return i;
    }
    // El sobre: emoji o ícono de correo, o título de código/correo.
    const porEmoji = botones.findIndex((b) => EMOJI_CORREO.test(b.texto + b.titulo));
    if (porEmoji >= 0) return porEmoji;
    const porIcono = botones.findIndex((b) => /mail|envelope|sobre|correo|inbox/i.test(b.icono));
    if (porIcono >= 0) return porIcono;
    const porTitulo = botones.findIndex((b) => /c[oó]digo|correo|mail|code/i.test(b.titulo));
    if (porTitulo >= 0) return porTitulo;
    // Si no, el único botón sin palabras (solo ícono) que no sea de otra cosa.
    const otros = /renov|copi|edit|elimin|borr|ojo|eye|pais|activar|hogar|link|^code/i;
    const soloIcono = botones
      .map((b, i) => ({ b, i }))
      .filter(
        ({ b }) =>
          !/\p{L}{2,}/u.test(b.texto) && !otros.test(`${b.texto} ${b.titulo} ${b.icono}`),
      );
    return soloIcono.length === 1 ? soloIcono[0]!.i : -1;
  }

  private async pulsarEnFila(
    page: Page,
    p: PedidoBoton,
    host: string,
  ): Promise<Omit<RespuestaRobot, 'sesion'>> {
    await this.irASeccion(page, p.urlBase, p.plataforma);
    const fila = await this.buscarFila(page, p.correoCuenta);
    const botones = await this.botonesDe(fila);
    const nombres = botones
      .map((b) => b.texto || b.titulo || `(ícono ${b.icono.slice(0, 40)})`)
      .slice(0, 15);
    const indice = this.elegirBoton(botones, p.accion);
    if (indice < 0) {
      throw new ErrorRobot(
        'SIN_BOTON',
        'No encontramos ese botón en la fila de la cuenta.',
        diagnostico('sin_boton', { botones: nombres }),
      );
    }

    const textos: string[] = [];
    const rutas: string[] = [];
    const vistos = new Set<string>();
    const alResponder = async (r: Response) => {
      const req = r.request();
      if (!['xhr', 'fetch'].includes(req.resourceType())) return;
      let url: URL;
      try {
        url = new URL(r.url());
      } catch {
        return;
      }
      if (url.hostname !== host && !url.hostname.endsWith(`.${host}`)) return;
      rutas.push(`${req.method()} ${url.pathname}`.slice(0, 120));
      const cuerpo = await r.text().catch(() => '');
      if (cuerpo.length > 0 && cuerpo.length < 20_000) textos.push(...textosDeJson(cuerpo));
    };
    const alDialogo = (d: Dialog) => {
      textos.push(d.message());
      void d.dismiss().catch(() => undefined);
    };
    const alAbrir = (nueva: Page) => {
      textos.push(nueva.url());
      void nueva.close().catch(() => undefined);
    };
    page.on('response', alResponder);
    page.on('dialog', alDialogo);
    page.context().on('page', alAbrir);
    try {
      await fila.locator(CLICABLES).nth(indice).click();
      const limite = Date.now() + ESPERA_RESPUESTA_MS;
      while (Date.now() < limite) {
        await espera(600);
        const avisos = await page
          .locator(SELECTOR_AVISOS)
          .evaluateAll((els) =>
            els
              .map((e) => {
                // Sin tipos del DOM en el servidor: se leen como objetos simples.
                const enlaces = Array.from(e.querySelectorAll('a[href]')).map(
                  (a) => (a as unknown as { href: string }).href,
                );
                const campos = Array.from(e.querySelectorAll('input, textarea')).map(
                  (c) => (c as unknown as { value: string }).value,
                );
                const texto = (e as unknown as { innerText: string }).innerText;
                return [texto, ...enlaces, ...campos].join('\n');
              })
              .filter((t) => t.trim()),
          )
          .catch(() => [] as string[]);
        for (const a of avisos) {
          if (!vistos.has(a)) {
            vistos.add(a);
            textos.push(a);
          }
        }
        if (hayRespuesta(leerRespuestaProveedor(p.accion, textos, host))) break;
      }
    } finally {
      page.off('response', alResponder);
      page.off('dialog', alDialogo);
      page.context().off('page', alAbrir);
    }
    return {
      textos,
      diagnostico: diagnostico('boton_pulsado', {
        rutas: [...new Set(rutas)].slice(0, 15),
        botones: nombres,
        avisos: [...vistos].map(tapar).slice(0, 8),
      }),
    };
  }
}
