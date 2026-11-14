'use client';

import type {
  ConversacionWhatsAppDetalle,
  MensajeWhatsAppPublico,
  PresenciaWhatsApp,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Check,
  CheckCheck,
  CircleAlert,
  Download,
  History,
  ImageOff,
  LoaderCircle,
  Pause,
  Pin,
  PinOff,
  Play,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';
import { claveDia, etiquetaDia, formatearFechaHora, formatearHora } from '@/lib/formato';

const rutaMedio = (id: string) => `/api/v1/whatsapp/mensajes/${id}/medio`;

const duracion = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function EstadoEnvio({ estado }: { estado: string | null }) {
  if (estado === 'fallido')
    return (
      <span className="inline-flex items-center gap-1 text-peligro">
        <CircleAlert className="size-3.5" aria-hidden="true" /> No se entregó
      </span>
    );
  if (estado === 'leido')
    return (
      <span className="inline-flex text-cian" title="Leído">
        <CheckCheck className="size-4" aria-hidden="true" />
        <span className="sr-only">Leído</span>
      </span>
    );
  if (estado === 'entregado')
    return (
      <span className="inline-flex" title="Entregado">
        <CheckCheck className="size-4" aria-hidden="true" />
        <span className="sr-only">Entregado</span>
      </span>
    );
  return (
    <span className="inline-flex" title="Enviado">
      <Check className="size-4" aria-hidden="true" />
      <span className="sr-only">Enviado</span>
    </span>
  );
}

/** Nota de voz con su botón, barra y tiempo, como en WhatsApp. */
export function NotaDeVoz({ src, segundos }: { src: string; segundos: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [sonando, setSonando] = useState(false);
  const [actual, setActual] = useState(0);
  const [total, setTotal] = useState(segundos ?? 0);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span className="flex items-center gap-2 text-xs text-tinta-suave">
        <CircleAlert className="size-4" aria-hidden="true" /> No se pudo cargar el audio. Escúchalo
        en el teléfono.
      </span>
    );
  }
  return (
    <div className="flex w-[min(17rem,62vw)] items-center gap-2.5 py-0.5">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={(e) => setActual(e.currentTarget.currentTime)}
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => {
          setSonando(false);
          setActual(0);
        }}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          if (a.paused) void a.play().catch(() => setError(true));
          else a.pause();
        }}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-exito text-black hover:brightness-110"
        aria-label={sonando ? 'Pausar la nota de voz' : 'Escuchar la nota de voz'}
      >
        {sonando ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="ml-0.5 size-4" aria-hidden="true" />
        )}
      </button>
      <div className="grid min-w-0 flex-1 gap-1">
        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={Math.min(actual, total || 1)}
          onChange={(e) => {
            const a = audio.current;
            if (a) a.currentTime = Number(e.currentTarget.value);
          }}
          aria-label="Avance de la nota de voz"
          className="h-1 w-full cursor-pointer accent-exito"
        />
        <span className="text-[0.68rem] text-tinta-tenue tabular-nums">
          {duracion(sonando || actual > 0 ? actual : total)}
        </span>
      </div>
    </div>
  );
}

/** Imagen del chat: se ve en pequeño y se abre en grande al tocarla. */
function ImagenMensaje({ m }: { m: MensajeWhatsAppPublico }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(false);
  const sticker = m.medio?.tipo === 'sticker';
  if (error) {
    return (
      <span className="flex items-center gap-2 py-1 text-xs text-tinta-suave">
        <ImageOff className="size-4" aria-hidden="true" /> La imagen ya no está disponible. Ábrela
        en el teléfono.
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="block overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:ring-cian"
        aria-label="Ver la imagen en grande"
      >
        <img
          src={rutaMedio(m.id)}
          alt={m.texto || 'Imagen recibida por WhatsApp'}
          loading="lazy"
          onError={() => setError(true)}
          className={clsx(
            'block object-cover',
            sticker ? 'size-32 bg-transparent object-contain' : 'max-h-80 w-[min(18rem,62vw)]',
          )}
        />
      </button>
      <dialog
        ref={dialogo}
        aria-label="Imagen"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogo.current?.close();
        }}
        className="m-auto max-h-[92dvh] max-w-[94vw] rounded-2xl border border-borde-fuerte bg-elevada p-2 backdrop:bg-black/80"
      >
        <div className="flex justify-end gap-1 pb-2">
          <a
            href={rutaMedio(m.id)}
            download
            className="grid size-9 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] hover:text-tinta"
            aria-label="Descargar la imagen"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => dialogo.current?.close()}
            className="grid size-9 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] hover:text-tinta"
            aria-label="Cerrar"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <img
          src={rutaMedio(m.id)}
          alt={m.texto || 'Imagen recibida por WhatsApp'}
          className="max-h-[80dvh] max-w-full rounded-xl object-contain"
        />
        {m.texto && <p className="px-1 pt-2 text-sm">{m.texto}</p>}
      </dialog>
    </>
  );
}

function MedioMensaje({ m }: { m: MensajeWhatsAppPublico }) {
  const medio = m.medio!;
  if (!medio.disponible) {
    const nombre = {
      imagen: 'Imagen',
      audio: 'Nota de voz',
      video: 'Video',
      sticker: 'Sticker',
      documento: 'Documento',
    }[medio.tipo];
    return (
      <span className="flex items-center gap-2 py-1 text-xs text-tinta-suave">
        <ImageOff className="size-4" aria-hidden="true" /> {nombre}: ábrelo en el teléfono.
      </span>
    );
  }
  if (medio.tipo === 'imagen' || medio.tipo === 'sticker') return <ImagenMensaje m={m} />;
  if (medio.tipo === 'audio') return <NotaDeVoz src={rutaMedio(m.id)} segundos={medio.segundos} />;
  if (medio.tipo === 'video') {
    return (
      <video
        src={rutaMedio(m.id)}
        controls
        preload="metadata"
        className="max-h-80 w-[min(18rem,62vw)] rounded-xl bg-black"
      />
    );
  }
  return (
    <a
      href={rutaMedio(m.id)}
      className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/30"
    >
      <Download className="size-4 text-cian" aria-hidden="true" /> Descargar documento
    </a>
  );
}

async function fijarMensaje(id: string, fijado: boolean) {
  return llamarApi('PATCH', `/whatsapp/mensajes/${id}`, { fijado });
}

/** Un mensaje del chat, con su archivo si trae, la hora y el botón para fijarlo. */
export function BurbujaWhatsApp({
  m,
  alFijar,
}: {
  m: MensajeWhatsAppPublico;
  alFijar: () => void;
}) {
  const entrante = m.direccion === 'entrante';
  const [ocupado, setOcupado] = useState(false);
  return (
    <li
      id={`m-${m.id}`}
      className={clsx(
        'group relative grid max-w-[min(80%,36rem)] gap-1 rounded-2xl px-2.5 py-1.5 text-sm shadow-[0_1px_0_rgb(0_0_0/0.25)] transition-[box-shadow]',
        entrante
          ? 'justify-self-start rounded-tl-md bg-[#1b2238]'
          : 'justify-self-end rounded-tr-md bg-[#0f4a3c]',
        m.medio?.tipo === 'sticker' && 'bg-transparent shadow-none',
      )}
    >
      {m.medio && <MedioMensaje m={m} />}
      {m.texto && <p className="px-0.5 whitespace-pre-wrap break-words">{m.texto}</p>}
      <p className="flex items-center justify-end gap-1.5 px-0.5 text-[0.68rem] text-tinta-tenue">
        {m.fijado && <Pin className="size-3 text-aviso" aria-label="Fijado" />}
        {m.autor && <span className="truncate">{m.autor.nombre} ·</span>}
        <time dateTime={m.creadoEn} title={formatearFechaHora(m.creadoEn)}>
          {formatearHora(m.creadoEn)}
        </time>
        {!entrante && <EstadoEnvio estado={m.estado} />}
      </p>
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          const r = await fijarMensaje(m.id, !m.fijado);
          setOcupado(false);
          if (r.ok) alFijar();
        }}
        className={clsx(
          'absolute top-1 grid size-7 place-items-center rounded-full border border-borde bg-elevada text-tinta-suave opacity-0 shadow-nv group-hover:opacity-100 hover:text-tinta focus-visible:opacity-100 [@media(hover:none)]:opacity-70',
          entrante ? '-right-9' : '-left-9',
        )}
        aria-label={m.fijado ? 'Desfijar el mensaje' : 'Fijar el mensaje'}
        title={m.fijado ? 'Desfijar' : 'Fijar'}
      >
        {ocupado ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : m.fijado ? (
          <PinOff className="size-3.5" aria-hidden="true" />
        ) : (
          <Pin className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

/** Franja de arriba con los mensajes fijados: se recorren tocándola, como en WhatsApp. */
export function FijadosWhatsApp({ fijados }: { fijados: MensajeWhatsAppPublico[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  if (fijados.length === 0) return null;
  const actual = fijados[Math.min(i, fijados.length - 1)]!;
  const resumen =
    actual.texto ||
    (actual.medio
      ? {
          imagen: '📷 Imagen',
          audio: '🎤 Nota de voz',
          video: '🎬 Video',
          sticker: 'Sticker',
          documento: '📄 Documento',
        }[actual.medio.tipo]
      : '');
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-borde bg-white/[0.025] px-3 py-1.5 sm:px-4">
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById(`m-${actual.id}`);
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            el.animate(
              [
                { boxShadow: '0 0 0 2px rgb(34 211 238 / 0.8)' },
                { boxShadow: '0 0 0 0 transparent' },
              ],
              { duration: 1600 },
            );
          }
          setI((n) => (n + 1) % fijados.length);
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        aria-label="Ir al mensaje fijado"
      >
        <span className="flex shrink-0 flex-col gap-0.5" aria-hidden="true">
          {fijados.slice(0, 4).map((f, n) => (
            <span
              key={f.id}
              className={clsx(
                'h-2 w-0.5 rounded-full',
                n === i % fijados.length ? 'bg-cian' : 'bg-borde-fuerte',
              )}
            />
          ))}
        </span>
        <Pin className="size-4 shrink-0 text-aviso" aria-hidden="true" />
        <span className="grid min-w-0 leading-tight">
          <span className="text-[0.68rem] font-semibold text-cian">
            Fijado{fijados.length > 1 ? ` · ${(i % fijados.length) + 1} de ${fijados.length}` : ''}
          </span>
          <span className="truncate text-sm text-tinta-suave">{resumen}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={async () => {
          const r = await fijarMensaje(actual.id, false);
          if (r.ok) {
            setI(0);
            router.refresh();
          }
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
        aria-label="Desfijar este mensaje"
        title="Desfijar"
      >
        <PinOff className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Mensajes del chat, de abajo hacia arriba como en WhatsApp: se queda en lo
 * último y, arriba, carga los anteriores guardados o los pide al teléfono.
 */
export function MensajesWhatsApp({ detalle }: { detalle: ConversacionWhatsAppDetalle }) {
  const router = useRouter();
  const lista = useRef<HTMLOListElement>(null);
  const [anteriores, setAnteriores] = useState<MensajeWhatsAppPublico[]>([]);
  const [hayMas, setHayMas] = useState(detalle.hayAnteriores);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const alturaAntes = useRef<number | null>(null);

  // Al cambiar de chat se empieza de cero.
  const [chat, setChat] = useState(detalle.id);
  if (chat !== detalle.id) {
    setChat(detalle.id);
    setAnteriores([]);
    setHayMas(detalle.hayAnteriores);
    setAviso(null);
  }

  const todos = [...anteriores, ...detalle.mensajes];
  const ultimo = detalle.mensajes.at(-1)?.id;

  // Lo nuevo (o al abrir): abajo del todo.
  useLayoutEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ultimo, detalle.id]);

  // Lo anterior: se queda donde estaba leyendo.
  useLayoutEffect(() => {
    const el = lista.current;
    if (el && alturaAntes.current !== null) {
      el.scrollTop = el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    }
  }, [anteriores.length]);

  async function cargarAnteriores(): Promise<number> {
    const masViejo = todos[0];
    if (!masViejo) return 0;
    const r = await llamarApi<ConversacionWhatsAppDetalle>(
      'GET',
      `/whatsapp/conversaciones/${detalle.id}?antes=${masViejo.id}`,
    );
    if (!r.ok) {
      setAviso(r.error.mensaje);
      return 0;
    }
    alturaAntes.current = lista.current?.scrollHeight ?? null;
    setAnteriores((a) => [...r.datos.mensajes, ...a]);
    setHayMas(r.datos.hayAnteriores);
    return r.datos.mensajes.length;
  }

  async function masAntiguos() {
    setCargando(true);
    setAviso(null);
    if (hayMas) {
      await cargarAnteriores();
      setCargando(false);
      return;
    }
    // No hay más guardados: se piden al teléfono y llegan en unos segundos.
    const r = await llamarApi('POST', `/whatsapp/conversaciones/${detalle.id}/historial`, {});
    if (!r.ok) {
      setAviso(r.error.mensaje);
      setCargando(false);
      return;
    }
    let llegaron = 0;
    for (let intento = 0; intento < 4 && llegaron === 0; intento++) {
      await new Promise((ok) => setTimeout(ok, 3_000));
      llegaron = await cargarAnteriores();
    }
    if (llegaron === 0) setAviso('El teléfono no mandó mensajes anteriores de este chat.');
    setCargando(false);
  }

  const mostrarBoton = todos.length > 0 && (hayMas || detalle.puedePedirHistorial);

  return (
    <ol
      ref={lista}
      aria-label="Mensajes"
      className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto overscroll-contain bg-[radial-gradient(rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-4 [scrollbar-width:thin] sm:px-12"
    >
      {mostrarBoton && (
        <li className="mb-1 grid justify-items-center gap-1">
          <button
            type="button"
            onClick={() => void masAntiguos()}
            disabled={cargando}
            className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-elevada px-3.5 py-1.5 text-xs font-semibold text-tinta-suave hover:border-borde-fuerte hover:text-tinta disabled:opacity-70"
          >
            {cargando ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <History className="size-3.5 text-cian" aria-hidden="true" />
            )}
            {cargando
              ? 'Cargando…'
              : hayMas
                ? 'Ver mensajes anteriores'
                : 'Traer mensajes anteriores del teléfono'}
          </button>
          {aviso && <span className="text-xs text-tinta-tenue">{aviso}</span>}
        </li>
      )}
      {todos.map((m, i) => {
        const nuevoDia = i === 0 || claveDia(todos[i - 1]!.creadoEn) !== claveDia(m.creadoEn);
        return (
          <Fragment key={m.id}>
            {nuevoDia && (
              <li className="my-2 justify-self-center rounded-lg bg-white/[0.06] px-3 py-1 text-[0.7rem] font-semibold text-tinta-suave">
                {etiquetaDia(m.creadoEn)}
              </li>
            )}
            <BurbujaWhatsApp
              m={m}
              alFijar={() => {
                // Los anteriores no vuelven del servidor: se actualizan aquí.
                setAnteriores((a) =>
                  a.map((x) => (x.id === m.id ? { ...x, fijado: !x.fijado } : x)),
                );
                router.refresh();
              }}
            />
          </Fragment>
        );
      })}
    </ol>
  );
}

/** En línea, escribiendo o última vez del contacto (con el número vinculado por QR). */
export function PresenciaContacto({
  conversacionId,
  respaldo,
}: {
  conversacionId: string;
  respaldo: string;
}) {
  // Se guarda con el chat al que pertenece: al cambiar de chat no se muestra la del anterior.
  const [estado, setEstado] = useState<{ para: string; p: PresenciaWhatsApp | null }>({
    para: '',
    p: null,
  });
  const p = estado.para === conversacionId ? estado.p : null;
  useEffect(() => {
    let activo = true;
    const pedir = () => {
      if (document.visibilityState !== 'visible') return;
      void llamarApi<PresenciaWhatsApp | null>(
        'GET',
        `/whatsapp/conversaciones/${conversacionId}/presencia`,
      ).then((r) => {
        if (activo && r.ok) setEstado({ para: conversacionId, p: r.datos });
      });
    };
    pedir();
    const t = window.setInterval(pedir, 8_000);
    return () => {
      activo = false;
      window.clearInterval(t);
    };
  }, [conversacionId]);

  if (p?.escribiendo || p?.grabando) {
    return (
      <span className="font-semibold text-exito">
        {p.grabando ? 'grabando audio…' : 'escribiendo…'}
      </span>
    );
  }
  if (p?.enLinea) {
    return (
      <span className="inline-flex items-center gap-1.5 text-exito">
        <span className="size-1.5 rounded-full bg-exito" aria-hidden="true" /> en línea
      </span>
    );
  }
  if (p?.vistoEn) {
    const dia = etiquetaDia(p.vistoEn);
    return (
      <span>
        últ. vez {dia === 'Hoy' ? 'hoy' : dia === 'Ayer' ? 'ayer' : `el ${dia}`} a las{' '}
        {formatearHora(p.vistoEn)}
      </span>
    );
  }
  return <span>{respaldo}</span>;
}
