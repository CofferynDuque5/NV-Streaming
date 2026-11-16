import {
  type CajaDia,
  diaCajaSchema,
  ETIQUETA_MOVIMIENTO_CAJA,
  formatearMonto,
  type GananciaDia,
  type TotalCaja,
  ZONA_HORARIA,
} from '@nv/shared';
import clsx from 'clsx';
import { ArrowRight, CalendarDays, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CerrarCaja } from '@/componentes/admin/caja';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { clasesEntradaAuto } from '@/componentes/ui/clases';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Caja diaria' };

const hora = new Intl.DateTimeFormat('es-VE', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: ZONA_HORARIA,
});
const diaLargo = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Totales por moneda y método, con la suma de cada moneda. */
function Totales({ totales }: { totales: TotalCaja[] }) {
  const porMoneda = new Map<string, TotalCaja[]>();
  for (const t of totales) porMoneda.set(t.moneda, [...(porMoneda.get(t.moneda) ?? []), t]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...porMoneda].map(([moneda, filas]) => {
        const suma = filas.reduce((s, f) => s + Number(f.monto), 0);
        return (
          <div key={moneda} className="rounded-xl border border-borde bg-hundida/50 p-4">
            <p className="text-xs font-medium tracking-wide text-tinta-tenue uppercase">{moneda}</p>
            <p className="mt-1 font-titulo text-2xl font-semibold tabular-nums">
              {formatearMonto(suma.toFixed(2), filas[0]!.moneda)}
            </p>
            <ul className="mt-3 grid gap-1 text-sm text-tinta-suave">
              {filas.map((f) => (
                <li key={f.metodo ?? '-'} className="flex justify-between gap-3">
                  <span>
                    {f.metodo ?? 'Sin método'}{' '}
                    <span className="text-tinta-tenue">· {f.cantidad}</span>
                  </span>
                  <span className="tabular-nums">{formatearMonto(f.monto, f.moneda)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const usd = (m: string) => formatearMonto(m, 'USD');

/** Una cifra de la cuenta del día: etiqueta, monto y una nota corta. */
function Cifra({
  etiqueta,
  monto,
  nota,
  signo,
  destacada,
}: {
  etiqueta: string;
  monto: string;
  nota?: string;
  signo?: '+' | '−';
  destacada?: boolean;
}) {
  const negativo = monto.startsWith('-');
  return (
    <div
      className={clsx(
        'grid gap-0.5 rounded-xl border p-4',
        destacada ? 'border-marca/40 bg-marca/10' : 'border-borde bg-hundida/50',
      )}
    >
      <p className="text-xs font-medium tracking-wide text-tinta-tenue uppercase">{etiqueta}</p>
      <p
        className={clsx(
          'font-titulo text-2xl font-semibold tabular-nums',
          negativo ? 'text-peligro' : destacada && 'text-exito',
        )}
      >
        {signo && <span className="mr-1 text-tinta-tenue">{signo}</span>}
        {usd(monto)}
      </p>
      {nota && <p className="text-xs text-tinta-suave">{nota}</p>}
    </div>
  );
}

/** Ventas del día, lo que cuestan, lo que se paga a proveedores y lo que queda. */
function GananciaDelDia({ g, hoy }: { g: GananciaDia; hoy: boolean }) {
  const ventas = (Number(g.ventasClientesUsd) + Number(g.ventasRevendedoresUsd)).toFixed(2);
  return (
    <Tarjeta>
      <CabeceraTarjeta
        titulo="Cuentas y ganancia del día"
        descripcion="En USD. Ventas confirmadas menos el costo de cada plan vendido, y lo que queda después de pagar las cuentas de los proveedores."
      />
      <div className="grid gap-5 p-5 sm:p-6">
        <div
          className={clsx(
            'grid gap-3',
            Number(g.reembolsosUsd) > 0 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          <Cifra
            etiqueta="Vendido"
            monto={ventas}
            nota={
              Number(g.ventasRevendedoresUsd) > 0
                ? `Clientes ${usd(g.ventasClientesUsd)} · revendedores ${usd(g.ventasRevendedoresUsd)}`
                : 'Pagos de clientes confirmados'
            }
          />
          <Cifra
            etiqueta="Costo de lo vendido"
            signo="−"
            monto={g.costoVendidoUsd}
            nota={
              g.vendidosSinCosto
                ? `${g.vendidosSinCosto} sin costo en el catálogo: escríbelo en el plan`
                : 'Costo escrito en cada plan'
            }
          />
          {Number(g.reembolsosUsd) > 0 && (
            <Cifra etiqueta="Reembolsos" signo="−" monto={g.reembolsosUsd} />
          )}
          <Cifra
            etiqueta="Ganancia de lo vendido"
            monto={g.gananciaVentasUsd}
            nota="Vendido − costo − reembolsos"
            destacada
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Cifra
            etiqueta="Pagado a proveedores"
            signo="−"
            monto={g.pagadoProveedoresUsd}
            nota={
              g.pagosProveedor.length === 1
                ? '1 cuenta pagada este día'
                : `${g.pagosProveedor.length} cuentas pagadas este día`
            }
          />
          <Cifra
            etiqueta={hoy ? 'Falta pagar hoy' : 'Vencía y sigue sin pagar'}
            signo="−"
            monto={g.porPagarUsd}
            nota={
              g.porPagar.length === 0
                ? 'Ninguna cuenta pendiente'
                : g.porPagar.length === 1
                  ? '1 cuenta por pagar'
                  : `${g.porPagar.length} cuentas por pagar`
            }
          />
          <Cifra
            etiqueta="Queda"
            monto={g.quedaUsd}
            nota="Vendido − reembolsos − pagado − por pagar"
            destacada
          />
        </div>

        {g.porPagar.length > 0 && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Cuentas por pagar</h3>
              <Link
                href="/admin/cuentas/por-pagar"
                className="inline-flex items-center gap-1 text-sm text-marca hover:underline"
              >
                Pagarlas en Por pagar <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <ul className="divide-y divide-borde rounded-xl border border-borde">
              {g.porPagar.slice(0, 8).map((c) => (
                <li
                  key={c.cuenta.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <b>{c.cuenta.servicio.nombre}</b>{' '}
                    <span className="text-tinta-suave">· {c.cuenta.pista}</span>
                    {c.cuenta.proveedor && (
                      <span className="text-tinta-tenue"> · {c.cuenta.proveedor}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {c.dias < 0 && (
                      <Insignia tono="peligro">
                        {c.dias === -1 ? '1 día de atraso' : `${-c.dias} días de atraso`}
                      </Insignia>
                    )}
                    <b className="tabular-nums">{usd(c.costoUsd)}</b>
                  </span>
                </li>
              ))}
            </ul>
            {g.porPagar.length > 8 && (
              <p className="text-xs text-tinta-tenue">
                Y {g.porPagar.length - 8} más en Por pagar.
              </p>
            )}
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

export default async function Caja({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sesion = await requerirSesion({ permiso: 'caja.ver' });
  const puedeCerrar = sesion.permisos.includes('caja.cerrar');
  const { dia: crudo } = await searchParams;
  const dia = diaCajaSchema.safeParse(crudo).success ? crudo : undefined;
  const verGanancia = sesion.permisos.includes('balance.ver');
  const [{ datos: caja, estado }, ganancia] = await Promise.all([
    leerApi<CajaDia>(dia ? `/caja?dia=${dia}` : '/caja'),
    verGanancia
      ? leerApi<GananciaDia>(dia ? `/balance/dia?dia=${dia}` : '/balance/dia')
      : Promise.resolve(null),
  ]);

  // Hoy en Venezuela (AAAA-MM-DD): no se puede pedir la caja de un día que no ha llegado.
  const hoyCaracas = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(
    new Date(),
  );
  const ultimo = caja?.cierres.at(-1);
  const puedeCerrarAhora = puedeCerrar && caja && (!ultimo || caja.movimientosDespuesDelCierre > 0);
  const titulo = caja ? diaLargo.format(new Date(`${caja.dia}T12:00:00Z`)) : '';

  return (
    <>
      <CabeceraPagina
        titulo="Caja diaria"
        descripcion="Lo que entró cada día según los pagos, recargas y reembolsos ya confirmados, por método y moneda. Hora de Venezuela."
        acciones={
          caja && puedeCerrarAhora ? (
            <CerrarCaja dia={caja.dia} nuevoCierre={Boolean(ultimo)} />
          ) : undefined
        }
      />

      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Elegir el día de la caja"
      >
        <label htmlFor="dia" className="grid gap-1.5 text-sm font-medium">
          Día
          <input
            id="dia"
            name="dia"
            type="date"
            defaultValue={caja?.dia ?? dia ?? hoyCaracas}
            max={hoyCaracas}
            className={clasesEntradaAuto}
          />
        </label>
        <Boton type="submit" variante="secundario" icono={<CalendarDays className="size-4" />}>
          Ver
        </Boton>
        {caja && !caja.hoy && (
          <Link href="/admin/caja" className="text-sm text-marca hover:underline">
            Volver a hoy
          </Link>
        )}
      </form>

      {!caja ? (
        <Alerta tono="peligro">
          {estado === 400
            ? 'Ese día todavía no llega. Elige hoy o un día anterior.'
            : 'No pudimos cargar la caja. Recarga la página.'}
        </Alerta>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <Tarjeta>
            <CabeceraTarjeta
              titulo={caja.hoy ? `Hoy, ${titulo}` : titulo}
              descripcion={
                ultimo
                  ? `Cerrada a las ${hora.format(new Date(ultimo.hasta))} por ${ultimo.cerradoPor.nombre}${caja.cierres.length > 1 ? ` (cierre ${ultimo.secuencia})` : ''}.`
                  : caja.hoy
                    ? 'Caja abierta.'
                    : 'Este día no se cerró.'
              }
              accion={
                ultimo ? (
                  <Insignia tono={caja.movimientosDespuesDelCierre ? 'aviso' : 'exito'}>
                    {caja.movimientosDespuesDelCierre
                      ? 'Entró dinero después del cierre'
                      : 'Cerrada'}
                  </Insignia>
                ) : (
                  <Insignia tono={caja.hoy ? 'marca' : 'neutro'}>
                    {caja.hoy ? 'Abierta' : 'Sin cerrar'}
                  </Insignia>
                )
              }
            />
            <div className="p-5 sm:p-6">
              {caja.totales.length === 0 ? (
                <p className="text-sm text-tinta-suave">No entró dinero este día.</p>
              ) : (
                <Totales totales={caja.totales} />
              )}
              {caja.movimientosDespuesDelCierre > 0 && (
                <div className="mt-5 grid gap-3">
                  <h3 className="text-sm font-semibold">
                    Después del último cierre ({caja.movimientosDespuesDelCierre})
                  </h3>
                  <Totales totales={caja.despuesDelCierre} />
                </div>
              )}
            </div>
          </Tarjeta>

          {ganancia?.datos && <GananciaDelDia g={ganancia.datos} hoy={caja.hoy} />}

          <Tarjeta>
            <CabeceraTarjeta
              titulo="Movimientos"
              descripcion="Los pagos con saldo de la billetera no se suman: ese dinero ya entró con la recarga."
            />
            {caja.movimientos.length === 0 ? (
              <EstadoVacio icono={Wallet} titulo="Sin movimientos este día" />
            ) : (
              <Tabla minimo="48rem">
                <Encabezados
                  columnas={[
                    'Hora',
                    'Tipo',
                    'Cliente o revendedor',
                    'Método',
                    { texto: 'Monto', className: 'text-right' },
                    { texto: 'Confirmó', className: 'pr-5 sm:pr-6' },
                  ]}
                />
                <Cuerpo>
                  {caja.movimientos.map((m) => (
                    <tr
                      key={m.id}
                      className={clsx(
                        ultimo &&
                          Date.parse(m.en) >= Date.parse(ultimo.hasta) &&
                          'bg-aviso-suave/40',
                      )}
                    >
                      <Celda primera className="tabular-nums text-tinta-suave">
                        {hora.format(new Date(m.en))}
                      </Celda>
                      <Celda>
                        <span className="block">{ETIQUETA_MOVIMIENTO_CAJA[m.tipo]}</span>
                        <span className="block font-mono text-xs text-tinta-tenue">
                          {m.referencia}
                        </span>
                      </Celda>
                      <Celda>{m.quien}</Celda>
                      <Celda className="text-tinta-suave">{m.metodo ?? '—'}</Celda>
                      <Celda
                        className={clsx(
                          'text-right font-semibold tabular-nums',
                          m.monto.startsWith('-') && 'text-peligro',
                        )}
                      >
                        {formatearMonto(m.monto, m.moneda)}
                      </Celda>
                      <Celda className="pr-5 text-tinta-suave sm:pr-6">
                        {m.por?.nombre ?? 'Automático'}
                      </Celda>
                    </tr>
                  ))}
                </Cuerpo>
              </Tabla>
            )}
          </Tarjeta>

          {caja.cierres.length > 0 && (
            <Tarjeta>
              <CabeceraTarjeta
                titulo="Cierres de este día"
                descripcion="Cada cierre es una foto: no se edita. El más reciente es el que vale."
              />
              <ul className="divide-y divide-borde">
                {caja.cierres.map((c) => (
                  <li key={c.id} className="grid gap-3 px-5 py-4 sm:px-6">
                    <p className="text-sm">
                      <span className="font-semibold">Cierre {c.secuencia}</span>
                      <span className="text-tinta-suave">
                        {' '}
                        · {hora.format(new Date(c.hasta))} · {c.cerradoPor.nombre} ·{' '}
                        {c.movimientos === 1 ? '1 movimiento' : `${c.movimientos} movimientos`}
                      </span>
                    </p>
                    {c.notas && <p className="text-sm text-tinta-suave">«{c.notas}»</p>}
                    {c.totales.length > 0 && <Totales totales={c.totales} />}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      )}
    </>
  );
}
