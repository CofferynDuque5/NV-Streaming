'use client';

import {
  CATEGORIAS_TICKET,
  type ClienteResumen,
  type EstadoTicket,
  ESTADOS_TICKET,
  type Pagina,
  PRIORIDADES_TICKET,
  type PrioridadTicket,
  type Referencia,
  SLA_HORAS,
  type TicketDetalle,
} from '@nv/shared';
import clsx from 'clsx';
import { LoaderCircle, Lock, Search, Send, UserRoundCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { AreaTexto, Casilla, Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';
import { CATEGORIA_TICKET, ESTADO_TICKET, PRIORIDAD_TICKET } from '@/lib/estados';
import { clasesFiltro } from './piezas-crm';

function ErrorGeneral({ error }: { error: ErrorLlamada | null }) {
  if (!error || error.campos) return null;
  return <Alerta tono="peligro">{error.mensaje}</Alerta>;
}

const texto = (d: FormData, campo: string) => {
  const v = d.get(campo);
  return typeof v === 'string' ? v.trim() : '';
};

/** Ctrl/⌘ + Enter envía el formulario desde un área de texto. */
function enviarConAtajo(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

const horas = (h: number) => (h === 1 ? '1 hora' : `${h} horas`);

/* ───────────────────────────── Nuevo ticket ───────────────────────────── */

type OpcionCliente = Pick<ClienteResumen, 'id' | 'nombre' | 'correo'>;

/** Alta de un ticket en nombre de un cliente. Al crearlo, abre la conversación. */
export function NuevoTicket({ clienteInicial }: { clienteInicial: OpcionCliente | null }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<OpcionCliente[]>(
    clienteInicial ? [clienteInicial] : [],
  );
  const [clienteId, setClienteId] = useState(clienteInicial?.id ?? '');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [prioridad, setPrioridad] = useState<PrioridadTicket>('normal');
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultima = useRef(0);

  async function buscar(q: string) {
    const turno = ++ultima.current;
    setBuscando(true);
    setErrorBusqueda(null);
    const r = await llamarApi<Pagina<ClienteResumen>>(
      'GET',
      `/clientes?busqueda=${encodeURIComponent(q)}&porPagina=15`,
    );
    if (turno !== ultima.current) return; // Llegó tarde: hay una búsqueda más reciente.
    setBuscando(false);
    if (!r.ok) return setErrorBusqueda(r.error.mensaje);
    const lista = r.datos.elementos.map(({ id, nombre, correo }) => ({ id, nombre, correo }));
    setResultados(lista);
    setClienteId((actual) => (lista.some((c) => c.id === actual) ? actual : (lista[0]?.id ?? '')));
  }

  function alEscribir(valor: string) {
    setBusqueda(valor);
    if (temporizador.current) clearTimeout(temporizador.current);
    const q = valor.trim();
    if (q.length < 2) {
      ultima.current++;
      setBuscando(false);
      return;
    }
    temporizador.current = setTimeout(() => void buscar(q), 300);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setCargando(true);
    setError(null);
    const r = await llamarApi<TicketDetalle>('POST', '/tickets', {
      clienteId,
      asunto: texto(d, 'asunto'),
      categoria: texto(d, 'categoria'),
      prioridad,
      mensaje: texto(d, 'mensaje'),
    });
    if (!r.ok) {
      setCargando(false);
      return setError(r.error);
    }
    router.push(`/admin/soporte/${r.datos.id}`);
  }

  const campos = erroresPorCampo(error);
  const sinResultados = busqueda.trim().length >= 2 && !buscando && resultados.length === 0;

  return (
    <form onSubmit={enviar} className="grid gap-5" noValidate>
      <fieldset className="grid gap-3 rounded-xl border border-borde bg-hundida/40 p-4">
        <legend className="px-1 text-sm font-medium">Cliente</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="buscar-cliente" className="text-xs text-tinta-suave">
              Buscar por nombre, correo, documento o WhatsApp
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
                aria-hidden="true"
              />
              <input
                id="buscar-cliente"
                type="search"
                value={busqueda}
                onChange={(e) => alEscribir(e.target.value)}
                autoComplete="off"
                placeholder="Escribe al menos 2 letras"
                aria-controls="cliente-ticket"
                className={clsx(clasesFiltro, 'pr-9 pl-9')}
              />
              {buscando && (
                <LoaderCircle
                  className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-tinta-tenue"
                  aria-label="Buscando"
                />
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="cliente-ticket" className="text-xs text-tinta-suave">
              Resultado elegido
            </label>
            <select
              id="cliente-ticket"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={resultados.length === 0}
              aria-invalid={campos.clienteId ? true : undefined}
              aria-describedby={campos.clienteId ? 'cliente-ticket-error' : undefined}
              className={clsx(clasesFiltro, 'disabled:opacity-60')}
            >
              {resultados.length === 0 ? (
                <option value="">Busca un cliente a la izquierda</option>
              ) : (
                resultados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.correo ? ` · ${c.correo}` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        <p aria-live="polite" className="text-xs text-tinta-tenue">
          {errorBusqueda ??
            (sinResultados
              ? 'No encontramos clientes activos con esa búsqueda.'
              : resultados.length > 1
                ? `${resultados.length} coincidencias. Elige la correcta en la lista.`
                : '')}
        </p>
        {campos.clienteId && (
          <p id="cliente-ticket-error" className="text-xs font-medium text-peligro">
            {campos.clienteId === 'Identificador no válido.'
              ? 'Elige un cliente.'
              : campos.clienteId}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Campo
          etiqueta="Asunto"
          name="asunto"
          required
          maxLength={160}
          autoComplete="off"
          error={campos.asunto}
        />
        <Selector etiqueta="Categoría" name="categoria" defaultValue="" error={campos.categoria}>
          <option value="" disabled>
            Elige una
          </option>
          {CATEGORIAS_TICKET.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_TICKET[c]}
            </option>
          ))}
        </Selector>
        <Selector
          etiqueta="Prioridad"
          value={prioridad}
          onChange={(e) => setPrioridad(e.target.value as PrioridadTicket)}
          ayuda={`Primera respuesta en ${horas(SLA_HORAS[prioridad])}.`}
          error={campos.prioridad}
        >
          {PRIORIDADES_TICKET.map((p) => (
            <option key={p} value={p}>
              {PRIORIDAD_TICKET[p].texto}
            </option>
          ))}
        </Selector>
      </div>

      <AreaTexto
        etiqueta="Mensaje"
        name="mensaje"
        rows={5}
        maxLength={5000}
        required
        onKeyDown={enviarConAtajo}
        placeholder="Describe el caso tal como lo contó el cliente."
        ayuda="El cliente verá este mensaje como el inicio de la conversación."
        error={campos.mensaje}
      />

      <ErrorGeneral error={error} />
      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-5">
        <Boton type="submit" cargando={cargando} disabled={!clienteId}>
          Abrir ticket
        </Boton>
        <BotonEnlace href="/admin/soporte" variante="fantasma" scroll={false}>
          Cancelar
        </BotonEnlace>
      </div>
    </form>
  );
}

/* ───────────────────────────── Responder ───────────────────────────── */

export function ResponderTicket({ id }: { id: string }) {
  const router = useRouter();
  const [interno, setInterno] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    setCargando(true);
    setError(null);
    const r = await llamarApi('POST', `/tickets/${id}/mensajes`, {
      texto: texto(d, 'texto'),
      interno,
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    formulario.reset();
    setInterno(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className={clsx(
        'grid gap-3 border-t px-5 py-5 transition-colors sm:px-6',
        interno ? 'border-aviso/30 bg-aviso-suave' : 'border-borde',
      )}
    >
      <AreaTexto
        etiqueta={interno ? 'Nota interna' : 'Tu respuesta'}
        name="texto"
        rows={4}
        maxLength={5000}
        required
        onKeyDown={enviarConAtajo}
        placeholder={
          interno
            ? 'Contexto para el equipo: el cliente no verá esta nota.'
            : 'Escribe tu respuesta al cliente. Le avisaremos por correo.'
        }
        error={erroresPorCampo(error).texto}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Casilla
          checked={interno}
          onChange={(e) => setInterno(e.target.checked)}
          etiqueta={
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5 text-aviso" aria-hidden="true" /> Nota interna
            </span>
          }
          ayuda="Solo la ve el equipo y no cambia el estado del ticket."
        />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-tinta-tenue sm:inline">Ctrl + Enter</span>
          <Boton
            type="submit"
            cargando={cargando}
            variante={interno ? 'secundario' : 'primario'}
            icono={interno ? <Lock className="size-4" /> : <Send className="size-4" />}
          >
            {interno ? 'Guardar nota' : 'Enviar respuesta'}
          </Boton>
        </div>
      </div>
      <ErrorGeneral error={error} />
    </form>
  );
}

/* ───────────────────────────── Gestión ───────────────────────────── */

export function GestionTicket({
  id,
  estado,
  prioridad,
  asignadoA,
  equipo,
  yo,
}: {
  id: string;
  estado: EstadoTicket;
  prioridad: PrioridadTicket;
  asignadoA: Referencia | null;
  /** Admin y operación activos; `null` si quien mira no puede listar usuarios. */
  equipo: Referencia[] | null;
  /** Quien mira, si puede recibir tickets (admin u operador). */
  yo: Referencia | null;
}) {
  const router = useRouter();
  const [nuevoEstado, setNuevoEstado] = useState(estado);
  const [nuevaPrioridad, setNuevaPrioridad] = useState(prioridad);
  const [asignado, setAsignado] = useState(asignadoA?.id ?? '');
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [cargando, setCargando] = useState<'guardar' | 'asignarme' | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Si el ticket cambia desde fuera (una respuesta lo pasa a "esperando respuesta"),
  // el formulario vuelve a partir de los valores guardados.
  const base = `${estado}|${prioridad}|${asignadoA?.id ?? ''}`;
  const [baseAnterior, setBaseAnterior] = useState(base);
  if (base !== baseAnterior) {
    setBaseAnterior(base);
    setNuevoEstado(estado);
    setNuevaPrioridad(prioridad);
    setAsignado(asignadoA?.id ?? '');
  }

  const opciones = [...(equipo ?? [])];
  if (asignadoA && !opciones.some((p) => p.id === asignadoA.id)) opciones.unshift(asignadoA);
  if (yo && equipo === null && !opciones.some((p) => p.id === yo.id)) opciones.push(yo);

  const cambios: Record<string, unknown> = {};
  if (nuevoEstado !== estado) cambios.estado = nuevoEstado;
  if (nuevaPrioridad !== prioridad) cambios.prioridad = nuevaPrioridad;
  if (asignado !== (asignadoA?.id ?? '')) cambios.asignadoAId = asignado || null;
  const hayCambios = Object.keys(cambios).length > 0;

  async function guardar(cuerpo: Record<string, unknown>, accion: 'guardar' | 'asignarme') {
    setCargando(accion);
    setError(null);
    setGuardado(false);
    const r = await llamarApi<TicketDetalle>('PATCH', `/tickets/${id}`, cuerpo);
    setCargando(null);
    if (!r.ok) return setError(r.error);
    setGuardado(true);
    router.refresh();
  }

  const campos = erroresPorCampo(error);
  return (
    <form
      className="grid gap-4 px-5 py-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (hayCambios) void guardar(cambios, 'guardar');
      }}
    >
      <Selector
        etiqueta="Estado"
        value={nuevoEstado}
        onChange={(e) => setNuevoEstado(e.target.value as EstadoTicket)}
        error={campos.estado}
      >
        {ESTADOS_TICKET.map((e) => (
          <option key={e} value={e}>
            {ESTADO_TICKET[e].texto}
          </option>
        ))}
      </Selector>
      <Selector
        etiqueta="Prioridad"
        value={nuevaPrioridad}
        onChange={(e) => setNuevaPrioridad(e.target.value as PrioridadTicket)}
        ayuda="Si aún no hay respuesta, el plazo se recalcula con la nueva prioridad."
        error={campos.prioridad}
      >
        {PRIORIDADES_TICKET.map((p) => (
          <option key={p} value={p}>
            {PRIORIDAD_TICKET[p].texto} · {horas(SLA_HORAS[p])}
          </option>
        ))}
      </Selector>
      <Selector
        etiqueta="Asignado a"
        value={asignado}
        onChange={(e) => setAsignado(e.target.value)}
        error={campos.asignadoAId}
      >
        <option value="">Sin asignar</option>
        {opciones.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
            {p.id === yo?.id ? ' (tú)' : ''}
          </option>
        ))}
      </Selector>

      <ErrorGeneral error={error} />
      {guardado && !hayCambios && <Alerta tono="exito">Cambios guardados.</Alerta>}

      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={cargando === 'guardar'} disabled={!hayCambios}>
          Guardar cambios
        </Boton>
        {yo && asignadoA?.id !== yo.id && (
          <Boton
            variante="secundario"
            cargando={cargando === 'asignarme'}
            icono={<UserRoundCheck className="size-4" />}
            onClick={() => void guardar({ asignadoAId: yo.id }, 'asignarme')}
          >
            Asignármelo
          </Boton>
        )}
      </div>
    </form>
  );
}
