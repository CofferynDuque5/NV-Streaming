/**
 * Bloques del sitio público. Son los mismos para la web y para la vista previa
 * del editor: no usan APIs del servidor ni estado, y reciben los datos (el
 * catálogo) por propiedades. Se adaptan con consultas de contenedor (@container),
 * así la vista previa a ancho de móvil se ve igual que en un teléfono.
 */
import {
  type BloqueDe,
  type BloqueSitio,
  type BotonSitio as DatosBoton,
  type CatalogoPublico,
  type FondoBloque,
  type IconoSitio,
  INFO_MONEDA,
  type Moneda,
  urlMedio,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  Clock,
  CreditCard,
  Gift,
  Globe,
  Headset,
  Heart,
  ImageIcon,
  Info,
  Layers,
  LockKeyhole,
  type LucideIcon,
  MessageCircle,
  MonitorPlay,
  ShieldCheck,
  Star,
  Store,
  TriangleAlert,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { agruparPorServicio, SelectorMoneda, TarjetaPlan } from '@/componentes/planes';
import { type MonedaMayorista, PlanesMayoristas } from '@/componentes/planes-mayoristas';
import { clasesBoton } from '@/componentes/ui/boton';
import type { VistaMayorista } from '@/lib/revendedor-publico';
import { EnlaceSitio, TextoEnriquecido } from './texto-enriquecido';

export const ICONOS: Record<IconoSitio, LucideIcon> = {
  insignia: BadgeCheck,
  tarjeta: CreditCard,
  candado: LockKeyhole,
  soporte: Headset,
  billetera: Wallet,
  capas: Layers,
  tienda: Store,
  escudo: ShieldCheck,
  rayo: Zap,
  reloj: Clock,
  estrella: Star,
  corazon: Heart,
  globo: Globe,
  pantalla: MonitorPlay,
  regalo: Gift,
  personas: Users,
  mensaje: MessageCircle,
  check: CircleCheck,
};

/** Datos que necesitan algunos bloques (hoy, el catálogo para el bloque de planes). */
export interface ContextoBloques {
  /** Ruta de la página, para los enlaces del selector de moneda. */
  ruta: string;
  catalogo: CatalogoPublico | null;
  moneda: Moneda;
  /**
   * Precios de un revendedor con sesión. Se calcula en cada petición y solo
   * llega aquí por propiedades: el contenido en caché del sitio no lo incluye.
   */
  mayorista?: { vista: VistaMayorista; moneda: MonedaMayorista } | null;
}

const contenedor = 'mx-auto w-full max-w-6xl px-4 @2xl:px-6';

function Seccion({
  bloque,
  children,
  className,
}: {
  bloque: { ancla?: string | null | undefined; fondo?: FondoBloque | undefined };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={bloque.ancla ?? undefined}
      className={clsx(
        'scroll-mt-20',
        bloque.fondo === 'suave' && 'border-y border-borde bg-superficie/40',
        bloque.fondo === 'acento' &&
          'border-y border-borde bg-[linear-gradient(135deg,var(--nv-acento-suave),transparent_60%)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

function Encabezado({
  etiqueta,
  titulo,
  subtitulo,
  acento,
  centrado,
}: {
  etiqueta?: string | null | undefined;
  titulo: string;
  subtitulo?: string | null | undefined;
  acento?: boolean;
  centrado?: boolean;
}) {
  return (
    <div className={clsx('grid max-w-2xl gap-3', centrado && 'mx-auto text-center')}>
      {etiqueta && (
        <p className={clsx('text-sm font-semibold', acento ? 'text-acento' : 'text-marca')}>
          {etiqueta}
        </p>
      )}
      <h2 className="text-3xl font-semibold">{titulo}</h2>
      {subtitulo && <p className="text-tinta-suave">{subtitulo}</p>}
    </div>
  );
}

function BotonSitio({
  boton,
  variante = 'primario',
  tamano = 'lg',
  flecha,
  className,
}: {
  boton: DatosBoton | null | undefined;
  variante?: 'primario' | 'secundario';
  tamano?: 'md' | 'lg';
  flecha?: boolean;
  className?: string;
}) {
  if (!boton?.texto || !boton.enlace) return null;
  return (
    <EnlaceSitio href={boton.enlace} className={clasesBoton(variante, tamano, className)}>
      {boton.texto}
      {flecha && <ArrowRight className="size-4" aria-hidden="true" />}
    </EnlaceSitio>
  );
}

/** Imagen de la biblioteca con proporción fija: no mueve la página al cargar. */
function ImagenMedio({
  medioId,
  alt,
  proporcion,
  prioritaria,
  className,
}: {
  medioId: string | null | undefined;
  alt: string;
  proporcion: string;
  prioritaria?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx('relative w-full overflow-hidden bg-hundida', className)}
      style={{ aspectRatio: proporcion.replace(':', ' / ') }}
    >
      {medioId ? (
        <img
          src={urlMedio(medioId)}
          alt={alt}
          loading={prioritaria ? 'eager' : 'lazy'}
          fetchPriority={prioritaria ? 'high' : 'auto'}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-tinta-tenue">
          <ImageIcon className="size-8" aria-hidden="true" />
          <span className="sr-only">Sin imagen</span>
        </span>
      )}
    </div>
  );
}

function TituloConDestacado({ titulo, destacado }: { titulo: string; destacado?: string | null }) {
  const i = destacado ? titulo.indexOf(destacado) : -1;
  if (!destacado || i < 0) return titulo;
  return (
    <>
      {titulo.slice(0, i)}
      <span className="text-marca">{destacado}</span>
      {titulo.slice(i + destacado.length)}
    </>
  );
}

function Portada({ b, principal }: { b: BloqueDe<'portada'>; principal: boolean }) {
  const Titulo = principal ? 'h1' : 'h2';
  const visual = b.imagen?.medioId || b.ilustracion;
  return (
    <Seccion bloque={b} className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-[34rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--nv-marca-suave),transparent_70%)]"
      />
      <div
        className={clsx(
          contenedor,
          'relative grid items-center gap-12 pt-16 pb-20 @5xl:pt-24 @5xl:pb-28',
          visual ? '@5xl:grid-cols-[1.1fr_1fr]' : 'max-w-4xl justify-items-center text-center',
        )}
      >
        <div className={clsx('grid gap-7', !visual && 'justify-items-center')}>
          {b.etiqueta && (
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-tinta-suave">
              <span className="size-1.5 rounded-full bg-exito" aria-hidden="true" />
              {b.etiqueta}
            </p>
          )}
          <Titulo className="text-4xl leading-[1.08] font-semibold @2xl:text-5xl @5xl:text-[3.4rem]">
            <TituloConDestacado titulo={b.titulo} destacado={b.destacado} />
          </Titulo>
          {b.subtitulo && <p className="max-w-xl text-lg text-tinta-suave">{b.subtitulo}</p>}
          {(b.botonPrimario || b.botonSecundario) && (
            <div className={clsx('flex flex-wrap gap-3', !visual && 'justify-center')}>
              <BotonSitio boton={b.botonPrimario} flecha />
              <BotonSitio boton={b.botonSecundario} variante="secundario" />
            </div>
          )}
        </div>
        {b.imagen?.medioId ? (
          <ImagenMedio
            medioId={b.imagen.medioId}
            alt={b.imagen.alt}
            proporcion="4:3"
            prioritaria={principal}
            className="rounded-[1.4rem] border border-borde-fuerte shadow-nv"
          />
        ) : b.ilustracion ? (
          <VistaPanel />
        ) : null}
      </div>
    </Seccion>
  );
}

/** Ilustración del panel hecha con CSS: ligera y sin datos inventados. */
function VistaPanel() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md @5xl:max-w-none">
      <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,var(--nv-acento-suave),transparent)]" />
      <div className="relative grid gap-4 rounded-[1.4rem] border border-borde-fuerte bg-superficie p-5 shadow-nv">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-peligro/70" />
          <span className="size-2.5 rounded-full bg-aviso/70" />
          <span className="size-2.5 rounded-full bg-exito/70" />
          <span className="ml-3 h-2.5 w-32 rounded-full bg-hundida" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['bg-marca', 'bg-acento', 'bg-exito'].map((c) => (
            <div key={c} className="grid gap-2 rounded-xl border border-borde bg-hundida p-3">
              <span className={`h-1.5 w-8 rounded-full ${c}`} />
              <span className="h-3 w-3/4 rounded bg-borde-fuerte" />
              <span className="h-2 w-1/2 rounded bg-borde" />
            </div>
          ))}
        </div>
        <div className="grid gap-2.5 rounded-xl border border-borde bg-hundida p-4">
          {[88, 64, 76, 52].map((w, i) => (
            <div key={w} className="flex items-center gap-3">
              <span
                className={`size-7 rounded-lg ${i % 2 ? 'bg-acento-suave' : 'bg-marca-suave'}`}
              />
              <span className="h-2.5 rounded bg-borde-fuerte" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Planes({ b, contexto }: { b: BloqueDe<'planes'>; contexto: ContextoBloques }) {
  const { catalogo, moneda, ruta, mayorista } = contexto;
  if (mayorista) {
    return (
      <Seccion bloque={b}>
        <div className={clsx(contenedor, 'grid gap-10 py-20')}>
          <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
          <PlanesMayoristas
            vista={mayorista.vista}
            moneda={mayorista.moneda}
            publicos={catalogo?.planes ?? null}
            servicio={b.servicio}
            ruta={ruta}
            conServicios={!b.servicio}
            claseRejilla="grid gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3"
          />
        </div>
      </Seccion>
    );
  }
  const planes = (catalogo?.planes ?? []).filter(
    (p) => !b.servicio || p.servicio.slug === b.servicio,
  );
  const grupos = agruparPorServicio(planes);
  const monedas = catalogo?.monedas ?? ['USD'];
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-10 py-20')}>
        <div className="grid gap-4">
          <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
          {grupos.length > 0 && <SelectorMoneda monedas={monedas} actual={moneda} ruta={ruta} />}
          {grupos.length > 0 && moneda !== 'USD' && (
            <p className="text-xs text-tinta-tenue">
              Precios en {INFO_MONEDA[moneda].nombre}, calculados con la tasa del día; pueden
              cambiar. El importe exacto queda fijado en tu factura.
            </p>
          )}
        </div>
        {grupos.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-nv border border-borde bg-superficie px-6 py-12 text-center shadow-nv">
            <Layers className="size-5 text-marca" aria-hidden="true" />
            <h3 className="font-semibold">Estamos preparando el catálogo</h3>
            <p className="text-sm text-tinta-suave">
              Vuelve pronto o crea tu cuenta y te avisaremos cuando haya planes disponibles.
            </p>
          </div>
        ) : (
          grupos.map((g) => (
            <div key={g.servicio.id} className="grid gap-5">
              {!b.servicio && <h3 className="text-2xl font-semibold">{g.servicio.nombre}</h3>}
              <div className="grid gap-5 @2xl:grid-cols-2 @5xl:grid-cols-3">
                {g.planes.map((p) => (
                  <TarjetaPlan
                    key={p.id}
                    plan={p}
                    moneda={moneda}
                    accion={
                      <EnlaceSitio
                        href={`/cuenta/planes?plan=${p.id}&moneda=${moneda}`}
                        className={clasesBoton('primario', 'md', 'w-full')}
                      >
                        Elegir este plan <ArrowRight className="size-4" aria-hidden="true" />
                      </EnlaceSitio>
                    }
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Seccion>
  );
}

function Beneficios({ b }: { b: BloqueDe<'beneficios'> }) {
  const acento = b.fondo === 'acento';
  if (b.variante === 'lista') {
    return (
      <Seccion bloque={b}>
        <div
          className={clsx(
            contenedor,
            'grid gap-10 py-20 @5xl:grid-cols-[1fr_1.2fr] @5xl:items-center',
          )}
        >
          <div className="grid gap-4">
            <Encabezado
              etiqueta={b.etiqueta}
              titulo={b.titulo}
              subtitulo={b.subtitulo}
              acento={acento}
            />
            <BotonSitio boton={b.boton} variante="secundario" tamano="md" className="w-fit" />
          </div>
          <ul className="grid gap-3">
            {b.elementos.map((e, i) => {
              const Icono = ICONOS[e.icono] ?? CircleCheck;
              return (
                <li key={i} className="flex gap-4 rounded-nv border border-borde bg-superficie p-5">
                  <Icono
                    className={clsx(
                      'mt-0.5 size-5 shrink-0',
                      acento ? 'text-acento' : 'text-marca',
                    )}
                    aria-hidden="true"
                  />
                  <div className="grid gap-1">
                    <h3 className="font-semibold">{e.titulo}</h3>
                    <p className="text-sm text-tinta-suave">{e.texto}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Seccion>
    );
  }
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-10 py-20')}>
        <Encabezado
          etiqueta={b.etiqueta}
          titulo={b.titulo}
          subtitulo={b.subtitulo}
          acento={acento}
        />
        <ul
          className={clsx(
            'grid gap-4 @2xl:grid-cols-2',
            b.elementos.length % 3 === 0 && '@5xl:grid-cols-3',
          )}
        >
          {b.elementos.map((e, i) => {
            const Icono = ICONOS[e.icono] ?? CircleCheck;
            return (
              <li
                key={i}
                className="flex gap-4 rounded-nv border border-borde bg-superficie p-6 shadow-nv"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-marca-suave text-marca">
                  <Icono className="size-5" aria-hidden="true" />
                </span>
                <div className="grid gap-1.5">
                  <h3 className="font-semibold">{e.titulo}</h3>
                  <p className="text-sm text-tinta-suave">{e.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <BotonSitio boton={b.boton} variante="secundario" tamano="md" className="w-fit" />
      </div>
    </Seccion>
  );
}

function Pasos({ b }: { b: BloqueDe<'pasos'> }) {
  const n = b.elementos.length;
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-10 py-20')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ol
          className={clsx(
            'grid gap-4',
            n % 3 === 0 ? '@3xl:grid-cols-3' : n > 1 && '@3xl:grid-cols-2',
            n % 4 === 0 && '@5xl:grid-cols-4',
          )}
        >
          {b.elementos.map((p, i) => (
            <li
              key={i}
              className="grid content-start gap-3 rounded-nv border border-borde bg-superficie p-6 shadow-nv"
            >
              <span className="font-titulo text-sm font-semibold text-marca">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-lg font-semibold">{p.titulo}</h3>
              <p className="text-sm text-tinta-suave">{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </Seccion>
  );
}

function Testimonios({ b }: { b: BloqueDe<'testimonios'> }) {
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-10 py-20')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ul className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {b.elementos.map((t, i) => (
            <li key={i}>
              <figure className="grid h-full content-between gap-5 rounded-nv border border-borde bg-superficie p-6 shadow-nv">
                <blockquote className="text-tinta-suave">«{t.cita}»</blockquote>
                <figcaption className="grid gap-0.5 text-sm">
                  <span className="font-semibold text-tinta">{t.autor}</span>
                  {t.detalle && <span className="text-tinta-tenue">{t.detalle}</span>}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Seccion>
  );
}

function Preguntas({ b }: { b: BloqueDe<'preguntas'> }) {
  return (
    <Seccion bloque={b}>
      <div className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-20 @2xl:px-6">
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <div className="grid gap-3">
          {b.elementos.map((p, i) => (
            <details
              key={i}
              className="group rounded-nv border border-borde bg-superficie px-5 py-4 open:shadow-nv"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {p.pregunta}
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-marca transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <TextoEnriquecido fuente={p.respuesta} className="mt-3 text-sm" />
            </details>
          ))}
        </div>
      </div>
    </Seccion>
  );
}

function Llamada({ b }: { b: BloqueDe<'llamada'> }) {
  return (
    <Seccion bloque={b}>
      <div className="mx-auto grid w-full max-w-3xl justify-items-center gap-5 px-4 py-24 text-center @2xl:px-6">
        <h2 className="text-3xl font-semibold">{b.titulo}</h2>
        {b.texto && <p className="text-tinta-suave">{b.texto}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          <BotonSitio boton={b.boton} />
          <BotonSitio boton={b.botonSecundario} variante="secundario" />
        </div>
      </div>
    </Seccion>
  );
}

function Texto({ b }: { b: BloqueDe<'texto'> }) {
  return (
    <Seccion bloque={b}>
      <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-14 @2xl:px-6">
        {b.titulo && <h2 className="text-3xl font-semibold">{b.titulo}</h2>}
        <TextoEnriquecido fuente={b.contenido} />
      </div>
    </Seccion>
  );
}

function Imagen({ b }: { b: BloqueDe<'imagen'> }) {
  return (
    <Seccion bloque={b}>
      <figure className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-12 @2xl:px-6">
        <ImagenMedio
          medioId={b.medioId}
          alt={b.alt}
          proporcion={b.proporcion}
          className="rounded-nv border border-borde"
        />
        {b.leyenda && (
          <figcaption className="text-center text-sm text-tinta-tenue">{b.leyenda}</figcaption>
        )}
      </figure>
    </Seccion>
  );
}

const TONOS_BANNER = {
  info: { clase: 'border-marca/25 bg-marca-suave', icono: Info, color: 'text-marca' },
  exito: { clase: 'border-exito/30 bg-exito-suave', icono: CircleCheck, color: 'text-exito' },
  aviso: { clase: 'border-aviso/30 bg-aviso-suave', icono: TriangleAlert, color: 'text-aviso' },
} as const;

function Banner({ b }: { b: BloqueDe<'banner'> }) {
  const tono = TONOS_BANNER[b.tono] ?? TONOS_BANNER.info;
  const Icono = tono.icono;
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'py-5')}>
        <aside
          className={clsx(
            'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm',
            tono.clase,
          )}
        >
          <Icono className={clsx('size-4 shrink-0', tono.color)} aria-hidden="true" />
          <p className="min-w-0 flex-1">{b.texto}</p>
          {b.enlace?.texto && (
            <EnlaceSitio
              href={b.enlace.enlace}
              className="font-medium text-marca underline underline-offset-2"
            >
              {b.enlace.texto}
            </EnlaceSitio>
          )}
        </aside>
      </div>
    </Seccion>
  );
}

function Bloque({
  bloque,
  contexto,
  principal,
}: {
  bloque: BloqueSitio;
  contexto: ContextoBloques;
  principal: boolean;
}) {
  switch (bloque.tipo) {
    case 'portada':
      return <Portada b={bloque} principal={principal} />;
    case 'planes':
      return <Planes b={bloque} contexto={contexto} />;
    case 'beneficios':
      return <Beneficios b={bloque} />;
    case 'pasos':
      return <Pasos b={bloque} />;
    case 'testimonios':
      return <Testimonios b={bloque} />;
    case 'preguntas':
      return <Preguntas b={bloque} />;
    case 'llamada':
      return <Llamada b={bloque} />;
    case 'texto':
      return <Texto b={bloque} />;
    case 'imagen':
      return <Imagen b={bloque} />;
    case 'banner':
      return <Banner b={bloque} />;
    default:
      return null;
  }
}

/**
 * Pinta los bloques de una página. La primera portada lleva el título principal
 * (h1); si no hay portada, el título de la página queda como h1 para lectores
 * de pantalla. En la vista previa del editor no hay h1 (ya lo tiene el panel).
 */
export function BloquesSitio({
  bloques,
  titulo,
  contexto,
  vistaPrevia = false,
}: {
  bloques: BloqueSitio[];
  titulo: string;
  contexto: ContextoBloques;
  vistaPrevia?: boolean;
}) {
  const principal = vistaPrevia ? -1 : bloques.findIndex((b) => b.tipo === 'portada');
  return (
    <div className="@container">
      {principal < 0 && !vistaPrevia && <h1 className="sr-only">{titulo}</h1>}
      {bloques.map((b, i) => (
        <Bloque key={b.id || i} bloque={b} contexto={contexto} principal={i === principal} />
      ))}
    </div>
  );
}
