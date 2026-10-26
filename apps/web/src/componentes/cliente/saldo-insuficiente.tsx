'use client';

import { formatearMonto } from '@nv/shared';
import { ArrowRight, Wallet } from 'lucide-react';
import Link from 'next/link';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';
import { Boton, clasesBoton } from '@/componentes/ui/boton';

/**
 * Aviso que se abre al tocar «pagar con saldo» cuando el saldo no alcanza: no
 * se puede pagar con la billetera hasta recargar. Muestra el saldo y lo que
 * falta tal como ya los mostró la página (cifras de la API) y lleva a recargar.
 * Modal nativo: el resto de la página queda inerte, Tab no sale del aviso,
 * Escape lo cierra y el foco vuelve a la opción que lo abrió. Se monta solo
 * mientras está abierto: Escape, el fondo y «Elegir otro método» llaman a
 * `alCerrar`, que lo desmonta.
 */
export function AvisoSaldoInsuficiente({
  alCerrar,
  origen,
  saldoUsd,
  faltanteUsd,
  que,
  enlaceRecarga,
  nota,
}: {
  alCerrar: () => void;
  /** Opción que lo abrió: recibe el foco al cerrar. */
  origen: RefObject<HTMLElement | null>;
  saldoUsd: string;
  faltanteUsd: string;
  /** Lo que se quería pagar: «este pedido», «esta factura». */
  que: string;
  enlaceRecarga: string;
  /** Qué pasa después de recargar. */
  nota: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ids = useId();

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
    // Al desmontarse (ya fuera de la página) el foco vuelve a la opción.
    const opcion = origen;
    return () => opcion.current?.focus();
  }, [origen]);

  // Tab y Mayús+Tab dan la vuelta dentro del aviso (no pasan a la barra del navegador).
  function atrapar(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return;
    const focos = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button')];
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (!primero || !ultimo) return;
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || !focos.includes(activo as HTMLElement))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (activo === ultimo || !focos.includes(activo as HTMLElement))) {
      e.preventDefault();
      primero.focus();
    }
  }

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={`${ids}-titulo`}
      aria-describedby={`${ids}-texto`}
      // Se cierra al momento (no con el evento «close», que llega después y
      // podría cerrar un aviso que se volvió a abrir con el teclado).
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClose={alCerrar}
      onKeyDown={atrapar}
      onClick={(e) => {
        // Un toque fuera de la tarjeta (en el fondo) también lo cierra.
        if (e.target === e.currentTarget) alCerrar();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-nv border border-borde-fuerte bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-[nv-entrar_.25s_ease]"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full border border-aviso/40 bg-aviso-suave text-aviso"
            aria-hidden="true"
          >
            <Wallet className="size-5" />
          </span>
          <div className="grid min-w-0 gap-1">
            <h2 id={`${ids}-titulo`} className="font-titulo text-lg font-bold">
              Tu saldo no alcanza
            </h2>
            <p id={`${ids}-texto`} className="text-sm text-tinta-suave">
              No puedes pagar {que} con tu billetera hasta que recargues.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2.5">
          <div className="grid min-w-0 gap-0.5 rounded-xl border border-borde bg-hundida/50 px-3.5 py-3">
            <dt className="text-xs text-tinta-suave">Tu saldo</dt>
            <dd className="truncate font-titulo text-lg font-bold tabular-nums">
              {formatearMonto(saldoUsd, 'USD')}
            </dd>
          </div>
          <div className="grid min-w-0 gap-0.5 rounded-xl border border-aviso/40 bg-aviso-suave px-3.5 py-3">
            <dt className="text-xs text-aviso">Te faltan</dt>
            <dd className="truncate font-titulo text-lg font-bold text-aviso tabular-nums">
              {formatearMonto(faltanteUsd, 'USD')}
            </dd>
          </div>
        </dl>

        <p className="text-[0.8rem] text-tinta-suave">{nota}</p>

        {/* Primero la acción principal (recibe el foco al abrir); en pantallas anchas va a la derecha. */}
        <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
          <Link href={enlaceRecarga} className={clasesBoton('primario', 'lg', 'w-full sm:w-auto')}>
            Recargar saldo
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Boton variante="fantasma" tamano="lg" className="w-full sm:w-auto" onClick={alCerrar}>
            Elegir otro método
          </Boton>
        </div>
      </div>
    </dialog>
  );
}
