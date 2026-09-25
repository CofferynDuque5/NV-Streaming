import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorApi } from '@nv/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Error de negocio con un código estable y un mensaje para el usuario, en español. */
export class ErrorApp extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly campos?: Record<string, string[]>,
    readonly cabeceras?: Record<string, string>,
  ) {
    super(mensaje);
  }
}

export const Errores = {
  noAutenticado: () => new ErrorApp(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.'),
  sinPermiso: () =>
    new ErrorApp(403, 'SIN_PERMISO', 'No tienes permiso para realizar esta acción.'),
  noEncontrado: (que = 'El recurso') => new ErrorApp(404, 'NO_ENCONTRADO', `${que} no existe.`),
  pasoPendiente: (paso: string) =>
    new ErrorApp(
      403,
      'VERIFICACION_PENDIENTE',
      'Completa la verificación en dos pasos para continuar.',
      {
        paso: [paso],
      },
    ),
};

const CODIGO_POR_ESTADO: Record<number, string> = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  405: 'METODO_NO_PERMITIDO',
  409: 'CONFLICTO',
  413: 'CONTENIDO_DEMASIADO_GRANDE',
  415: 'TIPO_NO_ADMITIDO',
  429: 'DEMASIADOS_INTENTOS',
};

/**
 * Convierte cualquier error en `{ error: { codigo, mensaje } }`. Los errores
 * inesperados se registran con el id de la petición y nunca exponen detalles.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('Errores');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const respuesta = ctx.getResponse<FastifyReply>();
    const peticion = ctx.getRequest<FastifyRequest>();

    let estado = 500;
    let cuerpo: ErrorApi = {
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
      },
    };

    if (excepcion instanceof ErrorApp) {
      estado = excepcion.estado;
      cuerpo = {
        error: {
          codigo: excepcion.codigo,
          mensaje: excepcion.message,
          ...(excepcion.campos ? { campos: excepcion.campos } : {}),
        },
      };
      for (const [k, v] of Object.entries(excepcion.cabeceras ?? {})) respuesta.header(k, v);
    } else if (excepcion instanceof HttpException) {
      estado = excepcion.getStatus();
      const mensaje =
        estado === HttpStatus.NOT_FOUND
          ? 'La ruta solicitada no existe.'
          : 'La solicitud no es válida.';
      cuerpo = { error: { codigo: CODIGO_POR_ESTADO[estado] ?? 'ERROR', mensaje } };
    } else if (esErrorFastify(excepcion)) {
      estado = excepcion.statusCode;
      cuerpo = {
        error: {
          codigo: CODIGO_POR_ESTADO[estado] ?? 'SOLICITUD_INVALIDA',
          mensaje:
            estado === 413
              ? 'El contenido enviado es demasiado grande.'
              : 'La solicitud no es válida.',
        },
      };
    }

    if (estado >= 500) {
      this.logger.error(
        { idPeticion: peticion.id, ruta: peticion.url, err: excepcion },
        'Error no controlado',
      );
    }
    void respuesta.status(estado).send(cuerpo);
  }
}

function esErrorFastify(e: unknown): e is { statusCode: number } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'statusCode' in e &&
    typeof (e as { statusCode: unknown }).statusCode === 'number' &&
    (e as { statusCode: number }).statusCode >= 400 &&
    (e as { statusCode: number }).statusCode < 500
  );
}
