import {
  BLOQUES_INICIO,
  INFO_CATEGORIA,
  planMasBarato,
  REGLAS_COBRO,
  type ServicioTienda,
  serviciosTienda,
} from '@nv/shared';
import { Globe, Headset, type LucideIcon, Plus, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { ArteServicio } from '@/componentes/tienda/arte';
import { AvisoMayorista } from '@/componentes/tienda/aviso-mayorista';
import { Carril } from '@/componentes/tienda/deslizables';
import { CopiarEnlace, DetalleServicio, type SaldoDetalle } from '@/componentes/tienda/detalle';
import { Migas } from '@/componentes/tienda/migas';
import { TarjetaServicio } from '@/componentes/tienda/tarjeta-servicio';
import { leerPaginaPublicada } from '@/lib/sitio';
import {
  catalogoTienda,
  leerTemaPublico,
  mayoristaTienda,
  monedaTienda,
  sesionTienda,
} from '@/lib/tienda';

type Parametros = Record<string, string | string[] | undefined>;

async function servicioDe(slug: string): Promise<{
  item: ServicioTienda;
  todos: ServicioTienda[];
} | null> {
  const catalogo = await catalogoTienda();
  if (!catalogo) return null;
  const todos = serviciosTienda(catalogo);
  const item = todos.find((s) => s.servicio.slug === slug);
  return item ? { item, todos } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ servicio: string }>;
}): Promise<Metadata> {
  const datos = await servicioDe((await params).servicio);
  if (!datos) return { title: 'Servicio no encontrado' };
  const { servicio } = datos.item;
  const descripcion =
    servicio.descripcion ??
    `${servicio.nombre} en NV Streaming: elige tu plan, paga en tu moneda y gestiónalo desde tu panel.`;
  return {
    title: servicio.nombre,
    description: descripcion,
    openGraph: { title: servicio.nombre, description: descripcion },
  };
}

/** Preguntas frecuentes de la portada publicada (las mismas que ve toda la tienda). */
async function preguntasTienda() {
  const portada = await leerPaginaPublicada('/');
  const bloques = portada?.bloques?.length ? portada.bloques : BLOQUES_INICIO;
  const b = bloques.find((x) => x.tipo === 'preguntas');
  return b?.tipo === 'preguntas' ? b.elementos.slice(0, 5) : [];
}

function Confianza({ items }: { items: { icono: LucideIcon; texto: string; color: string }[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2 @xl:gap-2.5">
      {items.map(({ icono: Icono, texto, color }) => (
        <li
          key={texto}
          className="flex flex-col items-center gap-2 rounded-2xl border border-borde bg-white/[0.02] p-3 text-center @xl:flex-row @xl:gap-3 @xl:text-left"
        >
          <span
            className="orbe orbe-sm"
            style={{ '--c': color } as CSSProperties}
            aria-hidden="true"
          >
            <Icono />
          </span>
          <span className="text-xs font-semibold @xl:text-sm">{texto}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DetalleServicioPagina({
  params,
  searchParams,
}: {
  params: Promise<{ servicio: string }>;
  searchParams: Promise<Parametros>;
}) {
  const [{ servicio: slug }, parametros] = await Promise.all([params, searchParams]);
  const pedida = typeof parametros.moneda === 'string' ? parametros.moneda : undefined;
  const [datos, moneda, tema, sesion, preguntas] = await Promise.all([
    servicioDe(slug),
    monedaTienda(pedida),
    leerTemaPublico(),
    sesionTienda(),
    preguntasTienda(),
  ]);
  if (!datos) notFound();
  const { item, todos } = datos;
  const { servicio } = item;
  const mayorista = await mayoristaTienda(moneda);
  const categoria = servicio.categoria ? INFO_CATEGORIA[servicio.categoria] : null;
  const pedido = typeof parametros.plan === 'string' ? parametros.plan : undefined;
  const inicial = item.planes.find((p) => p.id === pedido)?.id ?? item.planes[0]?.id ?? '';
  const saldo: SaldoDetalle | null =
    sesion?.saldoUsd && sesion.enlaceSaldo
      ? { usd: sesion.saldoUsd, enlace: sesion.enlaceSaldo }
      : null;
  const similares = todos.filter(
    (s) => s.servicio.id !== servicio.id && s.servicio.categoria === servicio.categoria,
  );
  const otros =
    similares.length > 0 ? similares : todos.filter((s) => s.servicio.id !== servicio.id);
  const metodos = [...new Set(tema.metodosPago.map((m) => m.nombre))];
  const whatsapp = tema.contacto.whatsapp;

  return (
    <div className="@container">
      <div className="contenedor grid gap-7 pt-7 pb-16">
        <Migas
          pasos={[
            { texto: 'Inicio', href: '/' },
            { texto: 'Catálogo', href: '/catalogo' },
            ...(categoria && servicio.categoria
              ? [{ texto: categoria.nombre, href: `/catalogo?categoria=${servicio.categoria}` }]
              : []),
            { texto: servicio.nombre },
          ]}
        />
        {mayorista && <AvisoMayorista mayorista={mayorista} />}
        <DetalleServicio
          nombre={servicio.nombre}
          planes={item.planes}
          inicial={inicial}
          moneda={moneda}
          mayorista={mayorista}
          saldo={saldo}
          arte={
            <div
              className="escenario relative min-h-[18rem] rounded-[1.6rem] border border-borde @2xl:min-h-[26rem] @5xl:min-h-[34rem]"
              style={{ '--c': item.color } as CSSProperties}
            >
              {categoria && (
                <span className="etiqueta-orbita absolute top-4 left-4 z-10">
                  Universo {categoria.nombre}
                </span>
              )}
              <ArteServicio
                arte={item.arte}
                nombre={servicio.nombre}
                categoria={servicio.categoria}
                color={item.color}
                prioridad
                decorativa={false}
                className="relative h-56 w-auto @2xl:h-80 @5xl:h-96 [&_.orbe]:scale-150"
              />
            </div>
          }
          cabecera={
            <div className="flex items-start gap-3">
              <div className="grid min-w-0 flex-1 gap-2">
                <h1 className="text-[clamp(2rem,5.5vw,3.2rem)] leading-[1.04]">
                  {servicio.nombre}
                </h1>
                {servicio.descripcion && <p className="text-tinta-suave">{servicio.descripcion}</p>}
              </div>
              <CopiarEnlace />
            </div>
          }
          confianza={
            <Confianza
              items={[
                { icono: Zap, texto: 'Lo gestionas desde tu panel', color: '#22d3ee' },
                { icono: Globe, texto: 'Pagas en tu moneda', color: '#5b98ff' },
                {
                  icono: Headset,
                  texto: whatsapp ? 'Ayuda por WhatsApp' : 'Soporte en español',
                  color: '#22c55e',
                },
              ]}
            />
          }
          pagos={
            metodos.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-tinta-tenue">Pagas con</span>
                {[...metodos, 'Saldo NV'].map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-borde px-3 py-1 text-[0.8rem] text-tinta"
                  >
                    {m}
                  </span>
                ))}
              </div>
            ) : null
          }
          comoSeActiva={
            <ol className="grid gap-3 @3xl:grid-cols-3">
              {[
                [
                  'Elige tu plan',
                  `Agrégalo al carrito (hasta ${REGLAS_COBRO.articulosPorPedido} planes por pedido) o cómpralo ahora.`,
                ],
                [
                  'Paga y sube el comprobante',
                  'Con uno de los métodos de pago activos o con el saldo de tu billetera.',
                ],
                [
                  'Se activa en tu panel',
                  'Cuando el equipo confirma tu pago, el plan se activa y lo ves en tu panel con su vencimiento.',
                ],
              ].map(([titulo, texto], i) => (
                <li
                  key={titulo}
                  className="grid content-start gap-1.5 rounded-2xl border border-borde bg-white/[0.02] p-5"
                >
                  <span className="texto-degradado font-titulo text-3xl font-extrabold">
                    0{i + 1}
                  </span>
                  <b className="font-titulo">{titulo}</b>
                  <p className="text-sm text-tinta-suave">{texto}</p>
                </li>
              ))}
            </ol>
          }
          preguntas={
            preguntas.length > 0 ? (
              <div className="grid gap-2.5">
                {preguntas.map((p) => (
                  <details
                    key={p.pregunta}
                    className="group rounded-2xl border border-borde bg-white/[0.02] open:border-borde-fuerte"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
                      {p.pregunta}
                      <Plus
                        className="size-4 shrink-0 text-cian transition-transform group-open:rotate-45"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="px-5 pb-4 text-sm text-tinta-suave">{p.respuesta}</p>
                  </details>
                ))}
              </div>
            ) : (
              <p className="text-sm text-tinta-suave">
                ¿Tienes una duda?{' '}
                <Link
                  href="/cuenta/soporte/nueva"
                  className="font-medium text-cian hover:underline"
                >
                  Escríbenos desde tu panel
                </Link>
                .
              </p>
            )
          }
        />

        {otros.length > 0 && (
          <section aria-labelledby="similares" className="mt-10">
            <Carril
              etiqueta={
                similares.length > 0 && categoria
                  ? `También en ${categoria.nombre}`
                  : 'Otros servicios'
              }
              cabecera={
                <h2 id="similares" className="text-[clamp(1.45rem,3.6vw,2.15rem)]">
                  {similares.length > 0 && categoria
                    ? `También en ${categoria.nombre}`
                    : 'Otros servicios'}
                </h2>
              }
              acciones={
                <Link
                  href={
                    servicio.categoria ? `/catalogo?categoria=${servicio.categoria}` : '/catalogo'
                  }
                  className="text-sm font-medium whitespace-nowrap text-cian hover:underline"
                >
                  Ver catálogo
                </Link>
              }
            >
              {otros.slice(0, 12).map((s) => {
                const plan = planMasBarato(s.planes, moneda) ?? s.planes[0];
                return plan ? (
                  <TarjetaServicio
                    key={s.servicio.id}
                    item={s}
                    plan={plan}
                    moneda={moneda}
                    mayorista={mayorista}
                  />
                ) : null;
              })}
            </Carril>
          </section>
        )}
      </div>
    </div>
  );
}
