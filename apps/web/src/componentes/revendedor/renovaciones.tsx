'use client';

import type { FiltroRenovaciones, ListaRenovaciones, ResultadoRenovacionLote } from '@nv/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PildoraEstado } from '@/componentes/cliente/pago';
import { claseEnlace, ESTADO_SERVICIO, Vacio } from '@/componentes/cliente/piezas-cuenta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { useNotificar } from '@/componentes/ui/notificaciones';
import { llamarApi } from '@/lib/api-cliente';
import { CeldaPlan, claseTabla, claseVence, usd, venceCorto } from './panel';

const FILTROS: [FiltroRenovaciones, string][] = [
  ['urgentes', 'Urgentes'],
  ['atrasados', 'Vencidos o en gracia'],
  ['todos', 'Todos los renovables'],
];

/** Centavos de un importe de la API (solo para la vista previa de la selección). */
const centavos = (v: string) => Math.round(Number(v) * 100);

const claveNueva = () => crypto.randomUUID();

/** Casilla con un área de toque cómoda. */
function Casilla({
  marcada,
  etiqueta,
  deshabilitada,
  onCambiar,
}: {
  marcada: boolean;
  etiqueta: string;
  deshabilitada: boolean;
  onCambiar: (v: boolean) => void;
}) {
  return (
    <label className="-m-1.5 inline-grid cursor-pointer place-items-center p-1.5">
      <input
        type="checkbox"
        checked={marcada}
        disabled={deshabilitada}
        aria-label={etiqueta}
        onChange={(e) => onCambiar(e.target.checked)}
        className="m-0 size-[1.2rem] cursor-pointer accent-cian disabled:cursor-not-allowed"
      />
    </label>
  );
}

/**
 * Renovaciones en lote: filtros, casillas, «elegir todos» y la barra fija con
 * el total elegido y lo que queda de saldo. La suma de la barra es solo una
 * vista previa: la API valida el lote y cobra todo o nada.
 */
export function Renovaciones({
  lista,
  saldoUsd,
  bloqueo,
}: {
  lista: ListaRenovaciones;
  saldoUsd: string;
  bloqueo: string | null;
}) {
  const router = useRouter();
  const notificar = useNotificar();
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [clave, setClave] = useState(claveNueva);
  const [cargando, setCargando] = useState(false);
  const [problemas, setProblemas] = useState<Record<string, string>>({});
  const filas = lista.elementos;
  const sel = filas.filter((x) => elegidos.has(x.suscripcion.id));
  const total = sel.reduce((t, x) => t + centavos(x.precioUsd!), 0);
  const queda = centavos(saldoUsd) - total;
  const todos = filas.length > 0 && sel.length === filas.length;
  const deshabilitada = Boolean(bloqueo) || cargando;

  function elegir(id: string, si: boolean) {
    setElegidos((s) => {
      const n = new Set(s);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  }
  const elegirTodos = (si: boolean) =>
    setElegidos(si ? new Set(filas.map((x) => x.suscripcion.id)) : new Set());

  async function renovar() {
    setCargando(true);
    setProblemas({});
    const ids = sel.map((x) => x.suscripcion.id);
    const r = await llamarApi<ResultadoRenovacionLote>('POST', '/revendedor/renovaciones/lote', {
      suscripcionIds: ids,
      claveIdempotencia: clave,
    });
    setCargando(false);
    if (!r.ok) {
      // Con el lote rechazado no se cobró nada: se marca cada servicio con su motivo.
      setProblemas(
        Object.fromEntries(Object.entries(r.error.campos ?? {}).map(([id, m]) => [id, m[0] ?? ''])),
      );
      notificar(r.error.mensaje, 'error');
      // Si la red falló, la misma clave evita cobrar dos veces al reintentar.
      if (r.error.estado !== 0) setClave(claveNueva());
      return;
    }
    const n = r.datos.renovadas.length;
    setClave(claveNueva());
    setElegidos(new Set());
    notificar(
      `Renovaste ${n} ${n === 1 ? 'servicio' : 'servicios'} por ${usd(r.datos.totalUsd)}. Saldo: ${usd(r.datos.saldoUsd)}`,
    );
    router.refresh();
  }

  return (
    <>
      <div role="group" aria-label="Filtrar renovaciones" className="flex flex-wrap gap-2">
        {FILTROS.map(([f, t]) => (
          <Link
            key={f}
            href={
              f === 'urgentes' ? '/revendedor/renovaciones' : `/revendedor/renovaciones?filtro=${f}`
            }
            className="chip"
            aria-current={lista.filtro === f ? 'page' : undefined}
            scroll={false}
          >
            {t} · {lista.totales[f].cantidad}
          </Link>
        ))}
      </div>

      {filas.length === 0 ? (
        <Vacio>Nada que renovar con este filtro.</Vacio>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[0.86rem] text-tinta-suave">
            <span>
              Tu saldo: <b className="text-tinta tabular-nums">{usd(saldoUsd)}</b>
            </span>
            <button
              type="button"
              className={claseEnlace}
              disabled={deshabilitada}
              onClick={() => elegirTodos(!todos)}
            >
              {todos
                ? 'Quitar todos'
                : filas.length === 1
                  ? 'Elegir el servicio'
                  : `Elegir los ${filas.length}`}
            </button>
          </div>
          <div className={claseTabla}>
            <table className="t-tab">
              <thead>
                <tr>
                  <th scope="col" className="chk">
                    <Casilla
                      marcada={todos}
                      etiqueta="Elegir todos"
                      deshabilitada={deshabilitada}
                      onCambiar={elegirTodos}
                    />
                  </th>
                  <th scope="col">Cliente y servicio</th>
                  <th scope="col">Vence</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">
                    Precio
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ suscripcion: s, precioUsd }) => {
                  const [texto, tono] = venceCorto(s);
                  const [estado, tonoEstado] = ESTADO_SERVICIO[s.estado];
                  const marcada = elegidos.has(s.id);
                  return (
                    <tr key={s.id} data-sel={marcada || undefined}>
                      <td className="chk">
                        <Casilla
                          marcada={marcada}
                          etiqueta={`Elegir ${s.cliente.nombre} · ${s.plan.servicio}`}
                          deshabilitada={deshabilitada}
                          onCambiar={(v) => elegir(s.id, v)}
                        />
                      </td>
                      <td data-l="Cliente">
                        <CeldaPlan
                          servicio={{
                            slug: s.plan.servicioSlug,
                            categoria: s.plan.categoria,
                            nombre: s.plan.servicio,
                          }}
                          titulo={s.cliente.nombre}
                          detalle={`${s.plan.servicio} ${s.plan.nombre}`}
                        />
                        {problemas[s.id] && (
                          <small className="!text-peligro">{problemas[s.id]}</small>
                        )}
                      </td>
                      <td data-l="Vence">
                        <span className={claseVence(tono)}>{texto}</span>
                      </td>
                      <td data-l="Estado">
                        <PildoraEstado texto={estado} tono={tonoEstado} />
                      </td>
                      <td data-l="Precio" className="num">
                        {usd(precioUsd!)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sel.length > 0 && (
        <div
          aria-live="polite"
          className="sticky bottom-[calc(var(--nv-barra-inferior,0px)+0.75rem+env(safe-area-inset-bottom,0px))] z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.125rem] border border-cian/45 bg-[rgb(11_16_38/0.96)] py-2.5 pr-2.5 pl-4 shadow-[0_16px_36px_-12px_rgb(0_0_0/0.8)] backdrop-blur-md"
        >
          <div className="grid gap-0.5">
            <b className="text-[0.95rem] tabular-nums">
              {sel.length} {sel.length === 1 ? 'elegido' : 'elegidos'} · {usd(total / 100)}
            </b>
            <span
              className={clsx(
                'text-[0.82rem] tabular-nums',
                queda < 0 ? 'font-semibold text-peligro' : 'text-tinta-suave',
              )}
            >
              {queda < 0 ? `Te faltan ${usd(-queda / 100)}` : `Te quedan ${usd(queda / 100)}`}
            </span>
          </div>
          {queda < 0 ? (
            <BotonEnlace href="/revendedor/saldo">Recargar saldo</BotonEnlace>
          ) : (
            <Boton
              cargando={cargando}
              disabled={Boolean(bloqueo)}
              title={bloqueo ?? undefined}
              onClick={() => void renovar()}
            >
              {cargando ? `Renovando ${sel.length}…` : `Renovar ${sel.length}`}
            </Boton>
          )}
        </div>
      )}
    </>
  );
}
