'use client';

/**
 * Carriles con estado en el navegador: la cartelera de la semana (chips que
 * filtran por tipo) y los combos (un botón que agrega todos sus planes al
 * carrito). El servidor les pasa los datos ya listos.
 */
import {
  type BloqueDe,
  type CategoriaCartelera,
  type CategoriaServicio,
  type TonoCartelera,
  urlMedio,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Check,
  Heart,
  type LucideIcon,
  MonitorPlay,
  ShoppingCart,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { ArteServicio } from '@/componentes/tienda/arte';
import { Carril } from '@/componentes/tienda/deslizables';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { abrirCarrito, MAX_CARRITO, useCarrito } from '@/lib/carrito';
import { Encabezado, EnlaceVerTodo } from './piezas';

/* --------------------------------------------------------------- cartelera */

export const INFO_CARTELERA: Record<
  CategoriaCartelera,
  { nombre: string; plural: string; icono: LucideIcon }
> = {
  serie: { nombre: 'Serie', plural: 'Series', icono: MonitorPlay },
  pelicula: { nombre: 'Película', plural: 'Películas', icono: Star },
  deporte: { nombre: 'Deporte', plural: 'Deportes', icono: Trophy },
  anime: { nombre: 'Anime', plural: 'Anime', icono: Sparkles },
  novela: { nombre: 'Novela', plural: 'Novelas', icono: Heart },
};

/** Degradado de la tarjeta: color de arriba, color de abajo y borde. */
export const TONOS_CARTELERA_INFO: Record<
  TonoCartelera,
  { nombre: string; arriba: string; abajo: string }
> = {
  rojo: { nombre: 'Rojo', arriba: '#a3172b', abajo: '#2a070d' },
  vino: { nombre: 'Vino', arriba: '#6d1330', abajo: '#1f0610' },
  naranja: { nombre: 'Naranja', arriba: '#f59e0b', abajo: '#8a2c0b' },
  azul: { nombre: 'Azul', arriba: '#2152d9', abajo: '#0a1745' },
  celeste: { nombre: 'Celeste', arriba: '#1aa3e8', abajo: '#0b3a66' },
  morado: { nombre: 'Morado', arriba: '#7c3aed', abajo: '#24104f' },
  verde: { nombre: 'Verde', arriba: '#16a34a', abajo: '#05301a' },
  gris: { nombre: 'Gris', arriba: '#475569', abajo: '#0d1424' },
};

/** «TOP 1» → 1; cualquier otra insignia → null. */
export function puestoTop(insignia: string | null | undefined): number | null {
  const m = /^top\s*(\d{1,2})$/i.exec(insignia?.trim() ?? '');
  return m ? Number(m[1]) : null;
}

export function CarteleraSemana({ b }: { b: BloqueDe<'cartelera'> }) {
  const [filtro, setFiltro] = useState<CategoriaCartelera | null>(null);
  const presentes = (Object.keys(INFO_CARTELERA) as CategoriaCartelera[]).filter((c) =>
    b.elementos.some((e) => e.categoria === c),
  );
  const visibles = filtro ? b.elementos.filter((e) => e.categoria === filtro) : b.elementos;
  return (
    <Carril
      etiqueta={b.titulo}
      ancho="poster"
      cabecera={
        <div className="grid gap-5">
          <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
          {b.filtros && presentes.length > 1 && (
            <div
              role="group"
              aria-label={`Filtrar ${b.titulo}`}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] @2xl:mx-0 @2xl:flex-wrap @2xl:overflow-visible @2xl:px-0 [&>button]:shrink-0"
            >
              <button
                type="button"
                className="chip"
                aria-pressed={filtro === null}
                onClick={() => setFiltro(null)}
              >
                Todo
              </button>
              {presentes.map((c) => {
                const { plural, icono: Icono } = INFO_CARTELERA[c];
                return (
                  <button
                    key={c}
                    type="button"
                    className="chip"
                    aria-pressed={filtro === c}
                    onClick={() => setFiltro(c)}
                  >
                    <Icono className="size-3.5" aria-hidden="true" />
                    {plural}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      }
      acciones={
        b.boton?.texto && b.boton.enlace ? (
          <EnlaceVerTodo href={b.boton.enlace}>{b.boton.texto}</EnlaceVerTodo>
        ) : undefined
      }
    >
      {visibles.map((e, i) => (
        <TarjetaCartelera key={`${filtro ?? 'todo'}-${i}-${e.titulo}`} e={e} />
      ))}
    </Carril>
  );
}

function TarjetaCartelera({ e }: { e: BloqueDe<'cartelera'>['elementos'][number] }) {
  const tono = TONOS_CARTELERA_INFO[e.tono] ?? TONOS_CARTELERA_INFO.azul;
  const { nombre: tipo, icono: Icono } = INFO_CARTELERA[e.categoria];
  const top = puestoTop(e.insignia);
  return (
    <article className="grid gap-2.5" style={{ '--c': tono.arriba } as CSSProperties}>
      <div
        className="relative isolate flex aspect-[2/3] flex-col justify-end overflow-hidden rounded-[1.1rem] border border-white/10 p-3 @xl:rounded-[1.25rem] @xl:p-4"
        style={{
          background: `radial-gradient(120% 70% at 30% 0%, color-mix(in srgb, ${tono.arriba} 85%, white 10%), transparent 70%), linear-gradient(180deg, ${tono.arriba}, ${tono.abajo})`,
        }}
      >
        {e.imagen ? (
          <img
            src={urlMedio(e.imagen.medioId)}
            alt={e.imagen.alt}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 -z-10 size-full object-cover"
          />
        ) : (
          <>
            {top !== null && (
              <span
                aria-hidden="true"
                className="absolute top-[18%] -left-1 -z-10 font-titulo text-[5.5rem] leading-none @xl:text-[8rem] font-extrabold text-transparent"
                style={{ WebkitTextStroke: '3px rgb(255 255 255 / 0.32)' }}
              >
                {top}
              </span>
            )}
            <Icono
              aria-hidden="true"
              strokeWidth={1.5}
              className={clsx(
                'absolute top-[22%] -z-10 size-16 text-white/25 @xl:size-28',
                top !== null ? '-right-3' : 'left-1/2 -translate-x-1/2',
              )}
            />
          </>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent"
        />
        {e.insignia && (
          <span
            className={clsx(
              'absolute top-3 left-3 rounded-full px-2 py-0.5 text-[0.62rem] @xl:top-4 @xl:left-4 @xl:px-2.5 @xl:py-1 @xl:text-[0.68rem] font-extrabold tracking-[0.12em] uppercase',
              top !== null ? 'bg-[#e11d48] text-white' : 'bg-black/55 text-white backdrop-blur',
            )}
          >
            {e.insignia}
          </span>
        )}
        {e.plataforma && (
          <span className="mb-2 max-w-full self-start truncate rounded-full border border-white/25 bg-black/35 px-2 py-0.5 text-[0.6rem] @xl:px-2.5 @xl:py-1 @xl:text-[0.65rem] font-extrabold tracking-[0.12em] text-white uppercase backdrop-blur">
            {e.plataforma}
          </span>
        )}
        <h3 className="line-clamp-3 font-titulo text-[0.95rem] leading-tight font-extrabold text-white @xl:text-xl">
          {e.titulo}
        </h3>
      </div>
      <div className="grid gap-0.5 px-0.5 text-sm">
        <span className="truncate font-medium" aria-hidden="true">
          {e.titulo}
        </span>
        <span className="truncate text-tinta-suave">{e.detalle || tipo}</span>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ combos */

export interface ComboTienda {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  /** Precio en USD, si la moneda de la página no es USD. */
  precioUsd: string | null;
  porcentaje: number;
  planes: string[];
  artes: {
    arte: string | null;
    nombre: string;
    categoria: CategoriaServicio | null;
    color: string;
  }[];
}

export function CarrilCombos({
  b,
  combos,
  conCarrito,
}: {
  b: BloqueDe<'combos'>;
  combos: ComboTienda[];
  /** Los revendedores ven el combo pero compran desde su panel. */
  conCarrito: boolean;
}) {
  return (
    <Carril
      etiqueta={b.titulo}
      ancho="ancho"
      cabecera={<Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />}
    >
      {combos.map((c) => (
        <TarjetaCombo key={c.id} c={c} conCarrito={conCarrito} />
      ))}
    </Carril>
  );
}

function TarjetaCombo({ c, conCarrito }: { c: ComboTienda; conCarrito: boolean }) {
  const carrito = useCarrito();
  const notificar = useNotificar();
  const dentro = c.planes.every((id) => carrito.tiene(id));
  const [a, z] = [c.artes[0], c.artes[1] ?? c.artes[0]];
  function agregar() {
    const faltan = c.planes.filter((id) => !carrito.tiene(id));
    if (faltan.length === 0) {
      notificar('Este combo ya está en tu carrito.', 'error', {
        texto: 'Ver carrito',
        alPulsar: abrirCarrito,
      });
      return;
    }
    if (carrito.planes.length + faltan.length > MAX_CARRITO) {
      notificar(
        `Tu carrito admite ${MAX_CARRITO} planes. Quita ${carrito.planes.length + faltan.length - MAX_CARRITO} para agregar este combo.`,
        'error',
        { texto: 'Ver carrito', alPulsar: abrirCarrito },
      );
      return;
    }
    for (const id of faltan) carrito.agregar(id);
    notificar(`${c.nombre} está en tu carrito con su precio de combo.`, 'exito', {
      texto: 'Ver carrito',
      alPulsar: abrirCarrito,
    });
  }
  return (
    <article
      className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 rounded-[1.4rem] border border-borde bg-[linear-gradient(135deg,color-mix(in_srgb,var(--c1)_16%,transparent),transparent_45%),linear-gradient(180deg,rgb(15_21_48/0.9),rgb(8_11_26/0.95))] p-3.5 @2xl:grid-cols-[9.5rem_minmax(0,1fr)] @2xl:gap-5 @2xl:p-5"
      style={{ '--c1': a?.color ?? '#4f8dff' } as CSSProperties}
    >
      <div className="relative h-32 @2xl:h-40" aria-hidden="true">
        {a && (
          <ArteServicio
            {...a}
            orbe="md"
            className="absolute top-[4%] left-0 w-[58%] -rotate-[10deg] opacity-85"
          />
        )}
        {z && (
          <ArteServicio
            {...z}
            orbe="md"
            className="absolute right-[2%] bottom-[2%] w-[60%] rotate-[8deg]"
          />
        )}
      </div>
      <div className="grid min-w-0 justify-items-start gap-1.5">
        {c.porcentaje > 0 && (
          <span className="rounded-full border border-exito/40 bg-exito-suave px-2.5 py-0.5 text-[0.7rem] font-extrabold tracking-[0.06em] text-exito uppercase">
            Ahorras {c.porcentaje}%
          </span>
        )}
        <h3 className="font-titulo text-lg leading-tight font-bold">{c.nombre}</h3>
        {c.descripcion && <p className="text-sm text-tinta-suave">{c.descripcion}</p>}
        <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <strong className="font-titulo text-xl">{c.precio}</strong>
          {c.precioUsd && <small className="text-sm text-tinta-suave">{c.precioUsd}</small>}
        </p>
        {conCarrito && (
          <button
            type="button"
            onClick={agregar}
            className={clsx(
              'mt-1 inline-flex w-full items-center justify-center gap-2 rounded-[0.875rem] border px-4 py-2.5 text-sm font-semibold transition-colors',
              dentro
                ? 'border-exito/50 bg-exito-suave text-exito'
                : 'border-borde-fuerte bg-white/[0.03] hover:border-cian',
            )}
          >
            {dentro ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <ShoppingCart className="size-4" aria-hidden="true" />
            )}
            {dentro ? 'En el carrito' : 'Agregar'}
            <span className="sr-only"> el combo {c.nombre}</span>
          </button>
        )}
      </div>
    </article>
  );
}
