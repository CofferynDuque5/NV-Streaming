'use client';

import {
  formatearMonto,
  type IntentoPagoPublico,
  type OpcionPagoEnLinea,
  type OpcionesPagoEnLinea,
  type Pasarela,
} from '@nv/shared';
import clsx from 'clsx';
import { CircleAlert, LockKeyhole, ShieldCheck } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';

/**
 * Pago de una factura en la pasarela elegida. Si la pasarela lo admite, el
 * cliente puede guardar el método para cobros automáticos: el texto de la
 * autorización lo da la API y hay que aceptarlo de forma expresa. Los datos de
 * la tarjeta o de la cuenta se escriben en la pasarela, nunca aquí.
 */
export function AccionPagoEnLinea({
  datos,
  opcion,
}: {
  datos: OpcionesPagoEnLinea;
  opcion: OpcionPagoEnLinea;
}) {
  const idTexto = useId();
  const idError = useId();
  const { factura, textosAutorizacion } = datos;
  const [guardar, setGuardar] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const texto = textosAutorizacion[opcion.pasarela as Pasarela];
  const puedeGuardar = Boolean(opcion.admiteGuardar && texto);
  const guardando = puedeGuardar && guardar;
  const faltaAceptar = guardando && !acepto;
  const pasarela = nombrePasarela(opcion.pasarela);

  async function pagar(e: FormEvent) {
    e.preventDefault();
    if (faltaAceptar) return setIntento(true);
    setCargando(true);
    setError(null);
    const r = await llamarApi<IntentoPagoPublico>(
      'POST',
      `/mi/facturas/${factura.id}/pago-en-linea`,
      {
        metodoCobroId: opcion.metodoCobroId,
        guardarMetodo: guardando,
        aceptoAutorizacion: guardando && acepto,
      },
    );
    if (!r.ok) {
      setCargando(false);
      return setError(r.error);
    }
    if (!r.datos.urlPago) {
      setCargando(false);
      return setError({
        estado: 0,
        codigo: 'SIN_URL',
        mensaje: 'La pasarela no devolvió un enlace de pago. Inténtalo de nuevo en unos minutos.',
      });
    }
    // Se sale del sitio: el cliente paga en la pasarela y vuelve a /cuenta/pagos/retorno.
    window.location.assign(r.datos.urlPago);
  }

  return (
    <form onSubmit={pagar} className="grid gap-4" aria-label="Pagar en línea" noValidate>
      <p className="text-sm text-tinta-suave">
        Te llevamos a {pasarela} para pagar{' '}
        <b className="text-tinta">{formatearMonto(factura.total, factura.moneda)}</b>. Al volver, la
        factura queda pagada sin enviar comprobante.
      </p>

      {puedeGuardar ? (
        <div
          className={clsx(
            'grid gap-3 rounded-2xl border bg-hundida/60 p-4',
            intento && faltaAceptar ? 'border-peligro' : 'border-borde-fuerte',
          )}
        >
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={guardar}
              onChange={(e) => {
                setGuardar(e.currentTarget.checked);
                if (!e.currentTarget.checked) {
                  setAcepto(false);
                  setIntento(false);
                }
              }}
              className="mt-0.5 size-4.5 shrink-0 accent-[var(--nv-marca)]"
            />
            <span>
              Guardar {opcion.nombre} para cobrar solas mis renovaciones
              <small className="block text-xs text-tinta-suave">
                Opcional. Solo se usa en las suscripciones donde actives el cobro automático, y lo
                revocas cuando quieras.
              </small>
            </span>
          </label>
          {guardar && texto && (
            <>
              <p id={idTexto} className="flex items-center gap-1.5 text-sm font-semibold">
                <ShieldCheck className="size-4 text-marca" aria-hidden="true" />
                Autorización de cobro automático
              </p>
              <blockquote
                aria-labelledby={idTexto}
                className="rounded-xl border-l-[3px] border-marca bg-marca-suave px-3.5 py-3 text-[0.82rem] leading-relaxed break-words text-tinta-suave"
              >
                {texto}
              </blockquote>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={acepto}
                  onChange={(e) => setAcepto(e.currentTarget.checked)}
                  aria-invalid={intento && faltaAceptar ? true : undefined}
                  aria-describedby={intento && faltaAceptar ? idError : undefined}
                  className="mt-0.5 size-4.5 shrink-0 accent-[var(--nv-marca)]"
                />
                <span>Acepto y autorizo los cobros automáticos en estos términos</span>
              </label>
              {intento && faltaAceptar && (
                <p
                  id={idError}
                  role="alert"
                  className="flex items-center gap-1.5 text-xs font-medium text-peligro"
                >
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  Para guardar el método acepta la autorización, o desmarca la casilla de arriba.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-2.5 rounded-xl border border-borde bg-marca-suave/60 px-3.5 py-3 text-sm text-tinta-suave">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cian" aria-hidden="true" />
          {opcion.nombre} no guarda el método para cobros automáticos: cada renovación la pagas tú.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex gap-2 rounded-xl border border-peligro/30 bg-peligro-suave px-3.5 py-2.5 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-peligro" aria-hidden="true" />
          <span>{error.mensaje} Inténtalo de nuevo o elige otro método.</span>
        </p>
      )}
      <div className="grid gap-2">
        <Boton
          type="submit"
          tamano="lg"
          className="w-full"
          cargando={cargando}
          icono={<LockKeyhole className="size-4" aria-hidden="true" />}
        >
          {cargando ? `Te llevamos a ${pasarela}…` : `Pagar con ${opcion.nombre}`}
        </Boton>
        <p className="text-center text-xs text-tinta-tenue">
          Tus datos de pago quedan en {pasarela}. NV Streaming no los ve ni los guarda.
        </p>
      </div>
    </form>
  );
}
