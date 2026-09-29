'use client';

import { Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { AreaTexto } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { Mensaje, MensajeError } from './pago';
import { claseArea, claseEnlace } from './piezas-cuenta';

/**
 * Revocar una autorización de cobro automático, con confirmación. Sirve al
 * cliente (/mi/…) y al equipo (/clientes/…): cambia solo la ruta.
 */
export function RevocarMetodo({
  ruta,
  descripcion,
  suscripciones,
  delEquipo,
}: {
  ruta: string;
  descripcion: string;
  suscripciones: number;
  delEquipo?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function revocar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '').trim();
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', ruta, motivo ? { motivo } : {});
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <Boton
        tamano="sm"
        variante="peligro"
        icono={<Ban className="size-3.5" aria-hidden="true" />}
        onClick={() => setAbierto(true)}
        aria-label={`Revocar ${descripcion}`}
      >
        Revocar
      </Boton>
    );
  }

  const campos = erroresPorCampo(error);
  return (
    <form
      onSubmit={revocar}
      className="grid w-full gap-3 rounded-xl border border-peligro/30 bg-peligro-suave p-4"
      aria-label={`Revocar ${descripcion}`}
    >
      <p className="text-sm">
        {delEquipo
          ? 'Se revoca la autorización del cliente: no se volverá a cobrar con este método.'
          : '¿Revocar esta autorización? No volveremos a cobrar con este método.'}{' '}
        {suscripciones > 0
          ? `${suscripciones === 1 ? 'La suscripción que lo usa pasa' : `Las ${suscripciones} suscripciones que lo usan pasan`} a pago manual: te enviaremos la factura de la renovación para que la pagues como prefieras.`
          : ''}
      </p>
      <AreaTexto
        etiqueta={delEquipo ? 'Motivo (queda registrado)' : 'Motivo (opcional)'}
        name="motivo"
        rows={2}
        maxLength={500}
        required={delEquipo}
        error={campos.motivo}
      />
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando}>
          Confirmar revocación
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={() => setAbierto(false)}>
          Volver
        </Boton>
      </div>
    </form>
  );
}

/**
 * «Revocar» en la cuenta del cliente: un enlace rojo que abre la confirmación
 * en el lugar, con motivo opcional.
 */
export function RevocarMetodoCliente({
  id,
  descripcion,
  suscripciones,
}: {
  id: string;
  descripcion: string;
  suscripciones: number;
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function revocar(e: FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const m = motivo.trim();
    const r = await llamarApi(
      'POST',
      `/mi/metodos-autorizados/${id}/revocar`,
      m ? { motivo: m } : {},
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setAbierto(false);
    notificar('Revocamos la autorización. No volveremos a cobrar con este método.');
    router.refresh();
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Revocar ${descripcion}`}
        className="justify-self-start text-sm font-semibold text-peligro hover:underline"
      >
        Revocar
      </button>
    );
  }

  const campos = erroresPorCampo(error);
  return (
    <form
      noValidate
      onSubmit={revocar}
      aria-label={`Revocar ${descripcion}`}
      className="grid gap-2.5 rounded-2xl border border-peligro/35 bg-peligro/[0.05] p-3.5"
    >
      <p className="text-[0.84rem] text-tinta-suave">
        {suscripciones > 0
          ? `Si lo revocas, ${suscripciones === 1 ? 'esa renovación se pagará' : 'esas renovaciones se pagarán'} a mano con factura.`
          : 'Si lo revocas, no se usará más.'}{' '}
        Puedes guardarlo otra vez cuando pagues en línea.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor={`motivo-${id}`} className="text-sm font-semibold">
          Motivo (opcional)
        </label>
        <textarea
          id={`motivo-${id}`}
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className={claseArea(campos.motivo ? 'mal' : '')}
        />
        {campos.motivo && <Mensaje id={`motivo-${id}-error`} estado="mal" texto={campos.motivo} />}
      </div>
      {error && !error.campos && <MensajeError error={error} />}
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando}>
          Revocar autorización
        </Boton>
        <button
          type="button"
          className={claseEnlace}
          disabled={cargando}
          onClick={() => setAbierto(false)}
        >
          Volver
        </button>
      </div>
    </form>
  );
}
