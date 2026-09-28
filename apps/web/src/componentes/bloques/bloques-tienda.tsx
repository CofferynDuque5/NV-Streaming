/**
 * Bloques de la tienda. Se llenan solos con datos reales: el catálogo (precios
 * que calcula la API en cada moneda), lo más pedido del mes, los métodos de
 * cobro activos y el contacto configurado. Si no hay datos, no se muestran
 * (en la vista previa del editor aparece un aviso).
 */
import {
  type BloqueDe,
  categoriasTienda,
  filtrarCatalogo,
  INFO_CATEGORIA,
  type ServicioTienda,
  serviciosTienda,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, CreditCard, MessageCircle, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArteServicio } from '@/componentes/tienda/arte';
import { BotonCarrito } from '@/componentes/tienda/boton-carrito';
import { Carril, RejillaFiltrable } from '@/componentes/tienda/deslizables';
import { Orbe } from '@/componentes/tienda/iconos';
import { precioDeTarjeta } from '@/componentes/tienda/precio-tarjeta';
import { TarjetaServicio } from '@/componentes/tienda/tarjeta-servicio';
import { clasesBoton } from '@/componentes/ui/boton';
import {
  BotonSitio,
  type ContextoBloques,
  contenedor,
  Encabezado,
  EnlaceVerTodo,
  Seccion,
  SinDatos,
  TituloConDestacado,
} from './piezas';

function servicios(contexto: ContextoBloques): ServicioTienda[] {
  return contexto.catalogo ? serviciosTienda(contexto.catalogo) : [];
}

/* --------------------------------------------------------------- universos */

export function Universos({
  b,
  contexto,
}: {
  b: BloqueDe<'universos'>;
  contexto: ContextoBloques;
}) {
  const cats = categoriasTienda(servicios(contexto), contexto.moneda);
  if (cats.length === 0) {
    return (
      <SinDatos
        contexto={contexto}
        titulo={b.titulo}
        motivo="Ningún servicio del catálogo tiene universo asignado (Catálogo → servicio → Categoría)."
      />
    );
  }
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-6 py-12')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ul className={clsx('grid grid-cols-2 gap-3 @2xl:grid-cols-4 @5xl:grid-cols-6')}>
          {cats.map((c) => (
            <li key={c.id} className="grid">
              <Link
                href={`/catalogo?categoria=${c.id}`}
                className="tarjeta-brillo grid justify-items-center gap-2 px-3 pt-7 pb-5 text-center"
                style={{ '--c': c.color } as CSSProperties}
              >
                <Orbe categoria={c.id} color={c.color} tamano="xl" />
                <b className="mt-2 font-titulo text-[0.95rem]">{c.nombre}</b>
                <span className="text-xs text-tinta-tenue">
                  {c.servicios} {c.servicios === 1 ? 'servicio' : 'servicios'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Seccion>
  );
}

/* --------------------------------------------------------------- servicios */

function Tira({ items, titulo }: { items: ServicioTienda[]; titulo: string }) {
  // Con pocos servicios se repiten hasta llenar el ancho; la segunda mitad es
  // la copia que permite el giro continuo (oculta a lectores de pantalla).
  const veces = Math.max(1, Math.ceil(12 / items.length));
  const mitad = Array.from({ length: veces }, () => items).flat();
  const vuelta = [...mitad, ...mitad];
  return (
    <div className="relative overflow-hidden py-6 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
      <h2 className="sr-only">{titulo}</h2>
      <ul className="flex w-max animate-[nv-tira_60s_linear_infinite] gap-4 hover:[animation-play-state:paused] motion-reduce:animate-none">
        {vuelta.map((s, i) => (
          <li key={`${s.servicio.id}-${i}`} aria-hidden={i >= items.length || undefined}>
            <Link
              href={`/catalogo/${s.servicio.slug}`}
              tabIndex={i >= items.length ? -1 : undefined}
              className="grid h-24 w-16 place-items-center transition-transform hover:-translate-y-1"
              title={s.servicio.nombre}
            >
              <ArteServicio
                arte={s.arte}
                nombre={s.servicio.nombre}
                categoria={s.servicio.categoria}
                color={s.color}
                decorativa={false}
                className="h-24 w-auto [&_.orbe]:scale-75"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Servicios({
  b,
  contexto,
}: {
  b: BloqueDe<'servicios'>;
  contexto: ContextoBloques;
}) {
  const { moneda, mayorista } = contexto;
  const todos = servicios(contexto);
  const resultados = filtrarCatalogo(todos, moneda, {
    categoria: b.categoria ?? null,
    orden: b.orden,
  }).slice(0, b.limite);
  if (resultados.length === 0) {
    return (
      <SinDatos
        contexto={contexto}
        titulo={b.titulo}
        motivo={
          b.categoria
            ? `No hay servicios visibles en el universo ${INFO_CATEGORIA[b.categoria].nombre}.`
            : 'El catálogo no tiene servicios visibles.'
        }
      />
    );
  }
  if (b.variante === 'tira') {
    return (
      <Seccion bloque={b}>
        <Tira items={resultados.map((r) => r.item)} titulo={b.titulo} />
      </Seccion>
    );
  }
  const verTodo = (
    <EnlaceVerTodo href={b.categoria ? `/catalogo?categoria=${b.categoria}` : '/catalogo'}>
      Ver catálogo
    </EnlaceVerTodo>
  );
  const tarjetas = resultados.map((r) => ({
    clave: r.item.servicio.id,
    grupo: r.item.servicio.categoria,
    nodo: <TarjetaServicio item={r.item} plan={r.plan} moneda={moneda} mayorista={mayorista} />,
  }));
  if (b.variante === 'carril') {
    return (
      <Seccion bloque={b}>
        <div className={clsx(contenedor, 'py-12')}>
          <Carril
            etiqueta={b.titulo}
            cabecera={
              <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
            }
            acciones={verTodo}
          >
            {tarjetas.map((t) => (
              <div key={t.clave} className="grid">
                {t.nodo}
              </div>
            ))}
          </Carril>
        </div>
      </Seccion>
    );
  }
  const chips = categoriasTienda(
    resultados.map((r) => r.item),
    moneda,
  ).map((c) => ({ valor: c.id, texto: c.nombre, color: c.color }));
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-6 py-12')}>
        <Encabezado
          etiqueta={b.etiqueta}
          titulo={b.titulo}
          subtitulo={b.subtitulo}
          accion={verTodo}
        />
        {b.filtros ? (
          <RejillaFiltrable chips={chips} elementos={tarjetas} etiqueta={b.titulo} />
        ) : (
          <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
            {tarjetas.map((t) => (
              <li key={t.clave} className="grid">
                {t.nodo}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Seccion>
  );
}

/* ----------------------------------------------------------------- ranking */

export function Ranking({ b, contexto }: { b: BloqueDe<'ranking'>; contexto: ContextoBloques }) {
  const { moneda, mayorista } = contexto;
  const top = servicios(contexto)
    .filter((s) => s.ranking !== null)
    .sort((x, y) => (x.ranking ?? 0) - (y.ranking ?? 0))
    .slice(0, b.limite);
  const filas = top.flatMap((s) => {
    const r = filtrarCatalogo([s], moneda, {})[0];
    return r ? [r] : [];
  });
  if (filas.length === 0) {
    return (
      <SinDatos
        contexto={contexto}
        titulo={b.titulo}
        motivo="Todavía no hay activaciones ni renovaciones en los últimos 30 días."
      />
    );
  }
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'py-12')}>
        <Carril
          etiqueta={b.titulo}
          cabecera={<Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />}
          acciones={<EnlaceVerTodo href="/catalogo">Ver catálogo</EnlaceVerTodo>}
        >
          {filas.map(({ item, plan }, i) => {
            const precio = precioDeTarjeta(plan, moneda, mayorista);
            return (
              <article
                key={item.servicio.id}
                className="grid"
                style={{ '--c': item.color } as CSSProperties}
                aria-label={`Número ${i + 1}: ${item.servicio.nombre}`}
              >
                <Link
                  href={`/catalogo/${item.servicio.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="relative flex h-48 items-end justify-end overflow-hidden"
                >
                  <span
                    className="absolute bottom-0 left-0 font-titulo text-[9.5rem] leading-[0.8] font-extrabold text-transparent"
                    style={{
                      WebkitTextStroke: `3px ${item.color}`,
                      filter: `drop-shadow(0 0 14px ${item.color})`,
                    }}
                  >
                    {i + 1}
                  </span>
                  <ArteServicio
                    arte={item.arte}
                    nombre={item.servicio.nombre}
                    categoria={item.servicio.categoria}
                    color={item.color}
                    className="relative mr-1 h-44 w-auto"
                  />
                </Link>
                <div className="tarjeta-brillo -mt-1 flex items-center gap-2 px-3.5 py-3">
                  <div className="grid min-w-0 flex-1">
                    <Link
                      href={`/catalogo/${item.servicio.slug}`}
                      className="truncate font-titulo text-sm font-bold hover:underline"
                    >
                      {item.servicio.nombre}
                    </Link>
                    {precio.principal && (
                      <span className="text-sm font-bold tabular-nums">{precio.principal}</span>
                    )}
                  </div>
                  {!mayorista && precio.principal && (
                    <BotonCarrito
                      planId={plan.id}
                      nombre={`${item.servicio.nombre} (${plan.nombre})`}
                    />
                  )}
                </div>
              </article>
            );
          })}
        </Carril>
      </div>
    </Seccion>
  );
}

/* ---------------------------------------------------------- métodos de pago */

export function MetodosPago({
  b,
  contexto,
}: {
  b: BloqueDe<'metodos-pago'>;
  contexto: ContextoBloques;
}) {
  const grupos = new Map<string, string[]>();
  for (const m of contexto.metodosPago ?? []) {
    const lista = grupos.get(m.nombre) ?? [];
    if (!lista.includes(m.moneda)) lista.push(m.moneda);
    grupos.set(m.nombre, lista);
  }
  if (grupos.size === 0) {
    return (
      <SinDatos
        contexto={contexto}
        titulo={b.titulo}
        motivo="No hay métodos de cobro activos (Finanzas → Métodos de cobro)."
      />
    );
  }
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-6 py-12')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
          {[...grupos].map(([nombre, monedas]) => (
            <li key={nombre} className="tarjeta-brillo flex items-center gap-3 px-4 py-3.5">
              <span
                className="orbe orbe-sm"
                style={{ '--c': '#22d3ee' } as CSSProperties}
                aria-hidden="true"
              >
                <CreditCard />
              </span>
              <span className="grid min-w-0">
                <b className="truncate text-sm">{nombre}</b>
                <span className="text-xs text-tinta-tenue">{monedas.join(' · ')}</span>
              </span>
            </li>
          ))}
          <li className="tarjeta-brillo flex items-center gap-3 px-4 py-3.5">
            <span
              className="orbe orbe-sm"
              style={{ '--c': '#a855f7' } as CSSProperties}
              aria-hidden="true"
            >
              <Wallet />
            </span>
            <span className="grid min-w-0">
              <b className="truncate text-sm">Saldo NV</b>
              <span className="text-xs text-tinta-tenue">Tu billetera</span>
            </span>
          </li>
        </ul>
      </div>
    </Seccion>
  );
}

/* ------------------------------------------------------------------- canal */

export function Canal({ b, contexto }: { b: BloqueDe<'canal'>; contexto: ContextoBloques }) {
  const canal = contexto.contacto?.canalWhatsapp;
  if (!canal) {
    return (
      <SinDatos
        contexto={contexto}
        titulo={b.titulo}
        motivo="Falta el enlace del canal de WhatsApp (Editor visual → Contacto y redes)."
      />
    );
  }
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'py-8')}>
        <div
          className="tarjeta-brillo flex flex-col gap-5 p-6 @3xl:flex-row @3xl:items-center"
          style={{ '--c': '#22c55e' } as CSSProperties}
        >
          <span className="orbe" style={{ '--c': '#22c55e' } as CSSProperties} aria-hidden="true">
            <MessageCircle />
          </span>
          <div className="grid flex-1 gap-1">
            {b.etiqueta && <span className="etiqueta-orbita w-fit">{b.etiqueta}</span>}
            <h2 className="text-[clamp(1.25rem,2.6vw,1.6rem)]">{b.titulo}</h2>
            {b.texto && <p className="text-sm text-tinta-suave">{b.texto}</p>}
          </div>
          <a
            href={canal}
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton('primario', 'lg')}
          >
            {b.boton}
          </a>
        </div>
      </div>
    </Seccion>
  );
}

/* ------------------------------------------------------------------- panel */

function VisualBilletera() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.35),transparent)]" />
      <div className="relative grid aspect-[1.6] content-between overflow-hidden rounded-[1.4rem] border border-white/20 bg-[linear-gradient(135deg,#1d4ed8_0%,#6d28d9_55%,#be185d_100%)] p-5 shadow-[0_30px_60px_-20px_rgb(109_40_217/0.7)] motion-safe:animate-[nv-flotar_6s_ease-in-out_infinite]">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(115deg,rgb(255_255_255/0.05)_0_2px,transparent_2px_14px)]" />
        <div className="relative flex items-start justify-between">
          <span className="text-[0.68rem] font-bold tracking-[0.2em] text-white/80 uppercase">
            Billetera NV
          </span>
          <img src="/marca/marca.webp" alt="" width={62} height={48} className="h-8 w-auto" />
        </div>
        <div className="relative grid gap-1">
          <span className="font-titulo text-2xl font-extrabold text-white">Tu saldo</span>
          <span className="text-sm text-white/80">Listo para tus próximas compras</span>
        </div>
      </div>
    </div>
  );
}

function VisualUniverso({ items }: { items: ServicioTienda[] }) {
  const muestra = items.slice(0, 5);
  if (muestra.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className="relative flex min-h-44 items-center justify-center @2xl:min-h-64"
    >
      <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgb(79_141_255/0.25),transparent)]" />
      {muestra.map((s, i) => {
        const centro = Math.floor(muestra.length / 2);
        const d = i - centro;
        return (
          <div
            key={s.servicio.id}
            className="relative -mx-6 transition-transform"
            style={{
              zIndex: 10 - Math.abs(d),
              transform: `translateY(${Math.abs(d) * 10}px) rotate(${d * 6}deg) scale(${1 - Math.abs(d) * 0.12})`,
              opacity: 1 - Math.abs(d) * 0.22,
            }}
          >
            <ArteServicio
              arte={s.arte}
              nombre={s.servicio.nombre}
              categoria={s.servicio.categoria}
              color={s.color}
              className="h-40 w-auto @2xl:h-56 @5xl:h-64"
            />
          </div>
        );
      })}
    </div>
  );
}

export function Panel({ b, contexto }: { b: BloqueDe<'panel'>; contexto: ContextoBloques }) {
  const delUniverso =
    b.visual === 'universo' && b.categoria
      ? servicios(contexto).filter((s) => s.servicio.categoria === b.categoria)
      : [];
  const visual =
    b.visual === 'billetera' ? (
      <VisualBilletera />
    ) : delUniverso.length > 0 ? (
      <VisualUniverso items={delUniverso} />
    ) : null;
  const acento = b.fondo === 'acento';
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'py-10')}>
        <div
          className={clsx(
            'relative grid items-center gap-10 overflow-hidden rounded-[1.75rem] border border-borde p-7 @3xl:p-12',
            visual ? '@4xl:grid-cols-[1.05fr_1fr]' : '@4xl:grid-cols-[1fr_auto]',
            acento
              ? 'bg-[radial-gradient(70%_90%_at_100%_50%,rgb(139_92_246/0.22),transparent_70%),radial-gradient(60%_80%_at_0%_0%,rgb(34_211_238/0.12),transparent_70%),linear-gradient(180deg,rgb(15_21_48/0.85),rgb(8_11_26/0.9))]'
              : 'bg-[radial-gradient(60%_80%_at_0%_100%,rgb(37_99_235/0.2),transparent_70%),linear-gradient(180deg,rgb(15_21_48/0.85),rgb(8_11_26/0.9))]',
          )}
        >
          <div className="grid justify-items-start gap-4">
            {b.etiqueta && <span className="etiqueta-orbita">{b.etiqueta}</span>}
            <h2 className="text-[clamp(1.7rem,4vw,2.6rem)]">
              <TituloConDestacado titulo={b.titulo} destacado={b.resaltado} />
            </h2>
            {b.texto && <p className="max-w-xl text-tinta-suave">{b.texto}</p>}
            {b.puntos.length > 0 && (
              <ul className="grid gap-2 text-[0.95rem]">
                {b.puntos.map((p, i) => (
                  <li key={i} className="flex gap-2.5">
                    <Check className="mt-1 size-4 shrink-0 text-exito" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
            {visual && (b.boton || b.botonSecundario) && (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <BotonSitio boton={b.boton} />
                <BotonSitio boton={b.botonSecundario} variante="enlace" />
              </div>
            )}
          </div>
          {visual ??
            ((b.boton || b.botonSecundario) && (
              <div className="flex flex-wrap items-center gap-3">
                <BotonSitio boton={b.boton} variante={acento ? 'secundario' : 'primario'} />
                <BotonSitio boton={b.botonSecundario} variante="enlace" />
              </div>
            ))}
        </div>
      </div>
    </Seccion>
  );
}

/* ------------------------------------------------------ portal de la portada */

/** Portal de la portada: anillo con las tarjetas de los servicios más pedidos. */
export function PortalServicios({ contexto }: { contexto: ContextoBloques }) {
  const lista = servicios(contexto);
  const ordenados = [...lista].sort(
    (a, b) => (a.ranking ?? Number.POSITIVE_INFINITY) - (b.ranking ?? Number.POSITIVE_INFINITY),
  );
  const conArte = ordenados.filter((s) => s.arte).slice(0, 3);
  const cats = categoriasTienda(lista, contexto.moneda).slice(0, 4);
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto grid aspect-square w-full max-w-[26rem] place-items-center"
    >
      <div className="absolute inset-[6%] rounded-full bg-[conic-gradient(from_200deg,#22d3ee,#3b82f6,#8b5cf6,#e879f9,#22d3ee)] p-[7%] shadow-[0_0_80px_-10px_rgb(139_92_246/0.8)] motion-safe:animate-[nv-girar_40s_linear_infinite]">
        <div className="size-full rounded-full bg-[radial-gradient(circle_at_50%_40%,#0b1030,#04050d_70%)]" />
      </div>
      {conArte.length > 0 ? (
        <div className="relative flex items-center justify-center">
          {conArte.map((s, i) => {
            const pos = conArte.length === 1 ? 0 : i === 0 ? 0 : i === 1 ? -1 : 1;
            return (
              <div
                key={s.servicio.id}
                className="relative -mx-8"
                style={{
                  order: pos === -1 ? 0 : pos === 0 ? 1 : 2,
                  zIndex: pos === 0 ? 3 : 1,
                  transform: `rotate(${pos * 9}deg) translateY(${Math.abs(pos) * 14}px) scale(${pos === 0 ? 1 : 0.78})`,
                }}
              >
                <ArteServicio
                  arte={s.arte}
                  nombre={s.servicio.nombre}
                  categoria={s.servicio.categoria}
                  color={s.color}
                  className="h-40 w-auto @2xl:h-56 @5xl:h-64"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative grid grid-cols-2 gap-5">
          {cats.length > 0 ? (
            cats.map((c) => <Orbe key={c.id} categoria={c.id} color={c.color} tamano="xl" />)
          ) : (
            <img
              src="/marca/marca.webp"
              alt=""
              width={124}
              height={96}
              className="col-span-2 h-24 w-auto"
            />
          )}
        </div>
      )}
    </div>
  );
}
