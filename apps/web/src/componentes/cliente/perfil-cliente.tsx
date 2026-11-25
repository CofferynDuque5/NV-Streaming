'use client';

import type { CodigoDelCliente, PerfilDelCliente, PerfilRevelado } from '@nv/shared';
import clsx from 'clsx';
import { ChevronDown, ExternalLink, EyeOff, MailSearch } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { BotonCopiar, MensajeError, PildoraEstado } from './pago';
import { claseEnlace, MiniaturaServicio } from './piezas-cuenta';

/** Segundos que los datos quedan a la vista antes de ocultarse solos. */
const SEGUNDOS_VISIBLES = 120;

/** Condiciones que ve el cliente al abrir sus datos de acceso. */
const CONDICIONES_SERVICIO = [
  'El servicio es válido únicamente para 1 dispositivo.',
  'Las descargas deben realizarse solo en un mismo dispositivo.',
  'No modificar perfiles, nombres ni configuraciones.',
  'No abrir la cuenta en más de un dispositivo.',
  'No compartir credenciales con terceros.',
  'El cliente debe reportar fallas de inmediato. Si no se informa a tiempo, no se repondrán días perdidos.',
  'No se realizan reembolsos ni cambios de suscripción, excepto en casos de falla técnica sin solución.',
  'El incumplimiento de las condiciones resultará en la suspensión inmediata del servicio sin derecho a reclamo.',
] as const;

/** Una fila de datos: etiqueta arriba, valor abajo y el botón de copiar a la derecha. */
function Dato({ etiqueta, valor, copiar }: { etiqueta: string; valor: string; copiar?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borde py-2.5 last:border-b-0">
      <div className="grid min-w-0 gap-0.5">
        <small className="text-xs text-tinta-tenue">{etiqueta}</small>
        <span className="text-[0.95rem] font-medium break-all select-all">{valor}</span>
      </div>
      {copiar && <BotonCopiar texto={valor} etiqueta={copiar} soloIcono />}
    </div>
  );
}

const TEXTO_ENLACE = {
  hogar: 'Sí, fui yo: actualizar el Hogar',
  verificar: 'Abrir el enlace de verificación',
  acceso: 'Abrir el enlace de acceso',
} as const;

/** El último código o enlace que llegó al correo de la cuenta (Netflix, Disney+…). */
function PedirCodigo({ suscripcionId, ruta }: { suscripcionId: string; ruta: string }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [resultado, setResultado] = useState<{ codigo: CodigoDelCliente | null } | null>(null);

  async function pedir() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<{ codigo: CodigoDelCliente | null }>(
      'POST',
      `${ruta}/${suscripcionId}/codigo`,
      {},
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setResultado(r.datos);
  }

  const c = resultado?.codigo;
  return (
    <div className="grid gap-2.5">
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
        <span className="text-xs text-tinta-tenue">
          Pídelo primero en la app («Enviar código» o «Actualizar Hogar»).
        </span>
      </div>
      {error && <MensajeError error={error} />}
      <div aria-live="polite">
        {resultado &&
          (c ? (
            <div className="grid gap-2">
              {c.codigo && (
                <div className="flex items-center justify-between gap-3 rounded-[0.875rem] bg-cian/[0.07] px-3.5 py-3">
                  <b className="font-mono text-[1.375rem] tracking-[0.18em] break-all select-all">
                    {c.codigo}
                  </b>
                  <BotonCopiar texto={c.codigo} etiqueta="el código" soloIcono />
                </div>
              )}
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
 * Perfil de una cuenta compartida en «Mis accesos»: una fila plegable con el
 * logo del servicio. Al abrirla se confirma que los datos son personales; se
 * piden, quedan registrados y se ocultan solos a los dos minutos.
 */
export function TarjetaPerfilCliente({
  perfil,
  detalle,
  ruta = '/mi/perfiles',
}: {
  perfil: PerfilDelCliente;
  /** «Perfil 2 · vence el 3 de noviembre». */
  detalle: string;
  /** El revendedor ve los perfiles de sus clientes en «/revendedor/perfiles». */
  ruta?: string;
}) {
  const titulo = useId();
  const cuerpoId = useId();
  const [fase, setFase] = useState<'cerrado' | 'confirmar' | 'visto'>('cerrado');
  const [datos, setDatos] = useState<PerfilRevelado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const completa = perfil.modo === 'completa';
  const que = completa ? 'los datos de tu cuenta' : 'los datos de tu perfil';
  const abierto = fase !== 'cerrado';

  useEffect(() => {
    if (fase !== 'visto') return;
    const t = setTimeout(() => {
      setDatos(null);
      setFase('cerrado');
    }, SEGUNDOS_VISIBLES * 1000);
    return () => clearTimeout(t);
  }, [fase]);

  function cerrar() {
    setDatos(null);
    setError(null);
    setFase('cerrado');
  }

  async function mostrar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<PerfilRevelado>(
      'POST',
      `${ruta}/${perfil.suscripcionId}/revelar`,
      {},
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setDatos(r.datos);
    setFase('visto');
  }

  const miniatura = (
    <MiniaturaServicio
      slug={perfil.servicioSlug ?? ''}
      categoria={perfil.categoria ?? null}
      nombre={perfil.servicio.nombre}
      imagen={perfil.servicioImagen ?? null}
      className="size-10"
    />
  );
  const textos = (
    <div className="grid min-w-0 gap-0.5 text-left">
      <h2 id={titulo} className="truncate text-[0.98rem] leading-tight font-semibold">
        {perfil.servicio.nombre} · {perfil.plan.nombre}
      </h2>
      <small className="flex min-w-0 items-center gap-1.5 text-[0.8rem] text-tinta-tenue">
        {perfil.disponible && (
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-exito" />
        )}
        <span className="truncate">{detalle}</span>
      </small>
    </div>
  );

  let cuerpo = null;
  if (!perfil.disponible) {
    cuerpo = (
      <p className="text-sm text-tinta-suave">
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
        <div className="grid">
          <Dato
            etiqueta={datos.miembro ? 'Tu correo (miembro del plan)' : 'Correo o usuario'}
            valor={datos.usuario}
            copiar="el usuario"
          />
          {datos.clave && datos.tipo !== 'correo' && (
            <Dato
              etiqueta={datos.miembro ? 'Tu clave' : 'Clave'}
              valor={datos.clave}
              copiar="la clave"
            />
          )}
          {!completa && datos.tipo === 'perfiles' && (
            <Dato etiqueta={datos.pin ? 'Perfil' : 'Perfil (sin PIN)'} valor={datos.perfil} />
          )}
          {datos.pin && <Dato etiqueta="PIN del perfil" valor={datos.pin} copiar="el PIN" />}
        </div>
        {datos.miembro && (
          <p className="text-[0.84rem] text-tinta-suave">
            Entras con tu propio correo: acepta la invitación al plan familiar que llega ahí.
          </p>
        )}
        {datos.tipo === 'correo' && (
          <p className="text-[0.84rem] text-tinta-suave">
            Al entrar te piden un código que llega al correo: pídelo aquí abajo o escríbenos.
          </p>
        )}
        <p className="text-xs text-tinta-tenue">
          {completa
            ? 'No cambies la clave ni el correo de la cuenta.'
            : 'Usa solo tu perfil y no cambies la clave, el correo ni los otros perfiles.'}{' '}
          Se ocultan solos en dos minutos.
        </p>
        {datos.contrato && (
          <details className="min-w-0">
            <summary className="cursor-pointer list-none text-[0.84rem] text-tinta-suave underline underline-offset-4 hover:text-tinta [&::-webkit-details-marker]:hidden">
              Ver mi contrato
            </summary>
            <div className="mt-2.5 grid gap-2 rounded-[0.875rem] border border-borde bg-white/[0.03] px-3.5 py-3">
              <pre className="max-h-80 overflow-auto font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap text-tinta-suave">
                {datos.contrato}
              </pre>
              <div className="justify-self-start">
                <BotonCopiar texto={datos.contrato} etiqueta="el contrato" />
              </div>
            </div>
          </details>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <details className="group min-w-0 flex-1">
            <summary className="cursor-pointer list-none text-[0.84rem] text-tinta-suave underline underline-offset-4 hover:text-tinta [&::-webkit-details-marker]:hidden">
              Condiciones del Servicio
            </summary>
            <div className="mt-2.5 grid gap-2.5 rounded-[0.875rem] border border-borde bg-white/[0.03] px-3.5 py-3 text-[0.8rem] leading-relaxed text-tinta-suave">
              <ul className="grid list-disc gap-1 pl-4">
                {CONDICIONES_SERVICIO.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-tinta">
                  ATENCIÓN AL CLIENTE
                </h3>
                <p>Horario: 11:00 AM a 11:30 PM.</p>
              </div>
              <p className="font-medium text-tinta">
                Al recibir el servicio, el cliente acepta todas las condiciones.
              </p>
            </div>
          </details>
          <Boton
            tamano="sm"
            variante="fantasma"
            icono={<EyeOff className="size-3.5" aria-hidden="true" />}
            onClick={cerrar}
          >
            Ocultar
          </Boton>
        </div>
      </>
    );
  } else if (fase === 'confirmar') {
    cuerpo = (
      <div role="group" aria-label={`¿Mostrar ${que}?`} className="grid gap-2.5">
        <p className="text-[0.84rem] text-tinta-suave">
          <b className="text-tinta">Estos datos son solo para ti.</b> No los compartas: si otra
          persona entra, la cuenta se puede caer para todos. Queda registrado cada vez que se
          muestran.
        </p>
        {error && <MensajeError error={error} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Boton autoFocus tamano="sm" cargando={cargando} onClick={() => void mostrar()}>
            Mostrar {completa || perfil.tipo !== 'perfiles' ? 'correo y clave' : 'mis datos'}
          </Boton>
          <button type="button" className={claseEnlace} disabled={cargando} onClick={cerrar}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <article
      aria-labelledby={titulo}
      className={clsx(
        'grid min-w-0 overflow-hidden rounded-[1.125rem] border bg-[rgb(10_14_32/0.6)] transition-colors',
        abierto ? 'border-borde-fuerte' : 'border-borde',
      )}
    >
      {perfil.disponible ? (
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={cuerpoId}
          onClick={() => (abierto ? cerrar() : setFase('confirmar'))}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco"
        >
          {miniatura}
          {textos}
          <ChevronDown
            aria-hidden="true"
            className={clsx(
              'size-4.5 text-tinta-tenue transition-transform',
              abierto && 'rotate-180',
            )}
          />
        </button>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3">
          {miniatura}
          {textos}
          <PildoraEstado texto="En espera" tono="cian" />
        </div>
      )}
      {(abierto || !perfil.disponible) && (
        <div id={cuerpoId} className="grid gap-3 border-t border-borde px-3.5 pt-1 pb-3.5">
          <div className="grid gap-3 pt-2.5">{cuerpo}</div>
          {perfil.disponible && perfil.pideCodigos && (
            <div className="border-t border-borde pt-3">
              <PedirCodigo suscripcionId={perfil.suscripcionId} ruta={ruta} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
