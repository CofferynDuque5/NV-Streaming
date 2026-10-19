'use client';

import type {
  ClienteCarteraDetalle,
  ClienteCarteraFila,
  OrdenCartera,
  ResultadoCompra,
  ServicioRenovable,
} from '@nv/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BotonCopiar, MensajeError, PildoraEstado } from '@/componentes/cliente/pago';
import {
  claseEnlace,
  ESTADO_SERVICIO,
  MiniaturaServicio,
} from '@/componentes/cliente/piezas-cuenta';
import { Avatar, iniciales } from '@/componentes/panel/avatar';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { Lateral } from './lateral';
import {
  claseTabla,
  claseVence,
  fechaCorta,
  Kpi,
  type TonoVence,
  usd,
  venceCorto,
  venceLargo,
} from './panel';

const COLUMNAS: [OrdenCartera, string, boolean][] = [
  ['nombre', 'Cliente', false],
  ['servicios', 'Servicios', true],
  ['vence', 'Próximo vencimiento', false],
  ['total', 'Total comprado', true],
  ['ultima', 'Última venta', false],
];

const claveNueva = () => crypto.randomUUID();
const ventas = (n: number) => `${n} ${n === 1 ? 'venta' : 'ventas'}`;

/**
 * Tabla de la cartera con el orden en la cabecera (lo calcula la API sobre
 * toda la cartera) y la ficha del cliente en un panel lateral al tocar una fila.
 */
export function TablaClientes({
  clientes,
  orden,
  dir,
  parametros,
  saldoUsd,
  bloqueo,
  comercial,
}: {
  clientes: ClienteCarteraFila[];
  orden: OrdenCartera;
  dir: 'asc' | 'desc';
  parametros: Record<string, string | undefined>;
  saldoUsd: string;
  bloqueo: string | null;
  comercial: string;
}) {
  const [abierto, setAbierto] = useState<ClienteCarteraFila | null>(null);

  function enlaceOrden(o: OrdenCartera) {
    const q = new URLSearchParams();
    if (parametros.busqueda) q.set('busqueda', parametros.busqueda);
    if (parametros.filtro) q.set('filtro', parametros.filtro);
    q.set('orden', o);
    // Tocar la columna que ya ordena invierte el sentido.
    if (o === orden) q.set('dir', dir === 'asc' ? 'desc' : 'asc');
    return `/revendedor/clientes?${q}`;
  }

  return (
    <>
      <div className={claseTabla}>
        <table className="t-tab">
          <thead>
            <tr>
              {COLUMNAS.map(([o, t, num]) => (
                <th
                  key={o}
                  scope="col"
                  className={num ? 'num' : undefined}
                  aria-sort={orden === o ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <Link
                    href={enlaceOrden(o)}
                    scroll={false}
                    replace
                    className="inline-flex items-center gap-1 hover:text-tinta focus-visible:text-tinta"
                    aria-label={`Ordenar por ${t.toLowerCase()}`}
                  >
                    {t}
                    <span className="text-cian" aria-hidden="true">
                      {orden === o ? (dir === 'asc' ? '↑' : '↓') : ''}
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const px = c.proximoVencimiento;
              const [vence, tono]: [string, TonoVence] = px ? venceCorto(px) : ['—', ''];
              const total = c.suscripciones.length;
              const abrir = () => setAbierto(c);
              return (
                <tr
                  key={c.id}
                  onClick={abrir}
                  className="cursor-pointer [&:hover>td]:bg-[rgb(148_163_184/0.06)] max-[43.75rem]:hover:bg-[rgb(148_163_184/0.06)]"
                >
                  <td data-l="Cliente">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        letras={iniciales(c.nombre)}
                        className="size-[1.875rem] text-[0.8rem]"
                      />
                      <span className="grid min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir();
                          }}
                          aria-haspopup="dialog"
                          className="justify-self-start truncate text-left font-semibold hover:text-cian focus-visible:text-cian"
                        >
                          {c.nombre}
                        </button>
                        <small className="truncate">
                          {c.correo ?? c.whatsapp ?? 'Sin contacto'}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td data-l="Servicios" className="num">
                    <span>
                      {c.serviciosActivos}
                      {total > c.serviciosActivos && (
                        <span className="text-xs text-tinta-tenue"> de {total}</span>
                      )}
                    </span>
                  </td>
                  <td data-l="Próximo vencimiento" data-ancha>
                    <span className={claseVence(tono)}>
                      {px ? `${px.plan.servicio} · ${vence}` : '—'}
                    </span>
                  </td>
                  <td data-l="Total comprado" className="num">
                    {usd(c.totalCompradoUsd)}
                  </td>
                  <td data-l="Última venta">
                    {c.ultimaVentaEn ? fechaCorta(c.ultimaVentaEn) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FichaCliente
        fila={abierto}
        saldoUsd={saldoUsd}
        bloqueo={bloqueo}
        comercial={comercial}
        onCerrar={() => setAbierto(null)}
      />
    </>
  );
}

/** Ficha del cliente: contacto, cifras, servicios con «Renovar» e historial. */
function FichaCliente({
  fila,
  saldoUsd,
  bloqueo,
  comercial,
  onCerrar,
}: {
  fila: ClienteCarteraFila | null;
  saldoUsd: string;
  bloqueo: string | null;
  comercial: string;
  onCerrar: () => void;
}) {
  const [ficha, setFicha] = useState<ClienteCarteraDetalle | null>(null);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [saldo, setSaldo] = useState(saldoUsd);
  const id = fila?.id ?? null;

  const [previo, setPrevio] = useState({ id, saldoUsd });
  // Otro cliente: se empieza de cero. Saldo nuevo de la página: se usa ese.
  if (previo.id !== id || previo.saldoUsd !== saldoUsd) {
    setPrevio({ id, saldoUsd });
    if (previo.id !== id) {
      setFicha(null);
      setError(null);
    }
    if (previo.saldoUsd !== saldoUsd) setSaldo(saldoUsd);
  }

  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    // Si se abre otro cliente antes de que llegue la respuesta, se descarta.
    let vigente = true;
    void llamarApi<ClienteCarteraDetalle>('GET', `/revendedor/clientes/${id}`).then((r) => {
      if (!vigente) return;
      if (r.ok) setFicha(r.datos);
      else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const c = ficha ?? fila;
  const primerNombre = c?.nombre.split(' ')[0] ?? '';
  const contacto = c
    ? (
        [
          ['Correo', c.correo],
          ['WhatsApp', c.whatsapp],
          ['Cédula', c.documento],
        ] as [string, string | null][]
      ).filter((x): x is [string, string] => Boolean(x[1]))
    : [];

  return (
    <Lateral
      abierto={Boolean(fila)}
      titulo={c?.nombre ?? 'Cliente'}
      subtitulo={`Cliente de ${comercial}`}
      onCerrar={onCerrar}
      pie={
        c && (
          <BotonEnlace href={`/revendedor/catalogo?cliente=${c.id}`} className="w-full">
            Vender otro plan a {primerNombre}
          </BotonEnlace>
        )
      }
    >
      {c && (
        <>
          {contacto.length ? (
            <dl className="grid gap-2">
              {contacto.map(([e, v]) => (
                <div
                  key={e}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-[0.875rem] border border-borde bg-white/[0.03] px-3 py-2"
                >
                  <dt className="text-[0.72rem] font-semibold tracking-[0.05em] text-tinta-tenue uppercase">
                    {e}
                  </dt>
                  <dd className="col-start-1 truncate text-sm font-semibold">{v}</dd>
                  <dd className="col-start-2 row-span-2 row-start-1">
                    <BotonCopiar texto={v} etiqueta={`${e.toLowerCase()} de ${c.nombre}`} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-tinta-tenue">Sin datos de contacto.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              titulo="Total comprado"
              valor={usd(c.totalCompradoUsd)}
              detalle={ventas(c.ventas)}
            />
            <Kpi
              titulo="Última venta"
              valor={c.ultimaVentaEn ? fechaCorta(c.ultimaVentaEn) : '—'}
            />
          </div>
          {error ? (
            <MensajeError error={error} />
          ) : !ficha ? (
            <p role="status" className="text-sm text-tinta-suave">
              Cargando servicios…
            </p>
          ) : (
            <>
              <section aria-labelledby="ficha-servicios" className="grid gap-2">
                <h3 id="ficha-servicios" className="text-[0.95rem]">
                  Servicios
                </h3>
                {ficha.servicios.length ? (
                  <ul className="overflow-hidden rounded-[1rem] border border-borde bg-[rgb(10_14_32/0.5)]">
                    {ficha.servicios.map((s) => (
                      <FilaServicio
                        key={s.suscripcion.id}
                        s={s}
                        cliente={ficha.nombre}
                        saldoUsd={saldo}
                        bloqueo={bloqueo}
                        onRenovado={(nuevo) => {
                          setSaldo(nuevo);
                          setVersion((v) => v + 1);
                        }}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-tinta-tenue">Sin servicios.</p>
                )}
              </section>
              <section aria-labelledby="ficha-historial" className="grid gap-2">
                <h3 id="ficha-historial" className="text-[0.95rem]">
                  Historial
                </h3>
                {ficha.historial.length ? (
                  <ul className="overflow-hidden rounded-[1rem] border border-borde bg-[rgb(10_14_32/0.5)]">
                    {ficha.historial.slice(0, 8).map((v) => (
                      <li
                        key={v.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-borde px-3.5 py-2.5 not-first:border-t"
                      >
                        <MiniaturaServicio
                          slug={v.plan.servicioSlug}
                          categoria={v.plan.categoria}
                          nombre={v.plan.servicio}
                          className="size-[2.125rem] rounded-[0.625rem]"
                        />
                        <span className="grid min-w-0">
                          <b className="truncate text-sm">
                            {v.plan.servicio} {v.plan.nombre}
                          </b>
                          <small className="text-[0.78rem] text-tinta-suave">
                            {v.tipo === 'alta' ? 'Activación' : 'Renovación'} ·{' '}
                            {fechaCorta(v.creadoEn)}
                            {v.estado === 'reembolsada' ? ' · reembolsada' : ''}
                          </small>
                        </span>
                        <strong
                          className={clsx(
                            'text-sm tabular-nums',
                            v.estado === 'reembolsada' && 'text-tinta-tenue line-through',
                          )}
                        >
                          {usd(v.precioUsd)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-tinta-tenue">Sin ventas registradas.</p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </Lateral>
  );
}

/**
 * Un servicio del cliente con «Renovar» y la confirmación en la misma fila con
 * el saldo que queda (o lo que falta). El cobro lo hace la API.
 */
function FilaServicio({
  s: { suscripcion: s, precioUsd, noRenovable },
  cliente,
  saldoUsd,
  bloqueo,
  onRenovado,
}: {
  s: ServicioRenovable;
  cliente: string;
  saldoUsd: string;
  bloqueo: string | null;
  onRenovado: (saldoUsd: string) => void;
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const [confirmando, setConfirmando] = useState(false);
  const [clave, setClave] = useState(claveNueva);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [vence, tono] = venceLargo(s);
  const [estado, tonoEstado] = ESTADO_SERVICIO[s.estado];
  const queda = precioUsd ? Number(saldoUsd) - Number(precioUsd) : 0;

  async function renovar() {
    setCargando(true);
    setError(null);
    const r = await llamarApi<ResultadoCompra>('POST', '/revendedor/compras', {
      tipo: 'renovacion',
      suscripcionId: s.id,
      claveIdempotencia: clave,
    });
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      notificar(r.error.mensaje, 'error');
      // Si la red falló, la misma clave evita cobrar dos veces al reintentar.
      if (r.error.estado !== 0) setClave(claveNueva());
      return;
    }
    setClave(claveNueva());
    setConfirmando(false);
    notificar(`Renovado ${s.plan.servicio} de ${cliente}. Saldo: ${usd(r.datos.saldoUsd)}`);
    onRenovado(r.datos.saldoUsd);
    router.refresh();
  }

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 border-borde px-3.5 py-3 not-first:border-t min-[35rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
      <MiniaturaServicio
        slug={s.plan.servicioSlug}
        categoria={s.plan.categoria}
        nombre={s.plan.servicio}
        className="size-10 rounded-xl"
      />
      <div className="grid min-w-0 gap-0.5">
        <b className="text-[0.92rem] text-balance">
          {s.plan.servicio} {s.plan.nombre}
        </b>
        <small className={clsx('truncate text-[0.8rem]', claseVence(tono) || 'text-tinta-suave')}>
          {vence}
        </small>
        <span className="mt-0.5">
          <PildoraEstado texto={estado} tono={tonoEstado} />
        </span>
      </div>
      {!confirmando && (precioUsd || noRenovable) && (
        <div className="col-start-2 justify-self-start min-[35rem]:col-start-auto min-[35rem]:justify-self-end">
          {precioUsd ? (
            <Boton
              tamano="sm"
              variante="secundario"
              disabled={Boolean(bloqueo)}
              title={bloqueo ?? undefined}
              aria-label={`Renovar ${s.plan.servicio} de ${cliente} por ${usd(precioUsd)}`}
              onClick={() => {
                setError(null);
                setConfirmando(true);
              }}
            >
              Renovar {usd(precioUsd)}
            </Boton>
          ) : (
            <span className="text-[0.78rem] text-tinta-tenue">{noRenovable}</span>
          )}
        </div>
      )}
      {precioUsd && confirmando && (
        <div
          role="group"
          aria-label={`Renovar ${s.plan.servicio} de ${cliente}`}
          className="col-span-full grid gap-2.5 rounded-[0.875rem] border border-marca/40 bg-marca/[0.07] px-3.5 py-3"
        >
          <p className="text-[0.86rem]">
            {queda >= 0 ? (
              <>
                ¿Renovar {s.plan.servicio} de {cliente} por <b>{usd(precioUsd)}</b>? Te quedan{' '}
                {usd(queda)} de saldo.
              </>
            ) : (
              <>
                Te faltan <b>{usd(-queda)}</b> para renovar por {usd(precioUsd)}.
              </>
            )}
          </p>
          {error && <MensajeError error={error} />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {queda >= 0 ? (
              <Boton autoFocus cargando={cargando} onClick={() => void renovar()}>
                {cargando ? 'Renovando…' : `Renovar por ${usd(precioUsd)}`}
              </Boton>
            ) : (
              <BotonEnlace href="/revendedor/saldo">Recargar saldo</BotonEnlace>
            )}
            <button
              type="button"
              className={claseEnlace}
              disabled={cargando}
              onClick={() => setConfirmando(false)}
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
