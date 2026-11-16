'use client';

import type {
  ConversacionWhatsAppDetalle,
  MensajeWhatsAppPublico,
  PresenciaWhatsApp,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  Download,
  Headset,
  History,
  ImageOff,
  LoaderCircle,
  Mic,
  Pause,
  Pin,
  PinOff,
  Play,
  Reply,
  Search,
  SmilePlus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { llamarApi } from '@/lib/api-cliente';
import { claveDia, etiquetaDia, formatearFechaHora, formatearHora } from '@/lib/formato';

const rutaMedio = (id: string) => `/api/v1/whatsapp/mensajes/${id}/medio`;
const rutaFoto = (conversacionId: string) =>
  `/api/v1/whatsapp/conversaciones/${conversacionId}/foto`;

const NOMBRE_MEDIO = {
  imagen: '📷 Imagen',
  audio: '🎤 Nota de voz',
  video: '🎬 Video',
  sticker: 'Sticker',
  documento: '📄 Documento',
} as const;

/** Texto corto de un mensaje para citas y fijados. */
export function resumenMensaje(m: {
  texto: string;
  medio: { tipo: keyof typeof NOMBRE_MEDIO } | keyof typeof NOMBRE_MEDIO | null;
}) {
  const tipo = typeof m.medio === 'string' ? m.medio : m.medio?.tipo;
  if (tipo) return m.texto ? `${NOMBRE_MEDIO[tipo]}: ${m.texto}` : NOMBRE_MEDIO[tipo];
  return m.texto;
}

/** Va a un mensaje del chat y lo hace brillar un momento. */
export function irAMensaje(id: string) {
  const el = document.getElementById(`m-${id}`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.animate(
    [{ boxShadow: '0 0 0 2px rgb(34 211 238 / 0.8)' }, { boxShadow: '0 0 0 0 transparent' }],
    { duration: 1600 },
  );
  return true;
}

// Mensaje al que se está respondiendo: lo elige la burbuja y lo usa la caja de abajo.
type CitaElegida = { conversacionId: string; m: MensajeWhatsAppPublico } | null;
let citaActual: CitaElegida = null;
const oyentesCita = new Set<() => void>();
export function elegirCita(c: CitaElegida) {
  citaActual = c;
  oyentesCita.forEach((f) => f());
}
export function useCita(conversacionId: string): MensajeWhatsAppPublico | null {
  const c = useSyncExternalStore(
    (f) => {
      oyentesCita.add(f);
      return () => oyentesCita.delete(f);
    },
    () => citaActual,
    () => null,
  );
  return c?.conversacionId === conversacionId ? c.m : null;
}

/** Foto de perfil de WhatsApp encima de las iniciales; si no hay, quedan las iniciales. */
export function FotoContacto({
  conversacionId,
  conFoto,
  children,
}: {
  conversacionId: string;
  conFoto: boolean;
  children: ReactNode;
}) {
  const [sinFoto, setSinFoto] = useState<string | null>(null);
  return (
    <span className="relative inline-grid shrink-0">
      {children}
      {conFoto && sinFoto !== conversacionId && (
        <img
          src={rutaFoto(conversacionId)}
          alt=""
          loading="lazy"
          onError={() => setSinFoto(conversacionId)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
    </span>
  );
}

/** Quita acentos y mayúsculas, letra por letra, para buscar sin mover las posiciones. */
const normalizar = (t: string) =>
  [...t].map((c) => (c.normalize('NFD').replace(/\p{M}/gu, '')[0] ?? c).toLowerCase()).join('');

function Resaltado({ texto, q }: { texto: string; q: string }) {
  const buscado = normalizar(q.trim());
  if (!buscado) return <>{texto}</>;
  const base = normalizar(texto);
  const trozos: ReactNode[] = [];
  let desde = 0;
  for (let i = base.indexOf(buscado); i !== -1; i = base.indexOf(buscado, i + buscado.length)) {
    trozos.push(texto.slice(desde, i));
    trozos.push(
      <mark key={i} className="rounded-sm bg-aviso/80 text-black">
        {texto.slice(i, i + buscado.length)}
      </mark>,
    );
    desde = i + buscado.length;
  }
  trozos.push(texto.slice(desde));
  return <>{trozos}</>;
}

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

// Ondas ya calculadas de cada audio (para no decodificarlo de nuevo al refrescar).
const ondas = new Map<string, number[]>();
const BARRAS = 34;

/** Barras de relleno mientras se calcula la onda real (siempre las mismas para el mismo audio). */
function ondaDeRelleno(src: string): number[] {
  let n = [...src].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: BARRAS }, () => {
    n = (n * 1103515245 + 12345) >>> 0;
    return 0.25 + ((n >>> 16) % 1000) / 1600;
  });
}

async function calcularOnda(src: string): Promise<number[]> {
  const r = await fetch(src);
  if (!r.ok) throw new Error('sin audio');
  const contexto = new AudioContext();
  try {
    const audio = await contexto.decodeAudioData(await r.arrayBuffer());
    const datos = audio.getChannelData(0);
    const tramo = Math.max(1, Math.floor(datos.length / BARRAS));
    const paso = Math.max(1, Math.floor(tramo / 200));
    const picos = Array.from({ length: BARRAS }, (_, b) => {
      let suma = 0;
      let n = 0;
      for (let i = b * tramo; i < (b + 1) * tramo && i < datos.length; i += paso) {
        suma += Math.abs(datos[i]!);
        n++;
      }
      return n ? suma / n : 0;
    });
    const max = Math.max(...picos, 0.0001);
    return picos.map((p) => 0.14 + 0.86 * (p / max));
  } finally {
    void contexto.close();
  }
}

const VELOCIDADES = [1, 1.5, 2] as const;

/** Nota de voz como en WhatsApp: onda, avance, velocidad y la foto con el micrófono. */
export function NotaDeVoz({
  src,
  segundos,
  entrante = true,
  conversacionId,
  conFoto = false,
}: {
  src: string;
  segundos: number | null;
  entrante?: boolean;
  conversacionId?: string;
  conFoto?: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [sonando, setSonando] = useState(false);
  const [actual, setActual] = useState(0);
  const [total, setTotal] = useState(segundos ?? 0);
  const [error, setError] = useState(false);
  const [escuchada, setEscuchada] = useState(false);
  const [velocidad, setVelocidad] = useState<(typeof VELOCIDADES)[number]>(1);
  const [onda, setOnda] = useState(() => ondas.get(src) ?? ondaDeRelleno(src));

  useEffect(() => {
    if (ondas.has(src) || typeof AudioContext === 'undefined') return;
    let activo = true;
    calcularOnda(src)
      .then((o) => {
        ondas.set(src, o);
        if (activo) setOnda(o);
      })
      .catch(() => undefined); // Se quedan las barras de relleno.
    return () => {
      activo = false;
    };
  }, [src]);

  if (error) {
    return (
      <span className="flex items-center gap-2 text-xs text-tinta-suave">
        <CircleAlert className="size-4" aria-hidden="true" /> No se pudo cargar el audio. Escúchalo
        en el teléfono.
      </span>
    );
  }
  const progreso = total > 0 ? Math.min(1, actual / total) : 0;
  const ir = (fraccion: number) => {
    const a = audio.current;
    if (a && total > 0) {
      a.currentTime = Math.max(0, Math.min(total, fraccion * total));
      setActual(a.currentTime);
    }
  };
  const enCurso = sonando || actual > 0;
  const avatar = (
    <span className="relative shrink-0" aria-hidden="true">
      {entrante && conversacionId ? (
        <FotoContacto conversacionId={conversacionId} conFoto={conFoto}>
          <i className="grid size-11 place-items-center rounded-full bg-white/10 text-tinta-suave not-italic">
            <UserRound className="size-6" />
          </i>
        </FotoContacto>
      ) : (
        <i className="grid size-11 place-items-center rounded-full bg-[linear-gradient(135deg,#0ea5e9,#22c55e)] text-white not-italic">
          <Headset className="size-5" />
        </i>
      )}
      <Mic
        className={clsx(
          'absolute -bottom-0.5 size-4 drop-shadow',
          entrante ? '-right-1' : '-left-1',
          escuchada ? 'text-cian' : 'text-exito',
        )}
      />
    </span>
  );
  const botonVelocidad = (
    <button
      type="button"
      onClick={() => {
        const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length]!;
        setVelocidad(siguiente);
        if (audio.current) audio.current.playbackRate = siguiente;
      }}
      className="grid h-7 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold text-tinta hover:bg-white/25"
      aria-label={`Velocidad ${velocidad}x. Tocar para cambiarla`}
    >
      {velocidad}×
    </button>
  );
  return (
    <div className="flex w-[min(20rem,66vw)] items-center gap-2.5 py-1">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={(e) => setActual(e.currentTarget.currentTime)}
        onPlay={(e) => {
          e.currentTarget.playbackRate = velocidad;
          setSonando(true);
          setEscuchada(true);
        }}
        onPause={() => setSonando(false)}
        onEnded={() => {
          setSonando(false);
          setActual(0);
        }}
        onError={() => setError(true)}
      />
      {entrante && (enCurso ? botonVelocidad : avatar)}
      <button
        type="button"
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          if (a.paused) void a.play().catch(() => setError(true));
          else a.pause();
        }}
        className="grid size-8 shrink-0 place-items-center rounded-full text-tinta-suave hover:text-tinta"
        aria-label={sonando ? 'Pausar la nota de voz' : 'Escuchar la nota de voz'}
      >
        {sonando ? (
          <Pause className="size-6 fill-current" aria-hidden="true" />
        ) : (
          <Play className="size-6 fill-current" aria-hidden="true" />
        )}
      </button>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Avance de la nota de voz"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(actual)}
          aria-valuetext={duracion(actual)}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            ir((e.clientX - r.left) / r.width);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const delta = (e.key === 'ArrowRight' ? 5 : -5) / (total || 1);
              ir(progreso + delta);
            }
          }}
          className="relative flex h-8 cursor-pointer touch-none items-center gap-[2px] rounded focus-visible:ring-2 focus-visible:ring-cian"
        >
          {onda.map((h, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={clsx(
                'min-w-0 flex-1 rounded-full transition-colors',
                (i + 0.5) / onda.length <= progreso
                  ? escuchada
                    ? 'bg-cian'
                    : 'bg-exito'
                  : 'bg-white/30',
              )}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
          <span
            aria-hidden="true"
            className={clsx(
              'pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow',
              escuchada ? 'bg-cian' : 'bg-exito',
            )}
            style={{ left: `${progreso * 100}%` }}
          />
        </div>
        <span className="text-[0.68rem] text-tinta-tenue tabular-nums">
          {duracion(enCurso ? actual : total)}
        </span>
      </div>
      {!entrante && (enCurso ? botonVelocidad : avatar)}
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

function MedioMensaje({
  m,
  conversacionId,
  conFoto,
}: {
  m: MensajeWhatsAppPublico;
  conversacionId: string;
  conFoto: boolean;
}) {
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
  if (medio.tipo === 'audio') {
    return (
      <NotaDeVoz
        src={rutaMedio(m.id)}
        segundos={medio.segundos}
        entrante={m.direccion === 'entrante'}
        conversacionId={conversacionId}
        conFoto={conFoto}
      />
    );
  }
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

const REACCIONES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * Un mensaje del chat, como en WhatsApp: cita, archivo, texto, hora, reacciones
 * y su menú (reaccionar, responder, copiar, fijar y eliminar para todos).
 */
export function BurbujaWhatsApp({
  m,
  conversacionId,
  contacto,
  conQr,
  busqueda = '',
  alCambiar,
}: {
  m: MensajeWhatsAppPublico;
  conversacionId: string;
  /** Nombre del cliente, para las citas. */
  contacto: string;
  /** El número está vinculado por QR: se puede reaccionar y borrar para todos. */
  conQr: boolean;
  busqueda?: string;
  alCambiar: (cambio: Partial<MensajeWhatsAppPublico>) => void;
}) {
  const entrante = m.direccion === 'entrante';
  const yo = useRef<HTMLLIElement>(null);
  const [menu, setMenu] = useState<'abajo' | 'arriba' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => {
      if (!yo.current?.contains(e.target as Node)) setMenu(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [menu]);

  function abrirMenu() {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = yo.current?.getBoundingClientRect();
    setAviso(null);
    setConfirmarBorrado(false);
    setMenu(r && r.bottom > window.innerHeight - 300 ? 'arriba' : 'abajo');
  }

  async function accion(
    hacer: () => ReturnType<typeof llamarApi>,
    cambio: Partial<MensajeWhatsAppPublico>,
  ) {
    setOcupado(true);
    setAviso(null);
    const r = await hacer();
    setOcupado(false);
    if (!r.ok) {
      setAviso(r.error.mensaje);
      return;
    }
    setMenu(null);
    alCambiar(cambio);
  }

  const reaccionar = (emoji: string) => {
    const nueva = m.reacciones.equipo === emoji ? null : emoji;
    void accion(() => llamarApi('PUT', `/whatsapp/mensajes/${m.id}/reaccion`, { emoji: nueva }), {
      reacciones: { ...m.reacciones, equipo: nueva },
    });
  };

  const reacciones = [m.reacciones.cliente, m.reacciones.equipo].filter(Boolean) as string[];
  const opcion =
    'flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-white/[0.06] disabled:opacity-50';

  return (
    <li
      ref={yo}
      id={`m-${m.id}`}
      className={clsx(
        'group relative grid max-w-[min(80%,36rem)] gap-1 rounded-2xl px-2.5 py-1.5 text-sm shadow-[0_1px_0_rgb(0_0_0/0.25)] transition-[box-shadow]',
        entrante
          ? 'justify-self-start rounded-tl-md bg-[#1b2238]'
          : 'justify-self-end rounded-tr-md bg-[#0f4a3c]',
        m.medio?.tipo === 'sticker' && 'bg-transparent shadow-none',
        reacciones.length > 0 && 'mb-3.5',
        menu && 'z-20',
      )}
    >
      {m.respuestaDe && (
        <button
          type="button"
          onClick={() => irAMensaje(m.respuestaDe!.id)}
          className={clsx(
            'grid min-w-0 gap-0.5 rounded-lg border-l-4 bg-black/25 px-2.5 py-1.5 text-left text-xs hover:bg-black/35',
            m.respuestaDe.direccion === 'entrante' ? 'border-cian' : 'border-exito',
          )}
          aria-label="Ir al mensaje citado"
        >
          <b className={m.respuestaDe.direccion === 'entrante' ? 'text-cian' : 'text-exito'}>
            {m.respuestaDe.direccion === 'entrante' ? contacto : 'Tú'}
          </b>
          <span className="line-clamp-2 text-tinta-suave">{resumenMensaje(m.respuestaDe)}</span>
        </button>
      )}
      {m.eliminado ? (
        <p className="flex items-center gap-1.5 px-0.5 text-tinta-tenue italic">
          <Ban className="size-3.5" aria-hidden="true" />
          {entrante ? 'Se eliminó este mensaje' : 'Eliminaste este mensaje'}
        </p>
      ) : (
        <>
          {m.medio && <MedioMensaje m={m} conversacionId={conversacionId} conFoto={conQr} />}
          {m.texto && (
            <p className="px-0.5 pr-5 whitespace-pre-wrap break-words">
              <Resaltado texto={m.texto} q={busqueda} />
            </p>
          )}
        </>
      )}
      <p className="flex items-center justify-end gap-1.5 px-0.5 text-[0.68rem] text-tinta-tenue">
        {m.fijado && <Pin className="size-3 text-aviso" aria-label="Fijado" />}
        {m.editado && !m.eliminado && <span>Editado</span>}
        {m.autor && <span className="truncate">{m.autor.nombre} ·</span>}
        <time dateTime={m.creadoEn} title={formatearFechaHora(m.creadoEn)}>
          {formatearHora(m.creadoEn)}
        </time>
        {!entrante && !m.eliminado && <EstadoEnvio estado={m.estado} />}
      </p>
      {reacciones.length > 0 && (
        <span
          className={clsx(
            'absolute -bottom-3.5 flex items-center gap-0.5 rounded-full border border-borde bg-elevada px-1.5 py-0.5 text-xs shadow-nv',
            entrante ? 'left-2' : 'right-2',
          )}
          title={[
            m.reacciones.cliente && `${contacto}: ${m.reacciones.cliente}`,
            m.reacciones.equipo && `Tú: ${m.reacciones.equipo}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          {[...new Set(reacciones)].map((r) => (
            <span key={r}>{r}</span>
          ))}
          {reacciones.length > 1 && (
            <span className="pl-0.5 text-[0.65rem] text-tinta-suave">{reacciones.length}</span>
          )}
        </span>
      )}

      {/* Flecha del menú dentro de la burbuja y carita al costado, como en WhatsApp Web. */}
      <>
        <button
          type="button"
          onClick={abrirMenu}
          className={clsx(
            'absolute top-1 right-1 grid size-6 place-items-center rounded-full text-tinta-suave opacity-0 group-hover:opacity-100 hover:text-tinta focus-visible:opacity-100 [@media(hover:none)]:opacity-60',
            entrante ? 'bg-[#1b2238]' : 'bg-[#0f4a3c]',
            menu && 'opacity-100',
          )}
          aria-label="Opciones del mensaje"
          aria-expanded={Boolean(menu)}
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
        {conQr && !m.eliminado && (
          <button
            type="button"
            onClick={abrirMenu}
            className={clsx(
              'absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-elevada text-tinta-suave opacity-0 shadow-nv group-hover:opacity-100 hover:text-tinta focus-visible:opacity-100',
              entrante ? '-right-10' : '-left-10',
            )}
            aria-label="Reaccionar"
            title="Reaccionar"
          >
            <SmilePlus className="size-4" aria-hidden="true" />
          </button>
        )}
      </>

      {menu && (
        <div
          role="menu"
          aria-label="Opciones del mensaje"
          className={clsx(
            'absolute z-30 w-60 overflow-hidden rounded-2xl border border-borde-fuerte bg-elevada py-1 shadow-nv',
            entrante ? 'left-0' : 'right-0',
            menu === 'abajo' ? 'top-full mt-1' : 'bottom-full mb-1',
          )}
        >
          {conQr && !m.eliminado && (
            <div className="flex items-center justify-between gap-0.5 border-b border-borde px-2 py-1.5">
              {REACCIONES.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="menuitem"
                  disabled={ocupado}
                  onClick={() => reaccionar(e)}
                  className={clsx(
                    'grid size-8 place-items-center rounded-full text-lg transition-transform hover:scale-125',
                    m.reacciones.equipo === e && 'bg-white/15',
                  )}
                  aria-label={m.reacciones.equipo === e ? `Quitar ${e}` : `Reaccionar con ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {!m.eliminado && (
            <button
              type="button"
              role="menuitem"
              className={opcion}
              onClick={() => {
                elegirCita({ conversacionId, m });
                setMenu(null);
              }}
            >
              <Reply className="size-4 text-tinta-suave" aria-hidden="true" /> Responder
            </button>
          )}
          {!m.eliminado && m.texto && (
            <button
              type="button"
              role="menuitem"
              className={opcion}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(m.texto);
                  setMenu(null);
                } catch {
                  setAviso('No se pudo copiar.');
                }
              }}
            >
              <Copy className="size-4 text-tinta-suave" aria-hidden="true" /> Copiar
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={ocupado}
            className={opcion}
            onClick={() =>
              void accion(
                () => llamarApi('PATCH', `/whatsapp/mensajes/${m.id}`, { fijado: !m.fijado }),
                {
                  fijado: !m.fijado,
                },
              )
            }
          >
            {m.fijado ? (
              <PinOff className="size-4 text-tinta-suave" aria-hidden="true" />
            ) : (
              <Pin className="size-4 text-tinta-suave" aria-hidden="true" />
            )}
            {m.fijado ? 'Desfijar' : 'Fijar'}
          </button>
          {conQr && !entrante && !m.eliminado && (
            <button
              type="button"
              role="menuitem"
              disabled={ocupado}
              className={clsx(opcion, 'text-peligro')}
              onClick={() => {
                if (!confirmarBorrado) {
                  setConfirmarBorrado(true);
                  return;
                }
                void accion(() => llamarApi('DELETE', `/whatsapp/mensajes/${m.id}`), {
                  eliminado: true,
                  texto: '',
                  medio: null,
                  fijado: false,
                });
              }}
            >
              {ocupado ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {confirmarBorrado ? 'Toca otra vez para borrarlo' : 'Eliminar para todos'}
            </button>
          )}
          {aviso && <p className="px-3.5 py-1.5 text-xs text-peligro">{aviso}</p>}
        </div>
      )}
    </li>
  );
}

/** Franja de arriba con los mensajes fijados: se recorren tocándola, como en WhatsApp. */
export function FijadosWhatsApp({ fijados }: { fijados: MensajeWhatsAppPublico[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  if (fijados.length === 0) return null;
  const actual = fijados[Math.min(i, fijados.length - 1)]!;
  const resumen = resumenMensaje(actual);
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-borde bg-white/[0.025] px-3 py-1.5 sm:px-4">
      <button
        type="button"
        onClick={() => {
          irAMensaje(actual.id);
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
export function MensajesWhatsApp({
  detalle,
  contacto,
}: {
  detalle: ConversacionWhatsAppDetalle;
  contacto: string;
}) {
  const router = useRouter();
  const lista = useRef<HTMLOListElement>(null);
  const [anteriores, setAnteriores] = useState<MensajeWhatsAppPublico[]>([]);
  const [hayMas, setHayMas] = useState(detalle.hayAnteriores);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const alturaAntes = useRef<number | null>(null);
  const conQr = detalle.puedePedirHistorial;
  // Buscar dentro del chat.
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState('');
  const [hallazgo, setHallazgo] = useState(0);
  const caja = useRef<HTMLInputElement>(null);

  // Al cambiar de chat se empieza de cero.
  const [chat, setChat] = useState(detalle.id);
  if (chat !== detalle.id) {
    setChat(detalle.id);
    setAnteriores([]);
    setHayMas(detalle.hayAnteriores);
    setAviso(null);
    setBuscando(false);
    setQ('');
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
  const buscado = normalizar(q.trim());
  const coincidencias = buscado
    ? todos.filter((m) => !m.eliminado && normalizar(m.texto).includes(buscado)).map((m) => m.id)
    : [];
  // Se empieza por la más reciente (abajo) y se sube.
  const marcado = coincidencias.length
    ? coincidencias[Math.max(0, coincidencias.length - 1 - (hallazgo % coincidencias.length))]
    : null;
  useEffect(() => {
    if (marcado) irAMensaje(marcado);
  }, [marcado]);
  useEffect(() => {
    if (buscando) caja.current?.focus();
  }, [buscando]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {buscando ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-borde bg-[rgb(10_14_32/0.9)] px-3 py-1.5 sm:px-4">
          <Search className="size-4 shrink-0 text-tinta-tenue" aria-hidden="true" />
          <input
            ref={caja}
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHallazgo(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setHallazgo((n) => (e.shiftKey ? Math.max(0, n - 1) : n + 1));
              }
              if (e.key === 'Escape') {
                setBuscando(false);
                setQ('');
              }
            }}
            placeholder="Buscar en este chat…"
            aria-label="Buscar en este chat"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-tinta-tenue"
          />
          {buscado && (
            <span className="shrink-0 text-xs text-tinta-suave tabular-nums" aria-live="polite">
              {coincidencias.length
                ? `${(hallazgo % coincidencias.length) + 1} de ${coincidencias.length}`
                : 'Sin resultados'}
            </span>
          )}
          <button
            type="button"
            disabled={coincidencias.length < 2}
            onClick={() => setHallazgo((n) => n + 1)}
            className="grid size-8 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] disabled:opacity-40"
            aria-label="Resultado anterior (más viejo)"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={coincidencias.length < 2 || hallazgo === 0}
            onClick={() => setHallazgo((n) => Math.max(0, n - 1))}
            className="grid size-8 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] disabled:opacity-40"
            aria-label="Resultado siguiente (más nuevo)"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setBuscando(false);
              setQ('');
            }}
            className="grid size-8 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06]"
            aria-label="Cerrar la búsqueda"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="absolute top-2.5 right-3 z-10 grid size-9 place-items-center rounded-full border border-borde bg-elevada/90 text-tinta-suave shadow-nv backdrop-blur hover:text-tinta"
          aria-label="Buscar en este chat"
          title="Buscar en este chat"
        >
          <Search className="size-4" aria-hidden="true" />
        </button>
      )}
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
                conversacionId={detalle.id}
                contacto={contacto}
                conQr={conQr}
                busqueda={buscado ? q : ''}
                alCambiar={(cambio) => {
                  // Los anteriores no vuelven del servidor: se actualizan aquí.
                  setAnteriores((a) => a.map((x) => (x.id === m.id ? { ...x, ...cambio } : x)));
                  router.refresh();
                }}
              />
            </Fragment>
          );
        })}
      </ol>
    </div>
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
