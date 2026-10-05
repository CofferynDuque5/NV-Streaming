import {
  analizarEnLinea,
  type BloquePolitica,
  type ClavePorDefinir,
  type DocumentoPoliticas,
  type EstadoSuscripcion,
  type NodoEnLinea,
  POR_DEFINIR,
  trozosPolitica,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, Fragment, type ReactNode } from 'react';
import { EnlaceSitio } from '@/componentes/bloques/texto-enriquecido';
import { clasesBoton } from '@/componentes/ui/boton';
import { ESTADO_SUSCRIPCION } from '@/lib/estados';
import { BotonCopiarEnlace } from './copiar-enlace';

/** Color del punto de cada estado (el mismo orden de gravedad que en el diseño aprobado). */
const COLOR_ESTADO: Record<EstadoSuscripcion, string> = {
  pendiente_pago: '#94a3b8',
  activa: '#22c55e',
  en_gracia: '#fbbf24',
  suspendida: '#f97316',
  vencida: '#f87171',
  pausada: '#5b98ff',
  cancelada: '#6b7598',
};

function EnLinea({ nodos }: { nodos: NodoEnLinea[] }) {
  return nodos.map((n, i) => {
    switch (n.tipo) {
      case 'texto':
        return <Fragment key={i}>{n.texto}</Fragment>;
      case 'salto':
        return <br key={i} />;
      case 'negrita':
        return (
          <b key={i} className="font-semibold text-tinta">
            <EnLinea nodos={n.hijos} />
          </b>
        );
      case 'cursiva':
        return (
          <em key={i}>
            <EnLinea nodos={n.hijos} />
          </em>
        );
      case 'enlace':
        return (
          <EnlaceSitio
            key={i}
            href={n.href}
            className="text-cian underline underline-offset-4 hover:text-tinta"
          >
            <EnLinea nodos={n.hijos} />
          </EnlaceSitio>
        );
    }
  });
}

/** Etiqueta ámbar de un dato que solo puede dar el dueño (politicas-por-definir.ts). */
export function MarcaPorDefinir({ tema, clave }: { tema?: string; clave?: ClavePorDefinir }) {
  return (
    <span className="pl-pd" data-pd={clave}>
      <b>Por definir</b>
      {tema}
    </span>
  );
}

/** Texto del documento: marcado en línea y datos por definir (o su valor, si ya lo tienen). */
export function TextoPolitica({ texto }: { texto: string }) {
  return trozosPolitica(texto).map((t, i) => {
    if (t.tipo === 'texto') return <EnLinea key={i} nodos={analizarEnLinea(t.texto)} />;
    const dato = POR_DEFINIR[t.clave];
    return dato.valor === null ? (
      <MarcaPorDefinir key={i} clave={t.clave} tema={dato.tema} />
    ) : (
      <EnLinea key={i} nodos={analizarEnLinea(dato.valor)} />
    );
  });
}

const tarjetaFila =
  'grid gap-[3px] rounded-[14px] border border-borde bg-superficie/55 px-3.5 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-baseline sm:gap-3.5';

function Bloque({ bloque, contacto }: { bloque: BloquePolitica; contacto: ReactNode }) {
  switch (bloque.tipo) {
    case 'parrafo':
      return (
        <p>
          <TextoPolitica texto={bloque.texto} />
        </p>
      );
    case 'subtitulo':
      return (
        <h3 className="mt-3 font-sans text-[1.09rem] leading-[1.35] font-semibold tracking-normal text-tinta">
          {bloque.texto}
        </h3>
      );
    case 'lista':
      return (
        <ul className="pl-lista grid gap-[9px]">
          {bloque.elementos.map((e, i) => (
            <li key={i}>
              <TextoPolitica texto={e} />
            </li>
          ))}
        </ul>
      );
    case 'datos':
      return (
        <dl className="grid gap-2">
          {bloque.filas.map((f) => (
            <div key={f.termino} className={tarjetaFila}>
              <dt className="text-[0.94rem] font-semibold text-tinta">{f.termino}</dt>
              <dd className="text-[0.94rem] leading-[1.6] text-tinta-suave">
                <TextoPolitica texto={f.detalle} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'estados':
      return (
        <dl className="grid gap-2">
          {bloque.filas.map((f) => (
            <div key={f.estado} className={tarjetaFila}>
              <dt>
                <span
                  className="inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap text-tinta before:size-[9px] before:rounded-full before:bg-[var(--c)] before:shadow-[0_0_10px_var(--c)] before:content-['']"
                  style={{ '--c': COLOR_ESTADO[f.estado] } as CSSProperties}
                >
                  {ESTADO_SUSCRIPCION[f.estado].texto}
                </span>
              </dt>
              <dd className="text-[0.94rem] leading-[1.6] text-tinta-suave">
                <TextoPolitica texto={f.detalle} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'cookies':
      return (
        <ul className="grid gap-2">
          {bloque.filas.map((f) => (
            <li
              key={f.nombre}
              className="grid gap-1 rounded-[14px] border border-borde bg-superficie/55 px-3.5 py-[13px]"
            >
              <code className="font-mono text-[0.84rem] font-semibold break-all text-cian">
                {f.nombre}
              </code>
              <span className="text-[0.94rem] leading-[1.55] text-tinta-suave">{f.uso}</span>
              <small className="text-[0.78rem] text-tinta-tenue">
                <span className="text-tinta-suave">Duración: </span>
                {f.duracion}
              </small>
            </li>
          ))}
        </ul>
      );
    case 'contacto':
      return contacto;
  }
}

/** Botones de la sección Contacto: WhatsApp (si está configurado) y un ticket de soporte. */
export function AccionesContacto({ whatsapp }: { whatsapp: string | null }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-[22px] gap-y-3">
      {whatsapp ? (
        <>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton('primario', 'md')}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Escríbenos por WhatsApp
          </a>
          <Link
            href="/cuenta/soporte/nueva"
            className="text-sm font-semibold whitespace-nowrap text-cian hover:underline"
          >
            Abrir un ticket
          </Link>
        </>
      ) : (
        <Link href="/cuenta/soporte/nueva" className={clasesBoton('primario', 'md')}>
          Abrir un ticket
        </Link>
      )}
    </div>
  );
}

/** «Lo esencial en 1 minuto» y las siete secciones numeradas. */
export function DocumentoPolitica({
  doc,
  contacto,
}: {
  doc: DocumentoPoliticas;
  contacto: ReactNode;
}) {
  return (
    <>
      <section
        id="esencial"
        aria-labelledby="h-esencial"
        className="pl-sec mt-1.5 rounded-[22px] border border-cian/35 bg-[radial-gradient(80%_90%_at_0%_0%,rgb(34_211_238/0.1),transparent_70%),linear-gradient(180deg,rgb(15_21_48/0.75),rgb(8_11_26/0.8))] px-5 py-[22px] md:px-7 md:py-[26px]"
      >
        <h2
          id="h-esencial"
          tabIndex={-1}
          className="mb-3.5 text-[clamp(1.25rem,2.4vw,1.5rem)] outline-none"
        >
          Lo esencial en 1 minuto
        </h2>
        <ul className="grid gap-3">
          {doc.esencial.map((x, i) => (
            <li
              key={i}
              className="flex items-start gap-[11px] text-[0.97rem] leading-[1.55] text-tinta/90"
            >
              <Check className="mt-1 size-4 shrink-0 text-exito" aria-hidden="true" />
              <span>
                <TextoPolitica texto={x} />
              </span>
            </li>
          ))}
        </ul>
      </section>
      {doc.secciones.map((s, n) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`h-${s.id}`}
          className={clsx('pl-sec py-[30px]', n === 0 ? 'mt-[18px]' : 'border-t border-borde')}
        >
          <div className="mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <span
              aria-hidden="true"
              className="rounded-[9px] border border-cian/35 bg-cian/[0.08] px-[9px] py-1 font-mono text-[0.8rem] font-bold tracking-[0.06em] text-cian tabular-nums"
            >
              {String(n + 1).padStart(2, '0')}
            </span>
            <h2
              id={`h-${s.id}`}
              tabIndex={-1}
              className="min-w-0 flex-[1_1_16rem] text-[clamp(1.45rem,3vw,1.9rem)] outline-none"
            >
              {s.titulo}
            </h2>
            <BotonCopiarEnlace ancla={s.id} titulo={s.titulo} />
          </div>
          <div className="grid gap-3 text-base leading-[1.7] text-tinta/85">
            {s.bloques.map((b, i) => (
              <Bloque key={i} bloque={b} contacto={contacto} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
