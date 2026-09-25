import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { TrabajadorService } from './automatizaciones/trabajador.service.js';
import { cargarEntorno } from './config/entorno.js';

/**
 * Proceso trabajador: programa las automatizaciones, procesa la cola de
 * trabajos (avisos, renovaciones, tasa…) y pasa los vencimientos. Reutiliza los
 * servicios de la API sin levantar el servidor HTTP. Se pueden ejecutar varios:
 * la cola y las claves únicas evitan duplicados. Termina limpio con SIGTERM.
 */
// El temporizador de respaldo de la API nunca corre aquí: esto ya es el trabajador.
const entorno = { ...cargarEntorno(), VENCIMIENTOS_EN_API: false, ENTREGAS_EN_API: false };
const app = await NestFactory.createApplicationContext(AppModule.con(entorno), {
  logger: ['error', 'warn', 'log'],
});
app.enableShutdownHooks();
await app.get(TrabajadorService).iniciar();
new Logger('Trabajador').log('Esperando trabajos. Detén el proceso con SIGTERM o Ctrl+C.');
