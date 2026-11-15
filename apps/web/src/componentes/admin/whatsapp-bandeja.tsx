'use client';

import { MEDIO_WHATSAPP_MAX_MB, type VinculoWhatsApp } from '@nv/shared';
import clsx from 'clsx';
import {
  Archive,
  ArchiveRestore,
  ImagePlus,
  LoaderCircle,
  MessageSquareDot,
  Mic,
  Pin,
  QrCode,
  Send,
  Smile,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { llamarApi } from '@/lib/api-cliente';
import { useAccion } from './piezas';
import { elegirCita, irAMensaje, resumenMensaje, useCita } from './whatsapp-chat';

/** Emojis a mano para la caja de respuesta, por grupos como en WhatsApp. */
const EMOJIS: { grupo: string; lista: string[] }[] = [
  {
    grupo: 'Caras',
    lista:
      '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😌 😔 😟 🙁 😢 😭 😤 😠 😡 🤯 😳 🥺 😱 🤔 🤫 🤭 🙄 😬 😴 🤗 🤝'.split(
        ' ',
      ),
  },
  {
    grupo: 'Gestos',
    lista: '👍 👎 👌 ✌️ 🤞 🤟 🤙 👋 👏 🙌 🙏 💪 👀 🫶'.split(' '),
  },
  {
    grupo: 'Corazones y símbolos',
    lista:
      '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💯 ✅ ❌ ⚠️ ⭐ 🔥 ✨ 🎉 🎁 💰 💵 💳 📱 📺 🎬 🎮 🎧 ⏰ 📌 🔒 🔑'.split(
        ' ',
      ),
  },
];

/** Vuelve a pedir la bandeja cada cierto tiempo mientras la pestaña está a la vista. */
export function RefrescoBandeja({ cadaMs = 15_000 }: { cadaMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, cadaMs);
    return () => window.clearInterval(t);
  }, [router, cadaMs]);
  return null;
}

/** Formato de grabación que entiende el navegador (el servidor lo pasa a nota de voz de WhatsApp). */
function formatoGrabacion(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Caja para responder: texto, imagen (con su pie) o nota de voz. Las imágenes y
 * los audios salen por el número vinculado con QR.
 */
export function ResponderWhatsApp({
  conversacionId,
  puede,
  motivo,
  puedeMedios = false,
}: {
  conversacionId: string;
  puede: boolean;
  /** Por qué no se puede responder, si no se puede. */
  motivo: string | null;
  /** El número está vinculado por QR: se pueden enviar imágenes y notas de voz. */
  puedeMedios?: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const { cargando, error, ejecutar } = useAccion();
  const id = useId();
  const cita = useCita(conversacionId);
  const areaTexto = useRef<HTMLTextAreaElement>(null);
  const [emojis, setEmojis] = useState(false);
  const ultimoAviso = useRef(0);

  // Al elegir «Responder» en un mensaje, se escribe aquí.
  useEffect(() => {
    if (cita) areaTexto.current?.focus();
  }, [cita]);

  /** «Escribiendo…» en el teléfono del cliente, como mucho cada 5 s. */
  function avisarEscribiendo(grabandoAudio = false) {
    if (!puedeMedios) return;
    const ahora = Date.now();
    if (!grabandoAudio && ahora - ultimoAviso.current < 5_000) return;
    ultimoAviso.current = ahora;
    void llamarApi('POST', `/whatsapp/conversaciones/${conversacionId}/escribiendo`, {
      grabando: grabandoAudio,
    });
  }

  function ponerEmoji(e: string) {
    const area = areaTexto.current;
    const desde = area?.selectionStart ?? texto.length;
    const hasta = area?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, desde) + e + texto.slice(hasta));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(desde + e.length, desde + e.length);
    });
  }
  const selector = useRef<HTMLInputElement>(null);
  const [imagen, setImagen] = useState<{ archivo: File; vista: string } | null>(null);
  const [enviandoMedio, setEnviandoMedio] = useState(false);
  const [errorMedio, setErrorMedio] = useState<string | null>(null);
  // Grabación de la nota de voz.
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const enviarAlParar = useRef(false);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const sePuedeGrabar = puedeMedios && Boolean(formatoGrabacion());

  useEffect(() => {
    if (!grabando) return;
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1_000);
    return () => window.clearInterval(t);
  }, [grabando]);

  // Al salir de la pantalla se suelta el micrófono y la vista previa.
  useEffect(
    () => () => {
      grabador.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => () => (imagen ? URL.revokeObjectURL(imagen.vista) : undefined), [imagen]);

  async function subir(archivo: Blob, nombre: string, campos: Record<string, string>) {
    setEnviandoMedio(true);
    setErrorMedio(null);
    const datos = new FormData();
    for (const [k, v] of Object.entries(campos)) datos.append(k, v);
    if (cita) datos.append('respuestaDe', cita.id);
    datos.append('archivo', archivo, nombre);
    const r = await llamarApi('POST', `/whatsapp/conversaciones/${conversacionId}/medios`, datos);
    setEnviandoMedio(false);
    if (!r.ok) {
      setErrorMedio(r.error.mensaje);
      return false;
    }
    elegirCita(null);
    router.refresh();
    return true;
  }

  async function enviar() {
    if (imagen) {
      const ok = await subir(imagen.archivo, imagen.archivo.name || 'imagen', {
        ...(texto.trim() ? { texto: texto.trim() } : {}),
      });
      if (ok) {
        setImagen(null);
        setTexto('');
      }
      return;
    }
    if (!texto.trim()) return;
    const r = await ejecutar('POST', `/whatsapp/conversaciones/${conversacionId}/mensajes`, {
      texto,
      ...(cita ? { respuestaDe: cita.id } : {}),
    });
    if (r) {
      setTexto('');
      setEmojis(false);
      elegirCita(null);
    }
  }

  function elegirImagen(archivo: File | undefined | null) {
    if (!archivo || !puedeMedios) return;
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) {
      setErrorMedio('Elige una imagen JPG, PNG o WebP.');
      return;
    }
    if (archivo.size > MEDIO_WHATSAPP_MAX_MB * 1024 * 1024) {
      setErrorMedio(`La imagen no puede superar ${MEDIO_WHATSAPP_MAX_MB} MB.`);
      return;
    }
    setErrorMedio(null);
    setImagen({ archivo, vista: URL.createObjectURL(archivo) });
  }

  async function grabar() {
    setErrorMedio(null);
    const tipo = formatoGrabacion();
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMedio('No pudimos usar el micrófono. Revisa el permiso del navegador.');
      return;
    }
    const r = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
    trozos.current = [];
    enviarAlParar.current = false;
    r.ondataavailable = (e) => {
      if (e.data.size > 0) trozos.current.push(e.data);
    };
    r.onstop = () => {
      flujo.getTracks().forEach((t) => t.stop());
      setGrabando(false);
      if (!enviarAlParar.current) return;
      const audio = new Blob(trozos.current, { type: r.mimeType || tipo || 'audio/webm' });
      const extension = audio.type.includes('ogg')
        ? 'ogg'
        : audio.type.includes('mp4')
          ? 'm4a'
          : 'webm';
      void subir(audio, `nota-de-voz.${extension}`, { segundos: String(segundosFinal.current) });
    };
    grabador.current = r;
    setSegundos(0);
    setGrabando(true);
    avisarEscribiendo(true);
    r.start(250);
  }

  const segundosFinal = useRef(0);
  function parar(enviarla: boolean) {
    enviarAlParar.current = enviarla;
    segundosFinal.current = segundos;
    if (grabador.current?.state !== 'inactive') grabador.current?.stop();
  }

  const ocupado = cargando || enviandoMedio;
  const claseIcono =
    'grid size-11 shrink-0 place-items-center rounded-full text-tinta-suave hover:bg-white/[0.06] hover:text-tinta disabled:opacity-40';

  return (
    <form
      className="grid shrink-0 gap-2 border-t border-borde bg-[rgb(10_14_32/0.9)] px-3 py-2.5 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      {cita && (
        <div className="flex items-stretch gap-2 rounded-xl bg-black/25">
          <button
            type="button"
            onClick={() => irAMensaje(cita.id)}
            className={clsx(
              'grid min-w-0 flex-1 gap-0.5 rounded-xl border-l-4 px-3 py-2 text-left text-xs',
              cita.direccion === 'entrante' ? 'border-cian' : 'border-exito',
            )}
          >
            <b className={cita.direccion === 'entrante' ? 'text-cian' : 'text-exito'}>
              {cita.direccion === 'entrante'
                ? 'Respondiendo al cliente'
                : 'Respondiendo a tu mensaje'}
            </b>
            <span className="line-clamp-2 text-tinta-suave">{resumenMensaje(cita)}</span>
          </button>
          <button
            type="button"
            onClick={() => elegirCita(null)}
            className="grid w-10 shrink-0 place-items-center rounded-xl text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
            aria-label="Cancelar la respuesta"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {emojis && !grabando && (
        <div
          role="dialog"
          aria-label="Emojis"
          className="grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-borde bg-black/25 p-2 [scrollbar-width:thin]"
        >
          {EMOJIS.map((g) => (
            <div key={g.grupo} className="grid gap-1">
              <span className="px-1 text-[0.68rem] font-semibold text-tinta-tenue">{g.grupo}</span>
              <div className="flex flex-wrap">
                {g.lista.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => ponerEmoji(e)}
                    className="grid size-9 place-items-center rounded-lg text-xl hover:bg-white/[0.08]"
                    aria-label={`Poner ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {imagen && (
        <div className="flex items-start gap-3 rounded-2xl border border-borde bg-black/20 p-2">
          <img
            src={imagen.vista}
            alt="Imagen para enviar"
            className="max-h-40 max-w-[12rem] rounded-xl object-contain"
          />
          <div className="grid min-w-0 flex-1 gap-1 text-sm">
            <b className="truncate">{imagen.archivo.name || 'Imagen'}</b>
            <span className="text-xs text-tinta-suave">
              Escribe abajo el texto que la acompaña (opcional) y envíala.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setImagen(null)}
            className="grid size-8 place-items-center rounded-lg text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
            aria-label="Quitar la imagen"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <label htmlFor={id} className="sr-only">
        Respuesta por WhatsApp
      </label>
      {grabando ? (
        <div className="flex items-center gap-2" role="status">
          <button
            type="button"
            onClick={() => parar(false)}
            className={claseIcono}
            aria-label="Descartar la nota de voz"
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </button>
          <span className="flex flex-1 items-center gap-2.5 rounded-full border border-borde bg-black/20 px-4 py-2.5 text-sm">
            <span className="size-2.5 animate-pulse rounded-full bg-peligro" aria-hidden="true" />
            Grabando… <span className="tabular-nums text-tinta-suave">{reloj(segundos)}</span>
          </span>
          <button
            type="button"
            onClick={() => parar(true)}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-exito text-black hover:brightness-110"
            aria-label="Enviar la nota de voz"
          >
            <Send className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={() => setEmojis((v) => !v)}
            disabled={!puede}
            className={clsx(claseIcono, emojis && 'text-exito')}
            aria-label={emojis ? 'Cerrar los emojis' : 'Emojis'}
            aria-expanded={emojis}
            title="Emojis"
          >
            {emojis ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Smile className="size-5" aria-hidden="true" />
            )}
          </button>
          {puedeMedios && (
            <>
              <input
                ref={selector}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  elegirImagen(e.currentTarget.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => selector.current?.click()}
                disabled={!puede || ocupado}
                className={claseIcono}
                aria-label="Adjuntar una imagen"
                title="Imagen"
              >
                <ImagePlus className="size-5" aria-hidden="true" />
              </button>
            </>
          )}
          <textarea
            ref={areaTexto}
            id={id}
            rows={1}
            maxLength={imagen ? 1024 : 4096}
            value={texto}
            disabled={!puede}
            placeholder={
              !puede
                ? (motivo ?? '')
                : imagen
                  ? 'Texto de la imagen (opcional)…'
                  : 'Escribe tu respuesta…'
            }
            onChange={(e) => {
              setTexto(e.target.value);
              if (e.target.value) avisarEscribiendo();
            }}
            onPaste={(e) => {
              const archivo = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
              if (archivo && puedeMedios) {
                e.preventDefault();
                elegirImagen(archivo);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            className={`${clasesEntrada} max-h-40 min-h-11 resize-none rounded-[1.4rem] py-2.5 [field-sizing:content]`}
          />
          {!texto.trim() && !imagen && sePuedeGrabar ? (
            <button
              type="button"
              onClick={() => void grabar()}
              disabled={!puede || ocupado}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-exito text-black hover:brightness-110 disabled:opacity-40"
              aria-label="Grabar una nota de voz"
              title="Nota de voz"
            >
              {enviandoMedio ? (
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Mic className="size-5" aria-hidden="true" />
              )}
            </button>
          ) : (
            <Boton
              type="submit"
              cargando={ocupado}
              disabled={!puede || (!texto.trim() && !imagen)}
              icono={<Send className="size-4" />}
            >
              Enviar
            </Boton>
          )}
        </div>
      )}
      {!puede && motivo && <p className="text-xs text-tinta-suave">{motivo}</p>}
      {(error || errorMedio) && (
        <p className="text-sm text-peligro" role="alert">
          {errorMedio ?? error?.mensaje}
        </p>
      )}
    </form>
  );
}

/** Deja el chat como no leído (con su globo verde) y vuelve a la lista. */
export function MarcarNoLeida({
  conversacionId,
  volverA,
}: {
  conversacionId: string;
  volverA: string;
}) {
  const router = useRouter();
  const { cargando, ejecutar } = useAccion();
  return (
    <button
      type="button"
      disabled={cargando}
      onClick={async () => {
        const r = await ejecutar('PATCH', `/whatsapp/conversaciones/${conversacionId}`, {
          noLeida: true,
        });
        if (r) router.push(volverA);
      }}
      className="grid size-9 place-items-center rounded-lg text-tinta-suave hover:bg-white/[0.06] hover:text-tinta disabled:opacity-50"
      aria-label="Marcar como no leído"
      title="Marcar como no leído"
    >
      {cargando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <MessageSquareDot className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

/** Fija la conversación arriba de la lista, o la suelta. */
export function FijarConversacion({
  conversacionId,
  fijada,
}: {
  conversacionId: string;
  fijada: boolean;
}) {
  const { cargando, ejecutar } = useAccion();
  return (
    <button
      type="button"
      disabled={cargando}
      onClick={() =>
        void ejecutar('PATCH', `/whatsapp/conversaciones/${conversacionId}`, { fijada: !fijada })
      }
      className={clsx(
        'grid size-9 shrink-0 place-items-center rounded-lg border border-borde hover:border-borde-fuerte',
        fijada ? 'bg-aviso/10 text-aviso' : 'text-tinta-suave hover:text-tinta',
      )}
      aria-pressed={fijada}
      aria-label={fijada ? 'Desfijar la conversación' : 'Fijar la conversación arriba'}
      title={fijada ? 'Desfijar' : 'Fijar arriba'}
    >
      {cargando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Pin className={clsx('size-4', fijada && 'fill-current')} aria-hidden="true" />
      )}
    </button>
  );
}

export function CerrarConversacion({
  conversacionId,
  cerrada,
}: {
  conversacionId: string;
  cerrada: boolean;
}) {
  const { cargando, error, ejecutar } = useAccion();
  return (
    <div className="grid justify-items-end gap-1">
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={cargando}
        icono={cerrada ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        onClick={() =>
          void ejecutar('PATCH', `/whatsapp/conversaciones/${conversacionId}`, {
            cerrada: !cerrada,
          })
        }
      >
        {cerrada ? 'Reabrir' : 'Cerrar'}
      </Boton>
      {error && (
        <p className="text-xs text-peligro" role="alert">
          {error.mensaje}
        </p>
      )}
    </div>
  );
}

const PASOS_QR = [
  'Abre WhatsApp en el teléfono del número de la empresa.',
  'Toca Ajustes (en Android, los tres puntos) → Dispositivos vinculados → Vincular un dispositivo.',
  'Apunta la cámara a este código.',
];

/**
 * Estado del número de la empresa, en pequeño: «Conectado» con su número (y
 * desvincular en su menú) o un botón para vincular, que abre el QR en una
 * ventana. Gratis, como WhatsApp Web; el teléfono sigue funcionando.
 */
export function VinculoWhatsAppQr({
  inicial,
  puedeCambiar,
}: {
  inicial: Pick<VinculoWhatsApp, 'estado' | 'numero'>;
  /** Puede vincular o desvincular (si no, solo ve el estado). */
  puedeCambiar: boolean;
}) {
  const router = useRouter();
  const ventana = useRef<HTMLDialogElement>(null);
  const [vinculo, setVinculo] = useState<VinculoWhatsApp>({ ...inicial, qr: null, error: null });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [vigente, setVigente] = useState(inicial);
  // Lo que manda el servidor en cada recarga manda sobre lo de antes.
  if (vigente.estado !== inicial.estado || vigente.numero !== inicial.numero) {
    setVigente(inicial);
    setVinculo((v) => ({ ...v, ...inicial }));
  }
  const esperando = vinculo.estado === 'esperando_qr';
  const conectando = vinculo.estado === 'conectando';

  // Mientras se espera el escaneo (o reconecta), se consulta el estado cada pocos segundos.
  useEffect(() => {
    if (!esperando && !conectando) return;
    let activo = true;
    const t = window.setInterval(() => {
      void llamarApi<VinculoWhatsApp>('GET', '/whatsapp/vinculo').then((r) => {
        if (!activo || !r.ok) return;
        setVinculo(r.datos);
        if (r.datos.estado === 'conectado') {
          ventana.current?.close();
          router.refresh();
        }
      });
    }, 3_000);
    return () => {
      activo = false;
      window.clearInterval(t);
    };
  }, [esperando, conectando, router]);

  async function pedir(metodo: 'POST' | 'DELETE') {
    setCargando(true);
    setError(null);
    const r = await llamarApi<VinculoWhatsApp>(
      metodo,
      '/whatsapp/vinculo',
      metodo === 'POST' ? {} : undefined,
    );
    setCargando(false);
    setConfirmar(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    setVinculo(r.datos);
    if (metodo === 'DELETE') ventana.current?.close();
    router.refresh();
  }

  const conectado = vinculo.estado === 'conectado';
  const pastilla = clsx(
    'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap',
    conectado
      ? 'border-exito/35 bg-exito/[0.08] text-tinta hover:bg-exito/[0.14]'
      : conectando
        ? 'border-borde text-tinta-suave'
        : 'border-aviso/40 bg-aviso/[0.08] text-tinta hover:bg-aviso/[0.14]',
  );

  return (
    <>
      <button
        type="button"
        className={pastilla}
        onClick={() => {
          if (!puedeCambiar) return;
          setError(null);
          ventana.current?.showModal();
        }}
        aria-haspopup={puedeCambiar ? 'dialog' : undefined}
        title={conectado ? 'Número de WhatsApp conectado' : undefined}
      >
        {conectando ? (
          <LoaderCircle className="size-4 animate-spin text-cian" aria-hidden="true" />
        ) : (
          <span
            className={clsx('size-2.5 rounded-full', conectado ? 'bg-exito' : 'bg-aviso')}
            aria-hidden="true"
          />
        )}
        {conectado
          ? (vinculo.numero ?? 'Conectado')
          : conectando
            ? 'Reconectando…'
            : puedeCambiar
              ? 'Vincular número'
              : 'Número sin vincular'}
        {conectado && (
          <span className="font-normal text-tinta-suave max-sm:hidden">· conectado</span>
        )}
      </button>

      {puedeCambiar && (
        <dialog
          ref={ventana}
          aria-label="Número de WhatsApp de la empresa"
          onClick={(e) => {
            if (e.target === e.currentTarget) ventana.current?.close();
          }}
          className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-nv border border-borde-fuerte bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/65 backdrop:backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-3.5">
            <h2 className="text-base font-semibold">Número de WhatsApp</h2>
            <button
              type="button"
              onClick={() => ventana.current?.close()}
              className="grid size-8 place-items-center rounded-lg text-tinta-tenue hover:bg-white/[0.06] hover:text-tinta"
              aria-label="Cerrar"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-4 p-5">
            {conectado ? (
              <>
                <p className="flex items-center gap-2.5 text-sm">
                  <span className="size-2.5 rounded-full bg-exito" aria-hidden="true" />
                  Conectado{vinculo.numero ? ` con ${vinculo.numero}` : ''}. Los mensajes llegan
                  aquí y respondes sin límite de tiempo.
                </p>
                {confirmar ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-tinta-suave">¿Desvincular el número?</span>
                    <Boton
                      tamano="sm"
                      variante="peligro"
                      cargando={cargando}
                      onClick={() => void pedir('DELETE')}
                    >
                      Sí, desvincular
                    </Boton>
                    <Boton tamano="sm" variante="secundario" onClick={() => setConfirmar(false)}>
                      No
                    </Boton>
                  </div>
                ) : (
                  <Boton
                    tamano="sm"
                    variante="secundario"
                    icono={<Unlink className="size-4" />}
                    onClick={() => setConfirmar(true)}
                    className="justify-self-start"
                  >
                    Desvincular
                  </Boton>
                )}
              </>
            ) : vinculo.qr ? (
              <div className="grid justify-items-center gap-4">
                <img
                  src={vinculo.qr}
                  alt="Código QR para vincular WhatsApp"
                  width={240}
                  height={240}
                  className="rounded-xl bg-white p-2"
                />
                <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-tinta-suave">
                  {PASOS_QR.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  <li>Espera unos segundos: esta ventana se cierra sola al conectar.</li>
                </ol>
                <Boton
                  variante="secundario"
                  tamano="sm"
                  cargando={cargando}
                  onClick={() => void pedir('DELETE')}
                >
                  Cancelar
                </Boton>
              </div>
            ) : (
              <>
                <p className="text-sm text-tinta-suave">
                  {conectando
                    ? 'Reconectando con WhatsApp… Si tarda más de un minuto, vuelve a vincular.'
                    : 'Escanea un código QR con el teléfono de la empresa, como en WhatsApp Web. Es gratis, el teléfono sigue funcionando y respondes sin el límite de 24 h.'}
                </p>
                {vinculo.error && <p className="text-sm text-aviso">{vinculo.error}</p>}
                <Boton
                  cargando={cargando}
                  icono={<QrCode className="size-4" />}
                  onClick={() => void pedir('POST')}
                  className="justify-self-start"
                >
                  {conectando ? 'Vincular de nuevo' : 'Mostrar código QR'}
                </Boton>
                <p className="text-xs text-tinta-tenue">
                  Úsalo para atender clientes, no para enviar mensajes masivos: eso puede hacer que
                  WhatsApp bloquee el número.
                </p>
              </>
            )}
            {error && (
              <p className="text-sm text-peligro" role="alert">
                {error}
              </p>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
