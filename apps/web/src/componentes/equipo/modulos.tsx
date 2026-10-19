'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { type CSSProperties, useState } from 'react';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { CampoBuscar } from '@/componentes/revendedor/busqueda';
import type { GrupoEquipo, ModuloEquipo } from '@/lib/navegacion';
import { ICONOS_MODULO } from './iconos';

export interface TarjetaModulo {
  clave: ModuloEquipo;
  grupo: GrupoEquipo;
  nombre: string;
  descripcion: string;
  color: string;
  href: string;
  estado: { texto: string; aviso: boolean };
  /** Lo que espera en el módulo (insignia ámbar). */
  pendientes: number;
}

/** Sin tildes ni mayúsculas, para buscar «catalogo» o «auditoria». */
const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Cuadrícula de los módulos del rol con buscador y chips por grupo (con
 * cuántos módulos tiene cada uno). Cada tarjeta lleva su estado y sus
 * pendientes.
 */
export function Modulos({
  modulos,
  grupos,
}: {
  modulos: TarjetaModulo[];
  grupos: [GrupoEquipo, string][];
}) {
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState<GrupoEquipo | 'todos'>('todos');
  const q = normalizar(busqueda.trim());
  const visibles = modulos.filter(
    (m) =>
      (grupo === 'todos' || m.grupo === grupo) &&
      (!q || normalizar(`${m.nombre} ${m.descripcion}`).includes(q)),
  );
  const conModulos = grupos
    .map(([g, t]) => [g, t, modulos.filter((m) => m.grupo === g).length] as const)
    .filter(([, , n]) => n > 0);

  return (
    <section id="modulos" aria-labelledby="titulo-modulos" className="grid scroll-mt-24 gap-3">
      <header className="grid gap-0.5">
        <h2 id="titulo-modulos" className="text-[clamp(1.25rem,2.6vw,1.5rem)]">
          Módulos
        </h2>
        <p className="text-[0.8rem] text-tinta-tenue">
          {modulos.length === 1 ? '1 módulo para tu rol' : `${modulos.length} módulos para tu rol`}
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <div className="flex min-w-0 flex-[1_1_15rem] sm:max-w-[22.5rem]">
          <CampoBuscar
            id="buscar-modulo"
            etiqueta="Buscar módulo"
            placeholder="Busca un módulo"
            valor={busqueda}
            onCambiar={setBusqueda}
          />
        </div>
        <div role="group" aria-label="Filtrar módulos" className="flex flex-wrap gap-2">
          <button
            type="button"
            className="chip"
            aria-pressed={grupo === 'todos'}
            onClick={() => setGrupo('todos')}
          >
            Todos · {modulos.length}
          </button>
          {conModulos.map(([g, t, n]) => (
            <button
              key={g}
              type="button"
              className="chip"
              aria-pressed={grupo === g}
              onClick={() => setGrupo(g)}
            >
              {t} · {n}
            </button>
          ))}
        </div>
      </div>
      {visibles.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-borde-fuerte px-4 py-5 text-center text-sm text-tinta-suave">
          Ningún módulo coincide.{' '}
          <button
            type="button"
            className={claseEnlace}
            onClick={() => {
              setBusqueda('');
              setGrupo('todos');
            }}
          >
            Limpiar búsqueda
          </button>
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14.375rem,1fr))] gap-3">
          {visibles.map((m) => {
            const Icono = ICONOS_MODULO[m.clave];
            return (
              <li key={m.clave} className="grid">
                <Link
                  href={m.href}
                  className="relative grid grid-cols-[auto_minmax(0,1fr)] content-start items-start gap-x-3 gap-y-1 rounded-[1.25rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-3.75 text-tinta transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[rgb(79_141_255/0.55)]"
                >
                  <span
                    className="orbe row-span-3 size-11 text-[1.15rem] after:hidden"
                    style={{ '--c': m.color } as CSSProperties}
                    aria-hidden="true"
                  >
                    <Icono />
                  </span>
                  <b className={clsx('truncate text-[0.97rem]', m.pendientes > 0 && 'pr-8')}>
                    {m.nombre}
                  </b>
                  <span className="text-[0.8rem] leading-snug text-tinta-suave">
                    {m.descripcion}
                  </span>
                  {m.estado.texto && (
                    <small
                      className={clsx(
                        'text-[0.78rem] tabular-nums',
                        m.estado.aviso ? 'text-[#fde68a]' : 'text-[#bcd3ff]',
                      )}
                    >
                      {m.estado.texto}
                    </small>
                  )}
                  {m.pendientes > 0 && (
                    <em className="absolute top-3.25 right-3.25 rounded-full bg-aviso/20 px-2 py-px font-mono text-xs font-bold text-[#fde68a] not-italic">
                      {m.pendientes}
                      <span className="sr-only"> por atender</span>
                    </em>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
