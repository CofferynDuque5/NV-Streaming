'use client';

import {
  type MetodoAutorizadoPublico,
  NOMBRE_TIPO_PLAN,
  type SuscripcionPublica,
} from '@nv/shared';
import clsx from 'clsx';
import {
  ChevronUp,
  CircleCheck,
  Clapperboard,
  Clock,
  Ellipsis,
  MessageCircle,
  Tag,
  UserRound,
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
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { Mensaje, MensajeError, type TonoEstado, type Validacion } from './pago';
import {
  Aviso,
  claseArea,
  claseEnlace,
  ESTADO_SERVICIO,
  MiniaturaServicio,
  Vacio,
} from './piezas-cuenta';

/* ───────────────────────── «Para revisar» ───────────────────────── */

export interface AvisoCuenta {
  clave: string;
  tipo: 'factura' | 'gracia' | 'vence' | 'acceso' | 'ticket' | 'revendedor';
  titulo: string;
  texto: string;
  /** Enlace de la acción (factura, acceso, solicitud). */
  href?: string;
  /** «Renovar»: lleva a la tarjeta del servicio. */
  servicioId?: string | undefined;
}

const EVENTO_IR = 'nv:ir-servicio';

const ASPECTO: Record<
  AvisoCuenta['tipo'],
  { tono: 'aviso' | 'peligro' | 'cian' | 'violeta'; icono: typeof Tag; accion: string }
> = {
  factura: { tono: 'aviso', icono: Tag, accion: 'Pagar' },
  gracia: { tono: 'peligro', icono: Clock, accion: 'Renovar' },
  vence: { tono: 'aviso', icono: Clock, accion: 'Renovar' },
  acceso: { tono: 'cian', icono: Zap, accion: 'Ver acceso' },
  ticket: { tono: 'cian', icono: MessageCircle, accion: 'Responder' },
  revendedor: { tono: 'violeta', icono: UserRound, accion: '' },
};

/** Lo que el cliente tiene que hacer: cada aviso con una sola acción. */
export function AvisosCuenta({ etiqueta, avisos }: { etiqueta: string; avisos: AvisoCuenta[] }) {
  return (
    <section aria-label={etiqueta} className="grid gap-2">
      {avisos.map((a) => {
        const { tono, icono: Icono, accion } = ASPECTO[a.tipo];
        let boton = null;
        if (a.tipo === 'factura' && a.href) {
          boton = (
            <BotonEnlace
              href={a.href}
              tamano="sm"
              aria-label={`Pagar ${a.titulo.split(' por')[0]}`}
            >
              {accion}
            </BotonEnlace>
          );
        } else if (a.servicioId) {
          const id = a.servicioId;
          boton = (
            <a
              href={`#servicio-${id}`}
              className={claseEnlace}
              onClick={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent(EVENTO_IR, { detail: id }));
              }}
            >
              {accion}
            </a>
          );
        } else if (a.href) {
          boton = (
            <Link href={a.href} className={claseEnlace}>
              {accion}
            </Link>
          );
        }
        return (
          <Aviso
            key={a.clave}
            tono={tono}
            icono={<Icono className="size-4" aria-hidden="true" />}
            titulo={a.titulo}
            accion={boton}
          >
            {a.texto}
          </Aviso>
        );
      })}
    </section>
  );
}

/* ───────────────────────── servicios ───────────────────────── */

type Grupo = 'todos' | 'activos' | 'vencer' | 'pendientes' | 'terminados';

export interface VistaServicio {
  s: SuscripcionPublica;
  /** Duración del plan; null en las compras únicas (recargas, paquetes, pases…). */
  duracion: string | null;
  vigencia: string;
  barra: { pct: number; tono: 'normal' | 'ambar' | 'rojo'; desde: string; resta: string } | null;
  venceLargo: string | null;
  /** Lo que se lee a la derecha de la tarjeta: «18 dic / 27 días», «4,00 USD / por pagar»… */
  fecha: { principal: string; nota: string } | null;
  pagoEnRevision: boolean;
  puedeRenovar: boolean;
  /** Renovar es la acción principal (en gracia, por vencer o ya vencida). */
  renovarDestacado: boolean;
  puedeCancelar: boolean;
  admiteCobroAutomatico: boolean;
  accesoId: string | null;
  /**
   * Lo gestiona su revendedor y tiene la renovación por pagar: solo se
   * informa a quién pedírsela (sin botones ni aviso en «Para revisar»).
   */
  renovacionPendiente: string | null;
  grupos: Grupo[];
  fin: boolean;
}

const FILTROS: [Grupo, string][] = [
  ['todos', 'Todos'],
  ['activos', 'Activos'],
  ['vencer', 'Por vencer'],
  ['pendientes', 'Pendientes'],
  ['terminados', 'Terminados'],
];

export function ServiciosCuenta({
  servicios,
  metodos,
  conRevendedor,
}: {
  servicios: VistaServicio[];
  metodos: MetodoAutorizadoPublico[];
  conRevendedor: boolean;
}) {
  const [filtro, setFiltro] = useState<Grupo>('todos');
  const [resaltado, setResaltado] = useState<string | null>(null);

  // «Renovar» en «Para revisar»: muestra todos, baja a la tarjeta y la resalta un momento.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    function ir(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setFiltro('todos');
      setResaltado(id);
      requestAnimationFrame(() => {
        const tarjeta = document.getElementById(`servicio-${id}`);
        tarjeta?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tarjeta?.focus({ preventScroll: true });
      });
      clearTimeout(t);
      t = setTimeout(() => setResaltado(null), 2200);
    }
    window.addEventListener(EVENTO_IR, ir);
    return () => {
      window.removeEventListener(EVENTO_IR, ir);
      clearTimeout(t);
    };
  }, []);

  if (servicios.length === 0) {
    return (
      <Vacio
        icono={<Clapperboard className="size-5" aria-hidden="true" />}
        titulo="Todavía no tienes servicios"
        accion={<BotonEnlace href="/catalogo">Ver el catálogo</BotonEnlace>}
      >
        {conRevendedor
          ? 'Cuando tu revendedor active un servicio para ti, lo verás aquí. También puedes contratar directo en la tienda.'
          : 'Elige un plan, paga en tu moneda y lo activamos en tu propia cuenta en cuanto confirmemos el pago.'}
      </Vacio>
    );
  }

  const lista = servicios.filter((v) => v.grupos.includes(filtro));
  return (
    <section aria-labelledby="titulo-servicios" className="grid gap-3.5">
      <h2 id="titulo-servicios" className="text-[clamp(1.25rem,2.6vw,1.625rem)]">
        Mis servicios
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar servicios">
        {FILTROS.map(([clave, nombre]) => (
          <button
            key={clave}
            type="button"
            className="chip"
            aria-pressed={filtro === clave}
            onClick={() => setFiltro(clave)}
          >
            {nombre} · {servicios.filter((v) => v.grupos.includes(clave)).length}
          </button>
        ))}
      </div>
      {lista.length ? (
        <div className="grid gap-3.5 min-[73.75rem]:grid-cols-2">
          {lista.map((v) => (
            <TarjetaServicio
              key={v.s.id}
              v={v}
              metodos={metodos}
              resaltado={resaltado === v.s.id}
            />
          ))}
        </div>
      ) : (
        <Vacio>
          No tienes servicios en este grupo.{' '}
          <button type="button" className={claseEnlace} onClick={() => setFiltro('todos')}>
            Ver todos
          </button>
        </Vacio>
      )}
    </section>
  );
}

const COLOR_BARRA = {
  normal: 'bg-[linear-gradient(90deg,#22d3ee,#4f8dff)]',
  ambar: 'bg-[linear-gradient(90deg,#f59e0b,#fbbf24)]',
  rojo: 'bg-[linear-gradient(90deg,#ef4444,#f87171)]',
};

function TarjetaServicio({
  v,
  metodos,
  resaltado,
}: {
  v: VistaServicio;
  metodos: MetodoAutorizadoPublico[];
  resaltado: boolean;
}) {
  const { s } = v;
  // Lo activó su revendedor: el cliente lo ve, pero lo renueva y lo paga el revendedor.
  const gestionada = s.gestionadaPorRevendedor;
  const router = useRouter();
  const notificar = useNotificar();
  const titulo = useId();
  const [cargando, setCargando] = useState<'renovar' | 'mantener' | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [estado, tono] = ESTADO_SERVICIO[s.estado];

  async function renovar() {
    setCargando('renovar');
    setError(null);
    const r = await llamarApi<{ factura?: { id: string } }>(
      'POST',
      `/mi/suscripciones/${s.id}/renovar`,
      {},
    );
    if (!r.ok) {
      setCargando(null);
      return setError(r.error);
    }
    if (r.datos.factura) router.push(`/cuenta/facturas/${r.datos.factura.id}`);
    else {
      setCargando(null);
      router.refresh();
    }
  }

  async function mantener() {
    setCargando('mantener');
    setError(null);
    const r = await llamarApi('POST', `/mi/suscripciones/${s.id}/revertir-cancelacion`, {});
    setCargando(null);
    if (!r.ok) return setError(r.error);
    notificar(`Listo: ${s.plan.servicio} se seguirá renovando.`);
    router.refresh();
  }

  // Una sola acción principal por tarjeta; las demás, como enlaces.
  let principal = null;
  if (s.facturaAbierta && !gestionada) {
    principal = v.pagoEnRevision ? (
      <span className="text-sm text-tinta-suave">Estamos revisando tu pago</span>
    ) : (
      <BotonEnlace href={`/cuenta/facturas/${s.facturaAbierta.id}`} tamano="sm">
        Pagar factura {s.facturaAbierta.numero}
      </BotonEnlace>
    );
  } else if (s.cancelarAlVencer && !v.fin && !gestionada) {
    principal = (
      <Boton
        tamano="sm"
        variante="secundario"
        cargando={cargando === 'mantener'}
        onClick={() => void mantener()}
      >
        Mantener mi suscripción
      </Boton>
    );
  } else if (v.puedeRenovar) {
    principal = (
      <Boton
        tamano="sm"
        variante={v.renovarDestacado ? 'primario' : 'secundario'}
        cargando={cargando === 'renovar'}
        onClick={() => void renovar()}
      >
        Renovar ahora
      </Boton>
    );
  }

  // Estado en palabras y su color: lo más útil para el cliente primero.
  let [estadoTexto, tonoEstado] = [estado, tono];
  if (v.pagoEnRevision) [estadoTexto, tonoEstado] = ['Pago en revisión', 'aviso'];
  else if (s.cancelarAlVencer && !v.fin) [estadoTexto, tonoEstado] = ['Termina al vencer', 'aviso'];
  else if (v.grupos.includes('vencer') && s.estado === 'activa')
    [estadoTexto, tonoEstado] = ['Vence pronto', 'aviso'];
  const detalleId = `${titulo}-detalle`;

  return (
    <article
      id={`servicio-${s.id}`}
      tabIndex={-1}
      aria-labelledby={titulo}
      className={clsx(
        'grid min-w-0 content-start overflow-hidden rounded-[1.125rem] border bg-[rgb(10_14_32/0.6)] transition-[border-color,box-shadow] duration-300 outline-none',
        resaltado ? 'border-cian shadow-[0_0_0_3px_rgb(34_211_238/0.25)]' : 'border-borde',
        v.fin && 'opacity-[0.72]',
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3">
        <MiniaturaServicio
          slug={s.plan.servicioSlug}
          categoria={s.plan.categoria}
          nombre={s.plan.servicio}
          imagen={s.plan.servicioImagen}
          className="size-10"
        />
        <div className="grid min-w-0 gap-0.5">
          <h3 id={titulo} className="truncate text-[0.98rem] leading-tight font-semibold">
            {s.plan.servicio}
            <span className="sr-only"> · {s.plan.nombre}</span>
          </h3>
          <small className="flex min-w-0 items-center gap-1.5 text-[0.8rem] text-tinta-tenue">
            <span
              aria-hidden="true"
              className={clsx('size-1.5 shrink-0 rounded-full', PUNTO[tonoEstado])}
            />
            <span className="truncate">
              <span>{estadoTexto}</span> · {s.plan.nombre}
            </span>
          </small>
        </div>
        {v.fecha && (
          <div className="grid justify-items-end gap-0.5 text-right">
            <b className="text-sm font-semibold whitespace-nowrap">{v.fecha.principal}</b>
            <small className="text-xs whitespace-nowrap text-tinta-tenue">{v.fecha.nota}</small>
          </div>
        )}
      </div>

      {v.barra && (
        <div
          className="h-[3px] bg-white/[0.06]"
          role="img"
          aria-label={`Llevas el ${v.barra.pct} % del periodo`}
        >
          <i
            className={clsx('block h-full', COLOR_BARRA[v.barra.tono])}
            style={{ width: `${Math.max(v.barra.pct, 3)}%` } as CSSProperties}
          />
        </div>
      )}

      {abierto && (
        <div id={detalleId} className="grid gap-3 border-t border-borde px-3.5 pt-1 pb-3">
          <dl className="grid text-[0.84rem]">
            <Fila etiqueta="Plan">
              {s.plan.nombre}
              {v.duracion ? ` · ${v.duracion}` : ` · ${NOMBRE_TIPO_PLAN[s.plan.tipo]}`}
            </Fila>
            {v.vigencia && <Fila etiqueta="Vigencia">{v.vigencia}</Fila>}
            {v.barra && (
              <Fila etiqueta="Periodo">
                {v.barra.desde} · {v.barra.resta}
              </Fila>
            )}
            {s.precioAcordadoUsd && (
              <Fila etiqueta="Precio">{s.precioAcordadoUsd} USD por periodo</Fila>
            )}
            <Fila etiqueta="Moneda">{s.moneda}</Fila>
            {s.datosCliente.map((d) => (
              <Fila key={d.etiqueta} etiqueta={d.etiqueta}>
                {d.valor}
              </Fila>
            ))}
          </dl>
          {v.admiteCobroAutomatico && (
            <CobroAutomatico s={s} metodos={metodos} vence={v.venceLargo} />
          )}
          {cancelando ? (
            <FormularioCancelar v={v} alTerminar={() => setCancelando(false)} />
          ) : (
            v.puedeCancelar && (
              <button
                type="button"
                className="justify-self-start text-sm font-semibold text-peligro hover:underline"
                onClick={() => setCancelando(true)}
              >
                {s.estado === 'pendiente_pago' ? 'Cancelar solicitud' : 'Cancelar suscripción'}
              </button>
            )
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-borde px-3.5 py-2.5">
        {principal}
        {v.accesoId && (
          <Link href={`/cuenta/accesos#acceso-${v.accesoId}`} className={claseEnlace}>
            Ver acceso
          </Link>
        )}
        {v.fin && !gestionada && (
          <Link href="/catalogo" className={claseEnlace}>
            Volver a contratar
          </Link>
        )}
        {gestionada && !v.fin && !v.renovacionPendiente && (
          <span className="text-[0.8rem] text-tinta-tenue">Lo gestiona tu revendedor</span>
        )}
        {v.renovacionPendiente && (
          <span className="flex items-center gap-1.5 text-[0.8rem] text-tinta-suave">
            <Clock className="size-3.5 shrink-0 text-aviso" aria-hidden="true" />
            {v.renovacionPendiente}
          </span>
        )}
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={detalleId}
          aria-label={abierto ? 'Ocultar detalles' : 'Ver detalles y opciones'}
          title={abierto ? 'Ocultar detalles' : 'Detalles y opciones'}
          onClick={() => {
            setAbierto((a) => !a);
            setCancelando(false);
          }}
          className="ml-auto grid size-8 place-items-center rounded-[0.625rem] text-tinta-tenue hover:bg-white/[0.05] hover:text-tinta"
        >
          {abierto ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <Ellipsis className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <div className="px-3.5 pb-3">
          <MensajeError error={error} />
        </div>
      )}
    </article>
  );
}

const PUNTO: Record<TonoEstado, string> = {
  exito: 'bg-exito',
  aviso: 'bg-aviso',
  peligro: 'bg-peligro',
  cian: 'bg-cian',
  neutro: 'bg-tinta-tenue',
};

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borde py-2 last:border-b-0">
      <dt className="shrink-0 text-tinta-tenue">{etiqueta}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function validarMotivo(texto: string): Validacion {
  const n = texto.trim().length;
  if (n < 3) return ['mal', 'Escribe al menos 3 caracteres.'];
  if (n > 500) return ['mal', 'Máximo 500 caracteres.'];
  return ['ok', 'Gracias, nos ayuda a mejorar'];
}

/** Cancelar con motivo obligatorio (validado mientras se escribe) y confirmación roja. */
function FormularioCancelar({ v, alTerminar }: { v: VistaServicio; alTerminar: () => void }) {
  const { s } = v;
  const router = useRouter();
  const notificar = useNotificar();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [motivo, setMotivo] = useState('');
  const [intento, setIntento] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const pendiente = s.estado === 'pendiente_pago';

  useEffect(() => area.current?.focus(), []);

  const [estado, texto] =
    intento || motivo ? validarMotivo(motivo) : (['', 'Lo lee el equipo'] as Validacion);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIntento(true);
    if (validarMotivo(motivo)[0] !== 'ok') return area.current?.focus();
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/mi/suscripciones/${s.id}/cancelar`, {
      motivo: motivo.trim(),
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    notificar(
      pendiente
        ? 'Cancelamos tu solicitud y anulamos su factura.'
        : `Listo: ${s.plan.servicio} termina${v.venceLargo ? ` el ${v.venceLargo}` : ''} y no se renovará.`,
    );
    alTerminar();
    router.refresh();
  }

  return (
    <form
      noValidate
      onSubmit={enviar}
      aria-label={`Cancelar ${s.plan.servicio} ${s.plan.nombre}`}
      className="grid gap-2.5 rounded-2xl border border-peligro/35 bg-peligro/[0.05] p-3.5"
    >
      <p className="text-[0.84rem] text-tinta-suave">
        {pendiente
          ? 'La solicitud se cancela ahora y la factura pendiente queda anulada.'
          : `Seguirás teniendo ${s.plan.servicio}${v.venceLargo ? ` hasta el ${v.venceLargo}` : ''} y no se generarán más facturas. Puedes arrepentirte antes de esa fecha.`}
      </p>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-motivo`} className="text-sm font-semibold">
          ¿Por qué quieres cancelar?
        </label>
        <textarea
          ref={area}
          id={`${id}-motivo`}
          rows={2}
          maxLength={500}
          value={motivo}
          placeholder="Cuéntanos en pocas palabras"
          aria-invalid={estado === 'mal' || undefined}
          aria-describedby={`${id}-ayuda`}
          onChange={(e) => setMotivo(e.target.value)}
          className={claseArea(estado)}
        />
        <Mensaje id={`${id}-ayuda`} estado={estado} texto={texto} />
      </div>
      {error && <MensajeError error={error} />}
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando}>
          Confirmar cancelación
        </Boton>
        <button type="button" className={claseEnlace} onClick={alTerminar}>
          Volver
        </button>
      </div>
    </form>
  );
}

/**
 * Cobro automático de una suscripción. Cerrado, una línea con el método (o
 * nada si el cliente no tiene métodos para esta moneda); abierto, el selector.
 */
function CobroAutomatico({
  s,
  metodos,
  vence,
}: {
  s: SuscripcionPublica;
  metodos: MetodoAutorizadoPublico[];
  vence: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const actual = s.cobroAutomatico ?? null;
  const aptos = metodos.filter((m) => m.estado === 'activo' && m.moneda === s.moneda);
  const [abierto, setAbierto] = useState(false);
  const [eleccion, setEleccion] = useState(actual?.metodoId ?? '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);

  if (aptos.length === 0 && !actual) return null;

  async function guardar() {
    setCargando(true);
    setError(null);
    setGuardado(null);
    const metodoAutorizadoId = eleccion || null;
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

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="grid gap-2.5 rounded-xl border border-borde bg-white/[0.03] px-3 py-2.5 text-[0.82rem] text-tinta-suave"
    >
      <h4 id={`${id}-titulo`} className="sr-only">
        Cobro automático
      </h4>
      <div className="flex flex-wrap items-center gap-2">
        {actual ? (
          <CircleCheck className="size-4 shrink-0 text-cian" aria-hidden="true" />
        ) : (
          <Clock className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          {actual ? `Cobro automático con ${actual.descripcion}` : 'Sin cobro automático'}
        </span>
        <button
          type="button"
          className={claseEnlace}
          aria-expanded={abierto}
          aria-controls={`${id}-panel`}
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? 'Listo' : actual ? 'Cambiar' : 'Activar'}
        </button>
      </div>
      {abierto && (
        <div id={`${id}-panel`} className="grid gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-0 flex-1 basis-48 gap-1">
              <label htmlFor={`${id}-metodo`} className="text-xs">
                Método para cobrar la renovación
              </label>
              <select
                id={`${id}-metodo`}
                value={eleccion}
                onChange={(e) => setEleccion(e.target.value)}
                className="h-10 w-full min-w-0 rounded-xl border border-borde-fuerte bg-hundida px-3 text-sm text-tinta [color-scheme:dark]"
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
              onClick={() => void guardar()}
            >
              {!eleccion ? 'Desactivar' : actual ? 'Guardar' : 'Activar'}
            </Boton>
          </div>
          <p className="text-xs text-tinta-tenue">
            Se cobra solo {vence ? `el ${vence}, día del vencimiento` : 'el día del vencimiento'}.
            Te avisamos antes de cobrar; si el cobro falla, lo reintentamos y te escribimos.
          </p>
        </div>
      )}
      {guardado && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-exito">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          {guardado}
        </p>
      )}
      {error && <MensajeError error={error} />}
    </section>
  );
}
