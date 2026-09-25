import type { MetodoAutorizadoPublico } from '@nv/shared';
import { ChevronDown, LockKeyhole, WalletCards } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RevocarMetodo } from '@/componentes/cliente/metodos-pago';
import { Alerta } from '@/componentes/ui/alerta';
import { BotonEnlace } from '@/componentes/ui/boton';
import { CabeceraPagina } from '@/componentes/ui/cabecera-pagina';
import { EstadoVacio } from '@/componentes/ui/estado-vacio';
import { Insignia } from '@/componentes/ui/insignia';
import { CabeceraTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { leerApi } from '@/lib/api-servidor';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import { ESTADO_METODO_AUTORIZADO, nombrePasarela } from '@/lib/pagos-en-linea';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Mis métodos de pago' };

export default async function MetodosDePago() {
  await requerirSesion({ roles: ['cliente'] });
  const { datos } = await leerApi<MetodoAutorizadoPublico[]>('/mi/metodos-autorizados');
  const activos = datos?.filter((m) => m.estado === 'activo') ?? [];
  const historial = datos?.filter((m) => m.estado !== 'activo') ?? [];

  return (
    <>
      <CabeceraPagina
        titulo="Mis métodos de pago"
        descripcion="Los métodos que autorizaste para cobrar solas tus renovaciones. Solo se usan en las suscripciones donde actives el cobro automático, y puedes revocarlos cuando quieras."
      />
      <p className="flex items-start gap-2 text-sm text-tinta-suave">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-marca" aria-hidden="true" />
        Los datos de tu tarjeta o cuenta quedan en la pasarela (PayPal, Mercado Pago): NV Streaming
        solo guarda una referencia para poder cobrar lo que autorizaste.
      </p>

      {!datos ? (
        <Alerta tono="peligro">
          No pudimos cargar tus métodos de pago. Recarga la página en un momento.
        </Alerta>
      ) : (
        <Tarjeta>
          <CabeceraTarjeta titulo="Autorizados" />
          {activos.length === 0 ? (
            <EstadoVacio
              icono={WalletCards}
              titulo="No tienes métodos autorizados"
              accion={
                <BotonEnlace href="/cuenta/facturas" variante="secundario">
                  Facturas y pagos
                </BotonEnlace>
              }
            >
              Cuando pagues una factura en línea (en dólares, euros, pesos o soles) puedes marcar
              «Guardar este método para cobros automáticos» y aparecerá aquí.
            </EstadoVacio>
          ) : (
            <ul className="divide-y divide-borde">
              {activos.map((m) => (
                <Metodo key={m.id} m={m} />
              ))}
            </ul>
          )}
        </Tarjeta>
      )}

      {historial.length > 0 && (
        <Tarjeta>
          <CabeceraTarjeta
            titulo="Revocados o no válidos"
            descripcion="Ya no se cobra con ellos. Se guardan como constancia de lo que autorizaste."
          />
          <ul className="divide-y divide-borde">
            {historial.map((m) => (
              <Metodo key={m.id} m={m} />
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  );
}

function Metodo({ m }: { m: MetodoAutorizadoPublico }) {
  const e = ESTADO_METODO_AUTORIZADO[m.estado];
  return (
    <li className="grid gap-3 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-words">{m.descripcion}</span>
            <Insignia tono={e.tono}>{e.texto}</Insignia>
          </p>
          <p className="text-sm text-tinta-suave">
            {nombrePasarela(m.pasarela)} · {m.moneda} · autorizado el{' '}
            {formatearFecha(m.autorizadoEn)}
          </p>
          {m.revocadoEn && (
            <p className="text-sm text-tinta-tenue">
              {m.estado === 'revocado' ? 'Revocado' : 'Desactivado'} el{' '}
              {formatearFechaHora(m.revocadoEn)}
              {m.motivoEstado ? ` · ${m.motivoEstado}` : ''}
            </p>
          )}
          {!m.revocadoEn && m.motivoEstado && (
            <p className="text-sm text-tinta-tenue">{m.motivoEstado}</p>
          )}
        </div>
        {m.estado === 'activo' && (
          <RevocarMetodo
            ruta={`/mi/metodos-autorizados/${m.id}/revocar`}
            descripcion={m.descripcion}
            suscripciones={m.suscripciones.length}
          />
        )}
      </div>

      {m.estado === 'activo' && (
        <div className="grid gap-1 text-sm">
          <p className="text-xs font-medium text-tinta-tenue">Se usa en</p>
          {m.suscripciones.length === 0 ? (
            <p className="text-tinta-suave">
              Ninguna suscripción todavía. Actívalo desde{' '}
              <Link href="/cuenta" className="font-medium text-marca hover:underline">
                Mis servicios
              </Link>
              .
            </p>
          ) : (
            <ul className="grid gap-1">
              {m.suscripciones.map((s) => (
                <li key={s.id} className="text-tinta-suave">
                  <span className="text-tinta">{s.plan}</span>
                  {s.venceEn ? ` · próximo cobro el ${formatearFecha(s.venceEn)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="group rounded-xl border border-borde bg-hundida">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Texto que aceptaste
          <ChevronDown
            className="size-4 shrink-0 text-tinta-tenue transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="grid gap-2 border-t border-borde px-3.5 py-3 text-sm">
          <blockquote className="leading-relaxed break-words text-tinta-suave">
            {m.textoAceptado}
          </blockquote>
          <p className="text-xs text-tinta-tenue">
            Aceptado el {formatearFechaHora(m.autorizadoEn)} · versión {m.versionTexto}
          </p>
        </div>
      </details>
    </li>
  );
}
