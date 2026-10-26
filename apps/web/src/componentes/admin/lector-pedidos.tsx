'use client';

import {
  type AliasServicioPublico,
  type ClienteResumen,
  formatearMonto,
  type LecturaPedido,
  leerPedido,
  MAX_TEXTO_PEDIDO,
  type Moneda,
  MONEDAS,
  type Pagina,
  type PlanPublico,
  REGLAS_COBRO,
} from '@nv/shared';
import { BookOpenText, Search, Trash2, Wand2, X } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { clasesEntrada } from '@/componentes/ui/clases';
import { Insignia } from '@/componentes/ui/insignia';
import { AreaTexto, Selector } from '@/componentes/ui/selector';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { formatearDuracion } from '@/lib/formato';
import { ErrorGeneral, useAccion } from './piezas';

/** Línea del pedido tal como la deja el equipo antes de crear. */
interface Linea {
  origen: string;
  servicioId: string;
  planId: string;
  cantidad: number;
  incluir: boolean;
  renovar: boolean;
  cliente: string | null;
  correo: string | null;
  dudas: string[];
}

interface Creada {
  linea: number;
  plan: string;
  facturaId: string;
}

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;

function BuscarCliente({
  elegido,
  onElegir,
  sugerencia,
}: {
  elegido: ClienteResumen | null;
  onElegir: (c: ClienteResumen | null) => void;
  sugerencia: string | null;
}) {
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState<ClienteResumen[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);

  async function buscar(q: string) {
    if (q.trim().length < 2) return;
    setCargando(true);
    setError(null);
    const r = await llamarApi<Pagina<ClienteResumen>>(
      'GET',
      `/clientes?busqueda=${encodeURIComponent(q.trim())}&porPagina=8`,
    );
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setLista(r.datos.elementos);
  }

  if (elegido) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca/40 bg-marca/5 px-4 py-3">
        <div className="grid min-w-0">
          <span className="text-xs text-tinta-suave">Cliente</span>
          <b className="truncate">{elegido.nombre}</b>
          {elegido.correo && (
            <span className="truncate text-xs text-tinta-tenue">{elegido.correo}</span>
          )}
        </div>
        <Boton
          tamano="sm"
          variante="fantasma"
          icono={<X className="size-3.5" />}
          onClick={() => onElegir(null)}
        >
          Cambiar
        </Boton>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label htmlFor="buscar-cliente" className="text-sm font-semibold">
        ¿Para qué cliente es?
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue"
            aria-hidden="true"
          />
          <input
            id="buscar-cliente"
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar(texto);
              }
            }}
            placeholder="Nombre, correo o teléfono"
            className={`${clasesEntrada} pl-9`}
            autoComplete="off"
          />
        </div>
        <Boton variante="secundario" cargando={cargando} onClick={() => void buscar(texto)}>
          Buscar
        </Boton>
      </div>
      {sugerencia && !lista && (
        <button
          type="button"
          className="justify-self-start text-sm text-marca underline-offset-2 hover:underline"
          onClick={() => {
            setTexto(sugerencia);
            void buscar(sugerencia);
          }}
        >
          Buscar «{sugerencia}», que sale en el pedido
        </button>
      )}
      {error && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      {lista &&
        (lista.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            No encontramos clientes con «{texto}». Puedes crearlo en{' '}
            <Link href="/admin/clientes" className="text-marca hover:underline">
              Clientes
            </Link>
            .
          </p>
        ) : (
          <ul className="grid divide-y divide-borde rounded-xl border border-borde">
            {lista.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  className="grid w-full px-4 py-2.5 text-left hover:bg-hundida/60"
                >
                  <span className="font-medium">{c.nombre}</span>
                  <span className="text-xs text-tinta-tenue">
                    {[c.correo, c.estado !== 'activo' ? c.estado : null]
                      .filter(Boolean)
                      .join(' · ') || 'Sin correo'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/**
 * Lector de pedidos con reglas locales: el texto pegado se lee en este
 * navegador con el catálogo y las palabras guardadas, sin enviarlo a una IA.
 * Las suscripciones se crean solo al confirmar, una por cada cupo pedido.
 */
export function LectorPedidos({
  planes,
  aliasIniciales,
}: {
  planes: PlanPublico[];
  aliasIniciales: AliasServicioPublico[];
}) {
  const servicios = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; slug: string }>();
    for (const p of planes) m.set(p.servicio.id, p.servicio);
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [planes]);
  const [alias, setAlias] = useState(aliasIniciales);
  const [texto, setTexto] = useState('');
  const [lectura, setLectura] = useState<LecturaPedido | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cliente, setCliente] = useState<ClienteResumen | null>(null);
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<{ linea: number; error: ErrorLlamada } | null>(null);
  const [creadas, setCreadas] = useState<Creada[]>([]);
  const guardar = useAccion();

  function leer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = leerPedido(
      texto,
      servicios,
      planes.map((p) => ({
        id: p.id,
        servicioId: p.servicio.id,
        nombre: p.nombre,
        duracionCantidad: p.duracionCantidad,
        duracionUnidad: p.duracionUnidad,
      })),
      alias.map((a) => ({ palabra: a.palabra, servicioId: a.servicio.id })),
    );
    setLectura(r);
    setCreadas([]);
    setErrorCrear(null);
    setLineas(
      r.pedidos.map((p) => ({
        origen: p.origen,
        servicioId: p.servicioId ?? '',
        planId: p.planId ?? '',
        cantidad: p.cantidad,
        // Una renovación se hace desde la suscripción que ya tiene: no se crea otra.
        incluir: !p.renovar && Boolean(p.planId),
        renovar: p.renovar,
        cliente: p.cliente,
        correo: p.correo,
        dudas: p.dudas,
      })),
    );
  }

  const cambiar = (i: number, cambio: Partial<Linea>) =>
    setLineas((l) => l.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  const elegidas = lineas.filter((l) => l.incluir && l.planId && l.cantidad > 0);
  const total = elegidas.reduce((s, l) => s + l.cantidad, 0);
  const planDe = (id: string) => planes.find((p) => p.id === id);
  const importe = elegidas.reduce((s, l) => {
    const precio = planDe(l.planId)?.precios[moneda];
    return precio ? s + Number(precio.precio) * l.cantidad : s;
  }, 0);
  const sinPrecio = elegidas.some((l) => !planDe(l.planId)?.precios[moneda]);
  const nombreSugerido = lineas.find((l) => l.cliente)?.cliente ?? null;

  async function crear() {
    if (!cliente || !total) return;
    setCreando(true);
    setErrorCrear(null);
    const hechas: Creada[] = [];
    for (const [i, l] of lineas.entries()) {
      if (!elegidas.includes(l)) continue;
      for (let n = 0; n < l.cantidad; n++) {
        const r = await llamarApi<{ factura: { id: string } }>('POST', '/suscripciones', {
          clienteId: cliente.id,
          planId: l.planId,
          moneda,
        });
        if (!r.ok) {
          setCreadas(hechas);
          setErrorCrear({ linea: i + 1, error: r.error });
          setCreando(false);
          // Lo creado se quita del pedido para no repetirlo al reintentar.
          setLineas((ls) =>
            ls.map((x, j) =>
              j < i
                ? { ...x, incluir: x.incluir && !elegidas.includes(x) }
                : j === i
                  ? { ...x, cantidad: x.cantidad - n }
                  : x,
            ),
          );
          return;
        }
        hechas.push({
          linea: i + 1,
          plan: planDe(l.planId)?.nombre ?? '',
          facturaId: r.datos.factura.id,
        });
      }
    }
    setCreadas(hechas);
    setCreando(false);
    setLineas((ls) => ls.map((x) => (elegidas.includes(x) ? { ...x, incluir: false } : x)));
  }

  async function guardarAlias(palabra: string, servicioId: string) {
    const r = await guardar.ejecutar<AliasServicioPublico>('POST', '/lector/alias', {
      palabra,
      servicioId,
    });
    if (r)
      setAlias((a) => [...a, r.datos].sort((x, y) => x.palabra.localeCompare(y.palabra, 'es')));
  }

  async function borrarAlias(id: string) {
    const r = await llamarApi('DELETE', `/lector/alias/${id}`);
    if (r.ok) setAlias((a) => a.filter((x) => x.id !== id));
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tarjeta>
        <CabeceraTarjeta
          titulo="1. Pega el pedido"
          descripcion="Por ejemplo: «2 netflix 3 meses para Ana Pérez, 1 disney». Se lee en este navegador con tu catálogo y las palabras guardadas; no se envía a ninguna IA."
        />
        <form onSubmit={leer} className="grid gap-4 p-5 sm:p-6" noValidate>
          <AreaTexto
            etiqueta="Texto del chat"
            name="texto"
            rows={6}
            maxLength={MAX_TEXTO_PEDIDO}
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            ayuda="También entiende «cuando diga plus es Spotify» para aprender una palabra."
          />
          <div>
            <Boton type="submit" icono={<Wand2 className="size-4" />} disabled={!texto.trim()}>
              Leer pedido
            </Boton>
          </div>
        </form>
      </Tarjeta>

      {lectura && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="2. Lo que entendimos"
            descripcion={
              lineas.length
                ? `${plural(lineas.length, 'línea', 'líneas')}. Revisa el servicio, el plan y la cantidad de cada una.`
                : 'No encontramos servicios del catálogo en el texto.'
            }
          />
          <div className="grid gap-4 p-5 sm:p-6">
            {lectura.alias.map((a) => (
              <div
                key={a.texto}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-hundida/50 px-4 py-3 text-sm"
              >
                <span>
                  Aprender que «<b>{a.palabra}</b>» es{' '}
                  <b>
                    {servicios.find((s) => s.id === a.servicioId)?.nombre ??
                      'un servicio que no reconocemos'}
                  </b>
                </span>
                {a.servicioId && !alias.some((x) => x.palabra === a.palabra) ? (
                  <Boton
                    tamano="sm"
                    variante="secundario"
                    cargando={guardar.cargando}
                    onClick={() => void guardarAlias(a.palabra, a.servicioId!)}
                  >
                    Guardar palabra
                  </Boton>
                ) : (
                  <span className="text-xs text-tinta-tenue">
                    {a.servicioId
                      ? 'Ya está guardada'
                      : 'Escribe el nombre como está en el catálogo'}
                  </span>
                )}
              </div>
            ))}
            {lectura.sinServicio.length > 0 && (
              <Alerta tono="aviso">
                No reconocimos el servicio en: {lectura.sinServicio.map((s) => `«${s}»`).join(', ')}
                . Si es un apodo, enséñalo abajo en «Palabras que entiende».
              </Alerta>
            )}
            {lineas.map((l, i) => {
              const delServicio = planes.filter((p) => p.servicio.id === l.servicioId);
              return (
                <fieldset
                  key={`${i}-${l.origen}`}
                  className="grid gap-3 rounded-xl border border-borde p-4"
                  aria-label={`Línea ${i + 1}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-sm text-tinta-suave">
                      <span className="text-tinta-tenue">Línea {i + 1} · </span>«{l.origen}»
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {l.renovar && <Insignia tono="marca">Renovación</Insignia>}
                      {l.cliente && <Insignia>Para {l.cliente}</Insignia>}
                      {l.correo && <Insignia>{l.correo}</Insignia>}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_6rem]">
                    <Selector
                      etiqueta="Servicio"
                      value={l.servicioId}
                      onChange={(e) => {
                        const servicioId = e.currentTarget.value;
                        const primero = planes.find((p) => p.servicio.id === servicioId);
                        cambiar(i, { servicioId, planId: primero?.id ?? '' });
                      }}
                    >
                      <option value="">Elige</option>
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </Selector>
                    <Selector
                      etiqueta="Plan"
                      value={l.planId}
                      onChange={(e) => cambiar(i, { planId: e.currentTarget.value, dudas: [] })}
                    >
                      <option value="">Elige</option>
                      {delServicio.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · {formatearDuracion(p.duracionCantidad, p.duracionUnidad)} ·{' '}
                          {formatearMonto(p.precioUsd, 'USD')}
                        </option>
                      ))}
                    </Selector>
                    <Campo
                      etiqueta="Cantidad"
                      type="number"
                      min={1}
                      max={20}
                      value={l.cantidad}
                      onChange={(e) =>
                        cambiar(i, {
                          cantidad: Math.max(0, Math.min(20, Number(e.currentTarget.value) || 0)),
                        })
                      }
                    />
                  </div>
                  {l.dudas.length > 0 && <p className="text-sm text-aviso">{l.dudas.join(' ')}</p>}
                  {l.renovar && (
                    <p className="text-sm text-tinta-suave">
                      Es una renovación: renuévala desde la suscripción del cliente para no crear
                      otra. Márcala solo si de verdad es una nueva.
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={l.incluir}
                      onChange={(e) => cambiar(i, { incluir: e.currentTarget.checked })}
                    />
                    Crear {l.cantidad > 1 ? `${l.cantidad} suscripciones` : 'la suscripción'} de
                    esta línea
                  </label>
                </fieldset>
              );
            })}
          </div>
        </Tarjeta>
      )}

      {lectura && lineas.length > 0 && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="3. Crear"
            descripcion="Cada cupo es una suscripción con su factura. El servicio se activa cuando se confirme el pago."
          />
          <div className="grid gap-4 p-5 sm:p-6">
            <BuscarCliente elegido={cliente} onElegir={setCliente} sugerencia={nombreSugerido} />
            <Selector
              etiqueta="Moneda de las facturas"
              value={moneda}
              onChange={(e) => setMoneda(e.currentTarget.value as Moneda)}
              className="sm:max-w-60"
            >
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Selector>
            <p className="text-sm text-tinta-suave">
              {total
                ? `${plural(total, 'suscripción', 'suscripciones')} por ${formatearMonto(importe.toFixed(2), moneda)} de lista${sinPrecio ? ' (algún plan no tiene precio en esta moneda)' : ''}. Los cupones se aplican desde la ficha del cliente.`
                : 'No hay líneas marcadas para crear.'}
            </p>
            {total > REGLAS_COBRO.pendientesPorCliente && (
              <Alerta tono="aviso">
                Cada cliente puede tener hasta {REGLAS_COBRO.pendientesPorCliente} suscripciones
                esperando pago. Si ya tiene alguna, las demás no se crearán hasta que pague.
              </Alerta>
            )}
            {errorCrear && (
              <Alerta tono="peligro">
                Línea {errorCrear.linea}: {errorCrear.error.mensaje}
                {creadas.length ? ' Lo anterior sí se creó y ya no está marcado.' : ''}
              </Alerta>
            )}
            {creadas.length > 0 && (
              <Alerta tono="exito">
                {plural(creadas.length, 'suscripción creada', 'suscripciones creadas')}. Facturas:{' '}
                {creadas.map((c, n) => (
                  <span key={c.facturaId}>
                    {n > 0 && ', '}
                    <Link href={`/admin/cobros/facturas/${c.facturaId}`} className="underline">
                      {c.plan}
                    </Link>
                  </span>
                ))}
              </Alerta>
            )}
            <div>
              <Boton
                onClick={() => void crear()}
                cargando={creando}
                disabled={!cliente || !total || sinPrecio}
              >
                {total ? `Crear ${plural(total, 'suscripción', 'suscripciones')}` : 'Crear'}
              </Boton>
            </div>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Palabras que entiende"
          descripcion="Apodos que usan tus clientes y revendedores para cada servicio. Las comparte todo el equipo."
        />
        <div className="grid gap-4 p-5 sm:p-6">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const f = e.currentTarget;
              void guardarAlias(
                String(d.get('palabra') ?? ''),
                String(d.get('servicioId') ?? ''),
              ).then(() => f.reset());
            }}
            noValidate
          >
            <Campo
              etiqueta="Palabra"
              name="palabra"
              placeholder="plus"
              maxLength={40}
              className="min-w-40 flex-1"
              error={guardar.campos.palabra}
            />
            <Selector
              etiqueta="Es el servicio"
              name="servicioId"
              className="min-w-40 flex-1"
              error={guardar.campos.servicioId}
            >
              <option value="">Elige</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <Boton type="submit" variante="secundario" cargando={guardar.cargando}>
              Guardar
            </Boton>
          </form>
          <ErrorGeneral error={guardar.error} />
          {alias.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-tinta-tenue">
              <BookOpenText className="size-4" aria-hidden="true" />
              Todavía no hay palabras. El lector ya reconoce los nombres del catálogo.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {alias.map((a) => (
                <li
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-borde py-1 pr-1 pl-3 text-sm"
                >
                  «{a.palabra}» → {a.servicio.nombre}
                  <button
                    type="button"
                    onClick={() => void borrarAlias(a.id)}
                    className="rounded-full p-1 text-tinta-tenue hover:bg-hundida hover:text-peligro"
                    aria-label={`Borrar la palabra ${a.palabra}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
