'use client';

import clsx from 'clsx';
import { type CSSProperties, useState } from 'react';
import { claseEnlace } from '@/componentes/cliente/piezas-cuenta';
import { CampoBuscar } from '@/componentes/revendedor/busqueda';
import type { GrupoEquipo, ModuloEquipo } from '@/lib/navegacion';
import { ICONOS_MODULO } from './iconos';
import { EnlaceAlPasar } from '@/componentes/panel/enlace-al-pasar';

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
  const q = normalizar(busqueda.trim());
  const visibles = modulos.filter(
    (m) => !q || normalizar(`${m.nombre} ${m.descripcion}`).includes(q),
  );
  const porGrupo = grupos
    .map(([g, t]) => [g, t, visibles.filter((m) => m.grupo === g)] as const)
    .filter(([, , lista]) => lista.length > 0);

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
      <div className="flex min-w-0 sm:max-w-[22.5rem]">
        <CampoBuscar
          id="buscar-modulo"
          etiqueta="Buscar módulo"
          placeholder="Busca un módulo"
          valor={busqueda}
          onCambiar={setBusqueda}
        />
      </div>
      {visibles.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-borde-fuerte px-4 py-5 text-center text-sm text-tinta-suave">
          Ningún módulo coincide.{' '}
          <button type="button" className={claseEnlace} onClick={() => setBusqueda('')}>
            Limpiar búsqueda
          </button>
        </p>
      ) : (
        // Un bloque por área, como en el menú: cada módulo en una fila corta.
        <div className="grid items-start gap-3 sm:grid-cols-2 min-[110rem]:grid-cols-3">
          {porGrupo.map(([g, titulo, lista]) => (
            <section
              key={g}
              aria-label={titulo}
              className="grid gap-1 rounded-[1.25rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.7),rgb(8_11_26/0.85))] p-2"
            >
              <h3 className="px-2.5 pt-1.5 pb-1 text-[0.68rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase">
                {titulo}
              </h3>
              <ul className="grid gap-0.5">
                {lista.map((m) => {
                  const Icono = ICONOS_MODULO[m.clave];
                  return (
                    <li key={m.clave}>
                      <EnlaceAlPasar
                        href={m.href}
                        title={m.descripcion}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2 text-tinta transition-colors hover:bg-white/[0.05]"
                      >
                        <span
                          className="orbe size-9 text-[1rem] after:hidden"
                          style={{ '--c': m.color } as CSSProperties}
                          aria-hidden="true"
                        >
                          <Icono />
                        </span>
                        <span className="grid min-w-0 leading-tight">
                          <b className="truncate text-[0.9rem]">{m.nombre}</b>
                          {m.estado.texto && (
                            <small
                              className={clsx(
                                'truncate text-[0.74rem] tabular-nums',
                                m.estado.aviso ? 'text-[#fde68a]' : 'text-tinta-suave',
                              )}
                            >
                              {m.estado.texto}
                            </small>
                          )}
                        </span>
                        {m.pendientes > 0 ? (
                          <em className="rounded-full bg-aviso/20 px-2 py-px font-mono text-xs font-bold text-[#fde68a] not-italic">
                            {m.pendientes}
                            <span className="sr-only"> por atender</span>
                          </em>
                        ) : (
                          <span />
                        )}
                      </EnlaceAlPasar>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
