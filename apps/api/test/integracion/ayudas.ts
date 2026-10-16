import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient, Rol, Usuario } from '@nv/db';
import { generate } from 'otplib';
import { crearAplicacion } from '../../src/aplicacion.js';
import { hashContrasena } from '../../src/auth/contrasenas.js';
import { PRISMA } from '../../src/comun/tokens.js';
import { cargarEntorno, type Entorno } from '../../src/config/entorno.js';
import { cargarVariables } from './entorno-pruebas.js';

export const ORIGEN = 'http://localhost:3000';
export const CONTRASENA = 'Prueba-Segura-2026';

export interface Contexto {
  app: NestFastifyApplication;
  prisma: PrismaClient;
  entorno: Entorno;
}

export async function crearContexto(variables: Record<string, string> = {}): Promise<Contexto> {
  const entorno = cargarEntorno({
    NODE_ENV: 'test',
    DATABASE_URL: cargarVariables(),
    WEB_ORIGEN: ORIGEN,
    CLAVE_CIFRADO: randomBytes(32).toString('base64'),
    PROXIES_DE_CONFIANZA: '0',
    DOCS_API_HABILITADA: 'false',
    ALMACEN_DIR: mkdtempSync(join(tmpdir(), 'nv-almacen-')),
    ...variables,
  });
  const app = await crearAplicacion(entorno, { registros: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, prisma: app.get<PrismaClient>(PRISMA), entorno };
}

/** Vacía la base de pruebas. El registro de auditoría bloquea TRUNCATE: se desactiva solo aquí. */
export async function limpiar(prisma: PrismaClient): Promise<void> {
  const filas = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  const tablas = filas.map((f) => `"${f.tablename}"`).join(', ');
  await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE auditoria DISABLE TRIGGER USER'),
    prisma.$executeRawUnsafe(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE`),
    prisma.$executeRawUnsafe('ALTER TABLE auditoria ENABLE TRIGGER USER'),
  ]);
}

let contador = 0;

export async function crearUsuario(
  prisma: PrismaClient,
  datos: { rol?: Rol; correo?: string; verificado?: boolean } = {},
): Promise<Usuario> {
  contador += 1;
  return prisma.usuario.create({
    data: {
      correo: datos.correo ?? `persona${contador}@nv.test`,
      nombre: `Persona ${contador}`,
      rol: datos.rol ?? 'cliente',
      hashContrasena: await hashContrasena(CONTRASENA),
      correoVerificadoEn: datos.verificado === false ? null : new Date(),
    },
  });
}

/** Último enlace enviado a un correo (el sandbox guarda el texto). */
export async function tokenDelUltimoCorreo(prisma: PrismaClient, para: string): Promise<string> {
  const correo = await prisma.correoSaliente.findFirstOrThrow({
    where: { para },
    orderBy: { creadoEn: 'desc' },
  });
  const token = /token=([A-Za-z0-9_-]+)/.exec(correo.texto ?? '')?.[1];
  if (!token) throw new Error(`El último correo a ${para} no tiene enlace.`);
  return token;
}

/** Código TOTP del siguiente periodo: evita chocar con la protección contra reutilización. */
export function codigoTotp(secreto: string, periodosAdelante = 0): Promise<string> {
  return generate({
    secret: secreto,
    epoch: Math.floor(Date.now() / 1000) + periodosAdelante * 30,
  });
}

interface Respuesta<T = any> {
  estado: number;
  cuerpo: T;
  cabeceras: Record<string, unknown>;
}

/** Cliente HTTP que guarda la cookie de sesión como un navegador. */
export class Navegador {
  cookie: string | null = null;

  constructor(
    private readonly app: NestFastifyApplication,
    private readonly origen: string | null = ORIGEN,
  ) {}

  async pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    const r = await this.app.inject({
      method: metodo as 'GET',
      url: `/api/v1${ruta}`,
      headers: {
        ...(this.origen ? { origin: this.origen } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0',
      },
      ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
    });
    const setCookie = r.headers['set-cookie'];
    const galleta = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (galleta) {
      const [par] = galleta.split(';');
      this.cookie = par && !par.endsWith('=') ? par : null;
    }
    return { estado: r.statusCode, cuerpo: (r.body ? r.json() : null) as T, cabeceras: r.headers };
  }

  /** Envía un formulario multipart (campos de texto y, opcionalmente, un archivo). */
  async formulario<T = any>(
    ruta: string,
    campos: Record<string, string>,
    archivo?: { campo: string; nombre: string; tipo: string; contenido: Buffer },
  ): Promise<Respuesta<T>> {
    const limite = `----nv${randomBytes(8).toString('hex')}`;
    const partes: Buffer[] = [];
    for (const [k, v] of Object.entries(campos)) {
      partes.push(
        Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
      );
    }
    if (archivo) {
      partes.push(
        Buffer.from(
          `--${limite}\r\nContent-Disposition: form-data; name="${archivo.campo}"; filename="${archivo.nombre}"\r\nContent-Type: ${archivo.tipo}\r\n\r\n`,
        ),
        archivo.contenido,
        Buffer.from('\r\n'),
      );
    }
    partes.push(Buffer.from(`--${limite}--\r\n`));
    const r = await this.app.inject({
      method: 'POST',
      url: `/api/v1${ruta}`,
      headers: {
        ...(this.origen ? { origin: this.origen } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        'content-type': `multipart/form-data; boundary=${limite}`,
      },
      payload: Buffer.concat(partes),
    });
    return {
      estado: r.statusCode,
      cuerpo: (r.body ? r.json() : null) as T,
      cabeceras: r.headers,
    };
  }

  /** Descarga cruda (para comprobantes). */
  async descargar(ruta: string) {
    const r = await this.app.inject({
      method: 'GET',
      url: `/api/v1${ruta}`,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}) },
    });
    return { estado: r.statusCode, cabeceras: r.headers, cuerpo: r.rawPayload };
  }

  get = <T = any>(ruta: string) => this.pedir<T>('GET', ruta);
  post = <T = any>(ruta: string, cuerpo?: unknown) => this.pedir<T>('POST', ruta, cuerpo ?? {});
  patch = <T = any>(ruta: string, cuerpo?: unknown) => this.pedir<T>('PATCH', ruta, cuerpo ?? {});
  delete = <T = any>(ruta: string) => this.pedir<T>('DELETE', ruta);

  async entrar(correo: string, contrasena = CONTRASENA) {
    return this.post('/auth/inicio-sesion', { correo, contrasena });
  }

  /** Entra y, si el rol lo exige, configura la verificación en dos pasos. Devuelve el secreto TOTP. */
  async entrarCompleto(correo: string): Promise<string | null> {
    const r = await this.entrar(correo);
    if (r.estado !== 200) throw new Error(`No se pudo entrar: ${JSON.stringify(r.cuerpo)}`);
    if (r.cuerpo.pendiente !== 'configurar_2fa') return null;
    const { cuerpo } = await this.post('/cuenta/2fa/iniciar');
    const conf = await this.post('/cuenta/2fa/confirmar', {
      codigo: await codigoTotp(cuerpo.secreto),
    });
    if (conf.estado !== 200)
      throw new Error(`No se pudo configurar 2FA: ${JSON.stringify(conf.cuerpo)}`);
    return cuerpo.secreto as string;
  }
}

/** PNG mínimo válido de 1×1 píxel. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Crea una persona del rol indicado y devuelve un navegador con la sesión completa. */
export async function conectar(ctx: Contexto, rol: Rol, correo?: string) {
  const usuario = await crearUsuario(ctx.prisma, { rol, ...(correo ? { correo } : {}) });
  const n = new Navegador(ctx.app);
  await n.entrarCompleto(usuario.correo);
  return { usuario, n };
}

/**
 * Catálogo mínimo para las pruebas de cobro: un plan mensual de 5 USD, la tasa
 * VES = 40 y dos métodos de cobro (Pago Móvil en VES y Zelle en USD).
 */
export async function prepararCatalogo(admin: Navegador) {
  const proveedor = await admin.post('/catalogo/proveedores', {
    nombre: 'NV Propio',
    tipo: 'propio',
  });
  const servicio = await admin.post('/catalogo/servicios', {
    proveedorId: proveedor.cuerpo.id,
    nombre: 'NV Cine',
    slug: 'nv-cine',
  });
  const plan = await admin.post('/catalogo/planes', {
    servicioId: servicio.cuerpo.id,
    nombre: 'Mensual',
    precioUsd: '5.00',
    duracionCantidad: 1,
    duracionUnidad: 'mes',
    beneficios: ['HD', '2 pantallas'],
  });
  await admin.post('/finanzas/tasas', { moneda: 'VES', valor: '40' });
  const pagoMovil = await admin.post('/finanzas/metodos-cobro', {
    nombre: 'Pago Móvil',
    moneda: 'VES',
    instrucciones: 'Banco de prueba, teléfono 0414-0000000, RIF J-00000000-0',
  });
  const zelle = await admin.post('/finanzas/metodos-cobro', {
    nombre: 'Zelle',
    moneda: 'USD',
    instrucciones: 'Envía a pagos@example.com',
    requiereReferencia: false,
  });
  for (const r of [proveedor, servicio, plan, pagoMovil, zelle]) {
    if (r.estado !== 201) throw new Error(`Catálogo de prueba: ${JSON.stringify(r.cuerpo)}`);
  }
  return {
    planId: plan.cuerpo.id as string,
    servicioId: servicio.cuerpo.id as string,
    pagoMovilId: pagoMovil.cuerpo.id as string,
    zelleId: zelle.cuerpo.id as string,
  };
}

export const hoy = () => new Date().toISOString();
