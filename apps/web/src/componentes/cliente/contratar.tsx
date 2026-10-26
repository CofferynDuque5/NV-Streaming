'use client';

import { type Cotizacion, formatearMonto, type Moneda } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

/**
 * Contratación de un plan: el cliente puede probar un cupón (se cotiza en la
 * API, que es quien sabe si es válido) y al confirmar se emite la factura.
 */
export function Contratar({
  planId,
  moneda,
  precio,
  abierto,
}: {
  planId: string;
  moneda: Moneda;
  precio: string;
  abierto?: boolean;
}) {
  const router = useRouter();
  const [expandido, setExpandido] = useState(Boolean(abierto));
  const [cupon, setCupon] = useState('');
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState<'cotizar' | 'contratar' | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function probarCupon() {
    setCargando('cotizar');
    setError(null);
    const r = await llamarApi<Cotizacion>('POST', '/mi/cotizar', { planId, moneda, cupon });
    setCargando(null);
    if (r.ok) setCotizacion(r.datos);
    else {
      setCotizacion(null);
      setError(r.error);
    }
  }

  async function contratar(e: FormEvent) {
    e.preventDefault();
    setCargando('contratar');
    setError(null);
    const r = await llamarApi<{ factura: { id: string } }>('POST', '/mi/suscripciones', {
      planId,
      moneda,
      cupon: cotizacion?.cupon ?? '',
    });
    if (!r.ok) {
      setCargando(null);
      return setError(r.error);
    }
    router.push(`/cuenta/facturas/${r.datos.factura.id}`);
  }

  if (!expandido) {
    return (
      <Boton className="w-full" onClick={() => setExpandido(true)}>
        Contratar
      </Boton>
    );
  }

  const campos = erroresPorCampo(error);
  const total = cotizacion?.total ?? precio;

  return (
    <form onSubmit={contratar} className="grid gap-3">
      <div className="flex items-end gap-2">
        <Campo
          etiqueta="Cupón (opcional)"
          name="cupon"
          value={cupon}
          onChange={(e) => {
            setCupon(e.target.value.toUpperCase());
            setCotizacion(null);
          }}
          autoComplete="off"
          maxLength={40}
          error={campos.cupon}
          className="flex-1"
        />
        <Boton
          variante="secundario"
          disabled={cupon.trim().length < 3}
          cargando={cargando === 'cotizar'}
          onClick={() => void probarCupon()}
        >
          Aplicar
        </Boton>
      </div>
      {cotizacion?.cupon && Number(cotizacion.descuento) > 0 && (
        <p className="text-sm text-exito">
          Cupón {cotizacion.cupon} aplicado: ahorras {formatearMonto(cotizacion.descuento, moneda)}.
        </p>
      )}
      <div className="flex items-baseline justify-between border-t border-borde pt-3 text-sm">
        <span className="text-tinta-suave">Total a pagar</span>
        <span className="text-base font-semibold tabular-nums">
          {formatearMonto(total, moneda)}
        </span>
      </div>
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <Boton type="submit" cargando={cargando === 'contratar'} className="w-full">
        Confirmar y ver cómo pagar
      </Boton>
      <p className="text-xs text-tinta-tenue">
        Te emitimos una factura. El servicio se activa cuando confirmamos tu pago.
      </p>
    </form>
  );
}
