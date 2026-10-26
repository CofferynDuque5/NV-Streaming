'use client';

import { formatearMonto, type Moneda } from '@nv/shared';
import { Check, Copy, RotateCcw, Undo2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto } from '@/componentes/ui/selector';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/** Texto de solo lectura con botón de copiar (p. ej. la URL de avisos de una pasarela). */
export function CopiarTexto({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2_000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-borde bg-hundida px-2.5 py-1.5 font-mono text-xs">
        {texto}
      </code>
      <Boton
        tamano="sm"
        variante="secundario"
        onClick={() => void copiar()}
        aria-label={`Copiar ${etiqueta}`}
        icono={
          copiado ? (
            <Check className="size-3.5 text-exito" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )
        }
      >
        <span aria-live="polite">{copiado ? 'Copiada' : 'Copiar'}</span>
      </Boton>
    </div>
  );
}

/** Vuelve a procesar un aviso de pasarela que quedó con error o sin procesar. */
export function ReprocesarEvento({ id }: { id: string }) {
  const { cargando, error, ejecutar } = useAccion();
  return (
    <div className="grid justify-items-end gap-1">
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={cargando}
        icono={<RotateCcw className="size-3.5" aria-hidden="true" />}
        onClick={() => void ejecutar('POST', `/eventos-pasarela/${id}/reprocesar`)}
      >
        Reprocesar
      </Boton>
      {error && <p className="max-w-48 text-right text-xs text-peligro">{error.mensaje}</p>}
    </div>
  );
}

function nuevaClave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Devolución total o parcial de un pago en línea a través de la pasarela. Lleva
 * una clave de idempotencia por formulario: si se reenvía, no se devuelve dos veces.
 */
export function DevolverPago({
  pagoId,
  moneda,
  disponible,
}: {
  pagoId: string;
  moneda: Moneda;
  /** Lo que aún se puede devolver (recibido menos lo ya devuelto). */
  disponible: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [parcial, setParcial] = useState(false);
  const [clave, setClave] = useState(nuevaClave);
  const [hecho, setHecho] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const monto = parcial ? textoDe(d, 'monto')?.replace(',', '.') : undefined;
    const motivo = textoDe(d, 'motivo') ?? '';
    const importe = formatearMonto(monto ?? disponible, moneda);
    if (
      !window.confirm(
        `¿Devolver ${importe} al cliente a través de la pasarela? El dinero sale de la cuenta de NV Streaming y no se puede deshacer.`,
      )
    )
      return;
    const r = await ejecutar(
      'POST',
      `/pagos/${pagoId}/reembolsos`,
      { ...(monto ? { monto } : {}), motivo },
      { 'idempotency-key': clave },
    );
    if (r) {
      setHecho(true);
      setAbierto(false);
      setParcial(false);
      setClave(nuevaClave());
    }
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          tamano="sm"
          variante="secundario"
          icono={<Undo2 className="size-3.5" aria-hidden="true" />}
          onClick={() => {
            setAbierto(true);
            setHecho(false);
          }}
        >
          Devolver
        </Boton>
        {hecho && (
          <p role="status" className="text-sm text-exito">
            Devolución solicitada. Aparece en la lista de devoluciones.
          </p>
        )}
      </div>
    );
  }

  return (
    <PanelFormulario
      titulo="Devolver pago"
      descripcion={`Se puede devolver hasta ${formatearMonto(disponible, moneda)}. El cliente recibe el dinero en su cuenta de la pasarela.`}
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-4" aria-label="Devolver pago" noValidate>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Importe a devolver</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [false, `Total (${formatearMonto(disponible, moneda)})`],
                [true, 'Parcial'],
              ] as const
            ).map(([valor, texto]) => (
              <label
                key={String(valor)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-borde-fuerte bg-hundida px-3 py-2 text-sm has-checked:border-marca has-checked:bg-marca-suave"
              >
                <input
                  type="radio"
                  name="alcance"
                  checked={parcial === valor}
                  onChange={() => setParcial(valor)}
                  className="accent-[var(--nv-marca)]"
                />
                {texto}
              </label>
            ))}
          </div>
        </fieldset>
        {parcial && (
          <Campo
            etiqueta={`Importe a devolver (${moneda})`}
            name="monto"
            inputMode="decimal"
            required
            autoComplete="off"
            placeholder="Ej. 5.00"
            error={campos.monto}
          />
        )}
        <AreaTexto
          etiqueta="Motivo"
          name="motivo"
          rows={2}
          required
          minLength={5}
          maxLength={500}
          ayuda="Queda registrado en la auditoría."
          error={campos.motivo}
        />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" variante="peligro" cargando={cargando}>
            Devolver dinero
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}
