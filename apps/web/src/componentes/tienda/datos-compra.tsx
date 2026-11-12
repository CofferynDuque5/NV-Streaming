'use client';

import type { DatoRequerido } from '@nv/shared';
import { Gamepad2 } from 'lucide-react';
import { useId } from 'react';
import { clasesEntrada } from '@/componentes/ui/clases';

/** Lo que pide cada plan del carrito: servicio, plan y sus datos. */
export interface PideDatos {
  planId: string;
  /** Id del servicio: con él se recuerdan los datos que ya escribió (ID de jugador…). */
  servicioId: string;
  servicio: string;
  plan: string;
  datos: DatoRequerido[];
}

export type ValoresCompra = Record<string, Record<string, string>>;

const llaveGuardada = (servicioId: string) => `nv:datos-jugador:${servicioId}`;

/**
 * Lo que el cliente escribió la última vez para este servicio (en este
 * navegador). Nunca guarda contraseñas.
 */
export function datosRecordados(servicioId: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(llaveGuardada(servicioId)) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

export function recordarDatos(
  servicioId: string,
  pedidos: DatoRequerido[],
  valores: Record<string, string>,
) {
  const sinClaves = Object.fromEntries(
    pedidos
      .filter((d) => d.tipo !== 'clave' && valores[d.clave])
      .map((d) => [d.clave, valores[d.clave]!.slice(0, 120)]),
  );
  try {
    localStorage.setItem(llaveGuardada(servicioId), JSON.stringify(sinClaves));
  } catch {
    // Sin almacenamiento (modo privado): solo no se recuerda.
  }
}

/** Un dato que pide el servicio, con el teclado y el control que le tocan. */
export function CampoDato({
  dato: d,
  campo,
  valor,
  error,
  alCambiar,
}: {
  dato: DatoRequerido;
  campo: string;
  valor: string;
  error?: string | undefined;
  alCambiar: (valor: string) => void;
}) {
  const describe =
    [d.ayuda ? `${campo}-a` : null, error ? `${campo}-e` : null].filter(Boolean).join(' ') ||
    undefined;
  const comunes = {
    id: campo,
    className: clasesEntrada,
    value: valor,
    required: d.obligatorio,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describe,
  } as const;
  const tipo = d.tipo ?? 'texto';
  return (
    <div className="grid gap-1">
      <label htmlFor={campo} className="text-sm font-medium">
        {d.etiqueta}
        {!d.obligatorio && <span className="font-normal text-tinta-tenue"> (opcional)</span>}
      </label>
      {tipo === 'lista' ? (
        <select {...comunes} onChange={(e) => alCambiar(e.currentTarget.value)}>
          <option value="">Elige una opción</option>
          {(d.opciones ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...comunes}
          type={tipo === 'correo' ? 'email' : tipo === 'clave' ? 'password' : 'text'}
          inputMode={tipo === 'numero' ? 'numeric' : tipo === 'correo' ? 'email' : undefined}
          pattern={tipo === 'numero' ? '[0-9]*' : undefined}
          maxLength={d.largo ?? 120}
          autoComplete={tipo === 'correo' ? 'email' : tipo === 'clave' ? 'off' : 'off'}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) =>
            alCambiar(
              tipo === 'numero' ? e.currentTarget.value.replace(/\D/g, '') : e.currentTarget.value,
            )
          }
        />
      )}
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
}

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
        Revísalos bien: con ellos hacemos la recarga o activamos tu compra. Las contraseñas se
        guardan cifradas.
      </p>
      {pedidos.map((p) => (
        <div key={p.planId} className="grid gap-2.5">
          {pedidos.length > 1 && (
            <p className="text-xs font-semibold text-tinta-suave">
              {p.servicio} · {p.plan}
            </p>
          )}
          {p.datos.map((d) => (
            <CampoDato
              key={d.clave}
              dato={d}
              campo={`${id}-${p.planId}-${d.clave}`}
              valor={valores[p.planId]?.[d.clave] ?? ''}
              error={errores[`datos.${p.planId}.${d.clave}`]}
              alCambiar={(v) => alCambiar(p.planId, d.clave, v)}
            />
          ))}
        </div>
      ))}
    </fieldset>
  );
}
