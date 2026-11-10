'use client';

import type { DatoRequerido } from '@nv/shared';
import { Gamepad2 } from 'lucide-react';
import { useId } from 'react';
import { clasesEntrada } from '@/componentes/ui/clases';

/** Lo que pide cada plan del carrito: servicio, plan y sus datos. */
export interface PideDatos {
  planId: string;
  servicio: string;
  plan: string;
  datos: DatoRequerido[];
}

export type ValoresCompra = Record<string, Record<string, string>>;

/**
 * Datos que el cliente escribe para que se le entregue lo que compra (p. ej. el
 * ID de jugador de una recarga). Los errores llegan con la forma
 * `datos.<planId>.<clave>`, igual que los devuelve la API.
 */
export function DatosCompra({
  pedidos,
  valores,
  errores,
  alCambiar,
}: {
  pedidos: PideDatos[];
  valores: ValoresCompra;
  errores: Record<string, string>;
  alCambiar: (planId: string, clave: string, valor: string) => void;
}) {
  const id = useId();
  if (pedidos.length === 0) return null;
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-borde bg-white/[0.02] p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <Gamepad2 className="size-4 text-cian" aria-hidden="true" />
        Datos para la entrega
      </legend>
      <p className="text-xs text-tinta-tenue">
        Revísalos bien: con ellos hacemos la recarga o activamos tu compra.
      </p>
      {pedidos.map((p) => (
        <div key={p.planId} className="grid gap-2.5">
          {pedidos.length > 1 && (
            <p className="text-xs font-semibold text-tinta-suave">
              {p.servicio} · {p.plan}
            </p>
          )}
          {p.datos.map((d) => {
            const campo = `${id}-${p.planId}-${d.clave}`;
            const error = errores[`datos.${p.planId}.${d.clave}`];
            return (
              <div key={d.clave} className="grid gap-1">
                <label htmlFor={campo} className="text-sm font-medium">
                  {d.etiqueta}
                  {!d.obligatorio && (
                    <span className="font-normal text-tinta-tenue"> (opcional)</span>
                  )}
                </label>
                <input
                  id={campo}
                  className={clasesEntrada}
                  value={valores[p.planId]?.[d.clave] ?? ''}
                  onChange={(e) => alCambiar(p.planId, d.clave, e.currentTarget.value)}
                  maxLength={120}
                  autoComplete="off"
                  spellCheck={false}
                  required={d.obligatorio}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    [d.ayuda ? `${campo}-a` : null, error ? `${campo}-e` : null]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
                {d.ayuda && (
                  <p id={`${campo}-a`} className="text-xs text-tinta-tenue">
                    {d.ayuda}
                  </p>
                )}
                {error && (
                  <p id={`${campo}-e`} role="alert" className="text-xs font-medium text-peligro">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
