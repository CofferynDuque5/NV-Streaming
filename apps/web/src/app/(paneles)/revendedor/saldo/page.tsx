import {
  type CatalogoPublico,
  formatearMonto,
  type MetodoCobroPublico,
  type Moneda,
  type MovimientoSaldoPublico,
  type Pagina,
  paginacionSchema,
  type RecargaPublica,
  type ResumenRevendedor,
} from '@nv/shared';
import clsx from 'clsx';
import { FileText, ReceiptText, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { Paginacion } from '@/componentes/panel/paginacion';
import { FormularioRecarga } from '@/componentes/revendedor/formularios';
import {
  AvisosRevendedor,
  EstadoRecargaInsignia,
  motivoBloqueo,
  SinFicha,
} from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Celda, Cuerpo, Encabezados, Tabla } from '@/componentes/ui/tabla';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { leerFiltro } from '@/lib/consulta';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { montoConSigno, TIPO_MOVIMIENTO } from '@/lib/revendedores';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Saldo y recargas' };

const MAX_MB = Number(process.env.COMPROBANTE_MAX_MB ?? 5);
type Crudo = Record<string, string | string[] | undefined>;

export default async function Saldo({ searchParams }: { searchParams: Promise<Crudo> }) {
  await requerirSesion({ roles: ['revendedor'] });
  const { consulta } = leerFiltro(paginacionSchema, await searchParams, { porPagina: 20 });
  const [{ estado, datos: resumen }, { datos: recargas }, { datos: libro }, metodos, catalogo] =
    await Promise.all([
      leerApi<ResumenRevendedor>('/revendedor/resumen'),
      leerApi<Pagina<RecargaPublica>>('/revendedor/recargas?porPagina=10'),
      leerApi<Pagina<MovimientoSaldoPublico>>(`/revendedor/movimientos?${consulta}`),
      leerApi<MetodoCobroPublico[]>('/revendedor/metodos-cobro').then((r) => r.datos ?? []),
      leerApi<CatalogoPublico>('/catalogo').then((r) => r.datos),
    ]);
  const cabecera = (
    <CabeceraPagina
      titulo="Saldo y recargas"
      descripcion="Recarga saldo pagando por los métodos de NV. Lo acreditamos en dólares al confirmar el pago."
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
  if (!resumen) {
    return (
      <>
        {cabecera}
        <Alerta tono="peligro">No pudimos cargar tu saldo. Recarga la página.</Alerta>
      </>
    );
  }
  const r = resumen.revendedor;
  const bloqueo = motivoBloqueo(r);
  const tasas: Partial<Record<Moneda, string>> = Object.fromEntries(
    (catalogo?.tasas ?? []).map((t) => [t.moneda, t.valor]),
  );

  return (
    <>
      {cabecera}
      <AvisosRevendedor revendedor={r} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Reportar una recarga"
            descripcion="Paga primero y luego envía el comprobante. La tasa de hoy queda fijada al reportar."
          />
          <div className="px-5 py-5 sm:px-6">
            {bloqueo ? (
              <Alerta tono="aviso">{bloqueo} No puedes recargar saldo por ahora.</Alerta>
            ) : (
              <FormularioRecarga metodos={metodos} tasas={tasas} maxMb={MAX_MB} />
            )}
          </div>
        </Tarjeta>

        <Tarjeta className="lg:sticky lg:top-24">
          <div className="grid gap-2 px-5 py-5 sm:px-6">
            <p className="inline-flex items-center gap-2 text-sm text-tinta-suave">
              <Wallet className="size-4 text-marca" aria-hidden="true" /> Saldo disponible
            </p>
            <p className="font-titulo text-3xl font-semibold tabular-nums">
              {formatearMonto(r.saldoUsd, 'USD')}
            </p>
            {resumen.saldoVes && (
              <p className="text-sm text-tinta-suave">
                ≈ {formatearMonto(resumen.saldoVes, 'VES')} (1 USD ={' '}
                {formatearMonto(resumen.tasaVes!, 'VES')})
              </p>
            )}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta>
        <CabeceraTarjeta titulo="Tus recargas" descripcion="Las 10 más recientes." />
        {!recargas || recargas.elementos.length === 0 ? (
          <EstadoVacio icono={ReceiptText} titulo="Todavía no has reportado recargas" />
        ) : (
          <ul className="divide-y divide-borde">
            {recargas.elementos.map((x) => (
              <li key={x.id} className="grid gap-1.5 px-5 py-4 text-sm sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatearMonto(x.montoRecibido ?? x.montoDeclarado, x.moneda)} ·{' '}
                    {x.metodo.nombre}
                  </span>
                  <EstadoRecargaInsignia estado={x.estado} />
                </div>
                <p className="text-tinta-suave">
                  {x.estado === 'confirmada' && x.montoUsd
                    ? `Acreditado: ${formatearMonto(x.montoUsd, 'USD')}`
                    : `Estimado: ${formatearMonto(x.montoUsdEstimado, 'USD')}`}{' '}
                  · pagado el {formatearFecha(x.fechaPago)} · código{' '}
                  <span className="font-mono text-xs">{x.referencia}</span>
                  {x.referenciaExterna ? ` · ref. ${x.referenciaExterna}` : ''}
                </p>
                {x.estado === 'rechazada' && x.motivoRechazo && (
                  <p className="text-peligro">Motivo: {x.motivoRechazo}</p>
                )}
                {x.tieneComprobante && (
                  <a
                    href={`/api/v1/revendedor/recargas/${x.id}/comprobante`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 justify-self-start font-medium text-marca hover:underline"
                  >
                    <FileText className="size-4" aria-hidden="true" /> Ver comprobante
                    <span className="sr-only">(se abre en una pestaña nueva)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <CabeceraTarjeta
          titulo="Movimientos del saldo"
          descripcion="Cada recarga, compra, reembolso o ajuste, con el saldo que quedó."
        />
        {!libro || libro.elementos.length === 0 ? (
          <EstadoVacio icono={Wallet} titulo="Sin movimientos todavía" />
        ) : (
          <>
            <Tabla minimo="40rem">
              <Encabezados
                columnas={[
                  'Fecha',
                  'Movimiento',
                  { texto: 'Importe', className: 'text-right' },
                  { texto: 'Saldo', className: 'text-right pr-5 sm:pr-6' },
                ]}
              />
              <Cuerpo>
                {libro.elementos.map((m) => (
                  <tr key={m.id}>
                    <Celda primera className="whitespace-nowrap text-tinta-suave">
                      <time dateTime={m.creadoEn}>{formatearFechaHora(m.creadoEn)}</time>
                    </Celda>
                    <Celda>
                      <span className="block font-medium">{TIPO_MOVIMIENTO[m.tipo]}</span>
                      <span className="block text-xs text-tinta-tenue">
                        {m.compra
                          ? `${m.compra.plan} · ${m.compra.cliente}`
                          : m.recarga
                            ? `Recarga ${m.recarga.referencia}`
                            : ''}
                        {m.motivo ? ` ${m.compra || m.recarga ? '· ' : ''}${m.motivo}` : ''}
                      </span>
                    </Celda>
                    <Celda
                      className={clsx(
                        'text-right font-medium whitespace-nowrap tabular-nums',
                        Number(m.montoUsd) < 0 ? 'text-tinta' : 'text-exito',
                      )}
                    >
                      {montoConSigno(m.montoUsd)}
                    </Celda>
                    <Celda className="pr-5 text-right whitespace-nowrap tabular-nums sm:pr-6">
                      {formatearMonto(m.saldoResultanteUsd, 'USD')}
                    </Celda>
                  </tr>
                ))}
              </Cuerpo>
            </Tabla>
            <Paginacion
              ruta="/revendedor/saldo"
              parametros={{}}
              pagina={libro.pagina}
              porPagina={libro.porPagina}
              total={libro.total}
            />
          </>
        )}
      </Tarjeta>
    </>
  );
}
