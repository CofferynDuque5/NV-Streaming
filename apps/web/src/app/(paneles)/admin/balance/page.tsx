import { type BalancePeriodo, balanceSchema, formatearMonto, ZONA_HORARIA } from '@nv/shared';
import clsx from 'clsx';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PorPagarTarjeta } from '@/componentes/admin/por-pagar';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntrada } from '@/componentes/ui/clases';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearDia } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Balance' };

const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Atajos de período, calculados con el día de Venezuela. */
function atajos(hoy: string) {
  const [a, m] = hoy.split('-').map(Number) as [number, number];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const mesPasadoInicio = iso(new Date(Date.UTC(a, m - 2, 1)));
  const mesPasadoFin = iso(new Date(Date.UTC(a, m - 1, 0)));
  const hace30 = iso(new Date(Date.parse(`${hoy}T00:00:00Z`) - 29 * 86_400_000));
  return [
    { texto: 'Este mes', desde: inicioMes, hasta: hoy },
    { texto: 'Mes pasado', desde: mesPasadoInicio, hasta: mesPasadoFin },
    { texto: 'Últimos 30 días', desde: hace30, hasta: hoy },
    { texto: 'Este año', desde: `${a}-01-01`, hasta: hoy },
  ];
}

function Cifra({
  titulo,
  valor,
  detalle,
  tono,
}: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  tono?: 'exito' | 'peligro';
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5 rounded-xl border border-borde bg-hundida/50 p-4">
      <span className="text-xs font-medium text-tinta-suave">{titulo}</span>
      <b
        className={clsx(
          'font-titulo text-2xl font-semibold [overflow-wrap:anywhere] tabular-nums',
          tono === 'exito' && 'text-exito',
          tono === 'peligro' && 'text-peligro',
        )}
      >
        {valor}
      </b>
      {detalle && <small className="text-xs text-tinta-tenue">{detalle}</small>}
    </div>
  );
}

const plural = (n: number, uno: string, varios: string) =>
  n === 1 ? `1 ${uno}` : `${n} ${varios}`;

export default async function Balance({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requerirSesion({ permiso: 'balance.ver' });
  const crudo = await searchParams;
  const filtro = balanceSchema.safeParse({
    ...(crudo.desde ? { desde: crudo.desde } : {}),
    ...(crudo.hasta ? { hasta: crudo.hasta } : {}),
  });
  const q = new URLSearchParams(
    Object.entries(filtro.success ? filtro.data : {}).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  const r = await leerApi<BalancePeriodo>(`/balance${q.size ? `?${q}` : ''}`);
  const b = r.datos;
  const hoy = DIA.format(new Date());

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <CabeceraPagina
        titulo="Balance"
        descripcion="Lo que vendiste, lo que devolviste y lo que te costaron las cuentas en el período, en USD. Abajo, lo que hoy está por cobrar y por pagar."
      />

      <Tarjeta>
        <form
          className="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6"
          aria-label="Período del balance"
        >
          <div className="grid gap-1.5">
            <label htmlFor="desde" className="text-sm font-medium">
              Desde
            </label>
            <input
              id="desde"
              name="desde"
              type="date"
              max={hoy}
              defaultValue={b?.desde ?? crudo.desde}
              className={clasesEntrada}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="hasta" className="text-sm font-medium">
              Hasta
            </label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={b?.hasta ?? crudo.hasta}
              className={clasesEntrada}
            />
          </div>
          <Boton type="submit" variante="secundario">
            Ver
          </Boton>
          <nav aria-label="Atajos de período" className="flex flex-wrap gap-2">
            {atajos(hoy).map((a) => {
              const activo = b?.desde === a.desde && b?.hasta === a.hasta;
              return (
                <Link
                  key={a.texto}
                  href={`/admin/balance?desde=${a.desde}&hasta=${a.hasta}`}
                  aria-current={activo ? 'true' : undefined}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-sm',
                    activo
                      ? 'border-marca/60 bg-marca/10 text-tinta'
                      : 'border-borde text-tinta-suave hover:border-borde-fuerte hover:text-tinta',
                  )}
                >
                  {a.texto}
                </Link>
              );
            })}
          </nav>
        </form>
      </Tarjeta>

      {!filtro.success && (
        <Alerta tono="aviso">Revisa las fechas: la inicial va antes que la final.</Alerta>
      )}
      {!b ? (
        <Alerta tono="peligro">
          {r.estado === 400
            ? 'El período puede tener hasta un año y la fecha inicial va antes que la final.'
            : 'No pudimos cargar el balance. Recarga la página.'}
        </Alerta>
      ) : (
        <>
          <Tarjeta>
            <CabeceraTarjeta
              titulo={`Del ${formatearDia(b.desde)} al ${formatearDia(b.hasta)}`}
              descripcion="Ventas: facturas con pago confirmado (como en Métricas) y compras de revendedores. Las recargas de saldo cuentan cuando se gastan."
            />
            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
              <Cifra
                titulo="Ventas a clientes"
                valor={formatearMonto(b.ventasClientesUsd, 'USD')}
                detalle={plural(b.pagosClientes, 'pago confirmado', 'pagos confirmados')}
              />
              <Cifra
                titulo="Ventas a revendedores"
                valor={formatearMonto(b.ventasRevendedoresUsd, 'USD')}
                detalle={plural(b.comprasRevendedores, 'compra', 'compras')}
              />
              <Cifra titulo="Reembolsos" valor={`− ${formatearMonto(b.reembolsosUsd, 'USD')}`} />
              <Cifra
                titulo="Costo de las cuentas"
                valor={`− ${formatearMonto(b.costosProveedorUsd, 'USD')}`}
                detalle={plural(b.pagosProveedor, 'pago al proveedor', 'pagos al proveedor')}
              />
              <Cifra
                titulo="Resultado"
                valor={formatearMonto(b.netoUsd, 'USD')}
                tono={Number(b.netoUsd) < 0 ? 'peligro' : 'exito'}
                detalle="Ventas − reembolsos − costos"
              />
              <Cifra
                titulo="Margen mensual estimado"
                valor={formatearMonto(
                  (
                    Number(b.ingresoMensualRecurrenteUsd) - Number(b.costoMensualCuentasUsd)
                  ).toFixed(2),
                  'USD',
                )}
                detalle={`${formatearMonto(b.ingresoMensualRecurrenteUsd, 'USD')} de suscripciones − ${formatearMonto(b.costoMensualCuentasUsd, 'USD')} de cuentas activas, al mes`}
              />
            </div>
          </Tarjeta>

          {b.costosPorServicio.length > 0 && (
            <Tarjeta>
              <CabeceraTarjeta titulo="Costos por servicio" />
              <ul className="divide-y divide-borde">
                {b.costosPorServicio.map((c) => (
                  <li
                    key={c.servicio.id}
                    className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6"
                  >
                    <span className="min-w-0 truncate">
                      {c.servicio.nombre}{' '}
                      <span className="text-xs text-tinta-tenue">
                        · {plural(c.pagos, 'pago', 'pagos')}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatearMonto(c.montoUsd, 'USD')}
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Cifra
              titulo="Por cobrar hoy"
              valor={formatearMonto(b.porCobrar.totalUsd, 'USD')}
              detalle={
                <>
                  {plural(b.porCobrar.facturas, 'factura emitida', 'facturas emitidas')}
                  {b.porCobrar.vencidas ? `, ${b.porCobrar.vencidas} vencidas` : ''} ·{' '}
                  <Link href="/admin/cobros" className="underline hover:text-tinta">
                    Ver cobros
                  </Link>
                </>
              }
            />
            <Cifra
              titulo="Por pagar a proveedores"
              valor={formatearMonto(
                (Number(b.porPagar.totalAtrasadoUsd) + Number(b.porPagar.totalProximoUsd)).toFixed(
                  2,
                ),
                'USD',
              )}
              tono={b.porPagar.atrasadas.length ? 'peligro' : undefined}
              detalle={
                b.porPagar.atrasadas.length
                  ? `${formatearMonto(b.porPagar.totalAtrasadoUsd, 'USD')} atrasado`
                  : 'Atrasado y de los próximos 7 días'
              }
            />
          </div>
          <PorPagarTarjeta datos={b.porPagar} />
        </>
      )}
    </div>
  );
}
