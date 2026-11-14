'use client';

import { type PlanPublico } from '@nv/shared';
import clsx from 'clsx';
import { Check, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Interruptor } from '@/componentes/ui/interruptor';
import { formatearDuracion } from '@/lib/formato';
import { ErrorGeneral, useAccion } from './piezas';

const claseEntrada =
  'h-10 w-full min-w-0 rounded-xl border border-borde bg-hundida px-3 text-sm tabular-nums text-tinta placeholder:text-tinta-tenue focus:border-marca focus:outline-none';

/** Un interruptor con su texto al lado, que guarda solo al tocarlo. */
function Opcion({
  etiqueta,
  activo,
  onCambiar,
  cargando,
}: {
  etiqueta: string;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  cargando: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-tinta-suave">
      <Interruptor activo={activo} onCambiar={onCambiar} cargando={cargando} aria-label={etiqueta} />
      {etiqueta}
    </label>
  );
}

/**
 * Un plan del servicio en una fila: nombre, precio para el cliente, precio
 * para revendedores y los interruptores de venta. Los interruptores se guardan
 * al tocarlos; nombre y precios con «Guardar».
 */
function FilaPlan({ plan }: { plan: PlanPublico }) {
  const { cargando, error, campos, ejecutar } = useAccion();
  const [cambiando, setCambiando] = useState<string | null>(null);
  const variosNiveles = plan.precioRevendedorUsd === 'varios';
  const inicial = {
    nombre: plan.nombre,
    precio: String(plan.precioUsd),
    revendedor: variosNiveles ? '' : String(plan.precioRevendedorUsd ?? ''),
  };
  const [valores, setValores] = useState(inicial);
  const [guardado, setGuardado] = useState(false);
  const sucio =
    valores.nombre !== inicial.nombre ||
    valores.precio !== inicial.precio ||
    valores.revendedor !== inicial.revendedor;

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardado(false);
    const cuerpo: Record<string, unknown> = {};
    if (valores.nombre !== inicial.nombre) cuerpo.nombre = valores.nombre;
    if (valores.precio !== inicial.precio) cuerpo.precioUsd = valores.precio;
    if (valores.revendedor !== inicial.revendedor) {
      // Vacío quita el precio de revendedor (deja de venderse a revendedores).
      cuerpo.precioRevendedorUsd = valores.revendedor.trim() === '' ? null : valores.revendedor;
    }
    const r = await ejecutar('PATCH', `/catalogo/planes/${plan.id}`, cuerpo);
    if (r) setGuardado(true);
  }

  async function alternar(campo: 'activo' | 'visible' | 'revendible', valor: boolean) {
    setCambiando(campo);
    await ejecutar('PATCH', `/catalogo/planes/${plan.id}`, { [campo]: valor });
    setCambiando(null);
  }

  const id = `plan-${plan.id}`;
  return (
    <li className={clsx('grid gap-3 px-5 py-4 sm:px-6', !plan.activo && 'opacity-75')}>
      <form onSubmit={guardar} noValidate className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="grid gap-1 text-xs font-semibold text-tinta-suave">
            <span>
              Plan{' '}
              <span className="font-normal text-tinta-tenue">
                · {formatearDuracion(plan.duracionCantidad, plan.duracionUnidad, plan.tipo)}
              </span>
            </span>
            <input
              className={claseEntrada}
              value={valores.nombre}
              onChange={(e) => setValores({ ...valores, nombre: e.currentTarget.value })}
              aria-invalid={campos.nombre ? true : undefined}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-tinta-suave">
            Precio cliente (USD)
            <input
              className={claseEntrada}
              inputMode="decimal"
              value={valores.precio}
              onChange={(e) => setValores({ ...valores, precio: e.currentTarget.value })}
              aria-invalid={campos.precioUsd ? true : undefined}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-tinta-suave">
            Precio revendedor (USD)
            <input
              className={claseEntrada}
              inputMode="decimal"
              placeholder={variosNiveles ? 'Varía por nivel' : 'No se revende'}
              value={valores.revendedor}
              onChange={(e) => setValores({ ...valores, revendedor: e.currentTarget.value })}
              aria-invalid={campos.precioRevendedorUsd ? true : undefined}
              aria-describedby={`${id}-ayuda`}
            />
          </label>
          <div className="flex items-center gap-2">
            <Boton type="submit" tamano="sm" cargando={cargando && !cambiando} disabled={!sucio}>
              Guardar
            </Boton>
            {guardado && !sucio && (
              <Check className="size-4 text-exito" aria-label="Guardado" role="img" />
            )}
          </div>
        </div>
        {(campos.nombre ?? campos.precioUsd ?? campos.precioRevendedorUsd) && (
          <p role="alert" className="text-xs font-medium text-peligro">
            {campos.nombre ?? campos.precioUsd ?? campos.precioRevendedorUsd}
          </p>
        )}
        <ErrorGeneral error={error} />
      </form>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Opcion
          etiqueta="A la venta"
          activo={plan.activo}
          onCambiar={(v) => void alternar('activo', v)}
          cargando={cambiando === 'activo'}
        />
        <Opcion
          etiqueta="Visible en la tienda"
          activo={plan.visible}
          onCambiar={(v) => void alternar('visible', v)}
          cargando={cambiando === 'visible'}
        />
        <Opcion
          etiqueta="Para revendedores"
          activo={plan.revendible}
          onCambiar={(v) => void alternar('revendible', v)}
          cargando={cambiando === 'revendible'}
        />
        <Link
          href={`/admin/catalogo/planes/${plan.id}`}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-cian hover:underline"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Más opciones
        </Link>
      </div>
      <p id={`${id}-ayuda`} className="sr-only">
        Vacío: el plan no se vende a revendedores. Un valor se aplica a todos los niveles.
      </p>
    </li>
  );
}

/** Los planes del servicio, cada uno editable en su fila. */
export function PlanesServicio({ planes }: { planes: PlanPublico[] }) {
  return (
    <ul className="divide-y divide-borde">
      {planes.map((p) => (
        <FilaPlan key={p.id} plan={p} />
      ))}
    </ul>
  );
}
