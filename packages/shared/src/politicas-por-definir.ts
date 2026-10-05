/**
 * Datos de las Políticas y términos (/politicas) que solo puede dar el dueño de
 * NV Streaming, con su abogado. El código no los define, así que no se inventan:
 * mientras `valor` sea `null`, la página muestra en su lugar una etiqueta ámbar
 * «Por definir» con el `tema`.
 *
 * Cómo completar uno:
 * 1. Escribe en `valor` el texto tal como debe leerse en la página, en el lugar
 *    que dice `donde`. Admite **negrita** y [enlaces](/ruta).
 * 2. Sube la versión y la fecha de `POLITICAS` (politicas.ts): cada cliente queda
 *    registrado con la versión que aceptó al crear su cuenta.
 * 3. Cuando el abogado apruebe el texto, pon `REVISION_LEGAL_PENDIENTE` en `false`
 *    para quitar el aviso de borrador.
 */
export interface DatoPorDefinir {
  /** Qué falta, tal como se lee en la etiqueta «Por definir». */
  tema: string;
  /** Sección y apartado de la página donde va. */
  donde: string;
  /** Texto definitivo; `null` mientras falte. */
  valor: string | null;
}

const DATOS = {
  vendedor: {
    tema: 'razón social, RIF y domicilio de quien vende',
    donde: 'Términos de uso › Quién vende',
    valor: null,
  },
  edadMinima: {
    tema: 'edad mínima y si un menor puede comprar con permiso',
    donde: 'Términos de uso › Tu cuenta',
    valor: null,
  },
  motivosSuspension: {
    tema: 'motivos por los que se suspende una cuenta',
    donde: 'Términos de uso › Suspensión de cuentas',
    valor: null,
  },
  avisoCambios: {
    tema: 'cómo y con cuánta anticipación avisamos los cambios importantes',
    donde: 'Términos de uso › Cambios y ley aplicable',
    valor: null,
  },
  leyAplicable: {
    tema: 'ley aplicable y tribunales competentes',
    donde: 'Términos de uso › Cambios y ley aplicable',
    valor: null,
  },
  otrosTerceros: {
    tema: 'si se comparten datos con otros terceros (contador, autoridades) y en qué casos',
    donde: 'Privacidad › Con quién se comparten',
    valor: null,
  },
  copiaBorrado: {
    tema: 'cómo pedir una copia de tus datos o borrar tu cuenta',
    donde: 'Privacidad › Lo que puedes hacer',
    valor: null,
  },
  conservacion: {
    tema: 'plazo de conservación de tus datos, pagos y comprobantes',
    donde: 'Privacidad › Cuánto tiempo los guardamos',
    valor: null,
  },
  devolucionManual: {
    tema: 'cómo y en qué plazo se devuelve un pago manual (a tu cuenta o como saldo de la billetera)',
    donde: 'Pagos y reembolsos › Reembolsos › Pagos manuales',
    valor: null,
  },
  saldoBilletera: {
    tema: 'si el saldo se puede retirar y si vence',
    donde: 'Pagos y reembolsos › Reembolsos › Saldo de la billetera',
    valor: null,
  },
  casosReembolso: {
    tema: 'casos y plazo para pedir un reembolso (por ejemplo, si no se pudo activar tu servicio)',
    donde: 'Pagos y reembolsos › Reembolsos › Cuándo procede',
    valor: null,
  },
  tiempoEntrega: {
    tema: 'tiempo máximo de entrega según el tipo de servicio',
    donde: 'Entregas › Tiempo de entrega',
    valor: null,
  },
  codigoFalla: {
    tema: 'qué hacemos (reposición o reembolso) y en qué plazo',
    donde: 'Entregas › Si un código no funciona',
    valor: null,
  },
  requisitosRevendedor: {
    tema: 'requisitos para aprobar una solicitud',
    donde: 'Revendedores › Solicitud',
    valor: null,
  },
  suspensionRevendedor: {
    tema: 'motivos de suspensión de un revendedor',
    donde: 'Revendedores › Suspensión',
    valor: null,
  },
  responsableDatos: {
    tema: 'persona o correo responsable de los datos y de los reclamos',
    donde: 'Contacto › Privacidad y reclamos',
    valor: null,
  },
  direccion: {
    tema: 'dirección física',
    donde: 'Contacto › Dirección para notificaciones',
    valor: null,
  },
} satisfies Record<string, DatoPorDefinir>;

export type ClavePorDefinir = keyof typeof DATOS;

/** Los datos que faltan, en el orden en que aparecen en la página. */
export const POR_DEFINIR: Record<ClavePorDefinir, DatoPorDefinir> = DATOS;

/** `true` mientras un abogado no haya revisado el texto: la página lo avisa arriba. */
export const REVISION_LEGAL_PENDIENTE: boolean = true;
