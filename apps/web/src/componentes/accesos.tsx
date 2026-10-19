'use client';

import type { AccesoRevelado, AccesoServicio } from '@nv/shared';
import { Check, Copy, ExternalLink, Eye, KeyRound, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Insignia } from '@/componentes/ui/insignia';
import { llamarApi } from '@/lib/api-cliente';
import { AVISO_NO_COMPARTIR, ESTADO_ACCESO } from '@/lib/entregas';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';

type Vista = 'cliente' | 'revendedor';

const rutaBase = (vista: Vista) => (vista === 'cliente' ? '/mi/accesos' : '/revendedor/accesos');

function BotonCopiar({ texto, que }: { texto: string; que: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2_000);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <Boton
      tamano="sm"
      variante="secundario"
      onClick={() => void copiar()}
      aria-label={`Copiar ${que}`}
      icono={
        copiado ? (
          <Check className="size-3.5 text-exito" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )
      }
    >
      <span aria-live="polite">{copiado ? 'Copiado' : 'Copiar'}</span>
    </Boton>
  );
}

/** Un servicio entregado: estado, instrucciones y el botón para mostrar el código. */
export function TarjetaAcceso({ acceso, vista }: { acceso: AccesoServicio; vista: Vista }) {
  const [revelado, setRevelado] = useState<AccesoRevelado | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const estado = ESTADO_ACCESO[acceso.estado];
  const listo = acceso.estado === 'entregada';
  const secreto = acceso.tieneCodigo || acceso.tieneEnlace;
  const titulo = useId();

  return (
    <article
      aria-labelledby={titulo}
      className="grid gap-4 rounded-nv border border-borde bg-superficie p-5 shadow-nv sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id={titulo} className="text-base font-semibold">
            {acceso.servicio} · {acceso.plan}
          </h2>
          <p className="text-sm text-tinta-suave">
            {vista === 'revendedor' && acceso.cliente ? `Para ${acceso.cliente.nombre} · ` : ''}
            {acceso.entregadaEn
              ? `Entregado el ${formatearFecha(acceso.entregadaEn)}`
              : `Pagado el ${formatearFecha(acceso.creadoEn)}`}
            {acceso.suscripcion?.venceEn && acceso.suscripcion.estado !== 'cancelada'
              ? ` · vence el ${formatearFecha(acceso.suscripcion.venceEn)}`
              : ''}
          </p>
        </div>
        <Insignia tono={estado.tono}>{estado.texto}</Insignia>
      </header>

      {!listo && acceso.estado !== 'revocada' && acceso.estado !== 'anulada' && (
        <p className="text-sm text-tinta-suave">
          Estamos preparando este acceso. Te avisaremos por correo en cuanto esté listo.
        </p>
      )}
      {acceso.estado === 'revocada' && (
        <p className="text-sm text-tinta-suave">
          Este acceso terminó con la suscripción. Renueva desde «Mis servicios» para recibir uno
          nuevo.
        </p>
      )}

      {listo && acceso.instrucciones && (
        <p className="rounded-xl border border-borde bg-hundida px-3.5 py-3 text-sm whitespace-pre-line">
          {acceso.instrucciones}
        </p>
      )}

      {listo && secreto && !revelado && (
        <div className="flex flex-wrap items-center gap-3">
          <Boton
            icono={<Eye className="size-4" aria-hidden="true" />}
            onClick={() => setConfirmando(true)}
          >
            {acceso.tieneCodigo ? 'Mostrar código' : 'Mostrar enlace'}
          </Boton>
          <span className="text-xs text-tinta-tenue">
            {acceso.vistaEn
              ? `Visto por primera vez el ${formatearFechaHora(acceso.vistaEn)}`
              : 'Aún no se ha mostrado'}
          </span>
        </div>
      )}

      {revelado && <DatosRevelados datos={revelado} />}

      {confirmando && (
        <DialogoRevelar
          id={acceso.id}
          vista={vista}
          onRevelado={setRevelado}
          onCerrar={() => setConfirmando(false)}
        />
      )}
    </article>
  );
}

function DatosRevelados({ datos }: { datos: AccesoRevelado }) {
  return (
    <div className="grid gap-3 rounded-xl border border-marca/25 bg-marca-suave/40 p-4">
      {datos.codigo && (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-tinta-suave">Código de activación</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 py-2 font-mono text-base break-all select-all">
              {datos.codigo}
            </code>
            <BotonCopiar texto={datos.codigo} que="el código" />
          </div>
        </div>
      )}
      {datos.enlace && (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-tinta-suave">Enlace de activación</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <a
              href={datos.enlace}
              target="_blank"
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium text-marca underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Abrir el enlace de activación</span>
            </a>
            <BotonCopiar texto={datos.enlace} que="el enlace" />
          </div>
        </div>
      )}
      <p className="flex gap-2 text-xs text-tinta-suave">
        <ShieldAlert className="size-4 shrink-0 text-aviso" aria-hidden="true" />
        {AVISO_NO_COMPARTIR}
      </p>
    </div>
  );
}

function DialogoRevelar({
  id,
  vista,
  onRevelado,
  onCerrar,
}: {
  id: string;
  vista: Vista;
  onRevelado: (d: AccesoRevelado) => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal nativo: atrapa el foco, cierra con Escape y devuelve el foco al cerrarse.
  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function mostrar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<AccesoRevelado>('POST', `${rutaBase(vista)}/${id}/revelar`, {});
    setCargando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    onRevelado(r.datos);
    dialogo.current?.close();
    router.refresh();
  }

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={`${ids}-titulo`}
      aria-describedby={`${ids}-texto`}
      onClose={onCerrar}
      onCancel={(e) => {
        if (cargando) e.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-nv border border-borde bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/60"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <h2 id={`${ids}-titulo`} className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-5 text-marca" aria-hidden="true" />
          ¿Mostrar el acceso?
        </h2>
        <div id={`${ids}-texto`} className="grid gap-2 text-sm text-tinta-suave">
          <p>
            {vista === 'revendedor'
              ? 'Asegúrate de que nadie más vea tu pantalla. Entrégaselo solo a tu cliente.'
              : 'Asegúrate de que nadie más vea tu pantalla.'}
          </p>
          <p>{AVISO_NO_COMPARTIR}</p>
          <p className="text-xs text-tinta-tenue">Queda registrado cada vez que se muestra.</p>
        </div>
        {error && <Alerta tono="peligro">{error}</Alerta>}
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="fantasma" onClick={() => dialogo.current?.close()} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton
            autoFocus
            cargando={cargando}
            icono={<Eye className="size-4" aria-hidden="true" />}
            onClick={() => void mostrar()}
          >
            Mostrar
          </Boton>
        </div>
      </div>
    </dialog>
  );
}
