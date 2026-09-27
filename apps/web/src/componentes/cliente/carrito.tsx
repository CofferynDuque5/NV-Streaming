'use client';

import {
  type CotizacionPedido,
  type FormaPagoPedido,
  formatearMonto,
  type Moneda,
  type PedidoPublico,
  type PlanPublico,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, clasesBoton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { MAX_CARRITO, useCarrito } from '@/lib/carrito';

/** Botón para sumar un plan al carrito (o quitarlo si ya está). */
export function AgregarAlCarrito({
  planId,
  variante = 'secundario',
}: {
  planId: string;
  variante?: 'primario' | 'secundario';
}) {
  const carrito = useCarrito();
  if (carrito.tiene(planId)) {
    return (
      <Boton
        variante="fantasma"
        className="w-full"
        icono={<Check className="size-4 text-exito" />}
        onClick={() => carrito.quitar(planId)}
        aria-label="En el carrito. Pulsa para quitarlo."
      >
        En el carrito
      </Boton>
    );
  }
  return (
    <Boton
      variante={variante}
      className="w-full"
      icono={<ShoppingCart className="size-4" />}
      disabled={carrito.lleno}
      title={carrito.lleno ? `Caben hasta ${MAX_CARRITO} planes por pedido.` : undefined}
      onClick={() => carrito.agregar(planId)}
    >
      Agregar al carrito
    </Boton>
  );
}

/** Enlace al carrito con la cantidad de planes elegidos. */
export function EnlaceCarrito({ moneda, destino }: { moneda: Moneda; destino?: string }) {
  const { planes } = useCarrito();
  const href = destino ?? `/cuenta/carrito?moneda=${moneda}`;
  return (
    <Link
      href={href}
      className={clasesBoton(planes.length > 0 ? 'primario' : 'secundario', 'md')}
      aria-label={`Ver el carrito (${planes.length} ${planes.length === 1 ? 'plan' : 'planes'})`}
    >
      <ShoppingCart className="size-4" aria-hidden="true" />
      Carrito
      <span className="rounded-full bg-black/15 px-2 text-xs tabular-nums">{planes.length}</span>
    </Link>
  );
}

const FORMAS: { id: FormaPagoPedido; titulo: string; texto: string }[] = [
  {
    id: 'billetera',
    titulo: 'Pagar con mi saldo',
    texto: 'Se descuenta de tu billetera y los servicios se activan al instante.',
  },
  {
    id: 'recarga',
    titulo: 'Recargar y pagar',
    texto:
      'Reportas una recarga con tu comprobante y, cuando la confirmamos, pagamos el pedido con ese saldo.',
  },
  {
    id: 'facturas',
    titulo: 'Pagar cada factura aparte',
    texto: 'Te emitimos una factura por plan y las pagas por transferencia, pago móvil o en línea.',
  },
];

/**
 * Caja del carrito: cotiza todos los planes en la API (precios, cupón y
 * saldo), deja elegir cómo pagar y crea el pedido.
 */
export function CajaCarrito({
  moneda,
  planes,
  saldoUsd,
  pendiente,
}: {
  moneda: Moneda;
  /** Planes contratables del catálogo (para mostrar los que no se pudieron cotizar). */
  planes: PlanPublico[];
  saldoUsd: string;
  /** Pedido que aún espera pago: no se puede hacer otro hasta cerrarlo. */
  pendiente: PedidoPublico | null;
}) {
  const router = useRouter();
  const carrito = useCarrito();
  const [cupon, setCupon] = useState('');
  const [cuponAplicado, setCuponAplicado] = useState('');
  const [resultado, setResultado] = useState<{
    clave: string;
    cotizacion: CotizacionPedido | null;
    error: ErrorLlamada | null;
  } | null>(null);
  const [errorPedido, setErrorPedido] = useState<ErrorLlamada | null>(null);
  const [creando, setCreando] = useState(false);
  const [forma, setForma] = useState<FormaPagoPedido | null>(null);

  // Quita del carrito planes que ya no se venden.
  const vendibles = new Set(planes.map((p) => p.id));
  const elegidos = carrito.planes.filter((id) => vendibles.has(id));
  const clave = `${elegidos.join(',')}|${moneda}|${cuponAplicado}`;

  useEffect(() => {
    if (elegidos.length === 0) return;
    let vigente = true;
    void llamarApi<CotizacionPedido>('POST', '/mi/pedidos/cotizar', {
      planes: elegidos,
      moneda,
      cupon: cuponAplicado,
    }).then((r) => {
      if (!vigente) return;
      setResultado(
        r.ok
          ? { clave, cotizacion: r.datos, error: null }
          : { clave, cotizacion: null, error: r.error },
      );
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume planes, moneda y cupón.
  }, [clave]);

  const actual = resultado?.clave === clave ? resultado : null;
  const cotizando = elegidos.length > 0 && !actual;
  const cotizacion = actual?.cotizacion ?? null;
  const error = errorPedido ?? actual?.error ?? null;

  const alcanza = cotizacion ? Number(cotizacion.faltanteUsd) === 0 : false;
  const elegida: FormaPagoPedido = forma ?? (alcanza ? 'billetera' : 'recarga');

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!cotizacion) return;
    setCreando(true);
    setErrorPedido(null);
    const r = await llamarApi<PedidoPublico>('POST', '/mi/pedidos', {
      planes: elegidos,
      moneda,
      cupon: cotizacion.cupon ?? '',
      pago: elegida,
    });
    if (!r.ok) {
      setCreando(false);
      return setErrorPedido(r.error);
    }
    carrito.vaciar();
    router.push(
      elegida === 'recarga'
        ? `/cuenta/billetera?pedido=${r.datos.id}`
        : `/cuenta/carrito/${r.datos.id}`,
    );
  }

  if (pendiente) {
    return (
      <Alerta tono="aviso" titulo={`Tienes el pedido ${pendiente.numero} por pagar`}>
        Págalo o cancélalo antes de hacer otro pedido.{' '}
        <Link href={`/cuenta/carrito/${pendiente.id}`} className="font-medium underline">
          Ver el pedido
        </Link>
      </Alerta>
    );
  }

  if (elegidos.length === 0) {
    return (
      <div className="grid justify-items-start gap-3 px-5 py-6 sm:px-6">
        <p className="text-sm text-tinta-suave">
          Tu carrito está vacío. Agrega hasta {MAX_CARRITO} planes y págalos juntos.
        </p>
        <Link href={`/cuenta/planes?moneda=${moneda}`} className={clasesBoton('primario')}>
          Ver planes
        </Link>
      </div>
    );
  }

  const campos = erroresPorCampo(error);
  const nombres = new Map(planes.map((p) => [p.id, `${p.servicio.nombre} · ${p.nombre}`]));

  return (
    <form onSubmit={crear} className="grid gap-5 px-5 py-5 sm:px-6" aria-busy={cotizando}>
      <ul className="grid divide-y divide-borde rounded-xl border border-borde">
        {elegidos.map((id) => {
          const linea = cotizacion?.lineas.find((l) => l.planId === id);
          return (
            <li key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{nombres.get(id)}</span>
                {linea && Number(linea.descuento) > 0 && (
                  <span className="block text-xs text-exito">
                    Cupón: −{formatearMonto(linea.descuento, moneda)}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  {linea ? formatearMonto(linea.total, moneda) : '…'}
                </span>
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  aria-label={`Quitar ${nombres.get(id)}`}
                  onClick={() => carrito.quitar(id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Boton>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-end gap-2">
        <Campo
          etiqueta="Cupón (opcional)"
          name="cupon"
          value={cupon}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setCupon(v);
            // Al borrar el cupón se vuelve a cotizar sin él.
            if (!v.trim()) setCuponAplicado('');
          }}
          autoComplete="off"
          maxLength={40}
          error={campos.cupon}
          ayuda="Se aplica al plan en el que más ahorras. Bórralo para cotizar sin cupón."
          className="flex-1"
        />
        <Boton
          variante="secundario"
          disabled={cupon.trim().length < 3}
          cargando={cotizando && cupon === cuponAplicado}
          onClick={() => {
            setErrorPedido(null);
            setCuponAplicado(cupon.trim());
          }}
        >
          Aplicar
        </Boton>
      </div>

      {cotizacion && (
        <dl className="grid gap-2 border-t border-borde pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-tinta-suave">Subtotal</dt>
            <dd className="tabular-nums">{formatearMonto(cotizacion.subtotal, moneda)}</dd>
          </div>
          {Number(cotizacion.descuento) > 0 && (
            <div className="flex justify-between text-exito">
              <dt>Cupón {cotizacion.cupon}</dt>
              <dd className="tabular-nums">−{formatearMonto(cotizacion.descuento, moneda)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatearMonto(cotizacion.total, moneda)}</dd>
          </div>
          {moneda !== 'USD' && (
            <p className="text-xs text-tinta-tenue">
              Equivale a {formatearMonto(cotizacion.totalUsd, 'USD')} con la tasa de hoy.
            </p>
          )}
        </dl>
      )}

      {cotizacion && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">¿Cómo vas a pagar?</legend>
          <p className="text-sm text-tinta-suave">
            Saldo en tu billetera: {formatearMonto(saldoUsd, 'USD')}
            {!alcanza && ` · te faltan ${formatearMonto(cotizacion.faltanteUsd, 'USD')}`}
          </p>
          {FORMAS.map((f) => {
            const deshabilitada = f.id === 'billetera' && !alcanza;
            return (
              <label
                key={f.id}
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-xl border p-4 text-sm',
                  elegida === f.id ? 'border-marca bg-marca-suave/40' : 'border-borde',
                  deshabilitada && 'cursor-not-allowed opacity-55',
                )}
              >
                <input
                  type="radio"
                  name="pago"
                  value={f.id}
                  checked={elegida === f.id}
                  disabled={deshabilitada}
                  onChange={() => setForma(f.id)}
                  className="mt-0.5 size-4 accent-[var(--nv-marca)]"
                />
                <span>
                  <span className="block font-medium">{f.titulo}</span>
                  <span className="block text-tinta-suave">
                    {deshabilitada ? 'Tu saldo no alcanza para este pedido.' : f.texto}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      <Boton type="submit" cargando={creando} disabled={!cotizacion || cotizando} tamano="lg">
        {elegida === 'billetera'
          ? 'Pagar con mi saldo'
          : elegida === 'recarga'
            ? 'Hacer el pedido y recargar'
            : 'Hacer el pedido'}
      </Boton>
      <p className="text-xs text-tinta-tenue">
        Cada plan es un servicio aparte con su propia factura. Se activan cuando están pagados.
      </p>
    </form>
  );
}

/** Acciones de un pedido pendiente: pagar lo que falta con saldo o cancelarlo. */
export function AccionesPedido({ pedido, saldoUsd }: { pedido: PedidoPublico; saldoUsd: string }) {
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {alcanza ? (
          <Boton cargando={cargando === 'pagar'} onClick={() => void accion('pagar')}>
            Pagar {formatearMonto(pedido.pendienteUsd, 'USD')} con mi saldo
          </Boton>
        ) : (
          <Link href={`/cuenta/billetera?pedido=${pedido.id}`} className={clasesBoton('primario')}>
            Recargar y pagar
          </Link>
        )}
        {confirmarCancelar ? (
          <>
            <Boton
              variante="peligro"
              cargando={cargando === 'cancelar'}
              onClick={() => void accion('cancelar')}
            >
              Sí, cancelar el pedido
            </Boton>
            <Boton variante="fantasma" onClick={() => setConfirmarCancelar(false)}>
              No
            </Boton>
          </>
        ) : (
          <Boton variante="secundario" onClick={() => setConfirmarCancelar(true)}>
            Cancelar pedido
          </Boton>
        )}
      </div>
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
    </div>
  );
}

/** Pagar una factura con el saldo de la billetera. */
export function PagarConSaldo({
  facturaId,
  totalUsd,
  saldoUsd,
}: {
  facturaId: string;
  totalUsd: string;
  saldoUsd: string;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const alcanza = Number(saldoUsd) >= Number(totalUsd);

  async function pagar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/facturas/${facturaId}/pagar-con-saldo`);
    setCargando(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-tinta-suave">
        Tienes {formatearMonto(saldoUsd, 'USD')} en tu billetera. Esta factura equivale a{' '}
        {formatearMonto(totalUsd, 'USD')}.
      </p>
      {alcanza ? (
        <Boton className="justify-self-start" cargando={cargando} onClick={() => void pagar()}>
          Pagar con mi saldo
        </Boton>
      ) : (
        <Link
          href="/cuenta/billetera"
          className={clasesBoton('secundario', 'md', 'justify-self-start')}
        >
          Recargar mi billetera
        </Link>
      )}
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
    </div>
  );
}
