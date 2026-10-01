import { Logger } from '@nestjs/common';
import { crearAplicacion } from './aplicacion.js';
import { cargarEntorno } from './config/entorno.js';

const entorno = cargarEntorno();
const app = await crearAplicacion(entorno);
await app.listen({ port: entorno.API_PUERTO, host: '0.0.0.0' });
new Logger('API').log(`Escuchando en http://localhost:${entorno.API_PUERTO}/api/v1`);
