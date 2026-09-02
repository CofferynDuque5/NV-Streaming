/**
 * errors.ts — Jerarquía de errores de aplicación (tipados, con código HTTP).
 *
 * Un único contrato de error para toda la app (principio de sustitución de
 * Liskov): cualquier error de negocio extiende `AppError` y expone `statusCode`
 * + `code` estables. El manejador central los traduce a HTTP sin `try/catch`
 * repetidos en cada controlador. Los errores NO-`AppError` se tratan como fallo
 * interno (500) y nunca filtran detalles al cliente.
 */

export interface DetalleError {
  campo?: string;
  mensaje: string;
}

interface OpcionesAppError {
  code: string;
  message: string;
  statusCode?: number;
  detalles?: readonly DetalleError[];
  causa?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly detalles?: readonly DetalleError[];
  readonly causa?: unknown;

  constructor(opciones: OpcionesAppError) {
    super(opciones.message);
    this.name = new.target.name;
    this.code = opciones.code;
    this.statusCode = opciones.statusCode ?? 400;
    if (opciones.detalles) this.detalles = opciones.detalles;
    if (opciones.causa !== undefined) this.causa = opciones.causa;
    Error.captureStackTrace?.(this, new.target);
  }

  /** Cuerpo seguro para responder al cliente (nunca incluye stack ni causa). */
  toJSON(): { error: string; mensaje: string; detalles?: readonly DetalleError[] } {
    const cuerpo: { error: string; mensaje: string; detalles?: readonly DetalleError[] } = {
      error: this.code,
      mensaje: this.message,
    };
    if (this.detalles) cuerpo.detalles = this.detalles;
    return cuerpo;
  }
}

/* ── Especializaciones por semántica HTTP (una clase por familia de fallo) ── */
export class ValidationError extends AppError {
  constructor(message = 'Datos de entrada inválidos.', detalles?: readonly DetalleError[]) {
    super({ code: 'validacion', message, statusCode: 400, ...(detalles ? { detalles } : {}) });
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado.') { super({ code: 'no_autenticado', message, statusCode: 401 }); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'No autorizado.') { super({ code: 'no_autorizado', message, statusCode: 403 }); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado.') { super({ code: 'no_encontrado', message, statusCode: 404 }); }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflicto con el estado actual.') { super({ code: 'conflicto', message, statusCode: 409 }); }
}
export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiadas peticiones. Inténtalo más tarde.') {
    super({ code: 'demasiadas_peticiones', message, statusCode: 429 });
  }
}
export class TimeoutError extends AppError {
  constructor(message = 'La petición tardó demasiado.') { super({ code: 'timeout', message, statusCode: 503 }); }
}

export function esAppError(valor: unknown): valor is AppError {
  return valor instanceof AppError;
}
