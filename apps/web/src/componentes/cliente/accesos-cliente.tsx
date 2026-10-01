'use client';

import type { AccesoRevelado, AccesoServicio } from '@nv/shared';
import clsx from 'clsx';
import { ExternalLink, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { ESTADO_ACCESO } from '@/lib/entregas';
import { BotonCopiar, MensajeError, PildoraEstado, type TonoEstado } from './pago';
import { claseEnlace, MiniaturaServicio } from './piezas-cuenta';

const TONO: Record<AccesoServicio['estado'], TonoEstado> = {
  entregada: 'exito',
  pendiente: 'cian',
  en_curso: 'cian',
  fallida: 'aviso',
  revocada: 'neutro',
  anulada: 'neutro',
};

const larga = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' });

/** Pasos de activación: una lista si vienen en varias líneas. */
function Instrucciones({ texto, titulo }: { texto: string; titulo: string }) {
  const lineas = texto
    .split('\n')
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean);
  return (
    <div className="rounded-[0.875rem] border border-borde bg-white/[0.03] px-3.5 py-3 text-sm text-tinta-suave">
      <b className="text-tinta">{titulo}</b>
      {lineas.length > 1 ? (
        <ol className="mt-1.5 grid list-decimal gap-1 pl-4.5">
          {lineas.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 whitespace-pre-line">{texto}</p>
      )}
    </div>
  );
}

/**
 * Un acceso del cliente: el código o enlace se muestra solo tras confirmar
 * que es personal, y entonces aparecen los pasos y el botón de copiar. En el
 * panel del revendedor (`vista="revendedor"`) es el acceso de un cliente suyo:
 * se confirma que se lo entregará solo a esa persona.
 */
export function TarjetaAccesoCliente({
  acceso,
  detalle,
  visto,
  pagoPendiente,
  vista = 'cliente',
}: {
  acceso: AccesoServicio;
  /** «Alta · entregado el 3 de octubre · vence el 2 de noviembre». */
  detalle: string;
  /** Fecha en que lo vio por primera vez, ya formateada. */
  visto: string | null;
  pagoPendiente: boolean;
  vista?: 'cliente' | 'revendedor';
}) {
  const deRevendedor = vista === 'revendedor';
  const cliente = acceso.cliente?.nombre ?? 'tu cliente';
  const tituloPasos = deRevendedor ? 'Cómo lo activa tu cliente' : 'Cómo activarlo';
  const router = useRouter();
  const titulo = useId();
  const [fase, setFase] = useState<'cerrado' | 'confirmar' | 'visto'>('cerrado');
  const [revelado, setRevelado] = useState<AccesoRevelado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const listo = acceso.estado === 'entregada';
  const secreto = acceso.tieneCodigo || acceso.tieneEnlace;
  const que = acceso.tieneCodigo ? 'código' : 'enlace';

  async function mostrar() {
    setCargando(true);
    setError(null);
    const base = deRevendedor ? '/revendedor/accesos' : '/mi/accesos';
    const r = await llamarApi<AccesoRevelado>('POST', `${base}/${acceso.id}/revelar`, {});
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setRevelado(r.datos);
    setFase('visto');
    router.refresh();
  }

  let cuerpo = null;
  if (acceso.estado === 'revocada') {
    cuerpo = (
      <p className="text-sm text-tinta-suave">
        {deRevendedor
          ? 'Este acceso terminó con el servicio. Renuévalo desde Renovaciones para recibir uno nuevo.'
          : 'Este acceso terminó con la suscripción. Renueva desde «Mis servicios» para recibir uno nuevo.'}
      </p>
    );
  } else if (acceso.estado === 'anulada') {
    cuerpo = (
      <p className="text-sm text-tinta-suave">Este acceso se anuló y ya no se puede usar.</p>
    );
  } else if (!listo) {
    cuerpo = (
      <p className="rounded-[0.875rem] border border-borde bg-white/[0.03] px-3.5 py-3 text-sm text-tinta-suave">
        {acceso.estado === 'fallida' ? 'Lo estamos revisando. ' : 'Lo estamos preparando. '}
        {pagoPendiente ? 'Primero confirmamos tu pago; ' : ''}te avisamos por correo cuando esté
        listo.
      </p>
    );
  } else if (!secreto) {
    cuerpo = acceso.instrucciones ? (
      <Instrucciones texto={acceso.instrucciones} titulo={tituloPasos} />
    ) : null;
  } else if (fase === 'visto' && revelado) {
    const vistaEn = larga.format(new Date(revelado.vistaEn));
    cuerpo = (
      <>
        {revelado.instrucciones && (
          <Instrucciones texto={revelado.instrucciones} titulo={tituloPasos} />
        )}
        {revelado.codigo && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[0.875rem] border border-dashed border-cian bg-cian/[0.06] px-3.5 py-3">
            <b className="font-mono text-[1.1875rem] tracking-[0.08em] break-all select-all">
              {revelado.codigo}
            </b>
            <BotonCopiar texto={revelado.codigo} etiqueta="el código" />
          </div>
        )}
        {revelado.enlace && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[0.875rem] border border-dashed border-cian bg-cian/[0.06] px-3.5 py-3">
            <a
              href={revelado.enlace}
              target="_blank"
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-cian hover:underline"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              Abrir el enlace de activación
            </a>
            <BotonCopiar texto={revelado.enlace} etiqueta="el enlace" />
          </div>
        )}
        <p className="text-[0.8rem] text-tinta-tenue">
          Visto por primera vez el {visto ?? vistaEn}.
          {deRevendedor ? '' : ' Es solo para ti: no lo compartas.'}
        </p>
      </>
    );
  } else if (fase === 'confirmar') {
    cuerpo = (
      <div
        role="group"
        aria-label={`¿Mostrar el ${que}?`}
        className="grid gap-2.5 rounded-2xl border border-aviso/40 bg-aviso/[0.06] p-3.5"
      >
        {deRevendedor ? (
          <p className="text-[0.84rem]">
            <b>Entrégaselo solo a {cliente}.</b> Si otra persona lo usa, tu cliente pierde el
            servicio.
          </p>
        ) : (
          <p className="text-[0.84rem]">
            <b>Este {que} es solo para ti.</b> Úsalo en tu propia cuenta y no lo compartas: es
            personal y solo sirve para activar tu servicio. Asegúrate de que nadie más vea tu
            pantalla.
          </p>
        )}
        <p className="text-xs text-tinta-tenue">Queda registrado cada vez que se muestra.</p>
        {error && <MensajeError error={error} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Boton autoFocus cargando={cargando} onClick={() => void mostrar()}>
            Mostrar {que}
          </Boton>
          <button
            type="button"
            className={claseEnlace}
            disabled={cargando}
            onClick={() => {
              setError(null);
              setFase('cerrado');
            }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  } else {
    cuerpo = (
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton
          variante={visto ? 'secundario' : 'primario'}
          icono={<Eye className="size-4" aria-hidden="true" />}
          onClick={() => setFase('confirmar')}
        >
          Mostrar {que}
        </Boton>
        <span className="text-[0.8rem] text-tinta-tenue">
          {visto ? `Lo viste el ${visto}` : 'Aún no lo has visto'}
        </span>
      </div>
    );
  }

  return (
    <article
      id={`acceso-${acceso.id}`}
      aria-labelledby={titulo}
      className={clsx(
        'grid min-w-0 scroll-mt-24 gap-3 rounded-[1.375rem] border border-borde bg-[rgb(10_14_32/0.6)] p-4',
        'target:border-cian target:shadow-[0_0_0_3px_rgb(34_211_238/0.2)]',
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <MiniaturaServicio
          slug={acceso.servicioSlug}
          categoria={acceso.categoria}
          nombre={acceso.servicio}
          className="size-[2.875rem]"
        />
        <div className="grid min-w-0 gap-0.5">
          <small className="truncate text-xs text-tinta-suave">{detalle}</small>
          <h2 id={titulo} className="text-[1.0625rem] leading-tight text-balance">
            {acceso.servicio} · {acceso.plan}
          </h2>
        </div>
        <span className="col-start-2 -mt-1 sm:col-start-auto sm:mt-0 sm:self-start">
          <PildoraEstado texto={ESTADO_ACCESO[acceso.estado].texto} tono={TONO[acceso.estado]} />
        </span>
      </div>
      {cuerpo}
    </article>
  );
}
