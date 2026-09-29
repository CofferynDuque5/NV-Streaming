'use client';

import { formatearMonto, type PedidoPublico } from '@nv/shared';
import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Boton, clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';

/**
 * Acciones de un pedido que espera pago: pagar lo que falta con el saldo (si
 * alcanza) o recargar, y cancelarlo con confirmación. Un solo botón principal.
 */
export function AccionesPedido({ pedido, saldoUsd }: { pedido: PedidoPublico; saldoUsd: string }) {
  const router = useRouter();
  const notificar = useNotificar();
  const [cargando, setCargando] = useState<'pagar' | 'cancelar' | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const alcanza = Number(saldoUsd) >= Number(pedido.pendienteUsd);

  async function accion(tipo: 'pagar' | 'cancelar') {
    setCargando(tipo);
    setError(null);
    const r = await llamarApi('POST', `/mi/pedidos/${pedido.id}/${tipo}`);
    setCargando(null);
    setConfirmarCancelar(false);
    if (!r.ok) return setError(r.error);
    notificar(
      tipo === 'pagar'
        ? `Pagamos el pedido ${pedido.numero} con tu saldo.`
        : `Cancelamos el pedido ${pedido.numero}.`,
      'exito',
    );
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {alcanza ? (
        <Boton
          tamano="lg"
          className="w-full"
          cargando={cargando === 'pagar'}
          disabled={cargando !== null}
          onClick={() => void accion('pagar')}
        >
          {cargando === 'pagar'
            ? 'Pagando…'
            : `Pagar ${formatearMonto(pedido.pendienteUsd, 'USD')} con mi saldo`}
        </Boton>
      ) : (
        <Link
          href={`/cuenta/billetera?pedido=${pedido.id}`}
          className={clasesBoton('primario', 'lg', 'w-full')}
        >
          {pedido.pagarAlRecargar ? 'Reportar mi recarga' : 'Recargar y pagar'}
        </Link>
      )}
      <p className="text-center text-xs text-tinta-tenue">
        También puedes pagar cada factura por separado desde su página.
      </p>
      {confirmarCancelar ? (
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span>¿Seguro? Se anulan sus facturas.</span>
          <Boton
            variante="peligro"
            tamano="sm"
            cargando={cargando === 'cancelar'}
            onClick={() => void accion('cancelar')}
          >
            {cargando === 'cancelar' ? 'Cancelando…' : 'Sí, cancelar'}
          </Boton>
          <Boton
            variante="fantasma"
            tamano="sm"
            disabled={cargando !== null}
            onClick={() => setConfirmarCancelar(false)}
          >
            No
          </Boton>
        </div>
      ) : (
        <button
          type="button"
          disabled={cargando !== null}
          onClick={() => setConfirmarCancelar(true)}
          className="justify-self-start px-0.5 py-1 text-sm font-medium text-peligro hover:underline disabled:opacity-55"
        >
          Cancelar el pedido
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="flex gap-2 rounded-xl border border-peligro/30 bg-peligro-suave px-3.5 py-2.5 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-peligro" aria-hidden="true" />
          <span>
            {error.mensaje}
            {error.codigo === 'PEDIDO_NO_PENDIENTE' && ' Recarga la página para ver cómo quedó.'}
          </span>
        </p>
      )}
    </div>
  );
}
