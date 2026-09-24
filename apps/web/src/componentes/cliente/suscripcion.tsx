'use client';

import type { SuscripcionPublica } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { AreaTexto } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

const RENOVABLES = new Set(['activa', 'en_gracia', 'suspendida', 'vencida']);

/** Acciones que el cliente puede hacer sobre su suscripción. */
export function AccionesSuscripcion({ s }: { s: SuscripcionPublica }) {
  const router = useRouter();
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const puedeRenovar =
    s.plan.renovable && RENOVABLES.has(s.estado) && !s.facturaAbierta && !s.cancelarAlVencer;
  const puedeCancelar = !s.cancelarAlVencer && !['cancelada', 'vencida'].includes(s.estado);

  async function ejecutar(accion: string, ruta: string, cuerpo: unknown = {}) {
    setCargando(accion);
    setError(null);
    const r = await llamarApi<{ factura?: { id: string } }>('POST', ruta, cuerpo);
    setCargando(null);
    if (!r.ok) return setError(r.error);
    if (accion === 'renovar' && r.datos.factura) {
      router.push(`/cuenta/facturas/${r.datos.factura.id}`);
      return;
    }
    setCancelando(false);
    router.refresh();
  }

  function cancelar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get('motivo') ?? '');
    void ejecutar('cancelar', `/mi/suscripciones/${s.id}/cancelar`, { motivo });
  }

  const campos = erroresPorCampo(error);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {s.facturaAbierta && (
          <BotonEnlace href={`/cuenta/facturas/${s.facturaAbierta.id}`} tamano="sm">
            Pagar factura {s.facturaAbierta.numero}
          </BotonEnlace>
        )}
        {puedeRenovar && (
          <Boton
            tamano="sm"
            variante={s.estado === 'activa' ? 'secundario' : 'primario'}
            cargando={cargando === 'renovar'}
            onClick={() => void ejecutar('renovar', `/mi/suscripciones/${s.id}/renovar`)}
          >
            Renovar ahora
          </Boton>
        )}
        {s.cancelarAlVencer && s.estado !== 'cancelada' && (
          <Boton
            tamano="sm"
            variante="secundario"
            cargando={cargando === 'revertir'}
            onClick={() =>
              void ejecutar('revertir', `/mi/suscripciones/${s.id}/revertir-cancelacion`)
            }
          >
            Mantener mi suscripción
          </Boton>
        )}
        {puedeCancelar && !cancelando && (
          <Boton tamano="sm" variante="fantasma" onClick={() => setCancelando(true)}>
            {s.estado === 'pendiente_pago' ? 'Cancelar solicitud' : 'Cancelar suscripción'}
          </Boton>
        )}
      </div>

      {cancelando && (
        <form
          onSubmit={cancelar}
          className="grid gap-3 rounded-xl border border-borde bg-hundida p-4"
        >
          <p className="text-sm text-tinta-suave">
            {s.estado === 'pendiente_pago'
              ? 'La solicitud se cancela ahora y la factura pendiente queda anulada.'
              : 'Seguirás teniendo el servicio hasta la fecha de vencimiento y no se generarán más facturas. Puedes revertirlo antes de esa fecha.'}
          </p>
          <AreaTexto
            etiqueta="¿Por qué quieres cancelar?"
            name="motivo"
            rows={2}
            required
            minLength={3}
            maxLength={500}
            error={campos.motivo}
          />
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando === 'cancelar'}>
              Confirmar cancelación
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => setCancelando(false)}>
              Volver
            </Boton>
          </div>
        </form>
      )}

      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
    </div>
  );
}
