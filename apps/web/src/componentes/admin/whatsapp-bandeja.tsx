'use client';

import { MEDIO_WHATSAPP_MAX_MB, type VinculoWhatsApp } from '@nv/shared';
import clsx from 'clsx';
import {
  Archive,
  ArchiveRestore,
  ImagePlus,
  LoaderCircle,
  Mic,
  Pin,
  QrCode,
  Send,
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
    datos.append('archivo', archivo, nombre);
    const r = await llamarApi('POST', `/whatsapp/conversaciones/${conversacionId}/medios`, datos);
    setEnviandoMedio(false);
    if (!r.ok) {
      setErrorMedio(r.error.mensaje);
      return false;
    }
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
    });
    if (r) setTexto('');
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
            onChange={(e) => setTexto(e.target.value)}
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
 * Vincula el número de la empresa escaneando un QR, como WhatsApp Web. Es
 * gratis y el teléfono sigue funcionando; solo se usa para responder en Soporte.
 */
export function VinculoWhatsAppQr({
  inicial,
}: {
  inicial: Pick<VinculoWhatsApp, 'estado' | 'numero'>;
}) {
  const router = useRouter();
  const [vinculo, setVinculo] = useState<VinculoWhatsApp>({ ...inicial, qr: null, error: null });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const esperando = vinculo.estado === 'esperando_qr' || vinculo.estado === 'conectando';

  // Mientras se espera el escaneo, se consulta el estado cada pocos segundos.
  useEffect(() => {
    if (!esperando) return;
    let activo = true;
    const t = window.setInterval(() => {
      void llamarApi<VinculoWhatsApp>('GET', '/whatsapp/vinculo').then((r) => {
        if (!activo || !r.ok) return;
        setVinculo(r.datos);
        if (r.datos.estado === 'conectado') router.refresh();
      });
    }, 3_000);
    return () => {
      activo = false;
      window.clearInterval(t);
    };
  }, [esperando, router]);

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
    router.refresh();
  }

  if (vinculo.estado === 'conectado') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm">
          <span className="size-2 rounded-full bg-exito" aria-hidden="true" />
          Conectado{vinculo.numero ? ` con ${vinculo.numero}` : ''}. Los mensajes llegan aquí y
          puedes responder sin límite de tiempo.
        </p>
        {confirmar ? (
          <div className="flex items-center gap-2">
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
          >
            Desvincular
          </Boton>
        )}
        {error && (
          <p className="w-full text-sm text-peligro" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {vinculo.qr ? (
        <div className="flex flex-wrap items-start gap-5">
          <img
            src={vinculo.qr}
            alt="Código QR para vincular WhatsApp"
            width={220}
            height={220}
            className="rounded-xl bg-white p-2"
          />
          <ol className="grid max-w-sm list-decimal gap-1.5 pl-5 text-sm text-tinta-suave">
            {PASOS_QR.map((p) => (
              <li key={p}>{p}</li>
            ))}
            <li>Espera unos segundos: esta pantalla cambia sola al conectar.</li>
          </ol>
        </div>
      ) : (
        <p className="text-sm text-tinta-suave">
          {vinculo.estado === 'conectando'
            ? 'Conectando con WhatsApp…'
            : 'Vincula el número de la empresa escaneando un código QR, como en WhatsApp Web. Es gratis, el teléfono sigue funcionando y puedes responder sin el límite de 24 h.'}
        </p>
      )}
      {vinculo.error && !vinculo.qr && <p className="text-sm text-aviso">{vinculo.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!esperando && (
          <Boton
            cargando={cargando}
            icono={<QrCode className="size-4" />}
            onClick={() => void pedir('POST')}
          >
            Vincular con código QR
          </Boton>
        )}
        {vinculo.qr && (
          <Boton
            variante="secundario"
            tamano="sm"
            cargando={cargando}
            onClick={() => void pedir('DELETE')}
          >
            Cancelar
          </Boton>
        )}
      </div>
      <p className="text-xs text-tinta-tenue">
        WhatsApp no permite oficialmente esta conexión. Úsala para atender clientes, no para enviar
        mensajes masivos: eso puede hacer que bloqueen el número.
      </p>
      {error && (
        <p className="text-sm text-peligro" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
