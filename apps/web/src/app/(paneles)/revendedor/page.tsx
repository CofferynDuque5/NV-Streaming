import { formatearMonto, type ResumenRevendedor } from '@nv/shared';
import { CalendarClock, Package, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisosRevendedor, Cifra, SinFicha } from '@/componentes/revendedor/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { diasHasta, formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Panel de revendedor' };

export default async function PanelRevendedor() {
  const sesion = await requerirSesion({ roles: ['revendedor'] });
  const { estado, datos: r } = await leerApi<ResumenRevendedor>('/revendedor/resumen');
  const saludo = (
    <CabeceraPagina
      titulo={`Hola, ${sesion.usuario.nombre.split(' ')[0]}`}
      descripcion="Compra activaciones con tu saldo a precio mayorista y sigue a tus clientes."
      acciones={
        r && (
          <>
            <BotonEnlace href="/revendedor/saldo" variante="secundario">
              Recargar saldo
            </BotonEnlace>
            <BotonEnlace href="/revendedor/catalogo">Comprar activación</BotonEnlace>
          </>
        )
      }
    />
  );
  if (estado === 404) {
    return (
      <>
        {saludo}
        <SinFicha />
      </>
    );
  }
  if (!r) {
    return (
      <>
        {saludo}
        <Alerta tono="peligro">No pudimos cargar tu resumen. Recarga la página.</Alerta>
      </>
    );
  }
  const d = r.revendedor;

  return (
    <>
      {saludo}
      <AvisosRevendedor revendedor={d} />
      {d.recargasEnRevision > 0 && (
        <Alerta tono="info" titulo="Recargas en revisión">
          {d.recargasEnRevision === 1
            ? 'Tienes 1 recarga esperando confirmación.'
            : `Tienes ${d.recargasEnRevision} recargas esperando confirmación.`}{' '}
          El saldo se acredita al confirmarlas.
        </Alerta>
      )}

      <Tarjeta>
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-nv bg-borde sm:grid-cols-2 lg:grid-cols-4">
          <Cifra
            etiqueta="Saldo disponible"
            valor={formatearMonto(d.saldoUsd, 'USD')}
            detalle={
              r.saldoVes
                ? `≈ ${formatearMonto(r.saldoVes, 'VES')} a la tasa de hoy`
                : 'Sin tasa de bolívares registrada'
            }
          />
          <Cifra
            etiqueta="Tu nivel"
            valor={d.nivel?.nombre ?? 'Por asignar'}
            detalle={
              d.limiteDiarioCompras
                ? `Hasta ${d.limiteDiarioCompras} compras por día (hoy: ${r.comprasHoy})`
                : 'Sin límite diario de compras'
            }
          />
          <Cifra
            etiqueta="Compras este mes"
            valor={String(r.comprasMes)}
            detalle={`${formatearMonto(r.gastoMesUsd, 'USD')} en activaciones`}
          />
          <Cifra
            etiqueta="Clientes"
            valor={String(d.clientes)}
            detalle={`${d.suscripcionesActivas} ${d.suscripcionesActivas === 1 ? 'servicio activo' : 'servicios activos'}`}
          />
        </dl>
      </Tarjeta>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Próximos vencimientos"
            descripcion="Servicios de tus clientes que vencen en los próximos 7 días."
            accion={
              <Link
                href="/revendedor/clientes"
                className="text-sm font-medium text-marca hover:underline"
              >
                Ver clientes
              </Link>
            }
          />
          {r.proximosVencimientos.length === 0 ? (
            <EstadoVacio icono={CalendarClock} titulo="Nada vence esta semana">
              Cuando un servicio de tus clientes esté por vencer lo verás aquí para renovarlo.
            </EstadoVacio>
          ) : (
            <ul className="divide-y divide-borde">
              {r.proximosVencimientos.map((s) => {
                const dias = s.venceEn ? diasHasta(s.venceEn) : null;
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-medium">{s.cliente.nombre}</span>
                      <span className="truncate text-xs text-tinta-tenue">
                        {s.plan.servicio} · {s.plan.nombre}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-tinta-suave">
                        {s.venceEn ? formatearFecha(s.venceEn) : '—'}
                        {dias !== null &&
                          (dias <= 0 ? ' · vencida' : ` · ${dias} ${dias === 1 ? 'día' : 'días'}`)}
                      </span>
                      <EstadoSuscripcionInsignia estado={s.estado} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta>
          <CabeceraTarjeta titulo="Cómo funciona" />
          <ol className="grid gap-4 px-5 py-5 text-sm sm:px-6">
            {[
              {
                icono: Wallet,
                texto: 'Recarga saldo pagando por Pago Móvil u otro método y envía el comprobante.',
              },
              {
                icono: Package,
                texto:
                  'Compra activaciones o renovaciones al precio de tu nivel. Se activan al momento.',
              },
              {
                icono: CalendarClock,
                texto: 'Cobra a tus clientes a tu manera y renueva antes de que venzan.',
              },
            ].map(({ icono: Icono, texto }, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-borde bg-hundida text-marca">
                  <Icono className="size-4" aria-hidden="true" />
                </span>
                <span className="text-tinta-suave">{texto}</span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      </div>
    </>
  );
}
