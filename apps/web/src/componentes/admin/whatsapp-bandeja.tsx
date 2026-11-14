'use client';

import type { VinculoWhatsApp } from '@nv/shared';
import { Archive, ArchiveRestore, QrCode, Send, Unlink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ComponentProps, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

/** Lista de mensajes que se queda abajo, en lo último, como en WhatsApp. */
export function ListaAlFinal({ children, ...props }: ComponentProps<'ol'>) {
  const lista = useRef<HTMLOListElement>(null);
  const cuantos = Array.isArray(children) ? children.length : 1;
  useLayoutEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cuantos]);
  return (
    <ol ref={lista} {...props}>
      {children}
    </ol>
  );
}

/** Caja para responder (dentro de la ventana de 24 h si es por la Cloud API). */
export function ResponderWhatsApp({
  conversacionId,
  puede,
  motivo,
}: {
  conversacionId: string;
  puede: boolean;
  /** Por qué no se puede responder, si no se puede. */
  motivo: string | null;
}) {
  const [texto, setTexto] = useState('');
  const { cargando, error, ejecutar } = useAccion();
  const id = useId();

  async function enviar() {
    if (!texto.trim()) return;
    const r = await ejecutar('POST', `/whatsapp/conversaciones/${conversacionId}/mensajes`, {
      texto,
    });
    if (r) setTexto('');
  }

  return (
    <form
      className="grid shrink-0 gap-2 border-t border-borde bg-[rgb(10_14_32/0.9)] px-3 py-2.5 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Respuesta por WhatsApp
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={id}
          rows={1}
          maxLength={4096}
          value={texto}
          disabled={!puede}
          placeholder={puede ? 'Escribe tu respuesta…' : (motivo ?? '')}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          className={`${clasesEntrada} max-h-40 min-h-11 resize-none rounded-[1.4rem] py-2.5 [field-sizing:content]`}
        />
        <Boton
          type="submit"
          cargando={cargando}
          disabled={!puede || !texto.trim()}
          icono={<Send className="size-4" />}
        >
          Enviar
        </Boton>
      </div>
      {!puede && motivo && <p className="text-xs text-tinta-suave">{motivo}</p>}
      {error && (
        <p className="text-sm text-peligro" role="alert">
          {error.mensaje}
        </p>
      )}
    </form>
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
