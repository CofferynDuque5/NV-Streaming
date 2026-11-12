'use client';

import type { CodigoDelCliente, PerfilDelCliente, PerfilRevelado } from '@nv/shared';
import { ExternalLink, Eye, EyeOff, MailSearch } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { BotonCopiar, MensajeError, PildoraEstado } from './pago';
import { claseEnlace } from './piezas-cuenta';

/** Segundos que los datos quedan a la vista antes de ocultarse solos. */
const SEGUNDOS_VISIBLES = 120;

function Dato({ etiqueta, valor, copiar }: { etiqueta: string; valor: string; copiar: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[0.875rem] border border-dashed border-cian bg-cian/[0.06] px-3.5 py-2.5">
      <div className="grid min-w-0 gap-0.5">
        <small className="text-xs text-tinta-suave">{etiqueta}</small>
        <b className="font-mono text-[1.0625rem] break-all select-all">{valor}</b>
      </div>
      <BotonCopiar texto={valor} etiqueta={copiar} />
    </div>
  );
}

const TEXTO_ENLACE = {
  hogar: 'Sí, fui yo: actualizar el Hogar',
  verificar: 'Abrir el enlace de verificación',
  acceso: 'Abrir el enlace de acceso',
} as const;

/** El último código o enlace que llegó al correo de la cuenta (Netflix, Disney+…). */
function PedirCodigo({ suscripcionId }: { suscripcionId: string }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [resultado, setResultado] = useState<{ codigo: CodigoDelCliente | null } | null>(null);

  async function pedir() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<{ codigo: CodigoDelCliente | null }>(
      'POST',
      `/mi/perfiles/${suscripcionId}/codigo`,
      {},
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setResultado(r.datos);
  }

  const c = resultado?.codigo;
  return (
    <div className="grid gap-2.5 border-t border-borde pt-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton
          variante="secundario"
          tamano="sm"
          cargando={cargando}
          icono={<MailSearch className="size-3.5" aria-hidden="true" />}
          onClick={() => void pedir()}
        >
          {resultado ? 'Buscar otra vez' : 'Ver mi código de acceso'}
        </Boton>
        <span className="text-[0.8rem] text-tinta-tenue">
          Pídelo primero en la app (por ejemplo «Enviar código» o «Actualizar Hogar»).
        </span>
      </div>
      {error && <MensajeError error={error} />}
      <div aria-live="polite">
        {resultado &&
          (c ? (
            <div className="grid gap-2">
              {c.codigo && <Dato etiqueta="Código" valor={c.codigo} copiar="el código" />}
              {c.enlace && (
                <a
                  href={c.enlace.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-2 justify-self-start rounded-[0.875rem] border border-cian bg-cian/[0.08] px-3.5 py-2 text-sm font-semibold hover:bg-cian/[0.14]"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {TEXTO_ENLACE[c.enlace.tipo]}
                </a>
              )}
              <p className="text-xs text-tinta-tenue">
                Llegó {new Date(c.recibidoEn).toLocaleTimeString('es-VE', { timeStyle: 'short' })}.
                Úsalo enseguida: los códigos vencen en pocos minutos.
              </p>
            </div>
          ) : (
            <p className="text-sm text-tinta-suave">
              No llegó ningún código en los últimos 30 minutos. Pídelo en la app, espera un minuto y
              vuelve a buscar.
            </p>
          ))}
      </div>
    </div>
  );
}

/**
 * Perfil de una cuenta compartida en «Mis accesos». Los datos se piden tras
 * confirmar, quedan registrados y se ocultan solos a los dos minutos.
 */
export function TarjetaPerfilCliente({
  perfil,
  detalle,
}: {
  perfil: PerfilDelCliente;
  /** «Perfil 2 · vence el 3 de noviembre». */
  detalle: string;
}) {
  const titulo = useId();
  const [fase, setFase] = useState<'cerrado' | 'confirmar' | 'visto'>('cerrado');
  const [datos, setDatos] = useState<PerfilRevelado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const completa = perfil.modo === 'completa';
  const que = completa ? 'los datos de tu cuenta' : 'los datos de tu perfil';

  useEffect(() => {
    if (fase !== 'visto') return;
    const t = setTimeout(() => {
      setDatos(null);
      setFase('cerrado');
    }, SEGUNDOS_VISIBLES * 1000);
    return () => clearTimeout(t);
  }, [fase]);

  async function mostrar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<PerfilRevelado>(
      'POST',
      `/mi/perfiles/${perfil.suscripcionId}/revelar`,
      {},
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setDatos(r.datos);
    setFase('visto');
  }

  let cuerpo;
  if (!perfil.disponible) {
    cuerpo = (
      <p className="rounded-[0.875rem] border border-borde bg-white/[0.03] px-3.5 py-3 text-sm text-tinta-suave">
        {perfil.estado === 'pendiente_pago'
          ? 'Los datos aparecen aquí cuando confirmemos tu pago.'
          : perfil.estado === 'activa' || perfil.estado === 'en_gracia'
            ? 'Estamos revisando esta cuenta. Te escribiremos con los datos nuevos.'
            : 'Los datos no se muestran mientras tu suscripción no esté al día.'}
      </p>
    );
  } else if (fase === 'visto' && datos) {
    cuerpo = (
      <>
        <div className="grid gap-2">
          <Dato etiqueta="Correo o usuario" valor={datos.usuario} copiar="el usuario" />
          <Dato etiqueta="Clave" valor={datos.clave} copiar="la clave" />
          {!completa && (
            <p className="px-1 text-sm text-tinta-suave">
              Entra en el perfil <b className="text-tinta">{datos.perfil}</b>
              {datos.pin ? '.' : ' (no tiene PIN).'}
            </p>
          )}
          {datos.pin && <Dato etiqueta="PIN del perfil" valor={datos.pin} copiar="el PIN" />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <p className="text-[0.8rem] text-tinta-tenue">
            {completa
              ? 'No cambies la clave ni el correo de la cuenta.'
              : 'Usa solo tu perfil y no cambies la clave, el correo ni los otros perfiles.'}{' '}
            Se ocultan solos en dos minutos.
          </p>
          <Boton
            tamano="sm"
            variante="fantasma"
            icono={<EyeOff className="size-3.5" aria-hidden="true" />}
            onClick={() => {
              setDatos(null);
              setFase('cerrado');
            }}
          >
            Ocultar
          </Boton>
        </div>
      </>
    );
  } else if (fase === 'confirmar') {
    cuerpo = (
      <div
        role="group"
        aria-label={`¿Mostrar ${que}?`}
        className="grid gap-2.5 rounded-2xl border border-aviso/40 bg-aviso/[0.06] p-3.5"
      >
        <p className="text-[0.84rem]">
          <b>Estos datos son solo para ti.</b> No los compartas ni los publiques: si otra persona
          entra, la cuenta se puede caer para todos. Asegúrate de que nadie más vea tu pantalla.
        </p>
        <p className="text-xs text-tinta-tenue">Queda registrado cada vez que se muestran.</p>
        {error && <MensajeError error={error} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Boton autoFocus cargando={cargando} onClick={() => void mostrar()}>
            Mostrar los datos
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
          variante="secundario"
          icono={<Eye className="size-4" aria-hidden="true" />}
          onClick={() => setFase('confirmar')}
        >
          Mostrar los datos
        </Boton>
        <span className="text-[0.8rem] text-tinta-tenue">
          {completa ? 'Correo y clave de tu cuenta' : 'Correo, clave y PIN de tu perfil'}
        </span>
      </div>
    );
  }

  return (
    <article
      aria-labelledby={titulo}
      className="grid min-w-0 gap-3 rounded-[1.375rem] border border-borde bg-[rgb(10_14_32/0.6)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <small className="truncate text-xs text-tinta-suave">{detalle}</small>
          <h2 id={titulo} className="text-[1.0625rem] leading-tight text-balance">
            {perfil.servicio.nombre} · {perfil.plan.nombre}
          </h2>
        </div>
        <PildoraEstado
          texto={perfil.disponible ? (completa ? 'Cuenta' : 'Perfil') : 'En espera'}
          tono={perfil.disponible ? 'exito' : 'cian'}
        />
      </div>
      {cuerpo}
      {perfil.disponible && perfil.pideCodigos && (
        <PedirCodigo suscripcionId={perfil.suscripcionId} />
      )}
    </article>
  );
}
