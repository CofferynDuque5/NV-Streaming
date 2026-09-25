import {
  type CatalogoMayorista,
  type ClienteCartera,
  formatearMonto,
  type Pagina,
  type ResumenRevendedor,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, Package } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ComprarPlan } from '@/componentes/revendedor/formularios';
import { AvisosRevendedor, motivoBloqueo, SinFicha } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearDuracion } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Catálogo mayorista' };

export default async function Catalogo({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  await requerirSesion({ roles: ['revendedor'] });
  const { plan: planPedido } = await searchParams;
  const [{ estado, datos: resumen }, { datos: catalogo }, { datos: cartera }] = await Promise.all([
    leerApi<ResumenRevendedor>('/revendedor/resumen'),
    leerApi<CatalogoMayorista>('/revendedor/catalogo'),
    leerApi<Pagina<ClienteCartera>>('/revendedor/clientes?porPagina=100'),
  ]);
  const cabecera = (
    <CabeceraPagina
      titulo="Catálogo mayorista"
      descripcion="Compra activaciones con tu saldo al precio de tu nivel. El servicio queda activo al momento."
    />
  );
  if (estado === 404) {
    return (
      <>
        {cabecera}
        <SinFicha />
      </>
    );
  }
  if (!resumen || !catalogo) {
    return (
      <>
        {cabecera}
        <Alerta tono="peligro">No pudimos cargar el catálogo. Recarga la página.</Alerta>
      </>
    );
  }
  const r = resumen.revendedor;
  const bloqueo = motivoBloqueo(r);
  const clientes = (cartera?.elementos ?? []).map((c) => ({ id: c.id, nombre: c.nombre }));
  // ?plan= (desde "Comprar con saldo" en el sitio): ese plan va primero y con la compra abierta.
  const elegido =
    typeof planPedido === 'string' ? catalogo.planes.find((p) => p.id === planPedido) : undefined;
  const planes = elegido
    ? [elegido, ...catalogo.planes.filter((p) => p !== elegido)]
    : catalogo.planes;

  return (
    <>
      {cabecera}
      <AvisosRevendedor revendedor={r} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-superficie px-4 py-3 text-sm">
        <span>
          Saldo disponible:{' '}
          <strong className="tabular-nums">{formatearMonto(r.saldoUsd, 'USD')}</strong>
          {catalogo.nivel && (
            <span className="text-tinta-suave"> · Nivel {catalogo.nivel.nombre}</span>
          )}
        </span>
        <Link href="/revendedor/saldo" className="font-medium text-marca hover:underline">
          Recargar saldo
        </Link>
      </div>

      {typeof planPedido === 'string' &&
        (elegido ? (
          <Alerta tono="info" titulo={`Comprar ${elegido.servicio.nombre} · ${elegido.nombre}`}>
            Indica para quién es y confirma: se cobra de tu saldo al precio de tu nivel.
          </Alerta>
        ) : (
          <Alerta tono="aviso">Ese plan no está disponible para tu nivel. Elige otro.</Alerta>
        ))}

      {catalogo.planes.length === 0 ? (
        <Tarjeta>
          <EstadoVacio icono={Package} titulo="No hay planes disponibles para tu nivel">
            {catalogo.nivel
              ? 'El equipo de NV todavía no publicó precios mayoristas para tu nivel.'
              : 'Cuando el equipo te asigne un nivel verás aquí los planes que puedes vender.'}
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {planes.map((p) => {
            const margen = Number(p.precioPublicoUsd) - Number(p.precioUsd);
            return (
              <li key={p.id} className="min-w-0">
                <Tarjeta
                  className={clsx(
                    'flex h-full flex-col',
                    p === elegido && 'border-marca/50 ring-2 ring-marca/30',
                  )}
                  aria-labelledby={`plan-${p.id}`}
                >
                  <div className="grid flex-1 content-start gap-3 px-5 py-5 sm:px-6">
                    <div className="grid gap-0.5">
                      <p className="text-xs font-medium text-tinta-tenue">{p.servicio.nombre}</p>
                      <h2 id={`plan-${p.id}`} className="text-base font-semibold">
                        {p.nombre}
                      </h2>
                      <p className="text-sm text-tinta-suave">
                        {formatearDuracion(p.duracionCantidad, p.duracionUnidad)}
                        {p.renovable ? ' · renovable' : ''}
                      </p>
                    </div>
                    <div className="grid gap-0.5">
                      <p className="font-titulo text-2xl font-semibold tabular-nums">
                        {formatearMonto(p.precioUsd, 'USD')}
                      </p>
                      <p className="text-xs text-tinta-suave">
                        {p.precioVes ? `≈ ${formatearMonto(p.precioVes, 'VES')} · ` : ''}
                        Precio al público {formatearMonto(p.precioPublicoUsd, 'USD')}
                        {margen > 0 ? ` (margen ${formatearMonto(margen.toFixed(2), 'USD')})` : ''}
                      </p>
                    </div>
                    {p.descripcion && <p className="text-sm text-tinta-suave">{p.descripcion}</p>}
                    {p.beneficios.length > 0 && (
                      <ul className="grid gap-1.5 text-sm">
                        {p.beneficios.map((b) => (
                          <li key={b} className="flex gap-2">
                            <Check
                              className="mt-0.5 size-4 shrink-0 text-exito"
                              aria-hidden="true"
                            />
                            <span className="min-w-0">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border-t border-borde px-5 py-4 sm:px-6">
                    <ComprarPlan
                      plan={p}
                      clientes={clientes}
                      saldoUsd={r.saldoUsd}
                      bloqueado={bloqueo}
                      abiertoInicial={p === elegido}
                    />
                  </div>
                </Tarjeta>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
