'use client';

import {
  type ClienteResumen,
  ETIQUETA_TIPO_NOTA,
  type NotaPublica,
  type Pagina,
  type TipoNota,
  TIPOS_NOTA,
} from '@nv/shared';
import clsx from 'clsx';
import {
  AlarmClock,
  BellRing,
  Check,
  Clock,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { clasesEntrada } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { llamarApi } from '@/lib/api-cliente';
import { formatearFechaHora, yaLlego } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

type OpcionCliente = Pick<ClienteResumen, 'id' | 'nombre'>;

const TONO_TIPO: Record<TipoNota, 'aviso' | 'peligro' | 'exito' | 'marca' | 'neutro'> = {
  entregar: 'aviso',
  renovar: 'exito',
  pendiente: 'aviso',
  fiado: 'peligro',
  paga_dia: 'marca',
  no_cortar: 'exito',
  otro: 'neutro',
};

/** «2026-11-13» y «09:30» en hora de Venezuela (UTC−4) a ISO con su desfase. */
function avisoIso(fecha: string | undefined, hora: string | undefined): string | null {
  if (!fecha) return null;
  return `${fecha}T${hora || '09:00'}:00-04:00`;
}

function etiquetaTipo(n: Pick<NotaPublica, 'tipo' | 'diaPago'>) {
  return n.tipo === 'paga_dia' && n.diaPago
    ? `Paga el día ${n.diaPago}`
    : ETIQUETA_TIPO_NOTA[n.tipo];
}

/** Buscador de cliente opcional (una nota puede ser general). */
function ElegirCliente({
  valor,
  onCambio,
}: {
  valor: OpcionCliente | null;
  onCambio: (c: OpcionCliente | null) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<OpcionCliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultima = useRef(0);

  async function buscar(q: string) {
    const turno = ++ultima.current;
    setBuscando(true);
    const r = await llamarApi<Pagina<ClienteResumen>>(
      'GET',
      `/clientes?busqueda=${encodeURIComponent(q)}&porPagina=8`,
    );
    if (turno !== ultima.current) return;
    setBuscando(false);
    setResultados(r.ok ? r.datos.elementos.map(({ id, nombre }) => ({ id, nombre })) : []);
  }

  if (valor) {
    return (
      <div className="grid content-start gap-1.5">
        <span className="text-sm font-medium">Cliente</span>
        <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-borde bg-hundida px-3.5">
          <span className="truncate text-sm font-medium">{valor.nombre}</span>
          <button
            type="button"
            onClick={() => onCambio(null)}
            className="text-xs text-tinta-suave hover:text-tinta"
          >
            Quitar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid content-start gap-1.5">
      <label htmlFor="nota-cliente" className="text-sm font-medium">
        Cliente (opcional)
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-tinta-tenue"
          aria-hidden
        />
        <input
          id="nota-cliente"
          type="search"
          value={busqueda}
          autoComplete="off"
          placeholder="Escribe al menos 2 letras"
          onChange={(e) => {
            const v = e.currentTarget.value;
            setBusqueda(v);
            if (temporizador.current) clearTimeout(temporizador.current);
            if (v.trim().length < 2) {
              ultima.current++;
              setResultados([]);
              setBuscando(false);
              return;
            }
            temporizador.current = setTimeout(() => void buscar(v.trim()), 300);
          }}
          className={clsx(clasesEntrada, 'pl-10')}
        />
      </div>
      {busqueda.trim().length >= 2 && (
        <ul
          className="absolute top-full z-10 mt-1 grid w-full overflow-hidden rounded-xl border border-borde bg-elevada shadow-nv"
          aria-label="Clientes encontrados"
        >
          {buscando ? (
            <li className="px-3.5 py-2.5 text-sm text-tinta-suave">Buscando…</li>
          ) : resultados.length === 0 ? (
            <li className="px-3.5 py-2.5 text-sm text-tinta-suave">Ningún cliente coincide.</li>
          ) : (
            resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onCambio(c);
                    setBusqueda('');
                    setResultados([]);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-sm hover:bg-hundida"
                >
                  {c.nombre}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function NuevaNota({ clienteInicial = null }: { clienteInicial?: OpcionCliente | null }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoNota>('pendiente');
  const [cliente, setCliente] = useState<OpcionCliente | null>(clienteInicial);
  const [guardada, setGuardada] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    const r = await ejecutar('POST', '/notas', {
      tipo,
      texto: textoDe(d, 'texto') ?? '',
      clienteId: cliente?.id ?? null,
      avisarEn: avisoIso(textoDe(d, 'fecha'), textoDe(d, 'hora')),
      ...(tipo === 'paga_dia' ? { diaPago: textoDe(d, 'diaPago') ?? '' } : {}),
    });
    if (r) {
      formulario.reset();
      setCliente(clienteInicial);
      setGuardada(true);
    }
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<Plus className="size-4" />}>
        Nueva nota
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo="Nueva nota"
      descripcion="Con fecha y hora de aviso aparece en «Para atender» del inicio cuando llegue el momento."
      onCerrar={() => {
        setAbierto(false);
        setGuardada(false);
      }}
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector
            etiqueta="Tipo"
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.currentTarget.value as TipoNota)}
          >
            {TIPOS_NOTA.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_NOTA[t]}
              </option>
            ))}
          </Selector>
          <ElegirCliente valor={cliente} onCambio={setCliente} />
        </div>
        <AreaTexto
          etiqueta="Nota"
          name="texto"
          rows={3}
          maxLength={2000}
          required
          placeholder="Entregarle Netflix cuando pague, cobrarle el fiado…"
          error={campos.texto}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            etiqueta="Avisar el día (opcional)"
            name="fecha"
            type="date"
            error={campos.avisarEn}
          />
          <Campo etiqueta="A la hora" name="hora" type="time" defaultValue="09:00" />
          {tipo === 'paga_dia' && (
            <Campo
              etiqueta="Día de pago"
              name="diaPago"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              error={campos.diaPago}
            />
          )}
        </div>
        <ErrorGeneral error={error} />
        {guardada && !error && (
          <p className="text-sm text-exito" role="status">
            Nota guardada.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Guardar nota
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

/** Mañana a la misma hora, o mañana a las 9:00 si no tenía aviso. */
function posponer(n: NotaPublica): string {
  const base = n.avisarEn
    ? new Date(n.avisarEn)
    : new Date(`${new Date().toISOString().slice(0, 10)}T09:00:00-04:00`);
  return new Date(base.getTime() + 86_400_000).toISOString();
}

function FilaNota({ n }: { n: NotaPublica }) {
  const { cargando, error, ejecutar } = useAccion();
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const vencida = !n.hechaEn && n.avisarEn !== null && yaLlego(n.avisarEn);
  const ruta = `/notas/${n.id}`;
  const resumen = n.texto.length > 40 ? `${n.texto.slice(0, 40)}…` : n.texto;

  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-4 sm:px-6">
      <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia tono={TONO_TIPO[n.tipo]}>{etiquetaTipo(n)}</Insignia>
          {n.cliente && (
            <Link
              href={`/admin/clientes/${n.cliente.id}`}
              className="text-sm font-medium hover:text-marca"
            >
              {n.cliente.nombre}
            </Link>
          )}
          {n.avisarEn && !n.hechaEn && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-xs',
                vencida ? 'font-semibold text-peligro' : 'text-tinta-suave',
              )}
            >
              {vencida ? (
                <BellRing className="size-3.5" aria-hidden="true" />
              ) : (
                <Clock className="size-3.5" aria-hidden="true" />
              )}
              {vencida ? 'Avisar ya · ' : 'Aviso '}
              {formatearFechaHora(n.avisarEn)}
            </span>
          )}
        </div>
        <p className="text-sm whitespace-pre-line">{n.texto}</p>
        <p className="text-xs text-tinta-tenue">
          {n.autor.nombre} · {formatearFechaHora(n.creadoEn)}
          {n.hechaEn ? ` · Hecha ${formatearFechaHora(n.hechaEn)}` : ''}
        </p>
        {error && (
          <p className="text-xs text-peligro" role="alert">
            {error.mensaje}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {n.hechaEn ? (
          <Boton
            tamano="sm"
            variante="secundario"
            cargando={cargando}
            onClick={() => void ejecutar('PATCH', ruta, { hecha: false })}
            icono={<RotateCcw className="size-4" />}
            aria-label={`Reabrir la nota ${resumen}`}
          >
            Reabrir
          </Boton>
        ) : (
          <>
            <Boton
              tamano="sm"
              variante="secundario"
              cargando={cargando}
              onClick={() => void ejecutar('PATCH', ruta, { hecha: true })}
              icono={<Check className="size-4" />}
              aria-label={`Marcar hecha la nota ${resumen}`}
            >
              Hecha
            </Boton>
            <Boton
              tamano="sm"
              variante="fantasma"
              onClick={() => void ejecutar('PATCH', ruta, { avisarEn: posponer(n) })}
              icono={<AlarmClock className="size-4" />}
              aria-label={`Posponer un día la nota ${resumen}`}
            >
              +1 día
            </Boton>
          </>
        )}
        {confirmarBorrar ? (
          <Boton
            tamano="sm"
            variante="peligro"
            onClick={() => void ejecutar('DELETE', ruta)}
            aria-label={`Confirmar borrar la nota ${resumen}`}
          >
            Sí, borrar
          </Boton>
        ) : (
          <Boton
            tamano="sm"
            variante="fantasma"
            onClick={() => setConfirmarBorrar(true)}
            icono={<Trash2 className="size-4" />}
            aria-label={`Borrar la nota ${resumen}`}
          >
            <span className="sr-only">Borrar</span>
          </Boton>
        )}
      </div>
    </li>
  );
}

function Grupo({ titulo, notas }: { titulo: string; notas: NotaPublica[] }) {
  if (notas.length === 0) return null;
  return (
    <Tarjeta>
      <section aria-label={titulo}>
        <CabeceraTarjeta titulo={`${titulo} · ${notas.length}`} />
        <ul className="divide-y divide-borde">
          {notas.map((n) => (
            <FilaNota key={n.id} n={n} />
          ))}
        </ul>
      </section>
    </Tarjeta>
  );
}

export function ListaNotas({ notas, hechas }: { notas: NotaPublica[]; hechas: boolean }) {
  if (notas.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio
          icono={StickyNote}
          titulo={hechas ? 'Todavía no hay notas hechas' : 'No hay pendientes'}
        >
          {hechas
            ? 'Las notas que marques como hechas aparecen aquí.'
            : 'Anota lo que tienes que entregar, renovar o cobrar, con un aviso si quieres.'}
        </EstadoVacio>
      </Tarjeta>
    );
  }
  if (hechas) return <Grupo titulo="Hechas" notas={notas} />;
  const yaAvisar = notas.filter((n) => n.avisarEn && yaLlego(n.avisarEn));
  const proximas = notas.filter((n) => n.avisarEn && !yaLlego(n.avisarEn));
  const sinAviso = notas.filter((n) => !n.avisarEn);
  return (
    <div className="grid gap-5">
      <Grupo titulo="Para avisar ya" notas={yaAvisar} />
      <Grupo titulo="Con aviso más adelante" notas={proximas} />
      <Grupo titulo="Sin aviso" notas={sinAviso} />
    </div>
  );
}
