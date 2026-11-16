'use client';

import type { ComentarioPublico, ComentariosServicio as Datos } from '@nv/shared';
import clsx from 'clsx';
import { BadgeCheck, LoaderCircle, MessageSquare, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { llamarApi } from '@/lib/api-cliente';

const fecha = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });

function Estrellas({ n, tamano = 'size-4' }: { n: number; tamano?: string }) {
  return (
    <span className="flex gap-0.5 text-[#fbbf24]" role="img" aria-label={`${n} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={clsx(tamano, i < Math.round(n) ? 'fill-current' : 'opacity-30')}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** Elegir de 1 a 5 estrellas (opcional: tocar la misma la quita). */
function ElegirEstrellas({
  valor,
  onCambiar,
}: {
  valor: number | null;
  onCambiar: (n: number | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Tu calificación (opcional)" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valor === n}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          onClick={() => onCambiar(valor === n ? null : n)}
          className="rounded-md p-0.5 text-[#fbbf24] focus-visible:ring-2 focus-visible:ring-marca focus-visible:outline-none"
        >
          <Star
            className={clsx('size-6', valor && n <= valor ? 'fill-current' : 'opacity-40')}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

function Comentario({ c, onBorrar }: { c: ComentarioPublico; onBorrar: () => void }) {
  return (
    <li className="grid gap-2 rounded-2xl border border-borde bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="grid size-9 place-items-center rounded-full bg-[linear-gradient(135deg,#5b98ff,#a855f7)] text-sm font-bold text-white"
          aria-hidden="true"
        >
          {c.autor.slice(0, 1)}
        </span>
        <b className="text-sm">{c.autor}</b>
        {c.compro && (
          <span className="inline-flex items-center gap-1 rounded-full bg-exito/15 px-2 py-0.5 text-[0.7rem] font-semibold text-exito">
            <BadgeCheck className="size-3" aria-hidden="true" /> Compró este servicio
          </span>
        )}
        <span className="ml-auto text-xs text-tinta-tenue">
          {fecha.format(new Date(c.creadoEn))}
        </span>
      </div>
      {c.estrellas && <Estrellas n={c.estrellas} tamano="size-3.5" />}
      <p className="text-sm whitespace-pre-wrap text-tinta-suave">{c.texto}</p>
      {c.respuesta && (
        <p className="rounded-xl border-l-2 border-marca bg-marca/10 px-3 py-2 text-sm">
          <b className="mr-1">Respuesta del equipo:</b>
          {c.respuesta}
        </p>
      )}
      {c.propio && (
        <button
          type="button"
          onClick={onBorrar}
          className="inline-flex items-center gap-1 justify-self-start text-xs text-tinta-tenue hover:text-peligro"
        >
          <Trash2 className="size-3.5" aria-hidden="true" /> Borrar mi comentario
        </button>
      )}
    </li>
  );
}

/**
 * Comentarios de los clientes en la página del servicio. Cualquiera los lee;
 * para escribir hay que entrar con una cuenta de cliente.
 */
export function ComentariosServicio({
  servicioId,
  nombre,
  puedeComentar,
  conSesion,
}: {
  servicioId: string;
  nombre: string;
  /** Hay sesión de cliente. */
  puedeComentar: boolean;
  /** Hay alguna sesión (equipo o revendedor no comentan). */
  conSesion: boolean;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);
  const [texto, setTexto] = useState('');
  const [estrellas, setEstrellas] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const ruta = puedeComentar
    ? `/mi/comentarios/${servicioId}`
    : `/sitio/publico/servicios/${servicioId}/comentarios`;
  const cargar = useCallback(
    () =>
      llamarApi<Datos>('GET', ruta).then((r) => {
        if (r.ok) setDatos(r.datos);
        else setFallo(true);
      }),
    [ruta],
  );

  useEffect(() => {
    let vivo = true;
    void llamarApi<Datos>('GET', ruta).then((r) => {
      if (!vivo) return;
      if (r.ok) setDatos(r.datos);
      else setFallo(true);
    });
    return () => {
      vivo = false;
    };
  }, [ruta]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const r = await llamarApi<ComentarioPublico>('POST', '/mi/comentarios', {
      servicioId,
      texto,
      estrellas,
    });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error.campos?.texto?.[0] ?? r.error.mensaje);
      return;
    }
    setTexto('');
    setEstrellas(null);
    await cargar();
  }

  async function borrar(id: string) {
    const r = await llamarApi('DELETE', `/mi/comentarios/${id}`);
    if (r.ok) await cargar();
  }

  if (fallo) return null;
  return (
    <section aria-labelledby="titulo-comentarios" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="titulo-comentarios" className="text-[clamp(1.45rem,3.6vw,2.15rem)]">
            Lo que dicen de {nombre}
          </h2>
          {datos && datos.total > 0 && (
            <p className="flex items-center gap-2 text-sm text-tinta-suave">
              {datos.promedio !== null && (
                <>
                  <Estrellas n={datos.promedio} />
                  <b className="text-tinta">{datos.promedio.toLocaleString('es-VE')}</b>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {datos.total === 1 ? '1 comentario' : `${datos.total} comentarios`}
            </p>
          )}
        </div>
      </div>

      {datos?.abiertos &&
        (puedeComentar ? (
          <form
            onSubmit={enviar}
            className="grid gap-3 rounded-2xl border border-borde bg-white/[0.03] p-4"
            noValidate
          >
            <label htmlFor="nuevo-comentario" className="text-sm font-semibold">
              Escribe un comentario
            </label>
            <ElegirEstrellas valor={estrellas} onCambiar={setEstrellas} />
            <textarea
              id="nuevo-comentario"
              rows={3}
              maxLength={600}
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              placeholder={`¿Cómo te fue con ${nombre}?`}
              className="w-full rounded-xl border border-borde bg-hundida px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca focus:outline-none"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'error-comentario' : undefined}
            />
            {error && (
              <p id="error-comentario" role="alert" className="text-sm text-peligro">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-tinta-tenue">
                Se publica con tu nombre y la inicial de tu apellido. {texto.length}/600
              </span>
              <button
                type="submit"
                disabled={enviando || texto.trim().length < 3}
                className={clasesBoton('primario', 'sm')}
              >
                {enviando && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                Publicar
              </button>
            </div>
          </form>
        ) : (
          !conSesion && (
            <p className="rounded-2xl border border-dashed border-borde-fuerte px-4 py-4 text-sm text-tinta-suave">
              <Link href="/ingresar" className="font-semibold text-cian hover:underline">
                Entra a tu cuenta
              </Link>{' '}
              para dejar tu comentario.
            </p>
          )
        ))}

      {!datos ? (
        <p className="flex items-center gap-2 text-sm text-tinta-tenue">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Cargando comentarios…
        </p>
      ) : datos.comentarios.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <MessageSquare className="size-4" aria-hidden="true" />
          {datos.abiertos ? 'Todavía no hay comentarios. ¡Sé el primero!' : 'Sin comentarios.'}
        </p>
      ) : (
        <ul className="grid gap-3 @3xl:grid-cols-2">
          {datos.comentarios.map((c) => (
            <Comentario key={c.id} c={c} onBorrar={() => void borrar(c.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
