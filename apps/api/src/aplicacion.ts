import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { Entorno } from './config/entorno.js';

const ID_PETICION_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;

/** Crea la aplicación configurada (la usan main.ts y las pruebas de integración). */
export async function crearAplicacion(entorno: Entorno, opciones: { registros?: boolean } = {}) {
  const adaptador = new FastifyAdapter({
    // Fastify acepta un número de saltos de proxy, aunque el tipo del adaptador no lo declare.
    trustProxy: entorno.PROXIES_DE_CONFIANZA as unknown as boolean,
    bodyLimit: 1024 * 1024,
    genReqId: (p: IncomingMessage) => {
      const cabecera = p.headers['x-request-id'];
      return typeof cabecera === 'string' && ID_PETICION_VALIDO.test(cabecera)
        ? cabecera
        : randomUUID();
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.con(entorno), adaptador, {
    logger: opciones.registros === false ? false : ['error', 'warn', 'log'],
  });

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    // La API solo devuelve JSON; la documentación necesita estilos y scripts propios.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (peticion, respuesta) => {
      void respuesta.header('x-request-id', peticion.id);
      if (!respuesta.hasHeader('cache-control')) void respuesta.header('cache-control', 'no-store');
    });

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  if (entorno.DOCS_API_HABILITADA) {
    const config = new DocumentBuilder()
      .setTitle('API de NV Streaming')
      .setDescription(
        'API modular de NV Streaming. Autenticación por cookie de sesión httpOnly; las peticiones que modifican datos deben enviar la cabecera Origin de la web.',
      )
      .setVersion('0.1.0')
      .addCookieAuth('nv_sesion')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config), {
      jsonDocumentUrl: 'api/docs/openapi.json',
    });
  }

  return app;
}
