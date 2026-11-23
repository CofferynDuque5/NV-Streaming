'use client';

import { INFO_MONEDA, MONEDAS, type Moneda, type Rol } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';

/**
 * Moneda predeterminada en la que la persona ve los precios de la tienda. Puede
 * cambiarla con el selector. «Automática» usa la de su país (o, en un cliente,
 * su moneda preferida).
 */
export function MonedaTiendaUsuario({
  id,
  rol,
  moneda,
  compacto = false,
}: {
  id: string;
  rol: Rol;
  moneda: Moneda | null;
  /** En una columna angosta: texto arriba y selector abajo. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [listo, setListo] = useState(false);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valor = new FormData(e.currentTarget).get('moneda');
    setCargando(true);
    setError(null);
    setListo(false);
    const r = await llamarApi('PATCH', `/usuarios/${id}/moneda-tienda`, {
      moneda: valor ? valor : null,
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setListo(true);
    router.refresh();
  }

  return (
    <div
      className={
        compacto
          ? 'grid gap-3 px-5 py-5 sm:px-6'
          : 'grid gap-3 px-5 py-5 sm:grid-cols-[1fr_minmax(0,22rem)] sm:gap-8 sm:px-6'
      }
    >
      <div className="grid content-start gap-1">
        <h3 className="text-sm font-semibold">Moneda predeterminada en la tienda</h3>
        <p className="text-sm text-tinta-suave">
          Los precios de la tienda le salen en esta moneda. Puede cambiarla con el selector de la
          tienda.
          {rol === 'cliente' && ' En «Automática» se usa su moneda preferida.'}
          {rol === 'cliente' && ' Los clientes ven el precio en esa moneda, sin la tasa del día.'}
        </p>
      </div>
      <form onSubmit={(e) => void guardar(e)} className="grid gap-3">
        <div className="flex items-end gap-2">
          <Selector etiqueta="Moneda" name="moneda" defaultValue={moneda ?? ''} className="flex-1">
            <option value="">Automática</option>
            {MONEDAS.map((m) => (
              <option key={m} value={m}>
                {m} · {INFO_MONEDA[m].nombre}
              </option>
            ))}
          </Selector>
          <Boton type="submit" variante="secundario" cargando={cargando}>
            Guardar
          </Boton>
        </div>
        {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        {listo && <Alerta tono="exito">Moneda de la tienda guardada.</Alerta>}
      </form>
    </div>
  );
}
