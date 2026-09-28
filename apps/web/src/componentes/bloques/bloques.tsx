/**
 * Bloques del sitio público. Son los mismos para la web y para la vista previa
 * del editor: no usan APIs del servidor ni estado, y reciben los datos (el
 * catálogo, los métodos de pago, el contacto) por propiedades. Se adaptan con
 * consultas de contenedor (@container), así la vista previa a ancho de móvil se
 * ve igual que en un teléfono.
 */
import { type BloqueDe, type BloqueSitio, INFO_MONEDA } from '@nv/shared';
import clsx from 'clsx';
import { ArrowRight, CircleCheck, Info, Layers, TriangleAlert } from 'lucide-react';
import type { CSSProperties } from 'react';
import { agruparPorServicio, TarjetaPlan } from '@/componentes/planes';
import { PlanesMayoristas } from '@/componentes/planes-mayoristas';
import { clasesBoton } from '@/componentes/ui/boton';
import {
  Canal,
  MetodosPago,
  Panel,
  PortalServicios,
  Ranking,
  Servicios,
  Universos,
} from './bloques-tienda';
import {
  BotonSitio,
  COLOR_ICONO,
  type ContextoBloques,
  contenedor,
  Encabezado,
  ICONOS,
  ImagenMedio,
  Seccion,
  TituloConDestacado,
} from './piezas';
import { EnlaceSitio, TextoEnriquecido } from './texto-enriquecido';

export type { ContextoBloques } from './piezas';

function Portada({
  b,
  principal,
  contexto,
}: {
  b: BloqueDe<'portada'>;
  principal: boolean;
  contexto: ContextoBloques;
}) {
  const Titulo = principal ? 'h1' : 'h2';
  const visual = b.imagen?.medioId ? (
    <ImagenMedio
      medioId={b.imagen.medioId}
      alt={b.imagen.alt}
      proporcion="4:3"
      prioritaria={principal}
      className="rounded-[1.4rem] border border-borde-fuerte shadow-nv"
    />
  ) : b.ilustracion ? (
    <PortalServicios contexto={contexto} />
  ) : null;
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'pt-5 pb-2 @3xl:pt-8')}>
        <div
          className={clsx(
            'relative grid items-center gap-10 overflow-hidden rounded-[2rem] border border-borde px-6 py-10 @3xl:px-14 @3xl:py-16',
            'bg-[radial-gradient(70%_80%_at_85%_40%,rgb(139_92_246/0.18),transparent_70%),radial-gradient(60%_70%_at_0%_100%,rgb(37_99_235/0.16),transparent_70%),linear-gradient(180deg,rgb(12_16_38/0.75),rgb(6_8_20/0.85))]',
            visual ? '@4xl:grid-cols-[1.1fr_1fr]' : 'justify-items-center text-center',
          )}
        >
          <div
            className={clsx('grid justify-items-start gap-6', !visual && 'justify-items-center')}
          >
            {b.etiqueta && <span className="etiqueta-orbita">{b.etiqueta}</span>}
            <Titulo className="text-[clamp(2.1rem,6.4vw,4.1rem)] leading-[1.02]">
              <TituloConDestacado titulo={b.titulo} destacado={b.destacado} />
            </Titulo>
            {b.subtitulo && (
              <p className="max-w-xl text-[1.05rem] text-tinta-suave">{b.subtitulo}</p>
            )}
            {(b.botonPrimario || b.botonSecundario) && (
              <div
                className={clsx('flex flex-wrap items-center gap-3', !visual && 'justify-center')}
              >
                <BotonSitio boton={b.botonPrimario} flecha />
                <BotonSitio boton={b.botonSecundario} variante="enlace" />
              </div>
            )}
          </div>
          {visual}
        </div>
      </div>
    </Seccion>
  );
}

function Planes({ b, contexto }: { b: BloqueDe<'planes'>; contexto: ContextoBloques }) {
  const { catalogo, moneda, ruta, mayorista } = contexto;
  // La moneda se cambia desde la cabecera; aquí solo se aclara cómo se calcula.
  if (mayorista) {
    return (
      <Seccion bloque={b}>
        <div className={clsx(contenedor, 'grid gap-8 py-12')}>
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
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'grid gap-8 py-12')}>
        <div className="grid gap-4">
          <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
          {grupos.length > 0 && moneda !== 'USD' && (
            <p className="text-xs text-tinta-tenue">
              Precios en {INFO_MONEDA[moneda].nombre}, calculados con la tasa del día; pueden
              cambiar. El importe exacto queda fijado en tu factura.
            </p>
          )}
        </div>
        {grupos.length === 0 ? (
          <div className="tarjeta-brillo grid justify-items-center gap-2 px-6 py-12 text-center">
            <Layers className="size-5 text-marca" aria-hidden="true" />
            <h3 className="font-semibold">Estamos preparando el catálogo</h3>
            <p className="text-sm text-tinta-suave">
              Vuelve pronto o crea tu cuenta y te avisaremos cuando haya planes disponibles.
            </p>
          </div>
        ) : (
          grupos.map((g) => (
            <div key={g.servicio.id} className="grid gap-5">
              {!b.servicio && <h3 className="text-2xl">{g.servicio.nombre}</h3>}
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
  if (b.variante === 'compacta') {
    return (
      <Seccion bloque={b}>
        <div className={clsx(contenedor, 'py-8')}>
          <h2 className="sr-only">{b.titulo}</h2>
          <ul className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-4">
            {b.elementos.map((e, i) => {
              const Icono = ICONOS[e.icono] ?? CircleCheck;
              return (
                <li key={i} className="tarjeta-brillo flex items-center gap-3.5 px-4 py-4">
                  <span
                    className="orbe orbe-sm"
                    style={{ '--c': COLOR_ICONO[e.icono] } as CSSProperties}
                    aria-hidden="true"
                  >
                    <Icono />
                  </span>
                  <div className="grid min-w-0 gap-0.5">
                    <h3 className="font-sans text-[0.95rem] font-bold">{e.titulo}</h3>
                    <p className="text-[0.82rem] text-tinta-suave">{e.texto}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Seccion>
    );
  }
  if (b.variante === 'lista') {
    return (
      <Seccion bloque={b}>
        <div
          className={clsx(
            contenedor,
            'grid gap-8 py-12 @5xl:grid-cols-[1fr_1.2fr] @5xl:items-center',
          )}
        >
          <div className="grid justify-items-start gap-5">
            <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
            <BotonSitio boton={b.boton} variante="secundario" tamano="md" />
          </div>
          <ul className="grid gap-3">
            {b.elementos.map((e, i) => {
              const Icono = ICONOS[e.icono] ?? CircleCheck;
              return (
                <li key={i} className="tarjeta-brillo flex gap-4 p-5">
                  <span
                    className="orbe orbe-sm"
                    style={{ '--c': COLOR_ICONO[e.icono] } as CSSProperties}
                    aria-hidden="true"
                  >
                    <Icono />
                  </span>
                  <div className="grid gap-1">
                    <h3 className="font-sans text-base font-bold">{e.titulo}</h3>
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
      <div className={clsx(contenedor, 'grid gap-8 py-12')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ul
          className={clsx(
            'grid gap-4 @2xl:grid-cols-2',
            b.elementos.length % 3 === 0 && '@5xl:grid-cols-3',
            b.elementos.length % 4 === 0 && '@5xl:grid-cols-4',
          )}
        >
          {b.elementos.map((e, i) => {
            const Icono = ICONOS[e.icono] ?? CircleCheck;
            return (
              <li key={i} className="tarjeta-brillo grid content-start gap-3 p-6">
                <span
                  className="orbe"
                  style={{ '--c': COLOR_ICONO[e.icono] } as CSSProperties}
                  aria-hidden="true"
                >
                  <Icono />
                </span>
                <h3 className="mt-1 font-sans text-base font-bold">{e.titulo}</h3>
                <p className="text-sm text-tinta-suave">{e.texto}</p>
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
      <div className={clsx(contenedor, 'grid gap-6 py-12')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ol
          className={clsx(
            'grid gap-4',
            n % 3 === 0 ? '@3xl:grid-cols-3' : n > 1 && '@3xl:grid-cols-2',
            n % 4 === 0 && '@5xl:grid-cols-4',
          )}
        >
          {b.elementos.map((p, i) => (
            <li key={i} className="tarjeta-brillo grid content-start gap-2.5 p-6">
              <span
                className="bg-[linear-gradient(180deg,#22d3ee,#1d4ed8)] bg-clip-text font-titulo text-[2.6rem] leading-none font-extrabold text-transparent"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="font-sans text-base font-bold">
                <span className="sr-only">Paso {i + 1}: </span>
                {p.titulo}
              </h3>
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
      <div className={clsx(contenedor, 'grid gap-8 py-12')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <ul className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {b.elementos.map((t, i) => (
            <li key={i}>
              <figure className="tarjeta-brillo grid h-full content-between gap-5 p-6">
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
      <div className={clsx(contenedor, 'grid gap-6 py-12')}>
        <Encabezado etiqueta={b.etiqueta} titulo={b.titulo} subtitulo={b.subtitulo} />
        <div className="grid items-start gap-3 @3xl:grid-cols-2">
          {b.elementos.map((p, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.7),rgb(8_11_26/0.8))] px-5 py-4 transition-colors open:border-borde-fuerte"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {p.pregunta}
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-lg leading-none text-cian transition-transform group-open:rotate-45"
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
      <div className={clsx(contenedor, 'py-12')}>
        <div className="grid justify-items-center gap-5 rounded-[1.75rem] border border-borde bg-[radial-gradient(60%_90%_at_50%_0%,rgb(37_99_235/0.2),transparent_70%),linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] px-6 py-14 text-center">
          <h2 className="max-w-2xl text-[clamp(1.6rem,3.6vw,2.4rem)]">{b.titulo}</h2>
          {b.texto && <p className="max-w-xl text-tinta-suave">{b.texto}</p>}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BotonSitio boton={b.boton} />
            <BotonSitio boton={b.botonSecundario} variante="enlace" />
          </div>
        </div>
      </div>
    </Seccion>
  );
}

function Texto({ b }: { b: BloqueDe<'texto'> }) {
  return (
    <Seccion bloque={b}>
      <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-12 @2xl:px-6">
        {b.titulo && <h2 className="text-[clamp(1.5rem,3.4vw,2.1rem)]">{b.titulo}</h2>}
        <TextoEnriquecido fuente={b.contenido} />
      </div>
    </Seccion>
  );
}

function Imagen({ b }: { b: BloqueDe<'imagen'> }) {
  return (
    <Seccion bloque={b}>
      <figure className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-10 @2xl:px-6">
        <ImagenMedio
          medioId={b.medioId}
          alt={b.alt}
          proporcion={b.proporcion}
          className="rounded-[1.4rem] border border-borde"
        />
        {b.leyenda && (
          <figcaption className="text-center text-sm text-tinta-tenue">{b.leyenda}</figcaption>
        )}
      </figure>
    </Seccion>
  );
}

const TONOS_BANNER = {
  info: { clase: 'border-cian/30 bg-acento-suave', icono: Info, color: 'text-cian' },
  exito: { clase: 'border-exito/30 bg-exito-suave', icono: CircleCheck, color: 'text-exito' },
  aviso: { clase: 'border-aviso/30 bg-aviso-suave', icono: TriangleAlert, color: 'text-aviso' },
} as const;

function Banner({ b }: { b: BloqueDe<'banner'> }) {
  const tono = TONOS_BANNER[b.tono] ?? TONOS_BANNER.info;
  const Icono = tono.icono;
  return (
    <Seccion bloque={b}>
      <div className={clsx(contenedor, 'py-4')}>
        <aside
          className={clsx(
            'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-sm',
            tono.clase,
          )}
        >
          <Icono className={clsx('size-4 shrink-0', tono.color)} aria-hidden="true" />
          <p className="min-w-0 flex-1">{b.texto}</p>
          {b.enlace?.texto && (
            <EnlaceSitio
              href={b.enlace.enlace}
              className="font-medium text-cian underline underline-offset-2"
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
      return <Portada b={bloque} principal={principal} contexto={contexto} />;
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
    case 'universos':
      return <Universos b={bloque} contexto={contexto} />;
    case 'servicios':
      return <Servicios b={bloque} contexto={contexto} />;
    case 'ranking':
      return <Ranking b={bloque} contexto={contexto} />;
    case 'metodos-pago':
      return <MetodosPago b={bloque} contexto={contexto} />;
    case 'canal':
      return <Canal b={bloque} contexto={contexto} />;
    case 'panel':
      return <Panel b={bloque} contexto={contexto} />;
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
  const ctx = vistaPrevia ? { ...contexto, vistaPrevia: true } : contexto;
  return (
    <div className="@container">
      {principal < 0 && !vistaPrevia && <h1 className="sr-only">{titulo}</h1>}
      {bloques.map((b, i) => (
        <Bloque key={b.id || i} bloque={b} contexto={ctx} principal={i === principal} />
      ))}
    </div>
  );
}
