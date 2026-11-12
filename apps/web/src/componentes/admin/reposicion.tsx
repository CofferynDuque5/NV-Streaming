'use client';

import type { PerfilPorReponer, ResultadoReposicion } from '@nv/shared';
import { ArrowRightLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Casilla } from '@/componentes/ui/selector';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { llamarApi } from '@/lib/api-cliente';
import { formatearFecha } from '@/lib/formato';

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);

/** Agrupa por servicio y cuenta caída, en el orden que llegó (la caída más vieja primero). */
function porCuenta(lista: PerfilPorReponer[]) {
  const mapa = new Map<string, PerfilPorReponer[]>();
  for (const p of lista) mapa.set(p.cuentaId, [...(mapa.get(p.cuentaId) ?? []), p]);
  return [...mapa.values()];
}

export function ColaReposicion({
  pendientes,
  puedeReponer,
}: {
  pendientes: PerfilPorReponer[];
  puedeReponer: boolean;
}) {
  const router = useRouter();
  const [compensar, setCompensar] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<{ perfilId: string; mensaje: string } | null>(null);
  const [hecho, setHecho] = useState<{ cliente: string; r: ResultadoReposicion } | null>(null);

  async function reponer(p: PerfilPorReponer) {
    setOcupado(p.perfilId);
    setError(null);
    setHecho(null);
    const r = await llamarApi<ResultadoReposicion>('POST', `/cuentas/reposicion/${p.perfilId}`, {
      compensar,
    });
    setOcupado(null);
    if (!r.ok) {
      setError({ perfilId: p.perfilId, mensaje: r.error.mensaje });
      return;
    }
    setHecho({ cliente: p.suscripcion.cliente.nombre, r: r.datos });
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      {puedeReponer && pendientes.length > 0 && (
        <Casilla
          etiqueta="Sumar al vencimiento los días que estuvieron sin servicio"
          ayuda="Se cuentan desde que marcaste la cuenta como caída."
          checked={compensar}
          onChange={(e) => setCompensar(e.currentTarget.checked)}
        />
      )}
      {hecho && (
        <Alerta tono="exito">
          {hecho.cliente} pasó a {hecho.r.perfil.nombre} de{' '}
          <Link
            href={`/admin/cuentas/${hecho.r.cuentaId}`}
            className="font-medium text-marca underline-offset-2 hover:underline"
          >
            {hecho.r.cuentaPista}
          </Link>
          {hecho.r.diasCompensados > 0 && `, con ${dias(hecho.r.diasCompensados)} más`}. Envíale sus
          datos nuevos desde la cuenta.
        </Alerta>
      )}
      {pendientes.length === 0 && (
        <Tarjeta>
          <EstadoVacio icono={ShieldCheck} titulo="Nadie espera reposición">
            Cuando marques una cuenta como caída, sus clientes con perfil aparecerán aquí.
          </EstadoVacio>
        </Tarjeta>
      )}
      {porCuenta(pendientes).map((grupo) => {
        const c = grupo[0]!;
        return (
          <Tarjeta key={c.cuentaId}>
            <section aria-label={`${c.servicio.nombre} · ${c.cuentaPista}`}>
              <CabeceraTarjeta
                titulo={`${c.servicio.nombre} · ${c.cuentaPista}`}
                descripcion={
                  <>
                    {c.caidaEn
                      ? `Caída desde el ${formatearFecha(c.caidaEn)} (${dias(c.diasPerdidos)}).`
                      : 'Caída.'}{' '}
                    {c.libres === 0
                      ? 'No hay perfiles libres de este servicio: agrega una cuenta al inventario.'
                      : `${c.libres === 1 ? 'Queda 1 perfil libre' : `Quedan ${c.libres} perfiles libres`} en otras cuentas.`}
                  </>
                }
                accion={
                  <Link
                    href={`/admin/cuentas/${c.cuentaId}`}
                    className="text-sm text-marca underline-offset-2 hover:underline"
                  >
                    Ver la cuenta
                  </Link>
                }
              />
              <ul className="divide-y divide-borde">
                {grupo.map((p) => (
                  <li
                    key={p.perfilId}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6"
                  >
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <Link
                        href={`/admin/suscripciones/${p.suscripcion.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {p.suscripcion.cliente.nombre}
                      </Link>
                      <span className="text-xs text-tinta-suave">
                        {p.perfil.nombre}
                        {p.suscripcion.venceEn &&
                          ` · vence el ${formatearFecha(p.suscripcion.venceEn)}`}
                      </span>
                    </div>
                    {puedeReponer && (
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        cargando={ocupado === p.perfilId}
                        disabled={p.libres === 0}
                        icono={<ArrowRightLeft className="size-4" />}
                        onClick={() => void reponer(p)}
                        aria-label={`Reponer a ${p.suscripcion.cliente.nombre}`}
                      >
                        Reponer
                      </Boton>
                    )}
                    {error?.perfilId === p.perfilId && (
                      <Alerta tono="peligro" className="w-full">
                        {error.mensaje}
                      </Alerta>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </Tarjeta>
        );
      })}
    </div>
  );
}
