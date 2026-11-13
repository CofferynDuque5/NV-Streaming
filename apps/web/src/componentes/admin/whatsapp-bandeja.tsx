'use client';

import { Archive, ArchiveRestore, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
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

/** Caja para responder dentro de la ventana de 24 h. */
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
      className="grid gap-2 border-t border-borde px-4 py-3 sm:px-5"
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
          rows={2}
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
          className={`${clasesEntrada} min-h-[2.75rem] resize-y`}
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
