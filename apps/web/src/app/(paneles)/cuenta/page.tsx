import { formatearMonto, type ResumenCliente, type SuscripcionPublica } from '@nv/shared';
import { CalendarClock, Clapperboard, LifeBuoy, Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AccionesSuscripcion } from '@/componentes/cliente/suscripcion';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoFacturaInsignia, EstadoSuscripcionInsignia } from '@/componentes/ui/estado';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { diasHasta, formatearDuracion, formatearFecha } from '@/lib/formato';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis servicios' };

function Vigencia({ s }: { s: SuscripcionPublica }) {
  if (s.estado === 'pendiente_pago') return <>Se activa cuando confirmemos tu pago.</>;
  if (s.estado === 'pausada') return <>Pausada. Los días que te quedaban se conservan.</>;
  if (s.estado === 'cancelada')
    return <>Cancelada{s.canceladaEn ? ` el ${formatearFecha(s.canceladaEn)}` : ''}.</>;
  if (!s.venceEn) return null;
  const dias = diasHasta(s.venceEn);
  if (s.estado === 'en_gracia')
    return <>Venció el {formatearFecha(s.venceEn)}. Renueva para no perder el servicio.</>;
  if (s.estado === 'suspendida' || s.estado === 'vencida')
    return <>Venció el {formatearFecha(s.venceEn)}.</>;
  if (s.cancelarAlVencer) return <>Termina el {formatearFecha(s.venceEn)} y no se renovará.</>;
  return (
    <>
      Vence el {formatearFecha(s.venceEn)}
      {dias >= 0 && dias <= 7
        ? ` (en ${dias === 0 ? 'menos de un día' : `${dias} ${dias === 1 ? 'día' : 'días'}`})`
        : ''}
      .
    </>
  );
}

export default async function MisServicios() {
  const sesion = await requerirSesion({ roles: ['cliente'] });
  const { datos } = await leerApi<ResumenCliente>('/mi/resumen');
  const nombre = sesion.usuario.nombre.split(' ')[0];

  if (!datos) {
    return (
      <>
        <CabeceraPagina titulo={`Hola, ${nombre}`} />
        <Alerta tono="peligro">
          No pudimos cargar tus servicios. Recarga la página en un momento.
        </Alerta>
      </>
    );
  }

  const { suscripciones, facturasPendientes, ticketsAbiertos } = datos;

  return (
    <>
      <CabeceraPagina
        titulo={`Hola, ${nombre}`}
        descripcion="Tus servicios, lo que tienes pendiente de pago y tus solicitudes de ayuda."
        acciones={
          <BotonEnlace href="/cuenta/planes" variante="secundario">
            Contratar otro plan
          </BotonEnlace>
        }
      />

      {facturasPendientes.length > 0 && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Pendiente de pago"
            descripcion="Paga y envía el comprobante; activamos o renovamos tu servicio al confirmarlo."
          />
          <ul className="divide-y divide-borde">
            {facturasPendientes.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
              >
                <div className="grid gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    Factura {f.numero}
                    <EstadoFacturaInsignia estado={f.estado} vencida={f.vencida} />
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {formatearMonto(f.total, f.moneda)} · pagar antes del{' '}
                    {formatearFecha(f.venceEn)}
                  </p>
                </div>
                {f.pagoEnRevision ? (
                  <span className="text-sm text-tinta-suave">Estamos revisando tu pago</span>
                ) : (
                  <BotonEnlace href={`/cuenta/facturas/${f.id}`} tamano="sm">
                    Pagar
                  </BotonEnlace>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {suscripciones.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            icono={Clapperboard}
            titulo="Todavía no tienes servicios"
            accion={<BotonEnlace href="/cuenta/planes">Ver planes</BotonEnlace>}
          >
            Elige un plan, paga en tu moneda y lo activamos en cuanto confirmemos el pago.
          </EstadoVacio>
        </Tarjeta>
      ) : (
        <section aria-labelledby="titulo-servicios" className="grid gap-3">
          <h2 id="titulo-servicios" className="text-base font-semibold">
            Mis servicios
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {suscripciones.map((s) => (
              <Tarjeta key={s.id} className="grid gap-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <p className="text-xs font-medium text-tinta-tenue">{s.plan.servicio}</p>
                    <h3 className="text-lg font-semibold">{s.plan.nombre}</h3>
                  </div>
                  <EstadoSuscripcionInsignia estado={s.estado} />
                </div>
                <p className="flex items-start gap-2 text-sm text-tinta-suave">
                  <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <Vigencia s={s} /> Plan de{' '}
                    {formatearDuracion(s.plan.duracionCantidad, s.plan.duracionUnidad)}, pagado en{' '}
                    {s.moneda}.
                  </span>
                </p>
                <AccionesSuscripcion s={s} />
              </Tarjeta>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/cuenta/facturas"
          className="flex items-center gap-4 rounded-nv border border-borde bg-superficie p-5 shadow-nv transition-colors hover:border-borde-fuerte"
        >
          <Receipt className="size-5 text-marca" aria-hidden="true" />
          <span className="grid gap-0.5">
            <span className="text-sm font-semibold">Facturas y pagos</span>
            <span className="text-sm text-tinta-suave">Historial y comprobantes enviados.</span>
          </span>
        </Link>
        <Link
          href="/cuenta/soporte"
          className="flex items-center gap-4 rounded-nv border border-borde bg-superficie p-5 shadow-nv transition-colors hover:border-borde-fuerte"
        >
          <LifeBuoy className="size-5 text-marca" aria-hidden="true" />
          <span className="grid gap-0.5">
            <span className="text-sm font-semibold">Soporte</span>
            <span className="text-sm text-tinta-suave">
              {ticketsAbiertos > 0
                ? `Tienes ${ticketsAbiertos} ${ticketsAbiertos === 1 ? 'solicitud abierta' : 'solicitudes abiertas'}.`
                : '¿Necesitas ayuda? Escríbenos.'}
            </span>
          </span>
        </Link>
      </div>
    </>
  );
}
