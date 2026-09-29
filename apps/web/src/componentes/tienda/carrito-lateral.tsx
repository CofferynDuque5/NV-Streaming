'use client';

import {
  type CotizacionPedido,
  etiquetaDuracion,
  formatearMonto,
  type Moneda,
  type PlanPublico,
  planMasBarato,
  type ServicioTienda,
} from '@nv/shared';
import clsx from 'clsx';
import { ChevronDown, Info, Plus, ShoppingCart, Trash2, Wallet, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { clasesBoton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import {
  EVENTO_ABRIR_CARRITO,
  MAX_CARRITO,
  RUTA_CARRITO,
  useCarrito,
  useRecienAgregado,
} from '@/lib/carrito';
import { precioTexto } from '@/lib/precios';
import { ArteServicio } from './arte';
import { useAgregarAlCarrito } from './boton-carrito';
import { Esqueleto, nombreOpcion, porPopularidad } from './carrito-comun';

interface Elegido {
  plan: PlanPublico;
  item: ServicioTienda;
}

/**
 * Carrito lateral de la tienda: se abre desde el carrito de la cabecera o de
 * la barra inferior. Guarda solo ids de planes; el subtotal y el precio de
 * cada plan salen de POST /mi/pedidos/cotizar. Sin sesión de cliente, muestra
 * el precio del catálogo solo como referencia. Cupón y forma de pago van en
 * la página del carrito (/carrito).
 */
export function CarritoLateral({
  servicios,
  moneda,
  cliente,
  abiertoInicial = false,
  foco = null,
}: {
  servicios: ServicioTienda[];
  moneda: Moneda;
  /** Hay sesión de cliente: se puede cotizar y mostrar el saldo. */
  cliente: boolean;
  /** Se cargó al pulsar el carrito: aparece ya abierto. */
  abiertoInicial?: boolean;
  /** Elemento que lo abrió (recibe el foco al cerrar). */
  foco?: HTMLElement | null;
}) {
  const carrito = useCarrito();
  const reciente = useRecienAgregado();
  const agregar = useAgregarAlCarrito();
  const notificar = useNotificar();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(abiertoInicial);
  // Al navegar a otra página, el carrito se cierra solo.
  const [rutaPrevia, setRutaPrevia] = useState(ruta);
  if (rutaPrevia !== ruta) {
    setRutaPrevia(ruta);
    setAbierto(false);
  }
  const panel = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const origen = useRef<HTMLElement | null>(foco);
  const idTitulo = useId();
  const [resultado, setResultado] = useState<{
    clave: string;
    cotizacion: CotizacionPedido | null;
    error: ErrorLlamada | null;
  } | null>(null);

  // Planes del catálogo por id (los que ya no se venden no se muestran).
  const porPlan = new Map<string, Elegido>();
  for (const item of servicios)
    for (const plan of item.planes) porPlan.set(plan.id, { plan, item });
  const elegidos = carrito.planes.flatMap((id) => {
    const e = porPlan.get(id);
    return e ? [e] : [];
  });
  const ids = elegidos.map((e) => e.plan.id);
  const clave = `${ids.join(',')}|${moneda}`;
  const libres = MAX_CARRITO - elegidos.length;

  const cerrar = () => setAbierto(false);
  useEffect(() => {
    const abrir = () => {
      if (panel.current) return;
      origen.current = document.activeElement as HTMLElement | null;
      setAbierto(true);
    };
    window.addEventListener(EVENTO_ABRIR_CARRITO, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_CARRITO, abrir);
  }, []);

  // Abierto: la página no se desplaza y el foco entra al carrito; al cerrar vuelve.
  useEffect(() => {
    if (!abierto) return;
    const raiz = document.documentElement;
    const antes = raiz.style.overflow;
    raiz.style.overflow = 'hidden';
    // Los avisos suben arriba para no tapar «Ir a pagar».
    raiz.dataset.carritoAbierto = '';
    titulo.current?.focus();
    return () => {
      raiz.style.overflow = antes;
      delete raiz.dataset.carritoAbierto;
      origen.current?.focus?.();
    };
  }, [abierto]);

  // Escape cierra; Tab recorre el carrito y los avisos (para llegar a «Deshacer»).
  useEffect(() => {
    if (!abierto) return;
    function teclado(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        cerrar();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const selector = 'a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])';
      const focos = [
        ...panel.current.querySelectorAll<HTMLElement>(selector),
        ...document.querySelectorAll<HTMLElement>(`[data-avisos] :is(${selector})`),
      ];
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (!primero || !ultimo) return;
      const dentro = focos.includes(document.activeElement as HTMLElement);
      if (!dentro) {
        e.preventDefault();
        primero.focus();
      } else if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener('keydown', teclado);
    return () => document.removeEventListener('keydown', teclado);
  }, [abierto]);

  // Cotiza en la API cada vez que cambian los planes o la moneda (solo clientes).
  useEffect(() => {
    if (!abierto || !cliente || ids.length === 0) return;
    let vigente = true;
    void llamarApi<CotizacionPedido>('POST', '/mi/pedidos/cotizar', {
      planes: ids,
      moneda,
      cupon: '',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume planes y moneda.
  }, [abierto, clave, cliente]);

  const actual = resultado?.clave === clave ? resultado : null;
  const cotizacion = actual?.cotizacion ?? null;
  const cotizando = cliente && ids.length > 0 && !actual;
  // Sin cotización (visitante o un error): precio de catálogo.
  const referencia = !cotizando && !cotizacion;

  function quitar(e: Elegido) {
    const indice = carrito.planes.indexOf(e.plan.id);
    carrito.quitar(e.plan.id);
    titulo.current?.focus();
    notificar(`Quitaste ${e.item.servicio.nombre} del carrito.`, 'info', {
      texto: 'Deshacer',
      alPulsar: () => {
        carrito.insertar(e.plan.id, indice);
        notificar('Listo, volvió a tu carrito.', 'exito');
      },
    });
  }

  function cambiarPlan(e: Elegido, nuevo: string) {
    if (!carrito.cambiar(e.plan.id, nuevo)) notificar('Ese plan ya está en tu carrito.', 'error');
  }

  const enCarrito = new Set(elegidos.map((e) => e.item.servicio.id));
  const populares = porPopularidad(servicios).filter((s) => !enCarrito.has(s.servicio.id));
  const sugerencias = populares.slice(0, 2).flatMap((s) => {
    const plan = planMasBarato(s.planes, moneda);
    return plan ? [{ item: s, plan }] : [];
  });
  const precioLinea = (id: string) => cotizacion?.lineas.find((l) => l.planId === id);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm aparecer"
        aria-hidden="true"
        onClick={cerrar}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="absolute inset-y-0 right-0 flex w-full max-w-[26.5rem] flex-col border-l border-borde bg-[linear-gradient(180deg,#0b1030,#060818)] shadow-nv aparecer"
      >
        <header className="flex items-center justify-between gap-3 border-b border-borde px-4 py-3.5">
          <div className="grid">
            <h2
              ref={titulo}
              id={idTitulo}
              tabIndex={-1}
              className="font-titulo text-lg font-bold outline-none"
            >
              Tu carrito
            </h2>
            <span className="text-xs text-tinta-suave" aria-live="polite">
              {elegidos.length} de {MAX_CARRITO} planes
            </span>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="grid size-10 place-items-center rounded-xl border border-borde hover:border-borde-fuerte"
            aria-label="Cerrar carrito"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        {elegidos.length === 0 ? (
          <div className="grid flex-1 content-center justify-items-center gap-3 overflow-y-auto px-6 py-10 text-center">
            <span
              className="orbe orbe-xl"
              style={{ '--c': '#4f8dff' } as CSSProperties}
              aria-hidden="true"
            >
              <ShoppingCart />
            </span>
            <b className="mt-2 font-titulo text-lg">Tu carrito está vacío</b>
            <p className="max-w-xs text-sm text-tinta-suave">
              Agrega hasta {MAX_CARRITO} planes y págalos juntos en un solo pedido.
            </p>
            <Link
              href="/catalogo"
              onClick={cerrar}
              className={clasesBoton('primario', 'md', 'mt-1')}
            >
              Ver catálogo
            </Link>
            {populares.length > 0 && (
              <div className="mt-4 grid justify-items-center gap-2">
                <span className="text-[0.7rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase">
                  Lo más pedido
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  {populares.slice(0, 3).flatMap((s) => {
                    const plan = planMasBarato(s.planes, moneda);
                    return plan
                      ? [
                          <button
                            key={s.servicio.id}
                            type="button"
                            className="chip"
                            onClick={() =>
                              agregar(plan.id, `${s.servicio.nombre} (${plan.nombre})`)
                            }
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Agregar </span>
                            {s.servicio.nombre}
                          </button>,
                        ]
                      : [];
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-[0.8rem] text-tinta-suave">
                  <span>Espacios del pedido</span>
                  <b className="text-tinta">
                    {libres === 0 ? 'Lleno' : libres === 1 ? 'Te queda 1' : `Te quedan ${libres}`}
                  </b>
                </div>
                <div className="grid grid-cols-5 gap-1.5" aria-hidden="true">
                  {Array.from({ length: MAX_CARRITO }, (_, i) => {
                    const e = elegidos[i];
                    return (
                      <span
                        key={i}
                        className={clsx(
                          'grid h-11 place-items-center overflow-hidden rounded-xl border-[1.5px]',
                          e
                            ? 'border-marca/60 bg-marca-suave'
                            : 'border-dashed border-borde-fuerte',
                        )}
                      >
                        {e && (
                          <ArteServicio
                            arte={e.item.arte}
                            nombre={e.item.servicio.nombre}
                            categoria={e.item.servicio.categoria}
                            color={e.item.color}
                            orbe="sm"
                            className="h-9 w-auto"
                          />
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              {libres === 0 && (
                <p
                  role="status"
                  className="flex items-center gap-2.5 rounded-2xl border border-aviso/40 bg-aviso-suave px-3 py-2.5 text-[0.8rem] text-aviso"
                >
                  <Zap className="size-4 shrink-0" aria-hidden="true" />
                  Tu carrito está lleno. Quita un plan para agregar otro.
                </p>
              )}

              <ul className="grid gap-2.5">
                {elegidos.map((e) => {
                  const nombre = e.item.servicio.nombre;
                  const linea = precioLinea(e.plan.id);
                  const nuevo = reciente === e.plan.id;
                  return (
                    <li
                      key={e.plan.id}
                      className={clsx(
                        'relative grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-[linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-2.5',
                        nuevo
                          ? 'border-cian/70 shadow-[0_0_26px_-10px_var(--nv-cian)]'
                          : 'border-borde',
                      )}
                    >
                      {nuevo && (
                        <span className="absolute -top-2.5 left-3 rounded-full bg-[linear-gradient(90deg,var(--nv-cian),#7dd3fc)] px-2 py-0.5 text-[0.62rem] font-bold tracking-wider text-[#04121a] uppercase">
                          Recién agregado
                        </span>
                      )}
                      <span
                        className="grid h-16 place-items-center rounded-xl"
                        style={{
                          background: `radial-gradient(60% 60% at 50% 55%, color-mix(in srgb, ${e.item.color} 45%, transparent), transparent 75%)`,
                        }}
                      >
                        <ArteServicio
                          arte={e.item.arte}
                          nombre={nombre}
                          categoria={e.item.servicio.categoria}
                          color={e.item.color}
                          orbe="md"
                          className="h-14 w-auto"
                        />
                      </span>
                      <div className="grid min-w-0 gap-1.5">
                        <b className="truncate text-sm" title={nombre}>
                          {nombre}
                        </b>
                        {e.item.planes.length > 1 ? (
                          <label className="relative inline-flex w-fit items-center">
                            <span className="sr-only">Plan de {nombre}</span>
                            <select
                              value={e.plan.id}
                              onChange={(ev) => cambiarPlan(e, ev.target.value)}
                              className="cursor-pointer appearance-none rounded-[0.6rem] border border-borde-fuerte bg-hundida py-1 pr-7 pl-2.5 text-[0.8rem] text-tinta"
                            >
                              {e.item.planes.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {nombreOpcion(p, e.item.planes)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              className="pointer-events-none absolute right-2 size-3.5 text-tinta-tenue"
                              aria-hidden="true"
                            />
                          </label>
                        ) : (
                          <span className="text-xs text-tinta-suave">
                            {nombreOpcion(e.plan, e.item.planes)}
                          </span>
                        )}
                      </div>
                      <div className="grid justify-items-end gap-1.5">
                        {cotizando ? (
                          <>
                            <Esqueleto />
                            <span className="sr-only">Calculando el precio</span>
                          </>
                        ) : linea ? (
                          <span className="grid justify-items-end">
                            <strong className="font-titulo text-[0.95rem] whitespace-nowrap tabular-nums">
                              {formatearMonto(linea.subtotal, moneda)}
                            </strong>
                            {moneda !== 'USD' && (
                              <small className="text-[0.7rem] text-tinta-tenue tabular-nums">
                                {formatearMonto(linea.totalUsd, 'USD')}
                              </small>
                            )}
                          </span>
                        ) : (
                          <strong className="font-titulo text-[0.95rem] whitespace-nowrap text-tinta-suave tabular-nums">
                            {precioTexto(e.plan, moneda) ?? 'Sin precio'}
                          </strong>
                        )}
                        <button
                          type="button"
                          onClick={() => quitar(e)}
                          className="grid size-8 place-items-center rounded-[0.6rem] border border-borde text-tinta-tenue hover:border-peligro/50 hover:text-peligro"
                          aria-label={`Quitar ${nombre} del carrito`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {libres > 0 && sugerencias.length > 0 && (
                <div className="grid gap-2">
                  <span className="text-[0.7rem] font-bold tracking-[0.14em] text-tinta-tenue uppercase">
                    Complétalo
                  </span>
                  {sugerencias.map(({ item, plan }) => (
                    <div
                      key={item.servicio.id}
                      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border border-dashed border-borde-fuerte px-2.5 py-2"
                    >
                      <ArteServicio
                        arte={item.arte}
                        nombre={item.servicio.nombre}
                        categoria={item.servicio.categoria}
                        color={item.color}
                        orbe="sm"
                        className="h-10 w-auto justify-self-center"
                      />
                      <div className="grid min-w-0">
                        <b className="truncate text-[0.82rem]">{item.servicio.nombre}</b>
                        <span className="text-xs text-tinta-suave">
                          {etiquetaDuracion(plan.duracionCantidad, plan.duracionUnidad)} ·{' '}
                          {precioTexto(plan, moneda)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => agregar(plan.id, `${item.servicio.nombre} (${plan.nombre})`)}
                        className="grid size-9 place-items-center rounded-[0.7rem] border border-borde-fuerte bg-white/[0.03] hover:border-cian"
                        aria-label={`Agregar ${item.servicio.nombre} al carrito`}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer className="grid gap-3 border-t border-borde px-4 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              {referencia ? (
                <p className="flex gap-2 text-[0.8rem] text-tinta-suave">
                  <Info className="mt-0.5 size-4 shrink-0 text-cian" aria-hidden="true" />
                  <span>
                    {actual?.error && actual.error.estado !== 401 ? `${actual.error.mensaje} ` : ''}
                    Son los precios del catálogo, como referencia. El total exacto se calcula al
                    pagar{cliente ? '' : ', cuando ingresas a tu cuenta'}.
                  </span>
                </p>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="grid text-sm text-tinta-suave">
                    Subtotal
                    <small className="text-[0.72rem] text-tinta-tenue">
                      Cupón y forma de pago, en el siguiente paso
                    </small>
                  </span>
                  <span className="grid justify-items-end">
                    {cotizacion ? (
                      <>
                        <b className="font-titulo text-2xl font-extrabold whitespace-nowrap tabular-nums">
                          {formatearMonto(cotizacion.subtotal, moneda)}
                        </b>
                        {moneda !== 'USD' && (
                          <small className="text-xs text-tinta-tenue tabular-nums">
                            {formatearMonto(cotizacion.totalUsd, 'USD')}
                          </small>
                        )}
                      </>
                    ) : (
                      <Esqueleto ancho="w-28" />
                    )}
                  </span>
                </div>
              )}
              {cotizacion && (
                <p className="flex items-center gap-2 text-[0.8rem] text-tinta-suave">
                  <Wallet className="size-4 shrink-0 text-violeta" aria-hidden="true" />
                  <span>
                    Tu saldo:{' '}
                    <b className="text-tinta tabular-nums">
                      {formatearMonto(cotizacion.saldoUsd, 'USD')}
                    </b>{' '}
                    ·{' '}
                    {Number(cotizacion.faltanteUsd) === 0 ? (
                      <span className="text-exito">te alcanza para pagarlo todo</span>
                    ) : (
                      <span className="text-aviso">
                        te faltan {formatearMonto(cotizacion.faltanteUsd, 'USD')}
                      </span>
                    )}
                  </span>
                </p>
              )}
              <Link
                href={`${RUTA_CARRITO}?moneda=${moneda}`}
                onClick={cerrar}
                className={clasesBoton('primario', 'lg', 'w-full')}
              >
                Ir a pagar
              </Link>
              <button
                type="button"
                onClick={cerrar}
                className="h-10 text-sm font-medium text-cian hover:underline"
              >
                Seguir comprando
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
