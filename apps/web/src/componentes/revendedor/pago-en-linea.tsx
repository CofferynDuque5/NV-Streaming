'use client';

import type { IntentoPagoPublico, MetodoEnLineaRevendedor } from '@nv/shared';
import { LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';
import { usd } from './panel';

/**
 * Renovar pagando en línea, como en las compras de los clientes: Binance Pay y
 * PayPal se confirman solos; si algo no cuadra, el equipo lo revisa. Al
 * confirmarse, el pago entra al saldo y los servicios se renuevan solos.
 */
export function PagarRenovacionEnLinea({
  ids,
  cantidad,
  totalUsd,
  metodos,
}: {
  ids: string[];
  cantidad: number;
  totalUsd: string;
  metodos: MetodoEnLineaRevendedor[];
}) {
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function pagar(metodoCobroId: string) {
    setCargando(metodoCobroId);
    setError(null);
    const r = await llamarApi<IntentoPagoPublico>(
      'POST',
      '/revendedor/renovaciones/pago-en-linea',
      {
        suscripcionIds: ids,
        metodoCobroId,
      },
    );
    if (!r.ok) {
      setCargando(null);
      return setError(r.error);
    }
    if (!r.datos.urlPago) {
      setCargando(null);
      return setError({
        estado: 0,
        codigo: 'SIN_URL',
        mensaje: 'La pasarela no devolvió un enlace de pago. Inténtalo de nuevo en unos minutos.',
      });
    }
    window.location.assign(r.datos.urlPago);
  }

  if (metodos.length === 0) return null;
  const servicios = cantidad === 1 ? '1 servicio' : `${cantidad} servicios`;
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Pagar en línea"
        descripcion={`Renueva ${servicios} por ${usd(totalUsd)}. Se confirma solo y se renuevan al momento.`}
      />
      <div className="grid gap-3 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {metodos.map((m) => (
            <Boton
              key={m.metodoCobroId}
              icono={<LockKeyhole className="size-4" aria-hidden="true" />}
              cargando={cargando === m.metodoCobroId}
              disabled={cargando !== null && cargando !== m.metodoCobroId}
              onClick={() => void pagar(m.metodoCobroId)}
            >
              Pagar con {m.nombre || nombrePasarela(m.pasarela)}
            </Boton>
          ))}
        </div>
        {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
        <p className="text-xs text-tinta-tenue">
          Con Pago Móvil, transferencia u otro método manual, usa la recarga de abajo: el equipo la
          revisa y se renuevan al confirmarla.
        </p>
      </div>
    </Tarjeta>
  );
}
