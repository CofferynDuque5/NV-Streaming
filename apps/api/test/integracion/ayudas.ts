import { randomBytes } from 'node:crypto';
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

export async function crearContexto(): Promise<Contexto> {
  const entorno = cargarEntorno({
    NODE_ENV: 'test',
    DATABASE_URL: cargarVariables(),
    WEB_ORIGEN: ORIGEN,
    CLAVE_CIFRADO: randomBytes(32).toString('base64'),
    PROXIES_DE_CONFIANZA: '0',
    DOCS_API_HABILITADA: 'false',
  });
  const app = await crearAplicacion(entorno, { registros: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, prisma: app.get<PrismaClient>(PRISMA), entorno };
}

const TABLAS = [
  'codigos_respaldo',
  'tokens_un_uso',
  'sesiones',
  'auditoria',
  'limites_uso',
  'correos_salientes',
  'usuarios',
];

/** Vacía la base de pruebas. El registro de auditoría bloquea TRUNCATE: se desactiva solo aquí. */
export async function limpiar(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE auditoria DISABLE TRIGGER USER'),
    prisma.$executeRawUnsafe(`TRUNCATE ${TABLAS.join(', ')} CASCADE`),
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
