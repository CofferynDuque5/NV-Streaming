'use client';

import {
  type CotizacionPedido,
  type FormaPagoPedido,
  formatearMonto,
  INFO_CATEGORIA,
  MENSAJE_CUPON,
  type Moneda,
  PATRON_CUPON,
  type PedidoPublico,
  type PlanPublico,
  planMasBarato,
  type ServicioTienda,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  CircleAlert,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Boton, clasesBoton } from '@/componentes/ui/boton';
import { clasesEntrada } from '@/componentes/ui/clases';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import {
  ID_TITULO_CARRITO,
  MAX_CARRITO,
  RUTA_CARRITO,
  useCarrito,
  useCarritoListo,
} from '@/lib/carrito';
import { precioTexto } from '@/lib/precios';
import { ArteServicio } from './arte';
import { Esqueleto, nombreOpcion, porPopularidad } from './carrito-comun';
import { Carril } from './deslizables';
import { PasosCompra } from './pasos-compra';
import type { MayoristaTienda } from './precio-tarjeta';
import { TarjetaServicio } from './tarjeta-servicio';

/** Quién mira el carrito: define qué puede hacer en el resumen. */
export type CuentaCarrito =
  | { tipo: 'invitado' }
  | {
      tipo: 'cliente';
      saldoUsd: string;
      /** Pedido que aún espera pago: no se puede hacer otro hasta cerrarlo. */
      pendiente: PedidoPublico | null;
      /** Métodos con los que se recarga la billetera (nombres del panel). */
      metodosRecarga: string[];
      /** Slugs de los servicios que ya tiene activos: no se le sugieren. */
      contratados: string[];
    }
  | { tipo: 'revendedor' }
  | { tipo: 'equipo'; panel: string }
  /** Hay sesión de cliente pero la billetera no respondió. */
  | { tipo: 'error' };

interface Elegido {
  plan: PlanPublico;
  item: ServicioTienda;
}

interface PedidoHecho {
  pedido: PedidoPublico;
  forma: FormaPagoPedido;
  /** Lo que faltaba de saldo al hacerlo (según la cotización de la API). */
  faltanteUsd: string;
}

const RUTA_INGRESO = `/ingresar?siguiente=${encodeURIComponent(RUTA_CARRITO)}`;

/** «Pago Móvil, Zelle o Binance»: nombres tal como están en el panel. */
function lista(nombres: string[]): string {
  return new Intl.ListFormat('es', { type: 'disjunction' }).format(nombres);
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Error de cupón de la API (no existe, venció, ya se usó…): se muestra bajo el campo. */
function esErrorCupon(e: ErrorLlamada) {
  return e.codigo.startsWith('CUPON_') || Boolean(e.campos?.cupon);
}

/**
 * Página del carrito. Guarda solo ids de planes (en este navegador); los
 * precios, el cupón y lo que falta de saldo salen siempre de
 * POST /mi/pedidos/cotizar, y el pedido se crea con POST /mi/pedidos.
 */
export function PaginaCarrito({
  servicios,
  moneda,
  cuenta,
  metodosPago,
  mayorista,
}: {
  servicios: ServicioTienda[];
  moneda: Moneda;
  cuenta: CuentaCarrito;
  /** Nombres de los métodos de cobro activos, tal como están en el panel. */
  metodosPago: string[];
  mayorista: MayoristaTienda | null;
}) {
  const listo = useCarritoListo();
  const carrito = useCarrito();
  const [hecho, setHecho] = useState<PedidoHecho | null>(null);

  // Planes del catálogo por id (los que ya no se venden no se muestran).
  const porPlan = new Map<string, Elegido>();
  for (const item of servicios)
    for (const plan of item.planes) porPlan.set(plan.id, { plan, item });
  const elegidos = carrito.planes.flatMap((id) => {
    const e = porPlan.get(id);
    return e ? [e] : [];
  });

  const paso = hecho ? (hecho.pedido.estado === 'pagado' ? 3 : 2) : 1;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1
            id={ID_TITULO_CARRITO}
            tabIndex={-1}
            className="text-[clamp(2rem,5vw,3rem)] outline-none"
          >
            Tu <span className="texto-degradado">carrito</span>
          </h1>
          <p className="text-tinta-suave">Revisa tus planes, elige cómo pagar y haz tu pedido.</p>
        </div>
        <PasosCompra actual={paso} />
      </div>

      {!listo ? (
        <CargandoCarrito />
      ) : hecho ? (
        <PedidoListo hecho={hecho} cuenta={cuenta} metodosPago={metodosPago} />
      ) : elegidos.length === 0 ? (
        <CarritoVacio />
      ) : (
        <CarritoConPlanes
          elegidos={elegidos}
          moneda={moneda}
          cuenta={cuenta}
          metodosPago={metodosPago}
          alHacerPedido={(h) => {
            setHecho(h);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {listo && !hecho && elegidos.length < MAX_CARRITO && (
        <Sugerencias
          servicios={servicios}
          elegidos={elegidos}
          contratados={cuenta.tipo === 'cliente' ? cuenta.contratados : []}
          moneda={moneda}
          mayorista={mayorista}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ estados */

function CargandoCarrito() {
  return (
    <div aria-busy="true" className="grid gap-6 min-[61.25rem]:grid-cols-[minmax(0,1fr)_23.75rem]">
      <span className="sr-only">Cargando tu carrito…</span>
      <div className="grid content-start gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-[1.25rem] border border-borde bg-white/[0.02]"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-3xl border border-borde bg-white/[0.02]" />
    </div>
  );
}

function CarritoVacio() {
  return (
    <div className="grid justify-items-center gap-3.5 rounded-[1.6rem] border-[1.5px] border-dashed border-borde-fuerte px-4 py-11 text-center">
      <span
        className="orbe orbe-xl"
        style={{ '--c': '#4f8dff' } as CSSProperties}
        aria-hidden="true"
      >
        <ShoppingCart />
      </span>
      <h2 className="mt-1 text-[1.4rem]">Tu carrito está vacío</h2>
      <p className="max-w-xs text-tinta-suave">
        Agrega hasta {MAX_CARRITO} planes y págalos juntos en un solo pedido.
      </p>
      <Link href="/catalogo" className={clasesBoton('primario', 'md', 'mt-1')}>
        Ver catálogo
      </Link>
    </div>
  );
}

/** Servicios más pedidos que aún no están en el carrito ni tiene ya activos. */
function Sugerencias({
  servicios,
  elegidos,
  contratados,
  moneda,
  mayorista,
}: {
  servicios: ServicioTienda[];
  elegidos: Elegido[];
  contratados: string[];
  moneda: Moneda;
  mayorista: MayoristaTienda | null;
}) {
  const dentro = new Set(elegidos.map((e) => e.item.servicio.id));
  const activos = new Set(contratados);
  const tarjetas = porPopularidad(servicios)
    .filter((s) => !dentro.has(s.servicio.id) && !activos.has(s.servicio.slug))
    .flatMap((s) => {
      const plan = planMasBarato(s.planes, moneda);
      return plan ? [{ s, plan }] : [];
    })
    .slice(0, 10);
  if (tarjetas.length === 0) return null;
  const titulo = elegidos.length > 0 ? 'Complétalo' : 'Lo más pedido';
  return (
    <section aria-labelledby="sugerencias-carrito" className="@container mt-8">
      <Carril
        etiqueta={titulo}
        cabecera={
          <div className="grid gap-1.5">
            <h2 id="sugerencias-carrito" className="text-[clamp(1.45rem,3.6vw,2.15rem)]">
              {titulo}
            </h2>
            <p className="text-sm text-tinta-suave">
              {elegidos.length > 0
                ? `Lo más pedido que aún no está en tu carrito${activos.size > 0 ? ' ni tienes activo' : ''}. Caben hasta ${MAX_CARRITO} planes por pedido.`
                : `Los servicios que más se piden en la tienda. Caben hasta ${MAX_CARRITO} planes por pedido.`}
            </p>
          </div>
        }
        acciones={
          <Link
            href="/catalogo"
            className="text-sm font-medium whitespace-nowrap text-cian hover:underline"
          >
            Ver catálogo
          </Link>
        }
      >
        {tarjetas.map(({ s, plan }) => (
          <TarjetaServicio
            key={s.servicio.id}
            item={s}
            plan={plan}
            moneda={moneda}
            mayorista={mayorista}
          />
        ))}
      </Carril>
    </section>
  );
}

/* ------------------------------------------------------------ con planes */

function CarritoConPlanes({
  elegidos,
  moneda,
  cuenta,
  metodosPago,
  alHacerPedido,
}: {
  elegidos: Elegido[];
  moneda: Moneda;
  cuenta: CuentaCarrito;
  metodosPago: string[];
  alHacerPedido: (h: PedidoHecho) => void;
}) {
  const router = useRouter();
  const carrito = useCarrito();
  const notificar = useNotificar();
  const cliente = cuenta.tipo === 'cliente' ? cuenta : null;

  const [cupon, setCupon] = useState('');
  const [cuponAplicado, setCuponAplicado] = useState('');
  const [errorCupon, setErrorCupon] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<{
    clave: string;
    cotizacion: CotizacionPedido | null;
    error: ErrorLlamada | null;
  } | null>(null);

  const ids = elegidos.map((e) => e.plan.id);
  const clave = `${ids.join(',')}|${moneda}|${cuponAplicado}|${intento}`;

  // Cotiza en la API cada vez que cambian los planes, la moneda o el cupón.
  useEffect(() => {
    if (!cliente || ids.length === 0) return;
    let vigente = true;
    void llamarApi<CotizacionPedido>('POST', '/mi/pedidos/cotizar', {
      planes: ids,
      moneda,
      cupon: cuponAplicado,
    }).then((r) => {
      if (!vigente) return;
      if (!r.ok && cuponAplicado && esErrorCupon(r.error)) {
        // El cupón no vale: se avisa bajo el campo y se vuelve a cotizar sin él.
        setErrorCupon(r.error.campos?.cupon?.[0] ?? r.error.mensaje);
        setCuponAplicado('');
        return;
      }
      setResultado(
        r.ok
          ? { clave, cotizacion: r.datos, error: null }
          : { clave, cotizacion: null, error: r.error },
      );
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume planes, moneda, cupón e intento.
  }, [clave, cliente !== null]);

  const actual = resultado?.clave === clave ? resultado : null;
  const cotizando = cliente !== null && !actual;
  const cotizacion = actual?.cotizacion ?? null;
  const errorCotizacion = actual?.error ?? null;
  const pendiente = cliente?.pendiente ?? null;

  const [cancelado, setCancelado] = useState<string | null>(null);
  const pedidoAbierto = pendiente && pendiente.id !== cancelado ? pendiente : null;

  // Barra fija del teléfono: se esconde cuando el resumen está en pantalla.
  const resumen = useRef<HTMLElement>(null);
  const [resumenVisible, setResumenVisible] = useState(false);
  useEffect(() => {
    const el = resumen.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) => setResumenVisible(Boolean(e?.isIntersecting)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function quitar(e: Elegido) {
    const indice = carrito.planes.indexOf(e.plan.id);
    carrito.quitar(e.plan.id);
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

  const libres = MAX_CARRITO - elegidos.length;
  const nPlanes = `${elegidos.length} ${plural(elegidos.length, 'plan', 'planes')}`;
  const conBarra =
    !resumenVisible &&
    (cuenta.tipo === 'invitado' || (cliente !== null && !pedidoAbierto && !errorCotizacion));

  return (
    <div className="grid grid-cols-1 items-start gap-6 min-[61.25rem]:grid-cols-[minmax(0,1fr)_23.75rem] min-[61.25rem]:gap-7">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg" aria-live="polite">
            {elegidos.length} de {MAX_CARRITO} planes
          </h2>
          <div className="grid w-[min(16.25rem,100%)] grid-cols-5 gap-1.5" aria-hidden="true">
            {Array.from({ length: MAX_CARRITO }, (_, i) => {
              const e = elegidos[i];
              return (
                <span
                  key={i}
                  className={clsx(
                    'grid h-10 place-items-center overflow-hidden rounded-[0.625rem] border-[1.5px]',
                    e ? 'border-marca/60 bg-marca-suave' : 'border-dashed border-borde-fuerte',
                  )}
                >
                  {e && (
                    <ArteServicio
                      arte={e.item.arte}
                      nombre={e.item.servicio.nombre}
                      categoria={e.item.servicio.categoria}
                      color={e.item.color}
                      orbe="sm"
                      className="h-[2.1rem] w-auto"
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <ul className="grid gap-3" aria-busy={cotizando}>
          {elegidos.map((e) => (
            <LineaCarrito
              key={e.plan.id}
              e={e}
              moneda={moneda}
              cotizando={cotizando}
              linea={cotizacion?.lineas.find((l) => l.planId === e.plan.id) ?? null}
              alCambiar={(nuevo) => cambiarPlan(e, nuevo)}
              alQuitar={() => quitar(e)}
            />
          ))}
        </ul>

        {libres > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border-[1.5px] border-dashed border-borde-fuerte px-4 py-3.5 text-sm text-tinta-suave">
            <span>
              {libres === 1 ? 'Te queda 1 espacio' : `Te quedan ${libres} espacios`} en este pedido
            </span>
            <Link
              href="/catalogo"
              className="font-medium whitespace-nowrap text-cian hover:underline"
            >
              Seguir comprando
            </Link>
          </div>
        ) : (
          <p
            role="status"
            className="flex items-center gap-2.5 rounded-2xl border border-aviso/40 bg-aviso-suave px-4 py-3 text-sm text-aviso"
          >
            <Zap className="size-4 shrink-0" aria-hidden="true" />
            Tu carrito está lleno. Quita un plan para agregar otro.
          </p>
        )}
      </div>

      <aside
        ref={resumen}
        id="resumen-carrito"
        aria-labelledby="titulo-resumen"
        className="grid gap-4 rounded-3xl border border-borde-fuerte bg-[linear-gradient(180deg,rgb(15_21_48/0.92),rgb(8_11_26/0.96))] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] min-[61.25rem]:sticky min-[61.25rem]:top-36"
      >
        <h2 id="titulo-resumen" className={clsx('text-xl', pedidoAbierto && 'sr-only')}>
          Resumen
        </h2>
        {cliente && pedidoAbierto ? (
          <>
            <AvisoPedidoAbierto
              pedido={pedidoAbierto}
              alCancelar={() => {
                setCancelado(pedidoAbierto.id);
                router.refresh();
              }}
            />
            <Totales
              cotizacion={cotizacion}
              cotizando={cotizando}
              nPlanes={nPlanes}
              moneda={moneda}
            />
          </>
        ) : cliente ? (
          <ResumenCliente
            cliente={cliente}
            ids={ids}
            moneda={moneda}
            nPlanes={nPlanes}
            metodosPago={metodosPago}
            cotizacion={cotizacion}
            cotizando={cotizando}
            errorCotizacion={errorCotizacion}
            reintentar={() => setIntento((n) => n + 1)}
            cupon={cupon}
            cuponAplicado={cuponAplicado}
            errorCupon={errorCupon}
            alEscribirCupon={(v) => {
              setCupon(v);
              setErrorCupon(null);
              // Al borrar el cupón se vuelve a cotizar sin él.
              if (!v) setCuponAplicado('');
            }}
            alAplicarCupon={() => {
              setErrorCupon(null);
              setCuponAplicado(cupon);
            }}
            alQuitarCupon={() => {
              setCupon('');
              setErrorCupon(null);
              setCuponAplicado('');
            }}
            alHacerPedido={(pedido, forma) => {
              carrito.vaciar();
              alHacerPedido({ pedido, forma, faltanteUsd: cotizacion?.faltanteUsd ?? '0.00' });
              notificar(
                pedido.estado === 'pagado'
                  ? `Pagamos el pedido ${pedido.numero} con tu saldo.`
                  : `Creamos el pedido ${pedido.numero}.`,
                'exito',
              );
              // La cabecera vuelve a leer el saldo y el pedido por pagar.
              router.refresh();
            }}
          />
        ) : (
          <ResumenSinCompra cuenta={cuenta} nPlanes={nPlanes} />
        )}
      </aside>

      {(cuenta.tipo === 'invitado' || cliente) && (
        <div
          {...(conBarra ? { 'data-barra-carrito': '' } : { 'aria-hidden': true, inert: true })}
          className={clsx(
            'fixed inset-x-2.5 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-[45] flex items-center gap-3 rounded-[1.25rem] border border-borde-fuerte bg-[rgb(8_11_28/0.95)] py-2.5 pr-2.5 pl-3.5 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-lg transition-[transform,opacity] duration-300 nav:hidden',
            !conBarra && 'pointer-events-none translate-y-[140%] opacity-0',
          )}
        >
          <div className="grid min-w-0 flex-1 leading-tight">
            {cliente ? (
              <>
                <span className="text-xs text-tinta-suave">Total · {nPlanes}</span>
                <b className="font-titulo text-lg font-extrabold whitespace-nowrap tabular-nums">
                  {cotizacion && !cotizando ? (
                    formatearMonto(cotizacion.total, moneda)
                  ) : (
                    <Esqueleto ancho="w-24" />
                  )}
                </b>
              </>
            ) : (
              <>
                <span className="text-xs text-tinta-suave">Tu carrito</span>
                <b className="font-titulo text-lg font-extrabold">{nPlanes}</b>
              </>
            )}
          </div>
          {cliente ? (
            <button
              type="button"
              className={clasesBoton('primario', 'md', 'px-4')}
              onClick={() => {
                resumen.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                resumen.current?.querySelector<HTMLElement>('input, button')?.focus({
                  preventScroll: true,
                });
              }}
            >
              Continuar
            </button>
          ) : (
            <Link href={RUTA_INGRESO} className={clasesBoton('primario', 'md', 'px-4')}>
              Ingresar para pagar
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function LineaCarrito({
  e,
  moneda,
  cotizando,
  linea,
  alCambiar,
  alQuitar,
}: {
  e: Elegido;
  moneda: Moneda;
  cotizando: boolean;
  linea: CotizacionPedido['lineas'][number] | null;
  alCambiar: (plan: string) => void;
  alQuitar: () => void;
}) {
  const { item, plan } = e;
  const nombre = item.servicio.nombre;
  const categoria = item.servicio.categoria ? INFO_CATEGORIA[item.servicio.categoria] : null;
  const descuento = linea && Number(linea.descuento) > 0 ? linea.descuento : null;
  return (
    <li
      className="aparecer grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 rounded-[1.25rem] border border-borde bg-[linear-gradient(180deg,rgb(15_21_48/0.86),rgb(8_11_26/0.94))] p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3.5"
      style={{ '--c': item.color } as CSSProperties}
    >
      <Link
        href={`/catalogo/${item.servicio.slug}?plan=${plan.id}`}
        tabIndex={-1}
        aria-hidden="true"
        className="grid min-h-24 place-items-center overflow-hidden rounded-[0.875rem] bg-[radial-gradient(60%_60%_at_50%_55%,color-mix(in_srgb,var(--c)_45%,transparent),transparent_75%),rgb(3_5_14/0.5)]"
      >
        <ArteServicio
          arte={item.arte}
          nombre={nombre}
          categoria={item.servicio.categoria}
          color={item.color}
          orbe="md"
          className="h-20 w-auto"
        />
      </Link>
      <div className="grid min-w-0 content-center gap-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="grid min-w-0">
            {categoria && (
              <span className="flex items-center gap-1.5 text-[0.68rem] font-bold tracking-[0.1em] text-tinta-suave uppercase">
                <i
                  className="size-1.5 rounded-full bg-[var(--c)] shadow-[0_0_8px_var(--c)]"
                  aria-hidden="true"
                />
                {categoria.nombre}
              </span>
            )}
            <Link
              href={`/catalogo/${item.servicio.slug}?plan=${plan.id}`}
              className="font-semibold hover:underline sm:truncate"
              title={nombre}
            >
              {nombre}
            </Link>
          </div>
          <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 tabular-nums sm:grid sm:justify-items-end sm:text-right">
            {cotizando ? (
              <>
                <Esqueleto ancho="w-20" />
                <span className="sr-only">Calculando el precio</span>
              </>
            ) : linea ? (
              <>
                <strong className="font-titulo text-[1.05rem] whitespace-nowrap">
                  {formatearMonto(linea.total, moneda)}
                </strong>
                {moneda !== 'USD' && (
                  <small className="text-xs text-tinta-suave">
                    {formatearMonto(linea.totalUsd, 'USD')}
                  </small>
                )}
                {descuento && (
                  <span className="text-xs whitespace-nowrap text-exito">
                    Cupón −{formatearMonto(descuento, moneda)}
                  </span>
                )}
              </>
            ) : (
              <>
                <strong className="font-titulo text-[1.05rem] whitespace-nowrap text-tinta-suave">
                  {precioTexto(plan, moneda) ?? 'Sin precio'}
                </strong>
                <small className="text-xs text-tinta-tenue">Precio de catálogo</small>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {item.planes.length > 1 ? (
            <label className="relative flex items-center">
              <span className="sr-only">Plan de {nombre}</span>
              <select
                value={plan.id}
                onChange={(ev) => alCambiar(ev.target.value)}
                className="cursor-pointer appearance-none rounded-[0.7rem] border border-borde-fuerte bg-[rgb(10_14_32/0.9)] py-1.5 pr-8 pl-3 text-sm text-tinta hover:border-tinta-tenue"
              >
                {item.planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nombreOpcion(p, item.planes)}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 size-3.5 text-tinta-suave"
                aria-hidden="true"
              />
            </label>
          ) : (
            <span className="text-sm text-tinta-suave">{nombreOpcion(plan, item.planes)}</span>
          )}
          <button
            type="button"
            onClick={alQuitar}
            aria-label={`Quitar ${nombre} del carrito`}
            className="inline-flex items-center gap-1.5 px-1 py-1.5 text-[0.8rem] text-tinta-suave hover:text-peligro"
          >
            <Trash2 className="size-4" aria-hidden="true" /> Quitar
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- resumen */

function Totales({
  cotizacion,
  cotizando,
  nPlanes,
  moneda,
}: {
  cotizacion: CotizacionPedido | null;
  cotizando: boolean;
  nPlanes: string;
  moneda: Moneda;
}) {
  return (
    <dl
      aria-live="polite"
      aria-busy={cotizando}
      className="grid gap-2 border-t border-borde pt-3.5 text-sm tabular-nums"
    >
      <div className="flex justify-between gap-3 text-tinta-suave">
        <dt>Subtotal · {nPlanes}</dt>
        <dd>
          {cotizacion && !cotizando ? formatearMonto(cotizacion.subtotal, moneda) : <Esqueleto />}
        </dd>
      </div>
      {cotizacion && !cotizando && Number(cotizacion.descuento) > 0 && (
        <div className="flex justify-between gap-3 text-exito">
          <dt>Cupón {cotizacion.cupon}</dt>
          <dd>−{formatearMonto(cotizacion.descuento, moneda)}</dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 pt-1.5">
        <dt className="font-semibold">Total</dt>
        <dd className="font-titulo text-[1.65rem] font-extrabold">
          {cotizacion && !cotizando ? (
            formatearMonto(cotizacion.total, moneda)
          ) : (
            <>
              <Esqueleto ancho="w-28" />
              <span className="sr-only">Calculando el total</span>
            </>
          )}
        </dd>
      </div>
      {moneda !== 'USD' && cotizacion && !cotizando && (
        <div className="flex justify-end text-xs text-tinta-tenue">
          <dd>Equivale a {formatearMonto(cotizacion.totalUsd, 'USD')} con la tasa de hoy</dd>
        </div>
      )}
    </dl>
  );
}

const TEXTO_BOTON: Record<FormaPagoPedido, string> = {
  billetera: 'Pagar con mi saldo',
  recarga: 'Hacer el pedido y recargar',
  facturas: 'Hacer el pedido',
};

function ResumenCliente({
  cliente,
  ids,
  moneda,
  nPlanes,
  metodosPago,
  cotizacion,
  cotizando,
  errorCotizacion,
  reintentar,
  cupon,
  cuponAplicado,
  errorCupon,
  alEscribirCupon,
  alAplicarCupon,
  alQuitarCupon,
  alHacerPedido,
}: {
  cliente: Extract<CuentaCarrito, { tipo: 'cliente' }>;
  ids: string[];
  moneda: Moneda;
  nPlanes: string;
  metodosPago: string[];
  cotizacion: CotizacionPedido | null;
  cotizando: boolean;
  errorCotizacion: ErrorLlamada | null;
  reintentar: () => void;
  cupon: string;
  cuponAplicado: string;
  errorCupon: string | null;
  alEscribirCupon: (v: string) => void;
  alAplicarCupon: () => void;
  alQuitarCupon: () => void;
  alHacerPedido: (pedido: PedidoPublico, forma: FormaPagoPedido) => void;
}) {
  const idCupon = useId();
  const [forma, setForma] = useState<FormaPagoPedido | null>(null);
  const [creando, setCreando] = useState(false);
  const [errorPedido, setErrorPedido] = useState<ErrorLlamada | null>(null);

  const saldoUsd = cotizacion?.saldoUsd ?? cliente.saldoUsd;
  const alcanza = cotizacion ? Number(cotizacion.faltanteUsd) === 0 : false;
  const elegida: FormaPagoPedido =
    forma === 'billetera' && !alcanza ? 'recarga' : (forma ?? (alcanza ? 'billetera' : 'recarga'));

  const formatoMal = cupon !== '' && !PATRON_CUPON.test(cupon);
  const aplicando = cotizando && cuponAplicado !== '' && cupon === cuponAplicado;
  const aplicado = !cotizando && cotizacion?.cupon ? cotizacion.cupon : null;
  const conDescuento = cotizacion?.lineas.find((l) => Number(l.descuento) > 0);

  const formas: { id: FormaPagoPedido; titulo: string; texto: string }[] = [
    {
      id: 'billetera',
      titulo: 'Pagar con mi saldo',
      texto: 'Se descuenta de tu billetera y el pedido queda pagado al instante.',
    },
    {
      id: 'recarga',
      titulo: 'Recargar y pagar',
      texto: 'Reportas una recarga con tu comprobante y, al confirmarla, pagamos el pedido.',
    },
    {
      id: 'facturas',
      titulo: 'Pagar cada factura aparte',
      texto:
        metodosPago.length > 0
          ? `Una factura por plan: ${lista(metodosPago)}.`
          : 'Una factura por plan, con los métodos de pago activos.',
    },
  ];

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!cotizacion || cotizando) return;
    setCreando(true);
    setErrorPedido(null);
    const r = await llamarApi<PedidoPublico>('POST', '/mi/pedidos', {
      planes: ids,
      moneda,
      cupon: cotizacion.cupon ?? '',
      pago: elegida,
    });
    setCreando(false);
    if (!r.ok) return setErrorPedido(r.error);
    alHacerPedido(r.datos, elegida);
  }

  let mensajeCupon: ReactNode = 'Opcional. Se aplica al plan donde más ahorras.';
  let tonoCupon: 'normal' | 'bien' | 'mal' = 'normal';
  if (formatoMal) {
    mensajeCupon = MENSAJE_CUPON;
    tonoCupon = 'mal';
  } else if (errorCupon) {
    mensajeCupon = `${errorCupon} Revisa el código o bórralo para seguir sin cupón.`;
    tonoCupon = 'mal';
  } else if (aplicando) {
    mensajeCupon = 'Comprobando el cupón…';
  } else if (aplicado) {
    mensajeCupon = conDescuento
      ? `Cupón ${aplicado} aplicado a ${conDescuento.servicio}, donde más ahorras.`
      : `Cupón ${aplicado} aplicado.`;
    tonoCupon = 'bien';
  }

  return (
    <form onSubmit={crear} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <label htmlFor={idCupon} className="text-sm font-semibold">
          Cupón de descuento
        </label>
        <div className="flex gap-2">
          <input
            id={idCupon}
            value={cupon}
            onChange={(e) => alEscribirCupon(e.target.value.toUpperCase().replace(/\s/g, ''))}
            onKeyDown={(e) => {
              // Enter aplica el cupón (no crea el pedido).
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!formatoMal && cupon.length >= 3) alAplicarCupon();
              }
            }}
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            placeholder="Escribe tu código"
            aria-invalid={tonoCupon === 'mal' || undefined}
            aria-describedby={`${idCupon}-ayuda`}
            data-valido={tonoCupon === 'bien' || undefined}
            className={clsx(clasesEntrada, 'min-w-0 flex-1 uppercase placeholder:normal-case')}
          />
          <Boton
            variante="secundario"
            cargando={aplicando}
            disabled={
              cupon.length < 3 ||
              formatoMal ||
              (cupon === cuponAplicado && !errorCupon) ||
              aplicando
            }
            onClick={alAplicarCupon}
          >
            {aplicando ? 'Aplicando…' : 'Aplicar'}
          </Boton>
        </div>
        <p
          id={`${idCupon}-ayuda`}
          aria-live="polite"
          className={clsx(
            'flex min-h-5 flex-wrap items-center gap-x-1.5 text-xs',
            tonoCupon === 'bien' && 'text-exito',
            tonoCupon === 'mal' && 'font-medium text-peligro',
            tonoCupon === 'normal' && 'text-tinta-tenue',
          )}
        >
          {tonoCupon === 'bien' && <Check className="size-3.5" aria-hidden="true" />}
          {tonoCupon === 'mal' && <X className="size-3.5" aria-hidden="true" />}
          <span>{mensajeCupon}</span>
          {aplicado && (
            <button
              type="button"
              onClick={alQuitarCupon}
              className="font-medium text-cian hover:underline"
            >
              Quitar cupón
            </button>
          )}
        </p>
      </div>

      <Totales cotizacion={cotizacion} cotizando={cotizando} nPlanes={nPlanes} moneda={moneda} />

      {errorCotizacion ? (
        <ErrorCotizacion error={errorCotizacion} reintentar={reintentar} />
      ) : (
        <>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-semibold">¿Cómo vas a pagar?</legend>
            <p className="mb-1 flex items-center gap-2 text-[0.8rem] text-tinta-suave">
              <Wallet className="size-4 shrink-0 text-violeta" aria-hidden="true" />
              <span>
                Tu saldo:{' '}
                <b className="text-tinta tabular-nums">{formatearMonto(saldoUsd, 'USD')}</b>
                {cotizacion && !cotizando && !alcanza && (
                  <>
                    {' · '}
                    <span className="text-aviso">
                      te faltan {formatearMonto(cotizacion.faltanteUsd, 'USD')}
                    </span>
                  </>
                )}
              </span>
            </p>
            {formas.map((f) => {
              const apagada = f.id === 'billetera' && !alcanza;
              return (
                <label
                  key={f.id}
                  className={clsx(
                    'flex gap-3 rounded-[0.95rem] border p-3.5 transition-colors',
                    elegida === f.id
                      ? 'border-marca bg-marca-suave'
                      : 'border-borde-fuerte bg-[rgb(3_5_14/0.5)]',
                    apagada ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-cian',
                  )}
                >
                  <input
                    type="radio"
                    name="pago"
                    value={f.id}
                    checked={elegida === f.id}
                    disabled={apagada || !cotizacion}
                    onChange={() => setForma(f.id)}
                    className="mt-0.5 size-[1.125rem] shrink-0 cursor-pointer appearance-none rounded-full border-2 border-borde-fuerte checked:border-[5px] checked:border-marca disabled:cursor-not-allowed"
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <b className="text-sm font-semibold">{f.titulo}</b>
                    <span className="text-[0.8rem] text-tinta-suave">
                      {apagada && cotizacion ? 'Tu saldo no alcanza para este pedido.' : f.texto}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <Boton
            type="submit"
            tamano="lg"
            className="w-full"
            cargando={creando}
            disabled={!cotizacion || cotizando}
          >
            {creando
              ? elegida === 'billetera'
                ? 'Pagando…'
                : 'Creando tu pedido…'
              : cotizando
                ? 'Calculando el total…'
                : TEXTO_BOTON[elegida]}
          </Boton>
          {errorPedido && (
            <p
              role="alert"
              className="flex gap-2 rounded-xl border border-peligro/30 bg-peligro-suave px-3.5 py-2.5 text-sm"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-peligro" aria-hidden="true" />
              <span>
                {errorPedido.mensaje}
                {errorPedido.codigo === 'PEDIDO_PENDIENTE' && (
                  <>
                    {' '}
                    <Link href="/cuenta/carrito" className="font-medium text-cian underline">
                      Ver mis pedidos
                    </Link>
                  </>
                )}
              </span>
            </p>
          )}
          <p className="text-center text-xs text-tinta-tenue">
            Cada plan es un servicio aparte con su propia factura. Se activa cuando está pagado.
          </p>
        </>
      )}
    </form>
  );
}

function ErrorCotizacion({ error, reintentar }: { error: ErrorLlamada; reintentar: () => void }) {
  if (error.estado === 401) {
    return (
      <div role="alert" className="grid gap-3 text-sm">
        <p className="text-peligro">
          Tu sesión terminó. Ingresa de nuevo para ver el total y pagar.
        </p>
        <Link href={RUTA_INGRESO} className={clasesBoton('primario', 'lg', 'w-full')}>
          Ingresar para pagar
        </Link>
      </div>
    );
  }
  return (
    <div role="alert" className="grid gap-3 text-sm">
      <p className="flex gap-2 rounded-xl border border-peligro/30 bg-peligro-suave px-3.5 py-2.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-peligro" aria-hidden="true" />
        <span>
          {error.mensaje}
          {error.estado !== 403 && ' Vuelve a intentarlo en un momento.'}
        </span>
      </p>
      {error.estado !== 403 && (
        <Boton variante="secundario" onClick={reintentar}>
          Calcular de nuevo
        </Boton>
      )}
    </div>
  );
}

/** Pedido que espera pago: se paga o se cancela antes de hacer otro. */
function AvisoPedidoAbierto({
  pedido,
  alCancelar,
}: {
  pedido: PedidoPublico;
  alCancelar: () => void;
}) {
  const notificar = useNotificar();
  const [confirmar, setConfirmar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function cancelar() {
    setCancelando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/pedidos/${pedido.id}/cancelar`);
    setCancelando(false);
    if (!r.ok) return setError(r.error);
    notificar(`Cancelamos el pedido ${pedido.numero}. Ya puedes hacer uno nuevo.`, 'exito');
    alCancelar();
  }

  return (
    <div className="grid gap-3 rounded-[1.25rem] border border-aviso/40 bg-aviso-suave p-4">
      <p className="font-titulo text-base font-bold">Tienes el pedido {pedido.numero} por pagar</p>
      <p className="text-sm text-tinta-suave">
        Págalo o cancélalo antes de hacer otro pedido. Tu carrito se queda como está.
      </p>
      <Link
        href={`/cuenta/carrito/${pedido.id}`}
        className={clasesBoton('primario', 'lg', 'w-full')}
      >
        Ver el pedido
      </Link>
      {confirmar ? (
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span>¿Seguro? Se anulan sus facturas.</span>
          <Boton
            variante="peligro"
            tamano="sm"
            cargando={cancelando}
            onClick={() => void cancelar()}
          >
            {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
          </Boton>
          <Boton
            variante="fantasma"
            tamano="sm"
            disabled={cancelando}
            onClick={() => setConfirmar(false)}
          >
            No
          </Boton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="justify-self-start px-0.5 py-1 text-sm font-medium text-peligro hover:underline"
        >
          Cancelar ese pedido
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-peligro">
          {error.mensaje} Recarga la página y vuelve a intentarlo.
        </p>
      )}
    </div>
  );
}

/** Resumen de quien no puede pagar aquí: visitante, revendedor o equipo. */
function ResumenSinCompra({ cuenta, nPlanes }: { cuenta: CuentaCarrito; nPlanes: string }) {
  const router = useRouter();
  if (cuenta.tipo === 'invitado') {
    return (
      <>
        <p className="flex justify-between gap-3 border-t border-borde pt-3.5 text-sm text-tinta-suave">
          <span>En tu carrito</span>
          <span className="text-tinta">{nPlanes}</span>
        </p>
        <p className="text-sm text-tinta-suave">
          Los precios de cada plan son los del catálogo. Al ingresar calculamos el total exacto, con
          tu cupón y tu saldo. Tu carrito se queda guardado en este navegador mientras ingresas.
        </p>
        <Link href={RUTA_INGRESO} className={clasesBoton('primario', 'lg', 'w-full')}>
          Ingresar para pagar
        </Link>
        <Link href="/registro" className={clasesBoton('secundario', 'lg', 'w-full')}>
          Crear cuenta gratis
        </Link>
      </>
    );
  }
  if (cuenta.tipo === 'error') {
    return (
      <div role="alert" className="grid gap-3 text-sm">
        <p className="flex gap-2 rounded-xl border border-peligro/30 bg-peligro-suave px-3.5 py-2.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-peligro" aria-hidden="true" />
          No pudimos leer tu billetera. Vuelve a intentarlo en un momento.
        </p>
        <Boton variante="secundario" onClick={() => router.refresh()}>
          Cargar de nuevo
        </Boton>
      </div>
    );
  }
  const [texto, enlace, destino] =
    cuenta.tipo === 'revendedor'
      ? [
          'Como revendedor, compras con tu saldo al precio mayorista desde tu catálogo.',
          'Ir al catálogo mayorista',
          '/revendedor/catalogo',
        ]
      : cuenta.tipo === 'equipo'
        ? [
            'El carrito es para clientes. Para comprar, entra con una cuenta de cliente.',
            'Ir a mi panel',
            cuenta.panel,
          ]
        : ['', '', ''];
  return (
    <>
      <p className="flex justify-between gap-3 border-t border-borde pt-3.5 text-sm text-tinta-suave">
        <span>En tu carrito</span>
        <span className="text-tinta">{nPlanes}</span>
      </p>
      <p role="status" className="text-sm text-tinta-suave">
        {texto}
      </p>
      <Link href={destino} className={clasesBoton('secundario', 'lg', 'w-full')}>
        {enlace}
      </Link>
    </>
  );
}

/* ------------------------------------------------------------------ listo */

function PedidoListo({
  hecho,
  cuenta,
  metodosPago,
}: {
  hecho: PedidoHecho;
  cuenta: CuentaCarrito;
  metodosPago: string[];
}) {
  const { pedido, forma, faltanteUsd } = hecho;
  const pagado = pedido.estado === 'pagado';
  const n = pedido.facturas.length;
  const recarga = cuenta.tipo === 'cliente' ? cuenta.metodosRecarga : [];
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus({ preventScroll: true }), []);

  let pasos: string[];
  let accion: { texto: string; href: string };
  if (pagado) {
    pasos = [
      forma === 'billetera'
        ? 'Tus planes ya están pagados con tu saldo.'
        : 'Tus planes ya están pagados.',
      'Los encuentras en Mis servicios, y sus datos de acceso, en Mis accesos.',
      ...(forma === 'billetera' ? ['Te enviamos la confirmación de cada pago a tu correo.'] : []),
    ];
    accion = { texto: 'Ir a mis servicios', href: '/cuenta' };
  } else if (forma === 'recarga') {
    pasos = [
      `${Number(faltanteUsd) > 0 ? `Reporta una recarga de ${formatearMonto(faltanteUsd, 'USD')}` : 'Reporta tu recarga'} en tu billetera, con el comprobante de tu pago${recarga.length > 0 ? ` (${lista(recarga)})` : ''}.`,
      'Cuando el equipo la confirme, pagamos el pedido con ese saldo y te avisamos.',
      'Cada plan se activa cuando su factura está pagada.',
    ];
    accion = { texto: 'Reportar mi recarga', href: `/cuenta/billetera?pedido=${pedido.id}` };
  } else {
    pasos = [
      `Creamos ${n === 1 ? 'una factura' : `${n} facturas`}, una por cada plan.`,
      `Paga cada una ${metodosPago.length > 0 ? `con ${lista(metodosPago)}` : 'con uno de los métodos de pago activos'} desde la página del pedido.`,
      'Cada plan se activa cuando su factura está pagada.',
    ];
    accion = { texto: 'Ver mi pedido', href: `/cuenta/carrito/${pedido.id}` };
  }

  return (
    <section
      aria-labelledby="titulo-listo"
      className="grid justify-items-center gap-3 rounded-[1.6rem] border border-exito/35 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(34_197_94/0.14),transparent_70%),rgb(8_11_26/0.7)] px-5 py-8 text-center"
    >
      <span
        className="orbe orbe-xl"
        style={{ '--c': '#22c55e' } as CSSProperties}
        aria-hidden="true"
      >
        <Check />
      </span>
      <h2
        ref={titulo}
        id="titulo-listo"
        tabIndex={-1}
        className="mt-2 text-[clamp(1.5rem,3.4vw,2rem)] outline-none"
      >
        Pedido {pedido.numero} {pagado ? 'pagado' : 'creado'}
      </h2>
      <p className="max-w-md text-tinta-suave">
        {pagado
          ? 'Listo, no tienes nada más que pagar.'
          : 'Solo falta el pago. Esto es lo que sigue:'}
      </p>
      <p className="text-sm text-tinta-suave">
        Total:{' '}
        <b className="text-tinta tabular-nums">{formatearMonto(pedido.total, pedido.moneda)}</b> ·{' '}
        {n} {plural(n, 'plan', 'planes')}
      </p>
      <ol className="my-1 grid max-w-md list-decimal gap-1.5 pl-5 text-left text-sm text-tinta-suave">
        {pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <Link href={accion.href} className={clasesBoton('primario', 'lg', 'mt-1')}>
        {accion.texto}
      </Link>
      <Link href="/catalogo" className="py-1 text-sm font-medium text-cian hover:underline">
        Seguir comprando
      </Link>
    </section>
  );
}
