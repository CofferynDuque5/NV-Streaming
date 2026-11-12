'use client';

import type { ElementoPapelera } from '@nv/shared';
import clsx from 'clsx';
import { KeyRound, LayoutGrid, RotateCcw, Search, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { formatearFechaHora } from '@/lib/formato';
import { useAccion } from './piezas';

type Tipo = ElementoPapelera['tipo'];

const TIPOS: { clave: Tipo | 'todo'; nombre: string }[] = [
  { clave: 'todo', nombre: 'Todo' },
  { clave: 'cliente', nombre: 'Clientes' },
  { clave: 'cuenta', nombre: 'Cuentas' },
  { clave: 'plataforma', nombre: 'Plataformas' },
];

const ICONO: Record<Tipo, typeof UserRound> = {
  cliente: UserRound,
  cuenta: KeyRound,
  plataforma: LayoutGrid,
};

const QUE: Record<Tipo, string> = {
  cliente: 'Cliente archivado',
  cuenta: 'Cuenta retirada',
  plataforma: 'Plataforma apagada',
};

const ENLACE: Record<Tipo, (id: string) => string> = {
  cliente: (id) => `/admin/clientes/${id}`,
  cuenta: (id) => `/admin/cuentas/${id}`,
  plataforma: () => '/admin/catalogo',
};

/** Restaurar usa la misma acción que deshacerlo a mano en su ficha. */
function restauracion(
  e: ElementoPapelera,
): [metodo: 'POST' | 'PATCH', ruta: string, cuerpo: object] {
  if (e.tipo === 'cliente') {
    return ['POST', `/clientes/${e.id}/reactivar`, { motivo: 'Restaurado desde la papelera' }];
  }
  if (e.tipo === 'cuenta') return ['PATCH', `/cuentas/${e.id}`, { estado: 'activa' }];
  return ['PATCH', `/catalogo/servicios/${e.id}`, { activo: true }];
}

export function Papelera({
  elementos,
  puede,
}: {
  elementos: ElementoPapelera[];
  /** Qué tipos puede restaurar quien entra (según sus permisos). */
  puede: Record<Tipo, boolean>;
}) {
  const [tipo, setTipo] = useState<Tipo | 'todo'>('todo');
  const [texto, setTexto] = useState('');
  const [restaurado, setRestaurado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const { error, ejecutar } = useAccion();

  const q = texto.trim().toLowerCase();
  const visibles = elementos.filter(
    (e) =>
      (tipo === 'todo' || e.tipo === tipo) &&
      (!q || `${e.nombre} ${e.detalle ?? ''}`.toLowerCase().includes(q)),
  );
  const cuantos = (t: Tipo | 'todo') =>
    t === 'todo' ? elementos.length : elementos.filter((e) => e.tipo === t).length;

  async function restaurar(e: ElementoPapelera) {
    setOcupado(e.id);
    setRestaurado(null);
    const [metodo, ruta, cuerpo] = restauracion(e);
    const r = await ejecutar(metodo, ruta, cuerpo);
    setOcupado(null);
    if (r) setRestaurado(e.nombre);
  }

  if (elementos.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio icono={Trash2} titulo="La papelera está vacía">
          Aquí aparecen los clientes que archives, las cuentas que retires y las plataformas que
          apagues, para restaurarlos cuando quieras.
        </EstadoVacio>
      </Tarjeta>
    );
  }

  return (
    <div className="grid gap-5">
      <Tarjeta className="grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">Buscar en la papelera</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-tenue"
              aria-hidden
            />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder="Nombre, correo o plataforma"
              className={clsx(clasesEntrada, 'pl-10')}
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
            {TIPOS.map((t) => (
              <button
                key={t.clave}
                type="button"
                aria-pressed={tipo === t.clave}
                onClick={() => setTipo(t.clave)}
                className={clsx(
                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                  tipo === t.clave
                    ? 'border-cian bg-acento-suave text-tinta'
                    : 'border-borde text-tinta-suave hover:text-tinta',
                )}
              >
                {t.nombre} · {cuantos(t.clave)}
              </button>
            ))}
          </div>
        </div>
      </Tarjeta>

      {restaurado && !error && <Alerta tono="exito">{restaurado} volvió a su lugar.</Alerta>}
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}

      <Tarjeta>
        {visibles.length === 0 ? (
          <EstadoVacio icono={Search} titulo="Nada coincide">
            Prueba con otro tipo o búsqueda.
          </EstadoVacio>
        ) : (
          <ul className="divide-y divide-borde" aria-label="Elementos en la papelera">
            {visibles.map((e) => {
              const Icono = ICONO[e.tipo];
              return (
                <li
                  key={`${e.tipo}:${e.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-borde bg-hundida text-tinta-suave">
                    <Icono className="size-4" aria-hidden="true" />
                  </span>
                  <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
                    <Link
                      href={ENLACE[e.tipo](e.id)}
                      className="truncate font-medium hover:text-marca"
                    >
                      {e.nombre}
                    </Link>
                    <p className="truncate text-xs text-tinta-suave">
                      {QUE[e.tipo]}
                      {e.detalle ? ` · ${e.detalle}` : ''} · {formatearFechaHora(e.quitadoEn)}
                      {e.quitadoPor ? ` por ${e.quitadoPor.nombre}` : ''}
                    </p>
                  </div>
                  {puede[e.tipo] && (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      cargando={ocupado === e.id}
                      onClick={() => void restaurar(e)}
                      icono={<RotateCcw className="size-4" />}
                      aria-label={`Restaurar ${e.nombre}`}
                    >
                      Restaurar
                    </Boton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
