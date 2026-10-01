'use client';

import {
  type BilleteraPublica,
  type EstadoRecarga,
  formatearMonto,
  INFO_MONEDA,
  type MetodoCobroPublico,
  type Moneda,
  type MovimientoBilleteraPublico,
  type MovimientoSaldoPublico,
  type Pagina,
  type PedidoPublico,
  type RecargaBilleteraPublica,
  type RecargaPublica,
  type TipoMovimientoBilletera,
  type TipoMovimientoSaldo,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  Clock,
  FileText,
  Landmark,
  LoaderCircle,
  Plus,
  RotateCcw,
  Send,
  ShoppingCart,
  Sparkles,
  Wallet,
  X,
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
import { Bandera } from '@/componentes/tienda/iconos';
import { Boton } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import {
  BloquePago,
  BotonCopiar,
  CampoComprobante,
  claseEntrada,
  CopiarTodo,
  hoyLocal,
  LineaTiempo,
  Mensaje,
  MensajeError,
  montoParaCopiar,
  normalizarMonto,
  OpcionMetodo,
  PATRON_REFERENCIA,
  partirInstrucciones,
  pesoTexto,
  PildoraEstado,
  type TonoEstado,
  TIPOS_COMPROBANTE,
  type Validacion,
} from './pago';

/** Recarga de la billetera de un cliente o del saldo de un revendedor (misma forma). */
type RecargaVista = RecargaBilleteraPublica | RecargaPublica;
/** Movimiento de la billetera de un cliente o del saldo de un revendedor. */
type MovimientoVista = MovimientoBilleteraPublico | MovimientoSaldoPublico;

/**
 * Saldo de un revendedor: la misma pantalla, con sus rutas de la API, sus
 * movimientos (compras y reembolsos) y sin pedidos del carrito.
 */
export interface ModoRevendedor {
  nombreComercial: string;
  /** Por qué no puede recargar ahora (cuenta suspendida), o null. */
  bloqueo: string | null;
}

/** Datos que la página de la billetera ya leyó de la API. */
export interface DatosBilletera {
  billetera: BilleteraPublica;
  /** Primera página de recargas (todas, de la más nueva a la más antigua). */
  recargas: Pagina<RecargaVista>;
  /** Primera página de movimientos (todos). */
  movimientos: Pagina<MovimientoVista>;
  /** Métodos que el equipo activó para recargar (manuales, con comprobante). */
  metodos: MetodoCobroPublico[];
  /** Unidades de cada moneda por 1 USD (la tasa de hoy del catálogo). */
  tasas: Partial<Record<Moneda, string>>;
  /** Pedido del carrito que espera pago y que esta recarga puede pagar. */
  pedido: PedidoPublico | null;
  /** Moneda sugerida para pagar (la que eligió antes o la de su país). */
  monedaSugerida: Moneda;
  nombre: string;
  maxMb: number;
  /** Con esto es el saldo de un revendedor en vez de la billetera de un cliente. */
  revendedor?: ModoRevendedor | null;
}

/** Ruta de la API del saldo: la billetera del cliente o el saldo del revendedor. */
const rutaSaldo = (revendedor: boolean) => (revendedor ? '/revendedor' : '/mi/billetera');

const MONTOS_RAPIDOS = ['5.00', '10.00', '20.00', '50.00'];
const ID_FORMULARIO = 'recargar';
const ID_METODO = 'recarga-metodo';
const ID_ACCION = 'recarga-accion';
const COLORES_METODO = ['#4f8dff', '#22d3ee', '#10b981', '#a855f7', '#f59e0b'];

const usd = (v: string | number) => formatearMonto(Number(v).toFixed(2), 'USD');
const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });

/** Fecha corta; el servidor y el navegador pueden estar en otra zona horaria. */
function Fecha({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {fechaCorta.format(new Date(iso))}
    </time>
  );
}

function tasaDe(moneda: Moneda, tasas: DatosBilletera['tasas']): string | null {
  return moneda === 'USD' ? '1' : (tasas[moneda] ?? null);
}

/** Importe en `moneda` de `montoUsd`, redondeado como se cobra. Solo una estimación. */
function aMoneda(montoUsd: number, moneda: Moneda, tasa: string): string {
  return (montoUsd * Number(tasa)).toFixed(INFO_MONEDA[moneda].decimales);
}

function irA(id: string, bloque: ScrollLogicalPosition = 'start') {
  document.getElementById(id)?.scrollIntoView({ block: bloque, behavior: 'smooth' });
}

function Titulillo({ children }: { children: ReactNode }) {
  return (
    <span className="text-[0.7rem] font-bold tracking-[0.12em] text-tinta-tenue uppercase">
      {children}
    </span>
  );
}

/** Aviso ancho con orbe (pedido por pagar, recarga rechazada). */
function Banda({
  tono,
  icono,
  titulo,
  children,
  accion,
}: {
  tono: 'aviso' | 'peligro';
  icono: ReactNode;
  titulo: ReactNode;
  children: ReactNode;
  accion: ReactNode;
}) {
  return (
    <div
      role={tono === 'peligro' ? 'alert' : 'status'}
      className={clsx(
        'flex flex-wrap items-center gap-3.5 rounded-[1.125rem] border px-4 py-3.5',
        tono === 'aviso'
          ? 'border-aviso/40 bg-[radial-gradient(80%_120%_at_0%_50%,rgb(251_191_36/0.12),transparent_70%),rgb(8_11_26/0.7)]'
          : 'border-peligro/45 bg-[radial-gradient(80%_120%_at_0%_50%,rgb(239_68_68/0.12),transparent_70%),rgb(8_11_26/0.7)]',
      )}
    >
      <span
        className="orbe orbe-sm after:hidden"
        style={{ '--c': tono === 'aviso' ? '#f59e0b' : '#ef4444' } as CSSProperties}
        aria-hidden="true"
      >
        {icono}
      </span>
      <div className="grid min-w-0 flex-[1_1_13rem] gap-0.5">
        <b className="text-[0.95rem]">{titulo}</b>
        <span className="text-[0.82rem] text-tinta-suave">{children}</span>
      </div>
      {accion}
    </div>
  );
}

const claseEnlace = 'text-sm font-semibold whitespace-nowrap text-cian hover:underline';

/* ───────────────────────────── cabecera ───────────────────────────── */

/**
 * Tarjeta del saldo en dólares con su equivalente y, abajo, las recargas en
 * revisión (o el nombre). La usan la billetera y el resumen del revendedor.
 */
export function TarjetaSaldo({
  titulo,
  saldoUsd,
  equivalente,
  pie,
  nombre,
  enRevision,
}: {
  titulo: string;
  saldoUsd: string;
  /** El saldo en otra moneda con la tasa de hoy, ya formateado (o null). */
  equivalente: string | null;
  pie: string;
  nombre: string;
  enRevision: number;
}) {
  return (
    <div className="relative isolate grid min-h-44 content-between gap-3.5 overflow-hidden rounded-[1.375rem] border border-white/20 bg-[linear-gradient(135deg,#1d4ed8_0%,#6d28d9_55%,#be185d_100%)] p-5 text-white shadow-[0_30px_60px_-20px_rgb(109_40_217/0.7)] before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(60%_50%_at_80%_10%,rgb(255_255_255/0.35),transparent_60%),repeating-linear-gradient(115deg,rgb(255_255_255/0.05)_0_2px,transparent_2px_9px)] md:min-h-[14.375rem]">
      <div className="flex items-center justify-between gap-2.5">
        <small className="text-[0.66rem] font-bold tracking-[0.16em] uppercase opacity-80">
          {titulo}
        </small>
        <img src="/marca/marca.webp" alt="" width={39} height={30} className="h-7.5 w-auto" />
      </div>
      <div className="grid gap-1">
        <strong
          className="font-titulo text-[clamp(2.125rem,8vw,2.75rem)] leading-none font-extrabold tabular-nums"
          data-prueba="saldo"
        >
          {usd(saldoUsd)}
        </strong>
        {equivalente && (
          <small className="text-[0.8rem] font-medium opacity-85">
            ≈ {equivalente} con la tasa de hoy
          </small>
        )}
      </div>
      <div className="flex items-center justify-between gap-2.5">
        <small className="text-[0.66rem] font-bold tracking-[0.16em] whitespace-nowrap uppercase opacity-80">
          {pie}
        </small>
        {enRevision > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/25 px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
            <i
              className="size-[7px] animate-pulse rounded-full bg-[#a5f3fc] shadow-[0_0_8px_#22d3ee]"
              aria-hidden="true"
            />
            {enRevision === 1 ? '1 recarga en revisión' : `${enRevision} recargas en revisión`}
          </span>
        ) : (
          <small className="truncate text-[0.66rem] font-bold tracking-[0.16em] uppercase opacity-80">
            {nombre}
          </small>
        )}
      </div>
    </div>
  );
}

function Cabecera({
  datos,
  moneda,
  faltante,
  rechazada,
  onRecargar,
  onReenviar,
}: {
  datos: DatosBilletera;
  moneda: Moneda;
  faltante: number;
  rechazada: RecargaVista | null;
  onRecargar: () => void;
  onReenviar: (r: RecargaVista) => void;
}) {
  const { billetera, pedido, revendedor } = datos;
  const enRevision = billetera.recargasPorEstado.en_revision;
  // Equivalente del saldo: en la moneda elegida o, si es dólares, en bolívares.
  const monedaEq: Moneda = moneda === 'USD' ? 'VES' : moneda;
  const tasaEq = tasaDe(monedaEq, datos.tasas);
  const { entradasUsd, salidasUsd } = billetera.ultimos30Dias;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4.5 md:grid-cols-2 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:gap-5.5">
      <TarjetaSaldo
        titulo="Saldo disponible"
        saldoUsd={billetera.saldoUsd}
        equivalente={
          tasaEq && Number(billetera.saldoUsd) > 0
            ? formatearMonto(aMoneda(Number(billetera.saldoUsd), monedaEq, tasaEq), monedaEq)
            : null
        }
        pie={revendedor ? 'Saldo revendedor · USD' : 'NV · USD'}
        nombre={revendedor?.nombreComercial ?? datos.nombre}
        enRevision={enRevision}
      />

      <div className="grid content-start gap-3">
        {pedido && (
          <Banda
            tono="aviso"
            icono={<ShoppingCart />}
            titulo={`Pedido ${pedido.numero} por pagar`}
            accion={
              <Link href={`/cuenta/carrito/${pedido.id}`} className={claseEnlace}>
                Ver pedido
              </Link>
            }
          >
            {faltante > 0
              ? `Te faltan ${usd(faltante)}. Recarga y lo pagamos cuando el equipo confirme.`
              : 'Tu saldo ya alcanza para pagarlo desde el pedido.'}
          </Banda>
        )}
        {rechazada && (
          <Banda
            tono="peligro"
            icono={<X />}
            titulo={
              <>
                Rechazamos tu recarga{' '}
                <span className="whitespace-nowrap">{rechazada.referencia}</span>
              </>
            }
            accion={
              <button type="button" className={claseEnlace} onClick={() => onReenviar(rechazada)}>
                Enviar de nuevo
              </button>
            }
          >
            {rechazada.motivoRechazo ?? 'Revisa los datos del pago y envíala de nuevo.'}
          </Banda>
        )}
        {billetera.totalMovimientos > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['Entró en 30 días', `+${usd(entradasUsd)}`, true],
              ['Gastaste en 30 días', usd(salidasUsd), false],
            ].map(([etiqueta, valor, mas]) => (
              <div
                key={String(etiqueta)}
                className="grid min-w-0 gap-1 rounded-[1.125rem] border border-borde bg-[rgb(10_14_32/0.6)] p-3.5"
              >
                <span className="truncate text-[0.78rem] text-tinta-suave">{etiqueta}</span>
                <b
                  className={clsx(
                    'font-titulo text-[1.375rem] font-extrabold whitespace-nowrap tabular-nums',
                    mas && 'text-exito',
                  )}
                >
                  {valor}
                </b>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Boton
            tamano="lg"
            className="flex-[1_1_12.5rem]"
            icono={<Plus className="size-4" aria-hidden="true" />}
            disabled={Boolean(revendedor?.bloqueo)}
            title={revendedor?.bloqueo ?? undefined}
            onClick={onRecargar}
          >
            Recargar saldo
          </Boton>
          {revendedor ? (
            <Link href="/revendedor/catalogo" className={claseEnlace}>
              Nueva venta
            </Link>
          ) : (
            <Link href="/catalogo" className={claseEnlace}>
              Usar mi saldo en la tienda
            </Link>
          )}
        </div>
        <p className="text-[0.8rem] text-tinta-tenue">
          {revendedor
            ? 'Con tu saldo activas y renuevas a tus clientes al instante, al precio de tu nivel.'
            : 'Tu saldo está en dólares. Pagas facturas y pedidos completos con él, al instante.'}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── formulario ─────────────────────────── */

/** Cuánto se recarga: un monto rápido, uno escrito o el de una recarga que se reenvía. */
type Monto =
  | { tipo: 'rapido'; usd: string }
  | { tipo: 'otro'; texto: string }
  | { tipo: 'fijo'; monto: string; moneda: Moneda };

interface Reportada {
  recarga: RecargaVista;
}

function validarMonto(
  monto: Monto,
  montoMoneda: string | null,
  moneda: Moneda,
  servidor?: string,
): Validacion {
  if (servidor) return ['mal', servidor];
  if (monto.tipo === 'otro') {
    if (!monto.texto.trim()) return ['mal', 'Elige o escribe cuánto quieres recargar.'];
    const n = normalizarMonto(monto.texto);
    if (!n) return ['mal', 'Usa solo números con hasta 2 decimales, por ejemplo 15.'];
    if (Number(n) <= 0) return ['mal', 'Debe ser mayor que cero.'];
  }
  if (!montoMoneda || Number(montoMoneda) <= 0) {
    return ['mal', `Es muy poco para pagarlo en ${moneda}. Escribe un monto mayor.`];
  }
  return ['ok', 'Monto listo'];
}

/** Paso 3: los datos del método y el formulario del comprobante. */
function Reportar({
  metodo,
  moneda,
  montoMoneda,
  montoUsd,
  montoMal,
  pedidoId,
  maxMb,
  revendedor,
  onIntento,
  onErrorMonto,
  onListo,
}: {
  metodo: MetodoCobroPublico;
  moneda: Moneda;
  /** null: el monto del paso 1 no es válido. */
  montoMoneda: string | null;
  montoUsd: number | null;
  montoMal: boolean;
  pedidoId: string | null;
  maxMb: number;
  revendedor: boolean;
  onIntento: () => void;
  onErrorMonto: (mensaje: string | undefined) => void;
  onListo: (r: RecargaVista) => void;
}) {
  const id = useId();
  const [fecha, setFecha] = useState(hoyLocal);
  const [referencia, setReferencia] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState('');
  const [errorArchivo, setErrorArchivo] = useState('');
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const servidor = erroresPorCampo(error);

  useEffect(() => () => void (vista && URL.revokeObjectURL(vista)), [vista]);

  const filas = partirInstrucciones(metodo.instrucciones);
  const copiable = montoMoneda ? montoParaCopiar(montoMoneda, moneda) : '';
  const todo = [
    ...(filas ? filas.map(([e, v]) => `${e}: ${v}`) : [metodo.instrucciones.trim()]),
    ...(montoMoneda ? [`Monto: ${copiable} ${moneda}`] : []),
  ].join('\n');

  const validar: Record<'fecha' | 'referencia' | 'archivo', () => Validacion> = {
    fecha: () => {
      if (servidor.fechaPago) return ['mal', servidor.fechaPago];
      if (!fecha) return ['mal', 'Elige la fecha del pago.'];
      if (fecha > hoyLocal()) return ['mal', 'La fecha no puede ser futura.'];
      if (fecha < hoyLocal(-90)) {
        return ['mal', 'Tiene más de 90 días. Escríbenos desde Soporte para registrarlo.'];
      }
      return ['ok', 'Fecha lista'];
    },
    referencia: () => {
      if (servidor.referenciaExterna) return ['mal', servidor.referenciaExterna];
      const r = referencia.trim();
      if (!r) {
        return metodo.requiereReferencia
          ? ['mal', 'Escribe el número de referencia del pago.']
          : ['', 'Opcional. Lo ves en el recibo de tu banco.'];
      }
      if (r.length > 80 || !PATRON_REFERENCIA.test(r)) {
        return ['mal', 'Usa letras, números, espacios y # . / - (hasta 80).'];
      }
      return ['ok', 'Referencia lista'];
    },
    archivo: () => {
      if (errorArchivo) return ['mal', errorArchivo];
      if (servidor.comprobante) return ['mal', servidor.comprobante];
      if (!archivo) return ['mal', 'Adjunta la captura o el PDF del pago.'];
      return ['ok', ''];
    },
  };

  function mostrar(campo: keyof typeof validar, ayuda = ''): Validacion {
    const [estado, texto] = validar[campo]();
    const visible = intento || tocados[campo] || (estado !== 'mal' && estado !== '');
    if (!visible) return ['', ayuda];
    return estado === '' ? ['', texto || ayuda] : [estado, texto];
  }
  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }));
  const limpiarServidor = () => {
    setError(null);
    onErrorMonto(undefined);
  };

  function tomarArchivo(f: File | undefined) {
    if (!f) return;
    limpiarServidor();
    tocar('archivo');
    if (!TIPOS_COMPROBANTE.includes(f.type)) {
      return setErrorArchivo('Ese archivo no sirve. Sube una imagen JPG, PNG o WEBP, o un PDF.');
    }
    if (f.size > maxMb * 1048576) {
      return setErrorArchivo(`El archivo pesa ${pesoTexto(f.size)}. El máximo es ${maxMb} MB.`);
    }
    setErrorArchivo('');
    setArchivo(f);
    setVista(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
  }

  function quitarArchivo() {
    setArchivo(null);
    setVista('');
    setErrorArchivo('');
  }

  const campos = ['fecha', 'referencia', 'archivo'] as const;
  const malos = () => campos.filter((c) => validar[c]()[0] === 'mal').length + (montoMal ? 1 : 0);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIntento(true);
    onIntento();
    if (malos() > 0 || !montoMoneda) {
      // El primer campo en rojo, también si es el monto del paso 1.
      requestAnimationFrame(() => {
        const primero = document
          .getElementById(ID_FORMULARIO)
          ?.querySelector<HTMLElement>('[aria-invalid="true"]');
        primero?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        primero?.focus({ preventScroll: true });
      });
      return;
    }
    const d = new FormData();
    d.set('metodoCobroId', metodo.id);
    d.set('moneda', moneda);
    d.set('monto', montoMoneda);
    d.set('fechaPago', fecha);
    if (referencia.trim()) d.set('referenciaExterna', referencia.trim());
    if (pedidoId) d.set('pedidoId', pedidoId);
    d.set('comprobante', archivo as File);
    setCargando(true);
    setError(null);
    const r = await llamarApi<RecargaVista>('POST', `${rutaSaldo(revendedor)}/recargas`, d);
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      const monto = erroresPorCampo(r.error).monto;
      if (monto) onErrorMonto(monto);
      return;
    }
    onListo(r.datos);
  }

  const [eFecha, tFecha] = mostrar('fecha');
  const [eRef, tRef] = mostrar(
    'referencia',
    metodo.requiereReferencia
      ? 'Lo ves en el recibo de tu banco.'
      : 'Opcional. Lo ves en el recibo de tu banco.',
  );
  const [eArchivo, tArchivo]: Validacion =
    intento || tocados.archivo ? validar.archivo() : ['', ''];
  const cantidadMalos = intento ? malos() : 0;
  const deCampo = ['monto', 'fechaPago', 'referenciaExterna', 'comprobante'].some(
    (c) => servidor[c],
  );
  const otroError = error && !deCampo ? error : null;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Titulillo>Paso 1 · Paga con estos datos</Titulillo>
        <div className="grid overflow-hidden rounded-2xl border border-borde-fuerte bg-hundida/70">
          {filas ? (
            filas.map(([etiqueta, valor]) => (
              <div
                key={etiqueta}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b border-borde px-3.5 py-2.5"
              >
                <span className="grid min-w-0">
                  <span className="text-xs text-tinta-suave">{etiqueta}</span>
                  <b className="font-semibold break-words tabular-nums">{valor}</b>
                </span>
                <BotonCopiar texto={valor} etiqueta={etiqueta.toLowerCase()} />
              </div>
            ))
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 border-b border-borde px-3.5 py-3">
              <p className="text-sm break-words whitespace-pre-line">{metodo.instrucciones}</p>
              <BotonCopiar texto={metodo.instrucciones.trim()} etiqueta="los datos" />
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2.5">
            <span className="grid min-w-0">
              <span className="text-xs text-tinta-suave">Monto exacto</span>
              <b className="font-titulo text-xl font-extrabold tabular-nums">
                {montoMoneda ? formatearMonto(montoMoneda, moneda) : '—'}
              </b>
            </span>
            {montoMoneda && <BotonCopiar texto={copiable} etiqueta="monto exacto" />}
          </div>
          {filas && filas.length > 1 && (
            <div className="flex justify-end border-t border-borde bg-marca-suave/40 px-3.5 py-2">
              <CopiarTodo texto={todo} />
            </div>
          )}
        </div>
      </div>

      <form onSubmit={enviar} noValidate className="grid gap-4" aria-label="Reportar la recarga">
        <Titulillo>Paso 2 · Cuéntanos cómo pagaste</Titulillo>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <label htmlFor={`${id}-fecha`} className="text-sm font-semibold">
              Fecha del pago
            </label>
            <input
              id={`${id}-fecha`}
              type="date"
              max={hoyLocal()}
              min={hoyLocal(-90)}
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                tocar('fecha');
                limpiarServidor();
              }}
              aria-invalid={eFecha === 'mal' ? true : undefined}
              aria-describedby={`${id}-fecha-m`}
              className={claseEntrada(eFecha)}
            />
            <Mensaje id={`${id}-fecha-m`} estado={eFecha} texto={tFecha} />
          </div>
          <div className="grid content-start gap-1.5">
            <label htmlFor={`${id}-ref`} className="text-sm font-semibold">
              {metodo.requiereReferencia ? 'Número de referencia' : 'Referencia (opcional)'}
            </label>
            <input
              id={`${id}-ref`}
              autoComplete="off"
              maxLength={80}
              placeholder="Ej.: 00123456"
              value={referencia}
              onChange={(e) => {
                setReferencia(e.target.value);
                limpiarServidor();
              }}
              onBlur={() => tocar('referencia')}
              aria-invalid={eRef === 'mal' ? true : undefined}
              aria-describedby={`${id}-ref-m`}
              className={claseEntrada(eRef)}
            />
            <Mensaje id={`${id}-ref-m`} estado={eRef} texto={tRef} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <span id={`${id}-comp`} className="text-sm font-semibold">
            Comprobante
          </span>
          <CampoComprobante
            id={`${id}-comp`}
            archivo={archivo}
            vista={vista}
            mal={eArchivo === 'mal'}
            maxMb={maxMb}
            onArchivo={tomarArchivo}
            onQuitar={quitarArchivo}
          />
          <Mensaje id={`${id}-comp-m`} estado={eArchivo} texto={tArchivo} />
        </div>

        {cantidadMalos > 0 && (
          <p role="alert" className="flex items-center gap-2 text-sm font-medium text-peligro">
            <X className="size-4 shrink-0" aria-hidden="true" />
            {cantidadMalos === 1
              ? 'Revisa el campo marcado en rojo.'
              : `Revisa los ${cantidadMalos} campos marcados en rojo.`}
          </p>
        )}
        {otroError && (
          <MensajeError
            error={otroError}
            extra={
              otroError.codigo === 'PEDIDO_NO_PENDIENTE'
                ? 'Desmarca la casilla del pedido y envíala de nuevo.'
                : otroError.estado === 0 || otroError.estado >= 500
                  ? 'Tus datos siguen aquí: inténtalo de nuevo.'
                  : undefined
            }
          />
        )}
        <div className="grid gap-2">
          <Boton
            type="submit"
            tamano="lg"
            className="w-full"
            cargando={cargando}
            icono={<Send className="size-4" aria-hidden="true" />}
          >
            {cargando
              ? 'Enviando recarga…'
              : montoMoneda
                ? `Reportar recarga de ${formatearMonto(montoMoneda, moneda)}`
                : 'Reportar recarga'}
          </Boton>
          <p className="text-center text-xs text-tinta-tenue">
            {montoUsd !== null && moneda !== 'USD' ? `Unos ${usd(montoUsd)} de saldo. ` : ''}
            El saldo aparece cuando el equipo confirma el pago.
            {revendedor ? '' : ' Te avisamos por correo.'}
          </p>
        </div>
      </form>
    </div>
  );
}

/** Recarga enviada: el código real y lo que pasa después. */
function Listo({ recarga, onOtra }: { recarga: RecargaVista; onOtra: () => void }) {
  const pedido = 'pedido' in recarga ? recarga.pedido : null;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    ref.current?.focus({ preventScroll: true });
  }, []);
  const tasa =
    recarga.moneda === 'USD'
      ? ''
      : ` · tasa fijada: 1 USD = ${formatearMonto(recarga.tasa, recarga.moneda)}`;
  return (
    <section
      ref={ref}
      id={ID_FORMULARIO}
      tabIndex={-1}
      aria-labelledby="titulo-recarga-lista"
      aria-live="polite"
      className="grid scroll-mt-24 gap-4 rounded-3xl border border-exito/35 bg-[radial-gradient(70%_60%_at_50%_0%,rgb(34_197_94/0.1),transparent_70%),linear-gradient(180deg,rgb(15_21_48/0.8),rgb(8_11_26/0.9))] p-4.5 outline-none sm:p-5.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-recarga-lista" className="flex items-center gap-2 text-[1.15rem]">
          <Check className="size-5 text-exito" aria-hidden="true" /> Recibimos tu recarga
        </h2>
        <span
          aria-label={`Código de la recarga ${recarga.referencia}`}
          className="rounded-[0.625rem] border border-dashed border-borde-fuerte bg-hundida px-3 py-1.5 font-titulo text-[0.95rem] font-bold tracking-[0.06em]"
        >
          {recarga.referencia}
        </span>
      </div>
      <p className="text-sm text-tinta-suave">
        Guarda este código por si necesitas escribirnos.{' '}
        {'revendedor' in recarga
          ? 'La verás confirmada en Tus recargas.'
          : 'Te avisamos por correo cuando se acredite.'}
      </p>
      <LineaTiempo
        etiqueta="Estado de la recarga"
        pasos={[
          {
            estado: 'hecho',
            titulo: 'Recarga reportada',
            texto: `${recarga.metodo.nombre} · ${formatearMonto(recarga.montoDeclarado, recarga.moneda)}${tasa}`,
          },
          {
            estado: 'ahora',
            titulo: 'El equipo la está revisando',
            texto: 'Comparamos el monto y la referencia con lo recibido',
          },
          {
            estado: 'luego',
            titulo: `Saldo acreditado: +${usd(recarga.montoUsdEstimado)}`,
            texto: pedido
              ? `Y pagamos tu pedido ${pedido.numero} con ese saldo`
              : 'Lo ves arriba y en tus movimientos',
          },
        ]}
      />
      <Boton variante="secundario" tamano="lg" className="w-full" onClick={onOtra}>
        Hacer otra recarga
      </Boton>
    </section>
  );
}

/* ─────────────────────────────── listas ─────────────────────────────── */

interface Lista<T> {
  filtro: string;
  elementos: T[];
  total: number;
  pagina: number;
}

/**
 * Lista paginada con filtro que se pide a la API desde el navegador. La primera
 * página sin filtro llega del servidor; «Ver más» pide la siguiente página.
 */
function useListaPaginada<T>(
  inicial: Pagina<T>,
  filtroInicial: string,
  ruta: (filtro: string, pagina: number) => string,
) {
  const [lista, setLista] = useState<Lista<T>>({
    filtro: filtroInicial,
    elementos: inicial.elementos,
    total: inicial.total,
    pagina: inicial.pagina,
  });
  const [cargando, setCargando] = useState<'filtro' | 'mas' | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const peticion = useRef(0);
  const ultima = useRef({ filtro: filtroInicial, pagina: 1 });

  async function pedir(filtro: string, pagina: number) {
    const n = ++peticion.current;
    ultima.current = { filtro, pagina };
    setCargando(pagina === 1 ? 'filtro' : 'mas');
    setError(null);
    const r = await llamarApi<Pagina<T>>('GET', ruta(filtro, pagina));
    if (n !== peticion.current) return;
    setCargando(null);
    if (!r.ok) return setError(r.error);
    setLista((l) => ({
      filtro,
      elementos: pagina === 1 ? r.datos.elementos : [...l.elementos, ...r.datos.elementos],
      total: r.datos.total,
      pagina,
    }));
  }

  function filtrar(filtro: string) {
    if (filtro === lista.filtro && !error) return;
    if (filtro === filtroInicial) {
      peticion.current++;
      setCargando(null);
      setError(null);
      return setLista({ filtro, ...inicial });
    }
    setLista({ filtro, elementos: [], total: 0, pagina: 1 });
    void pedir(filtro, 1);
  }

  const reintentar = () => void pedir(ultima.current.filtro, ultima.current.pagina);
  const verMas = () => void pedir(lista.filtro, lista.pagina + 1);
  const hayMas = lista.elementos.length < lista.total;
  return { lista, cargando, error, filtrar, verMas, reintentar, hayMas };
}

function Chips<K extends string>({
  opciones,
  actual,
  etiqueta,
  onElegir,
}: {
  opciones: [K, string][];
  actual: string;
  etiqueta: string;
  onElegir: (k: K) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map(([k, texto]) => (
        <button
          key={k}
          type="button"
          className="chip"
          aria-pressed={actual === k}
          onClick={() => onElegir(k)}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2.5 rounded-[1.25rem] border-[1.5px] border-dashed border-borde-fuerte px-4 py-6.5 text-center text-sm text-tinta-suave">
      {children}
    </div>
  );
}

function ErrorLista({ error, onReintentar }: { error: ErrorLlamada; onReintentar: () => void }) {
  return (
    <div className="grid gap-2">
      <MensajeError error={error} />
      <Boton
        variante="secundario"
        tamano="sm"
        className="justify-self-start"
        onClick={onReintentar}
      >
        Intentar de nuevo
      </Boton>
    </div>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <p role="status" className="flex items-center gap-2 px-1 py-3 text-sm text-tinta-suave">
      <LoaderCircle className="size-4 animate-spin text-cian" aria-hidden="true" /> {texto}
    </p>
  );
}

function Seccion({
  id,
  titulo,
  nota,
  children,
}: {
  id: string;
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="text-[clamp(1.25rem,2.6vw,1.6rem)]">
          {titulo}
        </h2>
        {nota && <span className="text-[0.8rem] text-tinta-tenue">{nota}</span>}
      </header>
      {children}
    </section>
  );
}

const ESTADO_RECARGA: Record<EstadoRecarga, [string, TonoEstado, ReactNode, string]> = {
  en_revision: ['En revisión', 'cian', <Clock key="r" />, '#22d3ee'],
  confirmada: ['Confirmada', 'exito', <Check key="c" />, '#22c55e'],
  rechazada: ['Rechazada', 'peligro', <X key="x" />, '#ef4444'],
};

type FiltroRecargas = 'todas' | EstadoRecarga;

function ListaRecargas({
  inicial,
  conteo,
  revendedor,
  onReenviar,
}: {
  inicial: Pagina<RecargaVista>;
  conteo: Record<EstadoRecarga, number>;
  revendedor: boolean;
  onReenviar: (r: RecargaVista) => void;
}) {
  const base = rutaSaldo(revendedor);
  const { lista, cargando, error, filtrar, verMas, reintentar, hayMas } = useListaPaginada(
    inicial,
    'todas',
    (f, pagina) =>
      `${base}/recargas?porPagina=${inicial.porPagina}&pagina=${pagina}${f === 'todas' ? '' : `&estado=${f}`}`,
  );
  const total = conteo.en_revision + conteo.confirmada + conteo.rechazada;
  const opciones: [FiltroRecargas, string][] = [
    ['todas', `Todas · ${total}`],
    ['en_revision', `En revisión · ${conteo.en_revision}`],
    ['confirmada', `Confirmadas · ${conteo.confirmada}`],
    ['rechazada', `Rechazadas · ${conteo.rechazada}`],
  ];

  let cuerpo: ReactNode;
  if (total === 0) {
    cuerpo = (
      <Vacio>
        <span
          className="orbe orbe-sm"
          style={{ '--c': '#a855f7' } as CSSProperties}
          aria-hidden="true"
        >
          <Wallet />
        </span>
        <b className="text-tinta">Todavía no has recargado</b>
        <span>Tu primera recarga aparece aquí con su estado.</span>
      </Vacio>
    );
  } else if (cargando === 'filtro') {
    cuerpo = <Cargando texto="Cargando recargas…" />;
  } else if (error && cargando === null && lista.elementos.length === 0) {
    cuerpo = <ErrorLista error={error} onReintentar={reintentar} />;
  } else if (lista.elementos.length === 0) {
    cuerpo = (
      <Vacio>
        No hay recargas con ese estado.
        <button type="button" className={claseEnlace} onClick={() => filtrar('todas')}>
          Ver todas
        </button>
      </Vacio>
    );
  } else {
    cuerpo = (
      <>
        <ul className="grid gap-2.5">
          {lista.elementos.map((r) => {
            const [texto, tono, icono, color] = ESTADO_RECARGA[r.estado];
            return (
              <li
                key={r.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[1.125rem] border border-borde bg-[rgb(10_14_32/0.6)] px-3.5 py-3"
              >
                <span
                  className="orbe orbe-sm after:hidden"
                  style={{ '--c': color } as CSSProperties}
                  aria-hidden="true"
                >
                  {icono}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <b className="truncate text-[0.9rem] tabular-nums">
                    {formatearMonto(r.montoRecibido ?? r.montoDeclarado, r.moneda)} ·{' '}
                    {r.metodo.nombre}
                  </b>
                  <small className="text-[0.78rem] text-tinta-suave">
                    {r.estado === 'confirmada' && r.montoUsd
                      ? `Acreditado: +${usd(r.montoUsd)}`
                      : `Estimado: +${usd(r.montoUsdEstimado)}`}{' '}
                    · <Fecha iso={r.creadoEn} /> · código {r.referencia}
                    {r.referenciaExterna ? ` · ref. ${r.referenciaExterna}` : ''}
                    {'pedido' in r && r.pedido ? ` · para el pedido ${r.pedido.numero}` : ''}
                  </small>
                  {r.estado === 'rechazada' && r.motivoRechazo && (
                    <small className="text-[0.78rem] text-peligro">Motivo: {r.motivoRechazo}</small>
                  )}
                </div>
                <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <PildoraEstado texto={texto} tono={tono} />
                  {r.estado === 'rechazada' && (
                    <button
                      type="button"
                      className="text-[0.8rem] font-semibold text-cian hover:underline"
                      onClick={() => onReenviar(r)}
                    >
                      Enviar de nuevo
                    </button>
                  )}
                  {r.tieneComprobante && (
                    <a
                      href={`/api/v1${base}/recargas/${r.id}/comprobante`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-[0.8rem] font-medium text-cian hover:underline"
                    >
                      <FileText className="size-3.5" aria-hidden="true" /> Ver comprobante
                      <span className="sr-only">(se abre en una pestaña nueva)</span>
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {error && <ErrorLista error={error} onReintentar={reintentar} />}
        {hayMas && !error && (
          <Boton
            variante="secundario"
            className="justify-self-center"
            cargando={cargando === 'mas'}
            onClick={verMas}
          >
            {cargando === 'mas' ? 'Cargando…' : 'Ver más recargas'}
          </Boton>
        )}
      </>
    );
  }

  return (
    <Seccion id="titulo-recargas" titulo="Tus recargas">
      {total > 0 && (
        <Chips
          etiqueta="Filtrar recargas por estado"
          opciones={opciones}
          actual={lista.filtro}
          onElegir={filtrar}
        />
      )}
      <div aria-busy={cargando !== null || undefined} className="grid gap-3">
        {cuerpo}
      </div>
    </Seccion>
  );
}

type TipoMovimiento = TipoMovimientoBilletera | TipoMovimientoSaldo;
type FiltroMovimientos = 'todos' | TipoMovimiento;

const TIPO_MOVIMIENTO: Record<TipoMovimiento, [string, string, ReactNode]> = {
  recarga: [
    'Recarga confirmada',
    'border-exito/40 bg-exito/[0.08] text-exito',
    <Plus key="r" className="size-4" />,
  ],
  pago: [
    'Pago de factura',
    'border-peligro/35 bg-peligro/[0.06] text-peligro',
    <ShoppingCart key="p" className="size-4" />,
  ],
  ajuste: [
    'Ajuste del equipo',
    'border-violeta/40 bg-violeta/[0.08] text-violeta',
    <Sparkles key="a" className="size-4" />,
  ],
  compra: [
    'Compra',
    'border-peligro/35 bg-peligro/[0.06] text-peligro',
    <ShoppingCart key="c" className="size-4" />,
  ],
  reembolso: [
    'Reembolso',
    'border-exito/40 bg-exito/[0.08] text-exito',
    <RotateCcw key="e" className="size-4" />,
  ],
};

/** «Activación · NV Cine · Mensual» para una compra; el nombre del tipo para lo demás. */
function tituloMovimiento(m: MovimientoVista): string {
  if ('compra' in m && m.compra) {
    if (m.tipo === 'reembolso') return `Reembolso · ${m.compra.plan}`;
    return `${m.compra.tipo === 'renovacion' ? 'Renovación' : 'Activación'} · ${m.compra.plan}`;
  }
  return TIPO_MOVIMIENTO[m.tipo][0];
}

function ListaMovimientos({
  inicial,
  totalMovimientos,
  revendedor,
}: {
  inicial: Pagina<MovimientoVista>;
  totalMovimientos: number;
  revendedor: boolean;
}) {
  const { lista, cargando, error, filtrar, verMas, reintentar, hayMas } = useListaPaginada(
    inicial,
    'todos',
    (f, pagina) =>
      `${rutaSaldo(revendedor)}/movimientos?porPagina=${inicial.porPagina}&pagina=${pagina}${f === 'todos' ? '' : `&tipo=${f}`}`,
  );
  const opciones: [FiltroMovimientos, string][] = revendedor
    ? [
        ['todos', 'Todos'],
        ['recarga', 'Recargas'],
        ['compra', 'Compras'],
        ['reembolso', 'Reembolsos'],
        ['ajuste', 'Ajustes'],
      ]
    : [
        ['todos', 'Todos'],
        ['recarga', 'Recargas'],
        ['pago', 'Pagos'],
        ['ajuste', 'Ajustes'],
      ];

  let cuerpo: ReactNode;
  if (totalMovimientos === 0) {
    cuerpo = (
      <Vacio>
        Sin movimientos todavía. Cuando recargues o {revendedor ? 'compres' : 'pagues'} con tu
        saldo, lo verás aquí.
      </Vacio>
    );
  } else if (cargando === 'filtro') {
    cuerpo = <Cargando texto="Cargando movimientos…" />;
  } else if (error && cargando === null && lista.elementos.length === 0) {
    cuerpo = <ErrorLista error={error} onReintentar={reintentar} />;
  } else if (lista.elementos.length === 0) {
    cuerpo = <Vacio>No hay movimientos de ese tipo.</Vacio>;
  } else {
    cuerpo = (
      <>
        <ul className="grid overflow-hidden rounded-[1.25rem] border border-borde bg-[rgb(10_14_32/0.6)]">
          {lista.elementos.map((m) => {
            const [, clases, icono] = TIPO_MOVIMIENTO[m.tipo];
            const titulo = tituloMovimiento(m);
            const positivo = Number(m.montoUsd) > 0;
            return (
              <li
                key={m.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 [&+&]:border-t [&+&]:border-borde"
              >
                <span
                  className={clsx('grid size-9 place-items-center rounded-xl border', clases)}
                  aria-hidden="true"
                >
                  {icono}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <b className="truncate text-[0.88rem] font-semibold">{titulo}</b>
                  <small className="truncate text-[0.78rem] text-tinta-suave">
                    <Fecha iso={m.creadoEn} /> ·{' '}
                    {'compra' in m && m.compra ? (
                      m.tipo === 'reembolso' && m.motivo ? (
                        m.motivo
                      ) : (
                        m.compra.cliente
                      )
                    ) : 'factura' in m && m.factura ? (
                      <Link
                        href={`/cuenta/facturas/${m.factura.id}`}
                        className="text-cian hover:underline"
                      >
                        Factura {m.factura.numero}
                      </Link>
                    ) : m.recarga ? (
                      `Recarga ${m.recarga.referencia}`
                    ) : (
                      m.motivo
                    )}
                  </small>
                </div>
                <div className="grid justify-items-end gap-0.5 tabular-nums">
                  <strong
                    className={clsx(
                      'font-titulo text-[0.95rem] font-bold whitespace-nowrap',
                      positivo && 'text-exito',
                    )}
                  >
                    {positivo ? '+' : '−'}
                    {usd(Math.abs(Number(m.montoUsd)))}
                  </strong>
                  <span className="text-[0.72rem] whitespace-nowrap text-tinta-tenue">
                    Saldo {usd(m.saldoResultanteUsd)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {error && <ErrorLista error={error} onReintentar={reintentar} />}
        {hayMas && !error && (
          <Boton
            variante="secundario"
            className="justify-self-center"
            cargando={cargando === 'mas'}
            onClick={verMas}
          >
            {cargando === 'mas' ? 'Cargando…' : 'Ver más movimientos'}
          </Boton>
        )}
      </>
    );
  }

  return (
    <Seccion
      id="titulo-movimientos"
      titulo="Movimientos"
      nota={
        revendedor
          ? 'Cada recarga, compra, reembolso o ajuste con el saldo que quedó'
          : 'Cada recarga, pago o ajuste con el saldo que quedó'
      }
    >
      {totalMovimientos > 0 && (
        <Chips
          etiqueta="Filtrar movimientos por tipo"
          opciones={opciones}
          actual={lista.filtro}
          onElegir={filtrar}
        />
      )}
      <div aria-busy={cargando !== null || undefined} className="grid gap-3">
        {cuerpo}
      </div>
    </Seccion>
  );
}

/* ─────────────────────────────── página ─────────────────────────────── */

/** Página «Tu billetera»: saldo, recarga en tres pasos, recargas y movimientos. */
export function VistaBilletera({ datos }: { datos: DatosBilletera }) {
  const router = useRouter();
  const notificar = useNotificar();
  const { billetera, pedido, metodos, tasas } = datos;
  const revendedor = datos.revendedor ?? null;

  // Solo las monedas de los métodos activos que tienen tasa hoy.
  const monedas = [...new Set(metodos.map((m) => m.moneda))].filter((m) => tasaDe(m, tasas));
  const monedaInicial = monedas.includes(datos.monedaSugerida)
    ? datos.monedaSugerida
    : monedas.includes('VES')
      ? 'VES'
      : (monedas[0] ?? 'USD');
  const faltante = pedido
    ? Math.max(0, Number(pedido.pendienteUsd) - Number(billetera.saldoUsd))
    : 0;
  const montoFaltante = faltante > 0 ? faltante.toFixed(2) : null;

  const [moneda, setMoneda] = useState<Moneda>(monedaInicial);
  const [monto, setMonto] = useState<Monto>({ tipo: 'rapido', usd: montoFaltante ?? '10.00' });
  const [metodoId, setMetodoId] = useState<string | null>(null);
  const [ligar, setLigar] = useState(true);
  const [intento, setIntento] = useState(false);
  const [tocadoMonto, setTocadoMonto] = useState(false);
  const [errorMonto, setErrorMonto] = useState<string | undefined>();
  const [listo, setListo] = useState<Reportada | null>(null);
  const [version, setVersion] = useState(0);
  const [barra, setBarra] = useState({ enFormulario: false, enAccion: false });
  const idMonto = useId();

  const tasa = tasaDe(moneda, tasas);
  const deMoneda = metodos.filter((m) => m.moneda === moneda);
  const metodo = deMoneda.find((m) => m.id === metodoId) ?? null;

  // Lo que se paga (en la moneda elegida) y lo que se recibe de saldo (USD), estimados.
  let montoUsd: number | null = null;
  let montoMoneda: string | null = null;
  if (tasa) {
    if (monto.tipo === 'fijo') {
      montoMoneda = monto.monto;
      montoUsd = Number(monto.monto) / Number(tasa);
    } else {
      const n = monto.tipo === 'rapido' ? monto.usd : normalizarMonto(monto.texto);
      if (n && Number(n) > 0) {
        montoUsd = Number(n);
        const m = aMoneda(montoUsd, moneda, tasa);
        montoMoneda = Number(m) > 0 ? m : null;
      }
    }
  }
  const [eMonto, tMonto] = validarMonto(monto, montoMoneda, moneda, errorMonto);
  const montoMal = eMonto === 'mal';
  // Validación en vivo al escribir; el error de un campo vacío, al salir o al enviar.
  const escrito = monto.tipo === 'otro' && monto.texto.trim() !== '';
  const [eVisible, tVisible]: Validacion =
    ((intento || tocadoMonto || Boolean(errorMonto)) && montoMal) || escrito
      ? [eMonto, tMonto]
      : monto.tipo === 'fijo'
        ? ['', `Mismo monto que reportaste: ${formatearMonto(monto.monto, monto.moneda)}.`]
        : ['', 'Escríbelo si no está arriba.'];

  // La barra del teléfono solo aparece mientras el formulario está en pantalla.
  useEffect(() => {
    const form = document.getElementById(ID_FORMULARIO);
    const accion = document.getElementById(ID_ACCION);
    const obs: IntersectionObserver[] = [];
    if (form) {
      const o = new IntersectionObserver(
        ([e]) => setBarra((b) => ({ ...b, enFormulario: Boolean(e?.isIntersecting) })),
        { rootMargin: '-45% 0px -45% 0px' },
      );
      o.observe(form);
      obs.push(o);
    }
    if (accion) {
      const o = new IntersectionObserver(
        ([e]) =>
          setBarra((b) => ({
            ...b,
            enAccion: Boolean(e?.isIntersecting && e.intersectionRatio > 0.35),
          })),
        { threshold: [0, 0.35, 1] },
      );
      o.observe(accion);
      obs.push(o);
    }
    return () => obs.forEach((o) => o.disconnect());
  }, [listo]);

  function elegirMoneda(m: Moneda) {
    setMoneda(m);
    setErrorMonto(undefined);
    if (monto.tipo === 'fijo' && m !== monto.moneda) {
      // La recarga que se reenviaba era en otra moneda: se pasa a su valor en dólares.
      setMonto({ tipo: 'otro', texto: montoUsd ? montoUsd.toFixed(2) : '' });
    }
    if (metodo && metodo.moneda !== m) setMetodoId(null);
  }

  function elegirMetodo(id: string) {
    setMetodoId(id);
    if (!window.matchMedia('(min-width: 80rem)').matches) setTimeout(() => irA(ID_ACCION), 60);
  }

  function reenviar(r: RecargaVista) {
    setListo(null);
    setIntento(false);
    setErrorMonto(undefined);
    setVersion((v) => v + 1);
    if (!monedas.includes(r.moneda)) {
      notificar(`Hoy no se puede recargar en ${r.moneda}. Elige otra moneda.`, 'error');
      return setTimeout(() => irA(ID_FORMULARIO), 60);
    }
    setMoneda(r.moneda);
    setMonto({ tipo: 'fijo', monto: r.montoDeclarado, moneda: r.moneda });
    if (pedido && 'pedido' in r && r.pedido?.id === pedido.id) setLigar(true);
    const activo = metodos.some((m) => m.id === r.metodo.id);
    setMetodoId(activo ? r.metodo.id : null);
    notificar(
      activo
        ? 'Corrige el dato y envíala de nuevo con el comprobante.'
        : 'Ese método ya no está disponible: elige otro para enviarla de nuevo.',
      'info',
    );
    setTimeout(() => irA(activo ? ID_ACCION : ID_METODO), 80);
  }

  function reportada(r: RecargaVista) {
    setListo({ recarga: r });
    setIntento(false);
    setTocadoMonto(false);
    notificar(`Recarga reportada. Tu código es ${r.referencia}.`, 'exito');
    router.refresh();
  }

  function otraRecarga() {
    setListo(null);
    setMetodoId(null);
    setMonto({ tipo: 'rapido', usd: '10.00' });
    setVersion((v) => v + 1);
    setTimeout(() => irA(ID_FORMULARIO), 60);
  }

  // Recarga rechazada más reciente, si todavía no se envió otra después.
  const ultima = datos.recargas.elementos[0];
  const rechazada = ultima?.estado === 'rechazada' ? ultima : null;
  const pedidoId = pedido && ligar ? pedido.id : null;

  let formulario: ReactNode;
  if (revendedor?.bloqueo) {
    formulario = (
      <section id={ID_FORMULARIO} className="grid gap-3">
        <h2 className="text-[clamp(1.25rem,2.6vw,1.6rem)]">Recargar saldo</h2>
        <Vacio>Mientras tu cuenta esté suspendida no puedes recargar.</Vacio>
      </section>
    );
  } else if (listo) {
    formulario = <Listo recarga={listo.recarga} onOtra={otraRecarga} />;
  } else if (monedas.length === 0) {
    formulario = (
      <section id={ID_FORMULARIO} className="grid gap-3">
        <h2 className="text-[clamp(1.25rem,2.6vw,1.6rem)]">Recargar saldo</h2>
        <p className="rounded-xl border border-aviso/35 bg-aviso-suave px-3.5 py-3 text-sm">
          {revendedor ? (
            'Por ahora no hay formas de recargar. Escribe al equipo de NV y te ayudamos.'
          ) : (
            <>
              Por ahora no hay formas de recargar. Escríbenos desde{' '}
              <Link href="/cuenta/soporte/nueva" className="font-semibold underline">
                Soporte
              </Link>{' '}
              y te ayudamos.
            </>
          )}
        </p>
      </section>
    );
  } else {
    const chips = [
      ...MONTOS_RAPIDOS.map((v) => ({ v, falta: false })),
      ...(montoFaltante && !MONTOS_RAPIDOS.includes(montoFaltante)
        ? [{ v: montoFaltante, falta: true }]
        : []),
    ];
    formulario = (
      <div id={ID_FORMULARIO} className="grid scroll-mt-24 gap-4">
        <header className="grid gap-1">
          <h2 className="text-[clamp(1.25rem,2.6vw,1.6rem)]">Recargar saldo</h2>
          <p className="text-[0.85rem] text-tinta-suave">
            Pagas primero y luego nos envías el comprobante.
          </p>
        </header>

        <BloquePago numero={1} titulo="¿Cuánto quieres recargar?">
          <div
            role="group"
            aria-label="Montos rápidos"
            className="grid grid-cols-3 gap-2 sm:grid-cols-5"
          >
            {chips.map(({ v, falta }) => {
              const elegido = monto.tipo === 'rapido' && monto.usd === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => {
                    setMonto({ tipo: 'rapido', usd: v });
                    setErrorMonto(undefined);
                  }}
                  className={clsx(
                    'grid min-w-0 justify-items-center gap-0.5 rounded-[0.875rem] border px-1.5 py-3 transition-colors',
                    elegido
                      ? 'border-marca bg-marca-suave shadow-[inset_0_0_0_1px_var(--nv-marca)]'
                      : falta
                        ? 'border-aviso/50 bg-hundida/50 hover:border-aviso'
                        : 'border-borde-fuerte bg-hundida/50 hover:border-marca/60',
                  )}
                >
                  <b className="font-titulo text-[1.05rem] whitespace-nowrap">{usd(v)}</b>
                  <span
                    className={clsx(
                      'max-w-full truncate text-[0.72rem]',
                      falta ? 'text-aviso' : 'text-tinta-suave',
                    )}
                  >
                    {falta
                      ? 'Lo que falta'
                      : tasa
                        ? formatearMonto(aMoneda(Number(v), moneda, tasa), moneda)
                        : ''}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor={idMonto} className="text-sm font-semibold">
              Otro monto en dólares
            </label>
            <input
              id={idMonto}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej.: 15"
              value={monto.tipo === 'otro' ? monto.texto : ''}
              onChange={(e) => {
                setMonto({ tipo: 'otro', texto: e.target.value });
                setErrorMonto(undefined);
              }}
              onBlur={() => setTocadoMonto(true)}
              aria-invalid={eVisible === 'mal' ? true : undefined}
              aria-describedby={`${idMonto}-m`}
              className={claseEntrada(monto.tipo === 'otro' || eVisible === 'mal' ? eVisible : '')}
            />
            <Mensaje id={`${idMonto}-m`} estado={eVisible} texto={tVisible} />
          </div>

          <div className="grid gap-2">
            <Titulillo>Vas a pagar en</Titulillo>
            <div role="group" aria-label="Moneda del pago" className="flex flex-wrap gap-2">
              {monedas.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === moneda}
                  onClick={() => elegirMoneda(m)}
                  title={INFO_MONEDA[m].nombre}
                  className="chip inline-flex items-center gap-2"
                >
                  <Bandera moneda={m} decorativa />
                  {m}
                </button>
              ))}
            </div>
          </div>

          {montoMoneda && montoUsd !== null && tasa && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 rounded-[1.125rem] border border-borde-fuerte bg-hundida/60 p-3.5">
              <div className="grid min-w-0 gap-0.5">
                <span className="text-xs text-tinta-suave">Pagas</span>
                <b className="truncate font-titulo text-xl font-extrabold tabular-nums">
                  {formatearMonto(montoMoneda, moneda)}
                </b>
              </div>
              <span
                className="grid size-8.5 place-items-center rounded-full border border-borde-fuerte text-cian"
                aria-hidden="true"
              >
                <ArrowRight className="size-4" />
              </span>
              <div className="grid min-w-0 gap-0.5">
                <span className="text-xs text-tinta-suave">Recibes de saldo</span>
                <b className="truncate font-titulo text-xl font-extrabold text-exito tabular-nums">
                  +{usd(montoUsd)}
                </b>
              </div>
              <p className="col-span-full text-xs text-tinta-tenue">
                {moneda === 'USD'
                  ? 'En dólares recibes lo mismo que pagas cuando el equipo confirma el pago.'
                  : `Estimado con la tasa de hoy: 1 USD = ${formatearMonto(tasa, moneda)}. La tasa queda fijada al reportar la recarga.`}
              </p>
            </div>
          )}

          {pedido && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-[0.875rem] border border-aviso/35 bg-aviso/[0.06] px-3.5 py-3 text-sm">
              <input
                type="checkbox"
                checked={ligar}
                onChange={(e) => setLigar(e.target.checked)}
                className="mt-0.5 size-4.5 shrink-0 accent-marca"
              />
              <span>
                Usar esta recarga para pagar el pedido {pedido.numero}
                <small className="block text-[0.8rem] text-tinta-suave">
                  Cuando el equipo la confirme, pagamos el pedido con tu saldo.
                </small>
              </span>
            </label>
          )}
        </BloquePago>

        <BloquePago numero={2} titulo="¿Cómo vas a pagar?" id={ID_METODO}>
          <div role="radiogroup" aria-label="Método de pago" className="grid gap-2.5">
            {deMoneda.map((m, i) => (
              <OpcionMetodo
                key={m.id}
                nombre={m.nombre}
                ya={false}
                icono={<Landmark className="size-4.5" />}
                color={COLORES_METODO[i % COLORES_METODO.length]!}
                elegido={metodo?.id === m.id}
                onElegir={() => elegirMetodo(m.id)}
                descripcion={
                  m.requiereReferencia
                    ? 'Pagas y nos envías el comprobante con la referencia'
                    : 'Pagas y nos envías el comprobante'
                }
              />
            ))}
          </div>
        </BloquePago>

        <BloquePago numero={3} titulo="Paga y reporta" id={ID_ACCION}>
          {metodo ? (
            <Reportar
              key={`${metodo.id}-${version}`}
              metodo={metodo}
              moneda={moneda}
              montoMoneda={montoMal ? null : montoMoneda}
              montoUsd={montoMal ? null : montoUsd}
              montoMal={montoMal}
              pedidoId={pedidoId}
              maxMb={datos.maxMb}
              revendedor={Boolean(revendedor)}
              onIntento={() => setIntento(true)}
              onErrorMonto={setErrorMonto}
              onListo={reportada}
            />
          ) : (
            <p className="flex items-start gap-2.5 rounded-xl border border-borde bg-marca-suave/60 px-3.5 py-3 text-sm text-tinta-suave">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-cian" aria-hidden="true" />
              Elige cómo vas a pagar y aquí te mostramos los datos.
            </p>
          )}
        </BloquePago>
      </div>
    );
  }

  const barraVisible =
    barra.enFormulario && !barra.enAccion && !listo && monedas.length > 0 && !revendedor?.bloqueo;

  return (
    <>
      <Cabecera
        datos={datos}
        moneda={moneda}
        faltante={faltante}
        rechazada={rechazada}
        onRecargar={() => irA(ID_FORMULARIO)}
        onReenviar={reenviar}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6.5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 gap-4">{formulario}</div>
        <aside aria-label="Historial de la billetera" className="grid min-w-0 gap-6.5">
          <ListaRecargas
            key={`r-${datos.recargas.total}-${datos.recargas.elementos[0]?.id ?? ''}-${datos.recargas.elementos[0]?.estado ?? ''}`}
            inicial={datos.recargas}
            conteo={billetera.recargasPorEstado}
            revendedor={Boolean(revendedor)}
            onReenviar={reenviar}
          />
          <ListaMovimientos
            key={`m-${billetera.totalMovimientos}`}
            inicial={datos.movimientos}
            totalMovimientos={billetera.totalMovimientos}
            revendedor={Boolean(revendedor)}
          />
        </aside>
      </div>

      {/* Barra del teléfono: lo que se recarga y un atajo al paso siguiente. */}
      <div
        inert={!barraVisible}
        className={clsx(
          'flotante fixed inset-x-2.5 bottom-[calc(var(--nv-barra-inferior,0px)+0.5rem+env(safe-area-inset-bottom,0px))] z-30 flex items-center gap-3 rounded-[1.25rem] py-2.5 pr-2.5 pl-3.5 backdrop-blur-md transition-[translate,opacity] duration-300 lg:hidden',
          barraVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-[140%] opacity-0',
        )}
      >
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-xs text-tinta-suave">Recargas</span>
          <b className="font-titulo text-lg font-extrabold whitespace-nowrap tabular-nums">
            {montoUsd !== null && !montoMal ? `+${usd(montoUsd)}` : '—'}
          </b>
        </span>
        <Boton tamano="md" onClick={() => irA(metodo ? ID_ACCION : ID_METODO)}>
          {metodo ? 'Reportar' : 'Continuar'}
        </Boton>
      </div>
    </>
  );
}
