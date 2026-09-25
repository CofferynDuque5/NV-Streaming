'use client';

import { type EntregaDetalle, MENSAJE_SIN_CREDENCIALES } from '@nv/shared';
import { Ban, CircleCheck, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto } from '@/componentes/ui/selector';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/**
 * Cajón lateral del detalle de una entrega. Se abre con `?id=` en la URL
 * (enlazable y sin JavaScript); con JavaScript se cierra con Escape y lleva el
 * foco a su título.
 */
export function CajonLateral({
  titulo,
  cerrar,
  children,
}: {
  titulo: string;
  cerrar: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const encabezado = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    encabezado.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(cerrar, { scroll: false });
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [cerrar, router]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link
        href={cerrar}
        scroll={false}
        aria-label="Cerrar el detalle"
        tabIndex={-1}
        className="absolute inset-0 bg-black/50"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cajon-titulo"
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-borde bg-superficie shadow-nv"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-borde bg-superficie px-5 py-4 sm:px-6">
          <h2
            id="cajon-titulo"
            ref={encabezado}
            tabIndex={-1}
            className="text-base font-semibold focus:outline-none"
          >
            {titulo}
          </h2>
          <Link
            href={cerrar}
            scroll={false}
            className="rounded-lg p-1.5 text-tinta-tenue hover:bg-hundida hover:text-tinta"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </Link>
        </header>
        <div className="grid gap-5 p-5 sm:p-6">{children}</div>
      </aside>
    </div>
  );
}

type Panel = 'completar' | 'anular' | null;

/** Acciones del equipo sobre una entrega: reintentar, completar a mano y anular. */
export function AccionesEntrega({
  entrega,
  adaptadorProveedor,
}: {
  entrega: EntregaDetalle;
  adaptadorProveedor: string | null;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const reintento = useAccion();
  const abierta = entrega.estado === 'pendiente' || entrega.estado === 'fallida';
  const puedeReintentar = abierta && adaptadorProveedor !== null && adaptadorProveedor !== 'manual';
  const puedeAnular = abierta || entrega.estado === 'entregada';

  if (!abierta && !puedeAnular) return null;

  return (
    <div className="grid gap-3">
      {panel === null && (
        <div className="flex flex-wrap gap-2">
          {abierta && (
            <Boton
              icono={<CircleCheck className="size-4" aria-hidden="true" />}
              onClick={() => setPanel('completar')}
            >
              Completar a mano
            </Boton>
          )}
          {puedeReintentar && (
            <Boton
              variante="secundario"
              cargando={reintento.cargando}
              icono={<RotateCcw className="size-4" aria-hidden="true" />}
              onClick={() => void reintento.ejecutar('POST', `/entregas/${entrega.id}/reintentar`)}
            >
              Reintentar ahora
            </Boton>
          )}
          {puedeAnular && (
            <Boton
              variante="peligro"
              icono={<Ban className="size-4" aria-hidden="true" />}
              onClick={() => setPanel('anular')}
            >
              {entrega.estado === 'entregada' ? 'Revocar' : 'Anular'}
            </Boton>
          )}
        </div>
      )}
      <ErrorGeneral error={reintento.error} />
      {panel === 'completar' && <CompletarEntrega id={entrega.id} onListo={() => setPanel(null)} />}
      {panel === 'anular' && (
        <AnularEntrega
          id={entrega.id}
          entregada={entrega.estado === 'entregada'}
          webhook={entrega.adaptador === 'webhook'}
          onListo={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function CompletarEntrega({ id, onListo }: { id: string; onListo: () => void }) {
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/entregas/${id}/completar`, {
      instrucciones: textoDe(d, 'instrucciones') ?? '',
      enlace: textoDe(d, 'enlace'),
      codigo: textoDe(d, 'codigo'),
    });
    if (r) onListo();
  }

  return (
    <PanelFormulario
      titulo="Completar la entrega"
      descripcion="El cliente lo verá en «Mis accesos» y recibirá un correo (sin el código)."
      onCerrar={onListo}
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <Alerta tono="aviso">{MENSAJE_SIN_CREDENCIALES}</Alerta>
        <AreaTexto
          etiqueta="Pasos para activar el servicio"
          name="instrucciones"
          rows={4}
          required
          maxLength={2000}
          placeholder="Ej.: Descarga la app oficial, elige «Canjear» y pega el código."
          error={campos.instrucciones}
        />
        <Campo
          etiqueta="Enlace de activación oficial"
          name="enlace"
          type="url"
          inputMode="url"
          placeholder="https://… (opcional)"
          error={campos.enlace}
          spellCheck={false}
          autoCapitalize="off"
        />
        <Campo
          etiqueta="Código de activación"
          name="codigo"
          placeholder="Opcional"
          ayuda="Se guarda cifrado y solo lo ve el cliente al pulsar «Mostrar»."
          error={campos.codigo}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Marcar como entregada
          </Boton>
          <Boton variante="fantasma" onClick={onListo}>
            Cancelar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

function AnularEntrega({
  id,
  entregada,
  webhook,
  onListo,
}: {
  id: string;
  entregada: boolean;
  webhook: boolean;
  onListo: () => void;
}) {
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar('POST', `/entregas/${id}/anular`, {
      motivo: textoDe(d, 'motivo') ?? '',
    });
    if (r) onListo();
  }

  return (
    <PanelFormulario
      titulo={entregada ? 'Revocar la entrega' : 'Anular la entrega'}
      descripcion={
        entregada
          ? webhook
            ? 'Se pedirá al proveedor que desactive el servicio. El cliente dejará de ver el acceso.'
            : 'El cliente dejará de ver el acceso. Un código ya mostrado no se puede recuperar.'
          : 'La entrega no se hará. No cambia la suscripción ni la factura.'
      }
      onCerrar={onListo}
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <AreaTexto
          etiqueta="Motivo"
          name="motivo"
          rows={2}
          required
          maxLength={500}
          error={campos.motivo}
        />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" variante="peligro" cargando={cargando}>
            {entregada ? 'Revocar' : 'Anular'}
          </Boton>
          <Boton variante="fantasma" onClick={onListo}>
            Cancelar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}
