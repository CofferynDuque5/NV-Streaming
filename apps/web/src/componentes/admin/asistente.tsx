'use client';

import {
  type AccionPropuestaPublica,
  type ConversacionDetalle,
  type ConversacionResumen,
  decidirAccionSchema,
  enviarMensajeAsistenteSchema,
  type EstadoAsistente,
  type MensajeAsistentePublico,
  type RespuestaAsistente,
} from '@nv/shared';
import clsx from 'clsx';
import {
  Archive,
  Bot,
  Check,
  ChevronDown,
  LoaderCircle,
  MessageSquarePlus,
  SendHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { AreaTexto } from '@/componentes/ui/selector';
import { llamarApi } from '@/lib/api-cliente';
import {
  EJEMPLOS_ASISTENTE,
  estadoVisible,
  MAX_CARACTERES_MENSAJE,
  RUTA_ASISTENTE,
  textoCaducidad,
} from '@/lib/asistente';
import { formatearFechaHora, haceCuanto } from '@/lib/formato';
import { EstadoAccionInsignia, FichasHerramientas, TextoAsistente } from './piezas-asistente';

// ── Reloj compartido ─────────────────────────────────────────────────────────

/** Hora actual redondeada al segundo; en el servidor, null (evita desajustes al hidratar). */
function useAhora(activo = true): number | null {
  const suscribir = useCallback(
    (avisar: () => void) => {
      if (!activo) return () => {};
      const t = setInterval(avisar, 1000);
      return () => clearInterval(t);
    },
    [activo],
  );
  return useSyncExternalStore(
    suscribir,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────────

type Mensaje = MensajeAsistentePublico;

export function ChatAsistente({
  estado: estadoInicial,
  conversaciones: conversacionesIniciales,
  detalle,
  errorDetalle,
}: {
  estado: EstadoAsistente;
  conversaciones: ConversacionResumen[];
  detalle: ConversacionDetalle | null;
  errorDetalle: string | null;
}) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales);
  const [activa, setActiva] = useState<{ id: string | null; titulo: string | null }>({
    id: detalle?.id ?? null,
    titulo: detalle?.titulo ?? null,
  });
  const [mensajes, setMensajes] = useState<Mensaje[]>(detalle?.mensajes ?? []);
  const [restantes, setRestantes] = useState(estadoInicial.mensajesRestantesHoy);
  const [texto, setTexto] = useState('');
  const [enviandoDesde, setEnviandoDesde] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(errorDetalle);
  const [anuncio, setAnuncio] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);

  // Si el servidor vuelve a pintar la página (navegación a la misma ruta), se adoptan sus datos.
  const [origen, setOrigen] = useState(conversacionesIniciales);
  if (origen !== conversacionesIniciales) {
    setOrigen(conversacionesIniciales);
    setConversaciones(conversacionesIniciales);
    setActiva({ id: detalle?.id ?? null, titulo: detalle?.titulo ?? null });
    setMensajes(detalle?.mensajes ?? []);
    setRestantes(estadoInicial.mensajesRestantesHoy);
    setError(errorDetalle);
  }

  const campo = useRef<HTMLTextAreaElement>(null);
  const historial = useRef<HTMLDivElement>(null);
  const idLista = useId();
  const idContador = useId();
  const idRestantes = useId();
  const enviando = enviandoDesde !== null;
  const sinCupo = restantes <= 0;

  // Al llegar mensajes nuevos, el historial baja hasta el final.
  useEffect(() => {
    const h = historial.current;
    if (h) h.scrollTop = h.scrollHeight;
  }, [mensajes.length, enviando, activa.id]);

  function cambiarUrl(id: string | null) {
    window.history.replaceState(
      null,
      '',
      id ? `${RUTA_ASISTENTE}?conversacion=${encodeURIComponent(id)}` : RUTA_ASISTENTE,
    );
  }

  async function refrescar() {
    const [lista, estado] = await Promise.all([
      llamarApi<ConversacionResumen[]>('GET', '/asistente/conversaciones'),
      llamarApi<EstadoAsistente>('GET', '/asistente/estado'),
    ]);
    if (lista.ok) setConversaciones(lista.datos);
    if (estado.ok) setRestantes(estado.datos.mensajesRestantesHoy);
  }

  async function recargarTrasFallo() {
    const lista = await llamarApi<ConversacionResumen[]>('GET', '/asistente/conversaciones');
    if (lista.ok) setConversaciones(lista.datos);
    // Sin conversación abierta, la API creó una nueva: es la más reciente.
    const id = activa.id ?? (lista.ok ? lista.datos[0]?.id : undefined);
    if (!id) return;
    const r = await llamarApi<ConversacionDetalle>(
      'GET',
      `/asistente/conversaciones/${encodeURIComponent(id)}`,
    );
    if (!r.ok) return;
    setActiva({ id: r.datos.id, titulo: r.datos.titulo });
    setMensajes(r.datos.mensajes);
    cambiarUrl(r.datos.id);
  }

  function nuevaConversacion() {
    if (enviando) return;
    setActiva({ id: null, titulo: null });
    setMensajes([]);
    setError(null);
    setListaAbierta(false);
    cambiarUrl(null);
    campo.current?.focus();
  }

  async function abrir(e: MouseEvent<HTMLAnchorElement>, id: string) {
    // Clic normal: se carga aquí mismo. Con modificadores, el enlace abre otra pestaña.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (enviando || id === activa.id) {
      setListaAbierta(false);
      return;
    }
    setCargando(true);
    setError(null);
    const r = await llamarApi<ConversacionDetalle>(
      'GET',
      `/asistente/conversaciones/${encodeURIComponent(id)}`,
    );
    setCargando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    setActiva({ id: r.datos.id, titulo: r.datos.titulo });
    setMensajes(r.datos.mensajes);
    setListaAbierta(false);
    cambiarUrl(r.datos.id);
    campo.current?.focus();
  }

  async function archivar(c: ConversacionResumen) {
    if (!window.confirm(`¿Archivar la conversación «${c.titulo}»? Dejará de aparecer en tu lista.`))
      return;
    const r = await llamarApi('DELETE', `/asistente/conversaciones/${encodeURIComponent(c.id)}`);
    if (!r.ok) {
      setError(r.error.mensaje);
      return;
    }
    setConversaciones((lista) => lista.filter((x) => x.id !== c.id));
    if (c.id === activa.id) nuevaConversacion();
    setAnuncio(`Conversación «${c.titulo}» archivada.`);
  }

  async function enviar(crudo: string) {
    if (enviando || sinCupo) return;
    const entrada = enviarMensajeAsistenteSchema.safeParse({
      ...(activa.id ? { conversacionId: activa.id } : {}),
      texto: crudo,
    });
    if (!entrada.success) {
      setError(entrada.error.issues[0]?.message ?? 'Revisa tu mensaje.');
      campo.current?.focus();
      return;
    }
    const provisional: Mensaje = {
      id: `provisional-${Date.now()}`,
      rol: 'usuario',
      texto: entrada.data.texto,
      herramientas: [],
      acciones: [],
      creadoEn: new Date().toISOString(),
    };
    setMensajes((m) => [...m, provisional]);
    setTexto('');
    setError(null);
    setEnviandoDesde(Date.now());
    setAnuncio('El asistente está pensando…');

    const r = await llamarApi<RespuestaAsistente>('POST', '/asistente/mensajes', entrada.data);
    setEnviandoDesde(null);
    if (!r.ok) {
      // El mensaje vuelve al cuadro de texto para reintentarlo.
      setMensajes((m) => m.filter((x) => x.id !== provisional.id));
      setTexto((t) => t || entrada.data.texto);
      setError(r.error.mensaje);
      setAnuncio(r.error.mensaje);
      campo.current?.focus();
      // Si el motor falló, la API guardó la pregunta: se vuelve a leer la conversación.
      if (r.error.estado === 503) void recargarTrasFallo();
      else if (r.error.estado === 409 || r.error.estado === 429) void refrescar();
      return;
    }
    const { conversacionId, pregunta, respuesta } = r.datos;
    setMensajes((m) => [...m.filter((x) => x.id !== provisional.id), pregunta, respuesta]);
    if (conversacionId !== activa.id) {
      setActiva({ id: conversacionId, titulo: null });
      cambiarUrl(conversacionId);
    }
    const acciones = respuesta.acciones.length;
    setAnuncio(
      `Respuesta del asistente: ${respuesta.texto.slice(0, 400)}${
        acciones > 0
          ? ` ${acciones === 1 ? 'Propone una acción' : `Propone ${acciones} acciones`} que necesita tu confirmación.`
          : ''
      }`,
    );
    campo.current?.focus();
    void refrescar();
  }

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void enviar(texto);
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar(texto);
    }
  }

  const titulo =
    activa.titulo ??
    conversaciones.find((c) => c.id === activa.id)?.titulo ??
    (activa.id ? 'Conversación' : 'Nueva conversación');
  const largo = texto.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* ── Conversaciones ── */}
      <section
        aria-labelledby={`${idLista}-titulo`}
        className="grid content-start gap-2 self-start rounded-nv border border-borde bg-superficie p-3 shadow-nv"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id={`${idLista}-titulo`}
            className="hidden px-2 text-sm font-semibold whitespace-nowrap text-tinta-suave lg:block"
          >
            Tus conversaciones
          </h2>
          <button
            type="button"
            className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-tinta-suave hover:bg-hundida hover:text-tinta lg:hidden"
            aria-expanded={listaAbierta}
            aria-controls={idLista}
            onClick={() => setListaAbierta((v) => !v)}
          >
            <span className="truncate">Conversaciones ({conversaciones.length})</span>
            <ChevronDown
              className={clsx('size-4 shrink-0 transition-transform', listaAbierta && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          <Boton
            tamano="sm"
            variante="secundario"
            onClick={nuevaConversacion}
            disabled={enviando}
            icono={<MessageSquarePlus className="size-4" aria-hidden="true" />}
          >
            Nueva
            <span className="sr-only"> conversación</span>
          </Boton>
        </div>
        <div id={idLista} className={clsx(listaAbierta ? 'block' : 'hidden lg:block')}>
          {conversaciones.length === 0 ? (
            <p className="px-2 py-3 text-sm text-tinta-tenue">
              Aún no tienes conversaciones. Escribe tu primera pregunta.
            </p>
          ) : (
            <ul className="grid max-h-[22rem] gap-0.5 overflow-y-auto lg:max-h-[calc(100dvh-20rem)]">
              {conversaciones.map((c) => {
                const actual = c.id === activa.id;
                return (
                  <li key={c.id} className="group relative flex items-center">
                    <a
                      href={`${RUTA_ASISTENTE}?conversacion=${encodeURIComponent(c.id)}`}
                      onClick={(e) => void abrir(e, c.id)}
                      aria-current={actual ? 'page' : undefined}
                      className={clsx(
                        'grid min-w-0 flex-1 gap-0.5 rounded-lg py-2 pr-10 pl-2.5 text-sm transition-colors',
                        actual
                          ? 'bg-marca-suave text-tinta'
                          : 'text-tinta-suave hover:bg-hundida hover:text-tinta',
                      )}
                    >
                      <span className="truncate font-medium">{c.titulo}</span>
                      <span className="flex items-center gap-1.5 text-xs text-tinta-tenue">
                        <time dateTime={c.actualizadaEn}>{haceCuanto(c.actualizadaEn)}</time>
                        {c.accionesPendientes > 0 && (
                          <span className="rounded-full bg-aviso-suave px-1.5 font-medium text-aviso">
                            {c.accionesPendientes} por confirmar
                          </span>
                        )}
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void archivar(c)}
                      disabled={enviando && actual}
                      className="absolute right-1 rounded-lg p-2 text-tinta-tenue opacity-100 hover:bg-superficie hover:text-tinta focus-visible:opacity-100 disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100"
                      aria-label={`Archivar «${c.titulo}»`}
                      title="Archivar"
                    >
                      <Archive className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── Conversación activa ── */}
      <section
        aria-labelledby="titulo-conversacion"
        className="flex h-[calc(100dvh-15rem)] min-h-[30rem] min-w-0 flex-col rounded-nv border border-borde bg-superficie shadow-nv"
      >
        <header className="flex items-center gap-2 border-b border-borde px-4 py-3 sm:px-5">
          <h2 id="titulo-conversacion" className="min-w-0 truncate text-base font-semibold">
            {titulo}
          </h2>
          {cargando && (
            <LoaderCircle
              className="size-4 shrink-0 animate-spin text-tinta-tenue"
              aria-label="Cargando conversación"
            />
          )}
        </header>

        <div
          ref={historial}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
          aria-busy={cargando || undefined}
        >
          {mensajes.length === 0 && !enviando ? (
            <Bienvenida onElegir={(t) => void enviar(t)} deshabilitado={sinCupo} />
          ) : (
            <ol aria-label="Mensajes" className="grid grid-cols-[minmax(0,1fr)] gap-5">
              {mensajes.map((m) => (
                <li key={m.id}>
                  <MensajeVista mensaje={m} onDecidida={() => void refrescar()} />
                </li>
              ))}
              {enviandoDesde !== null && (
                <li>
                  <Pensando desde={enviandoDesde} />
                </li>
              )}
            </ol>
          )}
        </div>

        <div aria-live="polite" className="sr-only">
          {anuncio}
        </div>

        <form
          onSubmit={alEnviar}
          aria-label="Escribir al asistente"
          className="grid gap-2 border-t border-borde px-3 py-3 sm:px-5"
        >
          {error && (
            <Alerta tono="peligro" className="py-2">
              {error}
            </Alerta>
          )}
          <label htmlFor="mensaje-asistente" className="sr-only">
            Tu mensaje para el asistente
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="mensaje-asistente"
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.currentTarget.value)}
              onKeyDown={alTeclear}
              maxLength={MAX_CARACTERES_MENSAJE}
              rows={1}
              placeholder="Escribe tu pregunta…"
              aria-describedby={`${idContador} ${idRestantes}`}
              className="max-h-40 min-h-11 w-full flex-1 resize-none rounded-xl border border-borde-fuerte bg-hundida px-3.5 py-2.5 text-[0.95rem] leading-relaxed text-tinta [field-sizing:content] placeholder:text-tinta-tenue hover:border-tinta-tenue focus:border-marca focus:ring-3 focus:ring-marca-suave focus:outline-none"
            />
            <Boton
              type="submit"
              className="size-11 shrink-0 px-0"
              disabled={enviando || sinCupo || texto.trim() === ''}
              aria-label="Enviar"
              title="Enviar (Intro)"
            >
              {enviando ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SendHorizontal className="size-4" aria-hidden="true" />
              )}
            </Boton>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-tinta-tenue">
            <p id={idRestantes} className={clsx(sinCupo && 'font-medium text-aviso')}>
              {sinCupo
                ? 'Llegaste al límite de mensajes de hoy. Vuelve mañana.'
                : restantes === 1
                  ? 'Te queda 1 mensaje hoy.'
                  : `Te quedan ${restantes} mensajes hoy.`}
              <span className="hidden sm:inline"> Intro envía; Mayús + Intro, nueva línea.</span>
            </p>
            <p
              id={idContador}
              className={clsx(
                'tabular-nums',
                largo > MAX_CARACTERES_MENSAJE * 0.9 && 'font-medium text-aviso',
              )}
            >
              <span className="sr-only">Caracteres: </span>
              {largo} / {MAX_CARACTERES_MENSAJE}
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}

function Bienvenida({
  onElegir,
  deshabilitado,
}: {
  onElegir: (texto: string) => void;
  deshabilitado: boolean;
}) {
  return (
    <div className="grid h-full content-center justify-items-center gap-4 px-2 py-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-borde bg-hundida text-marca">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <div className="grid max-w-md gap-1">
        <p className="text-base font-semibold">¿En qué te ayudo?</p>
        <p className="text-sm text-tinta-suave">
          Pregunta por clientes, vencimientos, cobros, tickets o métricas. Si algo requiere un
          cambio, te lo propongo y tú decides.
        </p>
      </div>
      <ul
        aria-label="Preguntas de ejemplo"
        className="flex max-w-xl flex-wrap justify-center gap-2"
      >
        {EJEMPLOS_ASISTENTE.map((t) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => onElegir(t)}
              disabled={deshabilitado}
              className="rounded-xl border border-borde-fuerte bg-superficie px-3 py-1.5 text-left text-sm text-tinta-suave transition-colors hover:border-marca/50 hover:bg-marca-suave hover:text-tinta disabled:opacity-55"
            >
              {t}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pensando({ desde }: { desde: number }) {
  const ahora = useAhora();
  const segundos = ahora ? Math.max(0, Math.round((ahora - desde) / 1000)) : 0;
  return (
    <div className="flex gap-3" role="status">
      <Avatar />
      <div className="grid gap-1 rounded-2xl rounded-tl-md border border-borde bg-hundida px-4 py-3 text-sm text-tinta-suave">
        <p className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin text-marca" aria-hidden="true" />
          El asistente está pensando…
          {segundos >= 5 && <span className="text-tinta-tenue tabular-nums">({segundos} s)</span>}
        </p>
        {segundos >= 15 && (
          <p className="text-xs text-tinta-tenue">
            Puede tardar hasta un par de minutos. No cierres esta página.
          </p>
        )}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full border border-marca/25 bg-marca-suave text-marca"
      aria-hidden="true"
    >
      <Bot className="size-4" />
    </span>
  );
}

function MensajeVista({ mensaje: m, onDecidida }: { mensaje: Mensaje; onDecidida: () => void }) {
  if (m.rol === 'usuario') {
    return (
      <article aria-label="Tu mensaje" className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-marca-suave px-4 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {m.texto}
        </div>
      </article>
    );
  }
  return (
    <article aria-label="Respuesta del asistente" className="flex gap-3">
      <Avatar />
      <div className="grid min-w-0 flex-1 gap-2.5">
        <div className="max-w-full rounded-2xl rounded-tl-md border border-borde bg-hundida/60 px-4 py-3">
          <TextoAsistente texto={m.texto} />
        </div>
        <FichasHerramientas herramientas={m.herramientas} />
        {m.acciones.map((a) => (
          <TarjetaAccion key={a.id} accion={a} onDecidida={onDecidida} />
        ))}
        <time dateTime={m.creadoEn} className="text-xs text-tinta-tenue">
          {formatearFechaHora(m.creadoEn)}
        </time>
      </div>
    </article>
  );
}

// ── Acciones propuestas ──────────────────────────────────────────────────────

export function TarjetaAccion({
  accion: inicial,
  onDecidida,
}: {
  accion: AccionPropuestaPublica;
  onDecidida?: () => void;
}) {
  const [accion, setAccion] = useState(inicial);
  const [modo, setModo] = useState<'confirmar' | 'rechazar' | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ahora = useAhora(accion.estado === 'propuesta');
  const id = useId();
  const tarjeta = useRef<HTMLElement>(null);
  const botonConfirmar = useRef<HTMLButtonElement>(null);

  const estado = ahora === null ? accion.estado : estadoVisible(accion, ahora);
  const pendiente = estado === 'propuesta';

  async function decidir(confirmar: boolean, motivo?: string) {
    const cuerpo = decidirAccionSchema.parse({
      confirmar,
      ...(motivo?.trim() ? { motivo: motivo.trim() } : {}),
    });
    setCargando(true);
    setError(null);
    const r = await llamarApi<AccionPropuestaPublica>(
      'POST',
      `/asistente/acciones/${encodeURIComponent(accion.id)}/decision`,
      cuerpo,
    );
    setCargando(false);
    if (!r.ok) {
      setError(r.error.mensaje);
      return false;
    }
    setAccion(r.datos);
    setModo(null);
    onDecidida?.();
    // Los botones desaparecen: el foco pasa a la tarjeta, que ya muestra el resultado.
    requestAnimationFrame(() => tarjeta.current?.focus());
    return true;
  }

  return (
    <section
      ref={tarjeta}
      tabIndex={-1}
      aria-label={`Acción propuesta: ${accion.etiqueta}`}
      className={clsx(
        'grid gap-3 rounded-xl border p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-marca',
        pendiente ? 'border-aviso/35 bg-aviso-suave/40' : 'border-borde bg-superficie',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-xs font-medium tracking-wide text-tinta-tenue uppercase">
            Acción propuesta
          </p>
          <h3 id={`${id}-titulo`} className="text-sm font-semibold">
            {accion.etiqueta}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {pendiente && ahora !== null && (
            <span className="text-xs text-tinta-suave tabular-nums">
              {textoCaducidad(accion.expiraEn, ahora)}
            </span>
          )}
          <EstadoAccionInsignia estado={estado} />
        </div>
      </div>
      <p id={`${id}-resumen`} className="text-sm [overflow-wrap:anywhere]">
        {accion.resumen}
      </p>

      {accion.resultado && (
        <p className="text-sm text-exito" role="status">
          {accion.resultado}
        </p>
      )}
      {accion.error &&
        (accion.estado === 'rechazada' ? (
          <p className="text-sm text-tinta-suave">Motivo: {accion.error}</p>
        ) : (
          <p className="text-sm text-peligro" role="alert">
            {accion.error}
          </p>
        ))}
      {accion.decididaPor && accion.decididaEn && (
        <p className="text-xs text-tinta-tenue">
          {accion.estado === 'rechazada' ? 'Rechazada' : 'Decidida'} por {accion.decididaPor.nombre}{' '}
          · <time dateTime={accion.decididaEn}>{formatearFechaHora(accion.decididaEn)}</time>
        </p>
      )}
      {error && (
        <p className="text-sm text-peligro" role="alert">
          {error}
        </p>
      )}

      {pendiente && modo === null && (
        <div className="flex flex-wrap gap-2">
          <Boton
            ref={botonConfirmar}
            tamano="sm"
            icono={<Check className="size-4" aria-hidden="true" />}
            onClick={() => {
              setError(null);
              setModo('confirmar');
            }}
            aria-describedby={`${id}-resumen`}
          >
            Confirmar
          </Boton>
          <Boton
            tamano="sm"
            variante="secundario"
            icono={<X className="size-4" aria-hidden="true" />}
            onClick={() => {
              setError(null);
              setModo('rechazar');
            }}
          >
            Rechazar
          </Boton>
        </div>
      )}
      {!pendiente && accion.estado === 'propuesta' && (
        <p className="text-xs text-tinta-tenue">
          Caducó sin confirmarse. Pídesela de nuevo al asistente si aún la necesitas.
        </p>
      )}

      {pendiente && modo === 'rechazar' && (
        <FormularioRechazo
          cargando={cargando}
          onRechazar={(motivo) => void decidir(false, motivo)}
          onCancelar={() => setModo(null)}
        />
      )}
      {modo === 'confirmar' && (
        <DialogoConfirmar
          accion={accion}
          cargando={cargando}
          error={error}
          onConfirmar={() => decidir(true)}
          onCerrar={() => {
            setModo(null);
            requestAnimationFrame(() => (botonConfirmar.current ?? tarjeta.current)?.focus());
          }}
        />
      )}
    </section>
  );
}

function FormularioRechazo({
  cargando,
  onRechazar,
  onCancelar,
}: {
  cargando: boolean;
  onRechazar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <form
      className="grid gap-3 rounded-xl border border-borde bg-superficie p-3"
      aria-label="Rechazar la acción"
      onSubmit={(e) => {
        e.preventDefault();
        onRechazar(motivo);
      }}
    >
      <AreaTexto
        etiqueta="Motivo (opcional)"
        rows={2}
        maxLength={500}
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.currentTarget.value)}
        ayuda="Queda registrado junto a la acción."
      />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="sm" variante="peligro" cargando={cargando}>
          Rechazar acción
        </Boton>
        <Boton tamano="sm" variante="fantasma" onClick={onCancelar} disabled={cargando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function DialogoConfirmar({
  accion,
  cargando,
  error,
  onConfirmar,
  onCerrar,
}: {
  accion: AccionPropuestaPublica;
  cargando: boolean;
  error: string | null;
  onConfirmar: () => Promise<boolean>;
  onCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const id = useId();

  // Modal nativo: atrapa el foco, cierra con Escape y devuelve el foco al cerrarse.
  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function confirmar() {
    const hecho = await onConfirmar();
    if (hecho) dialogo.current?.close();
  }

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-texto`}
      onClose={onCerrar}
      onCancel={(e) => {
        if (cargando) e.preventDefault();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-nv border border-borde bg-elevada p-0 text-tinta shadow-nv backdrop:bg-black/60"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <h2 id={`${id}-titulo`} className="text-lg font-semibold">
          ¿Confirmar «{accion.etiqueta}»?
        </h2>
        <div id={`${id}-texto`} className="grid gap-3 text-sm">
          <p className="rounded-xl border border-borde bg-hundida px-3 py-2.5 break-words">
            {accion.resumen}
          </p>
          <p className="text-tinta-suave">
            Esto se ejecutará con tu usuario y quedará en la auditoría.
          </p>
        </div>
        {error && <Alerta tono="peligro">{error}</Alerta>}
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="fantasma" onClick={() => dialogo.current?.close()} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton
            autoFocus
            cargando={cargando}
            icono={<Check className="size-4" aria-hidden="true" />}
            onClick={() => void confirmar()}
          >
            Confirmar y ejecutar
          </Boton>
        </div>
      </div>
    </dialog>
  );
}
