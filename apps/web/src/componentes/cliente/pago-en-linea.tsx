'use client';

import {
  formatearMonto,
  type IntentoPagoPublico,
  type OpcionesPagoEnLinea,
  type Pasarela,
} from '@nv/shared';
import { ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Casilla } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';

/**
 * Pago de una factura en la pasarela: el cliente elige la pasarela y, si quiere,
 * guarda el método para cobros automáticos aceptando el texto de autorización
 * completo. Los datos de la tarjeta o de la cuenta se escriben en la pasarela,
 * nunca aquí.
 */
export function PagarEnLinea({ datos }: { datos: OpcionesPagoEnLinea }) {
  const idTexto = useId();
  const { factura, opciones, textosAutorizacion } = datos;
  const [metodoId, setMetodoId] = useState(opciones[0]?.metodoCobroId ?? '');
  const [guardar, setGuardar] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const opcion = opciones.find((o) => o.metodoCobroId === metodoId);
  const texto = opcion ? textosAutorizacion[opcion.pasarela as Pasarela] : undefined;
  const puedeGuardar = Boolean(opcion?.admiteGuardar && texto);
  const guardando = puedeGuardar && guardar;

  async function pagar(e: FormEvent) {
    e.preventDefault();
    if (!opcion) return;
    if (guardando && !acepto) {
      setError({
        estado: 0,
        codigo: 'VALIDACION',
        mensaje: 'Para guardar el método tienes que aceptar la autorización de cobro.',
        campos: {
          aceptoAutorizacion: ['Para guardar el método tienes que aceptar la autorización.'],
        },
      });
      return;
    }
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
      setError({
        estado: 0,
        codigo: 'SIN_URL',
        mensaje: 'La pasarela no devolvió un enlace de pago. Inténtalo de nuevo en unos minutos.',
      });
      return;
    }
    // Se sale del sitio: el cliente paga en la página de la pasarela y vuelve a /cuenta/pagos/retorno.
    window.location.assign(r.datos.urlPago);
  }

  const campos = erroresPorCampo(error);

  return (
    <form onSubmit={pagar} className="grid gap-5" aria-label="Pagar en línea">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Elige la pasarela</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {opciones.map((o) => (
            <label
              key={o.metodoCobroId}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-borde-fuerte bg-hundida px-3.5 py-3 text-sm transition-colors has-checked:border-marca has-checked:bg-marca-suave"
            >
              <input
                type="radio"
                name="pasarela"
                value={o.metodoCobroId}
                checked={o.metodoCobroId === metodoId}
                onChange={() => {
                  setMetodoId(o.metodoCobroId);
                  setAcepto(false);
                }}
                className="accent-[var(--nv-marca)]"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{o.nombre}</span>
                <span className="text-xs text-tinta-tenue">
                  {nombrePasarela(o.pasarela)} · {o.moneda}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="flex items-start gap-2 text-sm text-tinta-suave">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-marca" aria-hidden="true" />
        <span>
          Te llevaremos a la página segura de {nombrePasarela(opcion?.pasarela)} para pagar{' '}
          <span className="font-medium text-tinta">
            {formatearMonto(factura.total, factura.moneda)}
          </span>
          . Los datos de tu tarjeta o de tu cuenta los escribes allí: NV Streaming nunca los ve ni
          los guarda.
        </span>
      </p>

      {puedeGuardar && (
        <div className="grid gap-3 rounded-xl border border-borde bg-elevada p-4">
          <Casilla
            name="guardarMetodo"
            checked={guardar}
            onChange={(e) => {
              setGuardar(e.currentTarget.checked);
              if (!e.currentTarget.checked) setAcepto(false);
            }}
            etiqueta="Guardar este método para cobros automáticos"
            ayuda="Opcional. Solo se usa en las suscripciones en las que tú actives el cobro automático, y puedes revocarlo cuando quieras."
          />
          {guardar && texto && (
            <div className="grid gap-3 border-t border-borde pt-3">
              <div className="grid gap-1.5">
                <p id={idTexto} className="flex items-center gap-1.5 text-sm font-medium">
                  <ShieldCheck className="size-4 text-marca" aria-hidden="true" />
                  Autorización de cobro automático
                </p>
                <blockquote
                  aria-labelledby={idTexto}
                  className="rounded-lg border border-borde bg-hundida px-3.5 py-3 text-sm leading-relaxed break-words text-tinta-suave"
                >
                  {texto}
                </blockquote>
              </div>
              <Casilla
                name="aceptoAutorizacion"
                required
                checked={acepto}
                onChange={(e) => setAcepto(e.currentTarget.checked)}
                etiqueta="Acepto y autorizo los cobros automáticos en estos términos"
                aria-invalid={campos.aceptoAutorizacion ? true : undefined}
              />
              {campos.aceptoAutorizacion && (
                <p className="text-xs font-medium text-peligro">{campos.aceptoAutorizacion}</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      {error?.campos && !campos.aceptoAutorizacion && (
        <Alerta tono="peligro">{error.mensaje}</Alerta>
      )}
      <Boton
        type="submit"
        cargando={cargando}
        disabled={!opcion || (guardando && !acepto)}
        icono={<ExternalLink className="size-4" aria-hidden="true" />}
        className="sm:justify-self-start"
      >
        Pagar {formatearMonto(factura.total, factura.moneda)} en línea
      </Boton>
    </form>
  );
}
