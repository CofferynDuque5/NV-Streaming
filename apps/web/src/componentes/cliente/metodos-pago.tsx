'use client';

import type { MetodoAutorizadoPublico, SuscripcionPublica } from '@nv/shared';
import { Ban } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { AreaTexto } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { formatearFecha } from '@/lib/formato';

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
 * Cobro automático de una suscripción: elegir un método autorizado activo de la
 * misma moneda o apagarlo. Explica cuándo se cobra.
 */
export function CobroAutomatico({
  s,
  metodos,
}: {
  s: SuscripcionPublica;
  metodos: MetodoAutorizadoPublico[];
}) {
  const router = useRouter();
  const id = useId();
  const actual = s.cobroAutomatico ?? null;
  const [eleccion, setEleccion] = useState(actual?.metodoId ?? '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const aptos = metodos.filter((m) => m.estado === 'activo' && m.moneda === s.moneda);

  async function guardar(metodoAutorizadoId: string | null) {
    setCargando(true);
    setError(null);
    setGuardado(null);
    const r = await llamarApi('PUT', `/mi/suscripciones/${s.id}/cobro-automatico`, {
      metodoAutorizadoId,
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setGuardado(
      metodoAutorizadoId
        ? 'Cobro automático activado.'
        : 'Cobro automático desactivado. Te enviaremos la factura para pagarla a mano.',
    );
    router.refresh();
  }

  const cuando = s.venceEn
    ? `el ${formatearFecha(s.venceEn)}, día del vencimiento`
    : 'el día del vencimiento';

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="grid gap-2.5 rounded-xl border border-borde bg-hundida/60 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={`${id}-titulo`} className="text-sm font-medium">
          Cobro automático
        </h4>
        <span className={actual ? 'text-xs font-medium text-exito' : 'text-xs text-tinta-tenue'}>
          {actual ? `Activo · ${actual.descripcion}` : 'Desactivado'}
        </span>
      </div>
      {aptos.length === 0 && !actual ? (
        <p className="text-xs text-tinta-suave">
          Para activarlo, paga una factura en línea en {s.moneda} y marca «Guardar este método para
          cobros automáticos».
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-0 flex-1 basis-48 gap-1">
              <label htmlFor={`${id}-metodo`} className="text-xs text-tinta-suave">
                Método para cobrar la renovación
              </label>
              <select
                id={`${id}-metodo`}
                value={eleccion}
                onChange={(e) => setEleccion(e.target.value)}
                className="h-9 w-full min-w-0 rounded-lg border border-borde-fuerte bg-superficie px-2.5 text-sm"
              >
                <option value="">Sin cobro automático (pago manual)</option>
                {aptos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.descripcion}
                  </option>
                ))}
              </select>
            </div>
            <Boton
              tamano="sm"
              variante="secundario"
              cargando={cargando}
              disabled={eleccion === (actual?.metodoId ?? '')}
              onClick={() => void guardar(eleccion || null)}
            >
              {!eleccion ? 'Desactivar' : actual ? 'Guardar' : 'Activar'}
            </Boton>
          </div>
          <p className="text-xs text-tinta-tenue">
            {actual || eleccion
              ? `Se cobra solo ${cuando}. Te avisamos antes de cobrar; si el cobro falla, lo reintentamos en los días siguientes y te escribimos. Puedes desactivarlo cuando quieras.`
              : 'Con el cobro automático no tienes que pagar a mano cada renovación: se cobra el día del vencimiento, con aviso previo.'}
          </p>
        </>
      )}
      {guardado && (
        <p role="status" className="text-xs text-exito">
          {guardado}
        </p>
      )}
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
    </section>
  );
}
